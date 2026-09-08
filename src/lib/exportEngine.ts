import { ParsedResume } from "../types";

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
    : (titleOrParsed?.contactInfo?.name || titleOrParsed?.name || "Tailored Resume");

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
 * Generates an ATS-friendly, Word-compliant DOCX (HTML/MIME Word format) document.
 */
export function generateDocxBlob(markdown: string, parsedResume?: ParsedResume): Blob {
  const htmlBody = generatePrintableHtml(markdown, parsedResume);
  const docxTemplate = `
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8">
  <title>Resume</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.3; }
    h1 { font-size: 18pt; font-weight: bold; border-bottom: 2pt solid #333; margin-bottom: 4pt; }
    h2 { font-size: 13pt; font-weight: bold; border-bottom: 1pt solid #666; margin-top: 12pt; margin-bottom: 4pt; }
    h3 { font-size: 11pt; font-weight: bold; margin-top: 8pt; margin-bottom: 2pt; }
    li { font-size: 10.5pt; margin-bottom: 3pt; }
  </style>
</head>
<body>
  ${htmlBody}
</body>
</html>`;

  return new Blob([docxTemplate], { type: "application/msword" });
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
