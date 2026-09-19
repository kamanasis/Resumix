export interface PdfExtractionResult {
  success: boolean;
  text: string;
  wordCount: number;
  charCount: number;
  pageCount: number;
  isScanned: boolean;
  error?: string;
}

/**
 * Parses raw text from a PDF ArrayBuffer or Uint8Array.
 * Extracts text stream objects (/Filter /FlateDecode) using zlib/pako decompressor
 * and decodes standard PDF text operators (Tj, TJ, ', \").
 * Strictly flags scanned / non-text PDFs without inventing or guessing text.
 */
export async function extractTextFromPdf(
  data: ArrayBuffer | Uint8Array
): Promise<PdfExtractionResult> {
  try {
    const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (!uint8 || uint8.length === 0) {
      return {
        success: false,
        text: "",
        wordCount: 0,
        charCount: 0,
        pageCount: 0,
        isScanned: false,
        error: "PDF buffer is empty."
      };
    }

    // Verify PDF header %PDF-
    const header = String.fromCharCode(...uint8.slice(0, 5));
    if (header !== "%PDF-") {
      return {
        success: false,
        text: "",
        wordCount: 0,
        charCount: 0,
        pageCount: 0,
        isScanned: false,
        error: "Invalid PDF format: Missing %PDF- header."
      };
    }

    const binaryStr = uint8ToBinaryString(uint8);

    // Count approximate pages via /Type /Page
    const pageMatches = binaryStr.match(/\/Type\s*\/Page[^s]/g) || [];
    const pageCount = Math.max(1, pageMatches.length);

    // Extract all stream...endstream chunks
    const extractedParagraphs: string[] = [];
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let streamMatch: RegExpExecArray | null;

    while ((streamMatch = streamRegex.exec(binaryStr)) !== null) {
      const streamRaw = streamMatch[1];
      const streamBytes = binaryStringToUint8(streamRaw);

      let decompressed = "";

      // 1. Try Flate / Deflate decompression
      try {
        // In Node.js environment:
        if (typeof process !== "undefined" && process.versions && process.versions.node) {
          const modName = "zlib";
          const zlib = await import(/* @vite-ignore */ modName);
          const inflated = zlib.inflateSync(Buffer.from(streamBytes));
          decompressed = inflated.toString("latin1");
        } else if (typeof DecompressionStream !== "undefined") {
          // Modern Browser DecompressionStream
          const ds = new DecompressionStream("deflate");
          const writer = ds.writable.getWriter();
          writer.write(streamBytes);
          writer.close();
          const decompBuffer = await new Response(ds.readable).arrayBuffer();
          decompressed = new TextDecoder("latin1").decode(decompBuffer);
        }
      } catch {
        // Fallback: Stream might be uncompressed ASCII or raw text
        decompressed = streamRaw;
      }

      if (!decompressed) {
        decompressed = streamRaw;
      }

      // 2. Parse text operators within BT ... ET blocks
      const textChunks = parsePdfTextOperators(decompressed);
      if (textChunks.length > 0) {
        extractedParagraphs.push(textChunks.join(" "));
      }
    }

    let fullText = extractedParagraphs
      .join("\n\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n\s*\n/g, "\n\n")
      .trim();

    // 3. Fallback extraction: if stream decompression yielded minimal text,
    // scan for readable text sequences in the PDF body (uncompressed text blocks)
    if (fullText.split(/\s+/).filter(Boolean).length < 15) {
      const uncompressedChunks = parsePdfTextOperators(binaryStr);
      if (uncompressedChunks.length > 0) {
        const altText = uncompressedChunks.join(" ").trim();
        if (altText.length > fullText.length) {
          fullText = altText;
        }
      }
    }

    const words = fullText.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const charCount = fullText.length;

    // Detect image-based / scanned PDF (substantial file size but almost no text extracted)
    const isScanned = uint8.length > 40000 && wordCount < 25;

    if (isScanned) {
      return {
        success: false,
        text: fullText,
        wordCount,
        charCount,
        pageCount,
        isScanned: true,
        error: `Scanned image PDF detected (${(uint8.length / 1024).toFixed(0)}KB with only ${wordCount} extracted words). Document requires OCR or selectable text layer.`
      };
    }

    if (wordCount < 10) {
      return {
        success: false,
        text: fullText,
        wordCount,
        charCount,
        pageCount,
        isScanned: false,
        error: "Insufficient extractable text found in PDF document."
      };
    }

    return {
      success: true,
      text: fullText,
      wordCount,
      charCount,
      pageCount,
      isScanned: false
    };
  } catch (err: any) {
    return {
      success: false,
      text: "",
      wordCount: 0,
      charCount: 0,
      pageCount: 0,
      isScanned: false,
      error: `PDF text extraction failed: ${err.message || String(err)}`
    };
  }
}

/**
 * Extracts strings from PDF Text Operators (BT ... ET).
 * Handles Tj, TJ, ', and " operators with octal/hex escape decoding.
 */
function parsePdfTextOperators(content: string): string[] {
  const result: string[] = [];
  const btRegex = /BT\s+([\s\S]*?)\s+ET/g;
  let btMatch: RegExpExecArray | null;

  while ((btMatch = btRegex.exec(content)) !== null) {
    const block = btMatch[1];

    // Match TJ array: [(...) -10 (...)] TJ
    const tjArrayRegex = /\[((?:[^\(\)\[\]]*|\([^\)]*\))*?)\]\s*TJ/g;
    let tjMatch: RegExpExecArray | null;
    let blockText = "";

    while ((tjMatch = tjArrayRegex.exec(block)) !== null) {
      const inner = tjMatch[1];
      const strRegex = /\(([^)]*)\)/g;
      let sMatch: RegExpExecArray | null;
      while ((sMatch = strRegex.exec(inner)) !== null) {
        blockText += decodePdfString(sMatch[1]) + " ";
      }
    }

    // Match single Tj: (string) Tj or ' or "
    const singleTjRegex = /\(([^)]*)\)\s*(?:Tj|'|")/g;
    let singleMatch: RegExpExecArray | null;
    while ((singleMatch = singleTjRegex.exec(block)) !== null) {
      blockText += decodePdfString(singleMatch[1]) + " ";
    }

    const trimmed = blockText.trim();
    if (trimmed.length > 0) {
      result.push(trimmed);
    }
  }

  return result;
}

/**
 * Decodes standard PDF escape sequences (\n, \r, \t, \b, \f, \(, \), \\, \ddd octal)
 */
function decodePdfString(str: string): string {
  return str
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function uint8ToBinaryString(uint8: Uint8Array): string {
  let res = "";
  const len = uint8.length;
  const chunk = 8192;
  for (let i = 0; i < len; i += chunk) {
    res += String.fromCharCode(...uint8.subarray(i, Math.min(i + chunk, len)));
  }
  return res;
}

function binaryStringToUint8(bin: string): Uint8Array {
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i) & 0xff;
  }
  return bytes;
}
