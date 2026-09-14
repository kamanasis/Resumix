import JSZip from "jszip";

export interface DocxExtractionResult {
  success: boolean;
  text: string;
  paragraphCount: number;
  wordCount: number;
  error?: string;
}

/**
 * Extracts plain text content from a DOCX (OpenXML) buffer or ArrayBuffer.
 * Parses word/document.xml paragraphs (<w:p>) and text runs (<w:t>).
 * Strictly fails closed if the document is corrupted or missing word/document.xml.
 */
export async function extractTextFromDocx(
  buffer: ArrayBuffer | Buffer | Uint8Array
): Promise<DocxExtractionResult> {
  try {
    if (!buffer || (buffer as any).byteLength === 0) {
      return {
        success: false,
        text: "",
        paragraphCount: 0,
        wordCount: 0,
        error: "DOCX file buffer is empty."
      };
    }

    const zip = await JSZip.loadAsync(buffer);
    const documentXmlFile = zip.file("word/document.xml");

    if (!documentXmlFile) {
      return {
        success: false,
        text: "",
        paragraphCount: 0,
        wordCount: 0,
        error: "Invalid DOCX package: missing word/document.xml entry."
      };
    }

    const xmlContent = await documentXmlFile.async("text");
    if (!xmlContent || xmlContent.trim().length === 0) {
      return {
        success: false,
        text: "",
        paragraphCount: 0,
        wordCount: 0,
        error: "DOCX word/document.xml is empty."
      };
    }

    // Extract text paragraph by paragraph to preserve line breaks
    const paragraphs: string[] = [];
    const pRegex = /<w:p(?:\s+[^>]*)?>([\s\S]*?)<\/w:p>/g;
    let pMatch: RegExpExecArray | null;

    while ((pMatch = pRegex.exec(xmlContent)) !== null) {
      const pContent = pMatch[1];
      
      // Check if paragraph is styled as a bullet point or list item
      const isListItem = /<w:pStyle\s+[^>]*w:val="ListBullet"[^>]*\/>/i.test(pContent) ||
                         /<w:numPr>/i.test(pContent);

      // Collect all text runs inside this paragraph
      const tRegex = /<w:t(?:\s+[^>]*)?>([^<]*)<\/w:t>/g;
      let tMatch: RegExpExecArray | null;
      let pText = "";

      while ((tMatch = tRegex.exec(pContent)) !== null) {
        pText += tMatch[1];
      }

      // Handle explicit line breaks inside paragraphs
      pText = pText.replace(/<w:br(?:\s+[^>]*)?\/>/g, "\n");

      const trimmedLine = pText.trim();
      if (trimmedLine.length > 0) {
        if (isListItem && !trimmedLine.startsWith("-") && !trimmedLine.startsWith("*")) {
          paragraphs.push(`- ${trimmedLine}`);
        } else {
          paragraphs.push(trimmedLine);
        }
      }
    }

    const fullText = paragraphs.join("\n\n");
    const words = fullText.split(/\s+/).filter(Boolean);

    return {
      success: true,
      text: fullText,
      paragraphCount: paragraphs.length,
      wordCount: words.length
    };
  } catch (err: any) {
    return {
      success: false,
      text: "",
      paragraphCount: 0,
      wordCount: 0,
      error: `DOCX extraction failed: ${err.message || String(err)}`
    };
  }
}
