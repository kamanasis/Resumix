import JSZip from "jszip";

export interface DocxValidationResult {
  isValid: boolean;
  fileCount: number;
  missingFiles: string[];
  hasContentTypes: boolean;
  hasRels: boolean;
  hasDocumentXml: boolean;
  hasDocumentRels: boolean;
  error?: string;
}

export const MANDATORY_DOCX_ENTRIES = [
  "[Content_Types].xml",
  "_rels/.rels",
  "word/document.xml",
  "word/_rels/document.xml.rels"
];

/**
 * Validates that an ArrayBuffer, Buffer, or Uint8Array is a valid OpenXML/DOCX package.
 * Verifies that the package can be unzipped and contains all mandatory files:
 * - [Content_Types].xml
 * - _rels/.rels
 * - word/document.xml
 * - word/_rels/document.xml.rels
 */
export async function validateDocxPackage(
  data: ArrayBuffer | Buffer | Uint8Array | Blob
): Promise<DocxValidationResult> {
  try {
    let buffer: ArrayBuffer | Buffer | Uint8Array;
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      buffer = await data.arrayBuffer();
    } else {
      buffer = data as ArrayBuffer | Buffer | Uint8Array;
    }

    if (!buffer || (buffer as any).byteLength === 0) {
      return {
        isValid: false,
        fileCount: 0,
        missingFiles: [...MANDATORY_DOCX_ENTRIES],
        hasContentTypes: false,
        hasRels: false,
        hasDocumentXml: false,
        hasDocumentRels: false,
        error: "DOCX binary buffer is empty."
      };
    }

    // Check for ZIP magic header bytes (PK\x03\x04 = 0x50, 0x4B, 0x03, 0x04)
    let uint8: Uint8Array;
    if (buffer instanceof Uint8Array) {
      uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    } else if (buffer instanceof ArrayBuffer) {
      uint8 = new Uint8Array(buffer);
    } else {
      const b = buffer as any;
      uint8 = b?.buffer ? new Uint8Array(b.buffer, b.byteOffset || 0, b.byteLength || b.length) : new Uint8Array(0);
    }
    if (uint8.length < 4 || uint8[0] !== 0x50 || uint8[1] !== 0x4B || uint8[2] !== 0x03 || uint8[3] !== 0x04) {
      return {
        isValid: false,
        fileCount: 0,
        missingFiles: [...MANDATORY_DOCX_ENTRIES],
        hasContentTypes: false,
        hasRels: false,
        hasDocumentXml: false,
        hasDocumentRels: false,
        error: "File does not start with standard ZIP/OpenXML magic signature (PK\\x03\\x04)."
      };
    }

    const zip = await JSZip.loadAsync(buffer);
    const files = Object.keys(zip.files);

    const hasContentTypes = Boolean(zip.file("[Content_Types].xml"));
    const hasRels = Boolean(zip.file("_rels/.rels"));
    const hasDocumentXml = Boolean(zip.file("word/document.xml"));
    const hasDocumentRels = Boolean(zip.file("word/_rels/document.xml.rels"));

    const missingFiles: string[] = [];
    if (!hasContentTypes) missingFiles.push("[Content_Types].xml");
    if (!hasRels) missingFiles.push("_rels/.rels");
    if (!hasDocumentXml) missingFiles.push("word/document.xml");
    if (!hasDocumentRels) missingFiles.push("word/_rels/document.xml.rels");

    const isValid = missingFiles.length === 0;

    return {
      isValid,
      fileCount: files.length,
      missingFiles,
      hasContentTypes,
      hasRels,
      hasDocumentXml,
      hasDocumentRels,
      error: isValid ? undefined : `Missing required OpenXML package entries: ${missingFiles.join(", ")}`
    };
  } catch (err: any) {
    return {
      isValid: false,
      fileCount: 0,
      missingFiles: [...MANDATORY_DOCX_ENTRIES],
      hasContentTypes: false,
      hasRels: false,
      hasDocumentXml: false,
      hasDocumentRels: false,
      error: `DOCX package decompression failed: ${err.message || String(err)}`
    };
  }
}
