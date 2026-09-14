import { ParsedResume } from "../types";
import { Document, Paragraph, TextRun, HeadingLevel, Packer } from "docx";
import { validateDocxPackage } from "./docxValidator";

export const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// ============================================================================
// RESUMIX STAGE 5: DETERMINISTIC EXPORT & DOCUMENT RENDERING ENGINE
// ============================================================================

export type ExportFormat = "PDF" | "DOCX" | "MARKDOWN" | "PRINT";

export interface ExportMetadata {
  format: ExportFormat;
  filename: string;
  exportedAt: string;
  resumeVersionId?: string;
  profileHash?: string;
  byteSize: number;
}

/**
 * Sanitizes candidate name, company, and target role into clean, professional filenames.
 * Example: "Alex Doe", "Google", "Senior Rust Dev" -> "Alex_Doe_Google_Senior_Rust_Dev_Resume.docx"
 */
export function sanitizeExportFileName(
  name?: string,
  company?: string,
  role?: string,
  format: string = "docx"
): string {
  const cleanExt = (format || "docx").replace(/^\./, "").toLowerCase().trim();

  const sanitizePart = (val?: string) => {
    if (!val) return "";
    return val
      .trim()
      .replace(/[\\/:*?"<>|\r\n\t]+/g, " ")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
  };

  const cleanName = sanitizePart(name) || "Candidate";
  const cleanCompany = sanitizePart(company);
  const cleanRole = sanitizePart(role);

  const parts = [cleanName];
  if (cleanCompany) parts.push(cleanCompany);
  if (cleanRole) parts.push(cleanRole);
  parts.push("Resume");

  let base = parts.filter(Boolean).join("_").replace(/_+/g, "_");

  // Prevent file system path overflow (cap at 140 chars before extension)
  if (base.length > 140) {
    base = base.substring(0, 140).replace(/_+$/, "");
  }

  return `${base}.${cleanExt}`;
}

/**
 * Converts markdown resume content into a clean, ATS-compliant HTML document
 * suitable for vector printing, PDF rendering, or offline viewing.
 */
export function generatePrintableHtml(
  markdown: string, 
  titleOrParsed?: string | ParsedResume
): string {
  const docTitle = typeof titleOrParsed === "string" 
    ? titleOrParsed 
    : (titleOrParsed?.contactInfo?.name || "Tailored Resume");

  const lines = markdown.split("\n");
  const htmlParts: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      if (inList) {
        htmlParts.push("</ul>");
        inList = false;
      }
      continue;
    }

    if (line.startsWith("# ")) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      htmlParts.push(`<h1>${escapeHtml(line.substring(2))}</h1>`);
    } else if (line.startsWith("## ")) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      htmlParts.push(`<h2>${escapeHtml(line.substring(3))}</h2>`);
    } else if (line.startsWith("### ")) {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      htmlParts.push(`<h3>${escapeHtml(line.substring(4))}</h3>`);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) {
        htmlParts.push("<ul>");
        inList = true;
      }
      htmlParts.push(`<li>${formatInlineMarkdown(line.substring(2))}</li>`);
    } else {
      if (inList) { htmlParts.push("</ul>"); inList = false; }
      htmlParts.push(`<p>${formatInlineMarkdown(line)}</p>`);
    }
  }

  if (inList) {
    htmlParts.push("</ul>");
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(docTitle)}</title>
  <style>
    @page { size: letter; margin: 0.65in; }
    @media print {
      body {
        margin: 0.5in 0.5in 0.5in 0.5in;
        color: #000000;
        background: #ffffff;
      }
      .no-print { display: none !important; }
      h2, h3, .section-block { page-break-inside: avoid; break-inside: avoid; }
      li { page-break-inside: avoid; break-inside: avoid; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 20px auto;
      max-width: 800px;
      padding: 20px;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1 {
      font-size: 20pt;
      margin: 0 0 4pt 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 2pt solid #1e293b;
      padding-bottom: 2pt;
      color: #0f172a;
    }
    h2 {
      font-size: 13pt;
      margin: 14pt 0 4pt 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1pt solid #cbd5e1;
      padding-bottom: 2pt;
      page-break-after: avoid;
      break-after: avoid;
      color: #0f172a;
    }
    h3 {
      font-size: 11pt;
      margin: 8pt 0 2pt 0;
      font-weight: bold;
      page-break-after: avoid;
      break-after: avoid;
      color: #0f172a;
    }
    p {
      font-size: 10pt;
      line-height: 1.45;
      margin: 3pt 0 6pt 0;
      color: #0f172a;
    }
    ul {
      margin: 4pt 0 8pt 18pt;
      padding: 0;
    }
    li {
      font-size: 10pt;
      line-height: 1.45;
      margin-bottom: 3pt;
      color: #0f172a;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    strong, b { font-weight: 700; color: #0f172a; }
    em, i { font-style: italic; }
    a { color: #0284c7; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .section-block { page-break-inside: avoid; break-inside: avoid; }
  </style>
</head>
<body>
  ${htmlParts.join("\n  ")}
</body>
</html>`;
}

/**
 * Parses markdown inline formatting (**bold**, *italic*) into TextRun array for docx.
 */
function parseMarkdownRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|[^*]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const chunk = match[0];
    if (chunk.startsWith("**") && chunk.endsWith("**") && chunk.length >= 4) {
      runs.push(new TextRun({ text: chunk.slice(2, -2), bold: true }));
    } else if (chunk.startsWith("*") && chunk.endsWith("*") && chunk.length >= 2) {
      runs.push(new TextRun({ text: chunk.slice(1, -1), italics: true }));
    } else {
      runs.push(new TextRun({ text: chunk }));
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text })];
}

/**
 * Builds a structured docx.Document adhering strictly to OpenXML standards.
 */
export function buildDocxDocument(markdown: string, _parsedResume?: ParsedResume): Document {
  const lines = markdown.split("\n");
  const children: Paragraph[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      children.push(new Paragraph({ spacing: { after: 100 } }));
      continue;
    }

    if (line.startsWith("# ")) {
      children.push(new Paragraph({
        text: line.substring(2).trim(),
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 120, before: 120 }
      }));
    } else if (line.startsWith("## ")) {
      children.push(new Paragraph({
        text: line.substring(3).trim(),
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 80, before: 160 }
      }));
    } else if (line.startsWith("### ")) {
      children.push(new Paragraph({
        text: line.substring(4).trim(),
        heading: HeadingLevel.HEADING_3,
        spacing: { after: 60, before: 100 }
      }));
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      const bulletContent = line.substring(2).trim();
      children.push(new Paragraph({
        children: parseMarkdownRuns(bulletContent),
        bullet: { level: 0 },
        spacing: { after: 40 }
      }));
    } else {
      children.push(new Paragraph({
        children: parseMarkdownRuns(line),
        spacing: { after: 80 }
      }));
    }
  }

  return new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 720,    // 0.5 inch (720 dxa)
            right: 720,
            bottom: 720,
            left: 720
          }
        }
      },
      children
    }]
  });
}

/**
 * Generates an ATS-friendly, genuine Microsoft Word OpenXML DOCX Blob.
 * Validates the output package before returning.
 */
export async function generateDocxBlob(markdown: string, parsedResume?: ParsedResume): Promise<Blob> {
  const doc = buildDocxDocument(markdown, parsedResume);
  const blob = await Packer.toBlob(doc);
  const validation = await validateDocxPackage(blob);

  if (!validation.isValid) {
    throw new Error(`Generated DOCX package validation failed: ${validation.error}`);
  }

  return blob;
}

/**
 * Generates an ATS-friendly, genuine Microsoft Word OpenXML DOCX Buffer for Node.js.
 * Validates the output package before returning.
 */
export async function generateDocxBuffer(markdown: string, parsedResume?: ParsedResume): Promise<Buffer> {
  const doc = buildDocxDocument(markdown, parsedResume);
  const buffer = await Packer.toBuffer(doc);
  const validation = await validateDocxPackage(buffer);

  if (!validation.isValid) {
    throw new Error(`Generated DOCX package validation failed: ${validation.error}`);
  }

  return buffer;
}

/**
 * Initiates safe browser download with memory leak prevention.
 */
export function triggerDownload(content: Blob | string, filename: string, mimeType = "text/plain") {
  const blob = typeof content === "string" ? new Blob([content], { type: mimeType }) : content;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatInlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}
