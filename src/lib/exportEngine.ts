import { ParsedResume, ResumeDocument, ResumeTemplateId, ResumeSkillCategory } from "../types";
import { Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType } from "docx";
import { validateDocxPackage } from "./docxValidator";
import { parseMarkdownToResumeDocument, resumeDocumentToPlainText } from "./resumeDocument";

export const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// ============================================================================
// RESUMIX STAGE 2 & 5: DETERMINISTIC MULTI-FORMAT RESUME RENDERING ENGINE
// ============================================================================

export type ExportFormat = "PDF" | "DOCX" | "MARKDOWN" | "PRINT" | "TXT";

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
 * Normalizes input (either ResumeDocument or markdown string) into a structured ResumeDocument.
 */
export function ensureResumeDocument(
  docOrMarkdown: ResumeDocument | string,
  fallbackParsed?: ParsedResume
): ResumeDocument {
  if (typeof docOrMarkdown === "string") {
    return parseMarkdownToResumeDocument(docOrMarkdown, fallbackParsed);
  }
  return docOrMarkdown;
}

/**
 * Generates an ATS-compliant, recruiter-ready printable HTML document with selectable text.
 * Styled according to the selected template.
 */
export function generatePrintableHtml(
  docOrMarkdown: ResumeDocument | string,
  templateOrParsed?: ResumeTemplateId | string | ParsedResume
): string {
  let doc: ResumeDocument;
  let templateId: ResumeTemplateId = "ats-classic";

  if (typeof docOrMarkdown === "string") {
    const fallbackParsed = typeof templateOrParsed === "object" ? templateOrParsed : undefined;
    doc = parseMarkdownToResumeDocument(docOrMarkdown, fallbackParsed);
    if (typeof templateOrParsed === "string" && isTemplateId(templateOrParsed)) {
      templateId = templateOrParsed;
    }
  } else {
    doc = docOrMarkdown;
    if (typeof templateOrParsed === "string" && isTemplateId(templateOrParsed)) {
      templateId = templateOrParsed;
    } else if (doc.templateId) {
      templateId = doc.templateId;
    }
  }

  return renderHtmlDocument(doc, templateId);
}

/**
 * Builds a structured docx.Document adhering strictly to OpenXML standards.
 * Supports ResumeDocument directly with native Word typography and indentation.
 */
export function buildDocxDocument(
  docOrMarkdown: ResumeDocument | string,
  templateIdOrParsed?: ResumeTemplateId | ParsedResume
): Document {
  const doc = ensureResumeDocument(
    docOrMarkdown, 
    typeof templateIdOrParsed === "object" ? templateIdOrParsed : undefined
  );
  const templateId = typeof templateIdOrParsed === "string" ? templateIdOrParsed : (doc.templateId || "ats-classic");

  const children: Paragraph[] = [];
  const isCenteredHeader = templateId === "ats-classic" || templateId === "minimal-exec";

  // 1. Header: Name & Title
  children.push(new Paragraph({
    alignment: isCenteredHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 100, after: 60 },
    children: [
      new TextRun({
        text: doc.header.name.toUpperCase(),
        bold: true,
        size: 32, // 16pt
        font: getDocxFont(templateId)
      })
    ]
  }));

  if (doc.header.professionalTitle) {
    children.push(new Paragraph({
      alignment: isCenteredHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: doc.header.professionalTitle,
          italics: true,
          size: 22,
          color: "475569",
          font: getDocxFont(templateId)
        })
      ]
    }));
  }

  // Header: Contact row
  const contactItems = [
    doc.header.email,
    doc.header.phone,
    doc.header.location,
    doc.header.linkedin,
    doc.header.github,
    doc.header.portfolio
  ].filter(Boolean) as string[];

  if (contactItems.length > 0) {
    children.push(new Paragraph({
      alignment: isCenteredHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { after: 180 },
      children: [
        new TextRun({
          text: contactItems.join("  |  "),
          size: 19,
          color: "334155",
          font: getDocxFont(templateId)
        })
      ]
    }));
  }

  // 2. Summary
  if (doc.summary) {
    addDocxSectionHeader(children, "PROFESSIONAL SUMMARY", templateId);
    children.push(new Paragraph({
      spacing: { after: 140 },
      children: [
        new TextRun({
          text: doc.summary,
          size: 20,
          font: getDocxFont(templateId)
        })
      ]
    }));
  }

  // Helper for rendering experience items
  const renderExpSection = () => {
    if (!doc.experience || doc.experience.length === 0) return;
    addDocxSectionHeader(children, "WORK EXPERIENCE", templateId);
    for (const exp of doc.experience) {
      // Role & Company + Dates
      const rightMeta = [exp.location, exp.dates].filter(Boolean).join(" | ");
      children.push(new Paragraph({
        spacing: { before: 80, after: 40 },
        children: [
          new TextRun({ text: exp.title, bold: true, size: 21, font: getDocxFont(templateId) }),
          new TextRun({ text: ` — ${exp.company}`, bold: true, color: "334155", size: 21, font: getDocxFont(templateId) }),
          ...(rightMeta ? [new TextRun({ text: ` (${rightMeta})`, italics: true, color: "64748b", size: 19, font: getDocxFont(templateId) })] : [])
        ]
      }));

      for (const bullet of exp.bullets) {
        children.push(new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 40 },
          children: parseMarkdownRuns(bullet, getDocxFont(templateId))
        }));
      }
    }
  };

  // Helper for rendering education items
  const renderEduSection = () => {
    if (!doc.education || doc.education.length === 0) return;
    addDocxSectionHeader(children, "EDUCATION", templateId);
    for (const edu of doc.education) {
      const meta = [edu.dates, edu.gpa ? `GPA: ${edu.gpa}` : ""].filter(Boolean).join(" | ");
      children.push(new Paragraph({
        spacing: { before: 60, after: 40 },
        children: [
          new TextRun({ text: edu.degree, bold: true, size: 20, font: getDocxFont(templateId) }),
          new TextRun({ text: `, ${edu.institution}`, size: 20, font: getDocxFont(templateId) }),
          ...(meta ? [new TextRun({ text: ` (${meta})`, italics: true, color: "64748b", size: 19, font: getDocxFont(templateId) })] : [])
        ]
      }));
    }
  };

  // Helper for rendering projects
  const renderProjSection = () => {
    if (!doc.projects || doc.projects.length === 0) return;
    addDocxSectionHeader(children, "TECHNICAL PROJECTS", templateId);
    for (const proj of doc.projects) {
      const techStr = proj.technologies && proj.technologies.length > 0 ? ` [${proj.technologies.join(", ")}]` : "";
      children.push(new Paragraph({
        spacing: { before: 80, after: 40 },
        children: [
          new TextRun({ text: proj.name, bold: true, size: 21, font: getDocxFont(templateId) }),
          ...(techStr ? [new TextRun({ text: techStr, italics: true, color: "0284c7", size: 19, font: getDocxFont(templateId) })] : [])
        ]
      }));

      for (const bullet of proj.bullets) {
        children.push(new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 40 },
          children: parseMarkdownRuns(bullet, getDocxFont(templateId))
        }));
      }
    }
  };

  // Helper for rendering skills
  const renderSkillsSection = () => {
    if (!doc.skills) return;
    addDocxSectionHeader(children, "TECHNICAL SKILLS", templateId);
    if (Array.isArray(doc.skills) && doc.skills.length > 0) {
      if (typeof doc.skills[0] === "string") {
        children.push(new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: (doc.skills as string[]).join(", "), size: 20, font: getDocxFont(templateId) })]
        }));
      } else {
        for (const cat of doc.skills as ResumeSkillCategory[]) {
          children.push(new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: `${cat.category}: `, bold: true, size: 20, font: getDocxFont(templateId) }),
              new TextRun({ text: cat.items.join(", "), size: 20, font: getDocxFont(templateId) })
            ]
          }));
        }
      }
    }
  };

  // Ordering based on template (Student/Fresher prioritizes Education and Projects)
  if (templateId === "student-fresher") {
    renderEduSection();
    renderProjSection();
    renderSkillsSection();
    renderExpSection();
  } else if (templateId === "technical") {
    renderSkillsSection();
    renderExpSection();
    renderProjSection();
    renderEduSection();
  } else {
    renderExpSection();
    renderProjSection();
    renderSkillsSection();
    renderEduSection();
  }

  // Certifications
  if (doc.certifications && doc.certifications.length > 0) {
    addDocxSectionHeader(children, "CERTIFICATIONS", templateId);
    for (const cert of doc.certifications) {
      const certStr = typeof cert === "string" 
        ? cert 
        : `${cert.name}${cert.issuer ? ` — ${cert.issuer}` : ""}${cert.date ? ` (${cert.date})` : ""}`;
      children.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 30 },
        children: [new TextRun({ text: certStr, size: 20, font: getDocxFont(templateId) })]
      }));
    }
  }

  // Achievements
  if (doc.achievements && doc.achievements.length > 0) {
    addDocxSectionHeader(children, "KEY ACHIEVEMENTS", templateId);
    for (const ach of doc.achievements) {
      children.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 30 },
        children: [new TextRun({ text: ach, size: 20, font: getDocxFont(templateId) })]
      }));
    }
  }

  return new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 720,    // 0.5 in (720 dxa)
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
export async function generateDocxBlob(
  docOrMarkdown: ResumeDocument | string, 
  templateIdOrParsed?: ResumeTemplateId | ParsedResume
): Promise<Blob> {
  const doc = buildDocxDocument(docOrMarkdown, templateIdOrParsed);
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
export async function generateDocxBuffer(
  docOrMarkdown: ResumeDocument | string, 
  templateIdOrParsed?: ResumeTemplateId | ParsedResume
): Promise<Buffer> {
  const doc = buildDocxDocument(docOrMarkdown, templateIdOrParsed);
  const buffer = await Packer.toBuffer(doc);
  const validation = await validateDocxPackage(buffer);

  if (!validation.isValid) {
    throw new Error(`Generated DOCX package validation failed: ${validation.error}`);
  }

  return buffer;
}

/**
 * Generates clean plain text representation from ResumeDocument or markdown.
 */
export function generatePlainText(docOrMarkdown: ResumeDocument | string): string {
  const doc = ensureResumeDocument(docOrMarkdown);
  return resumeDocumentToPlainText(doc);
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

// ----------------------------------------------------------------------------
// Internal Typography & HTML Rendering Utilities
// ----------------------------------------------------------------------------

function isTemplateId(val: string): val is ResumeTemplateId {
  return ["ats-classic", "modern-pro", "technical", "minimal-exec", "student-fresher"].includes(val);
}

function getDocxFont(templateId: ResumeTemplateId): string {
  switch (templateId) {
    case "ats-classic":
      return "Times New Roman";
    case "minimal-exec":
      return "Georgia";
    case "technical":
      return "Calibri";
    case "student-fresher":
    case "modern-pro":
    default:
      return "Arial";
  }
}

function addDocxSectionHeader(children: Paragraph[], title: string, templateId: ResumeTemplateId) {
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 180, after: 80 },
    children: [
      new TextRun({
        text: title,
        bold: true,
        size: 24, // 12pt
        color: templateId === "modern-pro" ? "0f766e" : (templateId === "technical" ? "0369a1" : "0f172a"),
        font: getDocxFont(templateId)
      })
    ]
  }));
}

function parseMarkdownRuns(text: string, fontName = "Arial"): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|[^*]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const chunk = match[0];
    if (chunk.startsWith("**") && chunk.endsWith("**") && chunk.length >= 4) {
      runs.push(new TextRun({ text: chunk.slice(2, -2), bold: true, size: 20, font: fontName }));
    } else if (chunk.startsWith("*") && chunk.endsWith("*") && chunk.length >= 2) {
      runs.push(new TextRun({ text: chunk.slice(1, -1), italics: true, size: 20, font: fontName }));
    } else {
      runs.push(new TextRun({ text: chunk, size: 20, font: fontName }));
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text, size: 20, font: fontName })];
}

function renderHtmlDocument(doc: ResumeDocument, templateId: ResumeTemplateId): string {
  const title = `${doc.header.name} - Resume`;
  const isCentered = templateId === "ats-classic" || templateId === "minimal-exec";

  const contactList = [
    doc.header.email ? `<a href="mailto:${escapeHtml(doc.header.email)}">${escapeHtml(doc.header.email)}</a>` : "",
    doc.header.phone ? escapeHtml(doc.header.phone) : "",
    doc.header.location ? escapeHtml(doc.header.location) : "",
    doc.header.linkedin ? `<a href="https://${escapeHtml(doc.header.linkedin.replace(/^https?:\/\//, ""))}" target="_blank">${escapeHtml(doc.header.linkedin)}</a>` : "",
    doc.header.github ? `<a href="https://${escapeHtml(doc.header.github.replace(/^https?:\/\//, ""))}" target="_blank">${escapeHtml(doc.header.github)}</a>` : "",
    doc.header.portfolio ? `<a href="https://${escapeHtml(doc.header.portfolio.replace(/^https?:\/\//, ""))}" target="_blank">${escapeHtml(doc.header.portfolio)}</a>` : ""
  ].filter(Boolean);

  const sectionsHtml: string[] = [];

  // Summary
  if (doc.summary) {
    sectionsHtml.push(`
      <section class="resume-section">
        <h2 class="section-title">Professional Summary</h2>
        <p class="summary-text">${escapeHtml(doc.summary)}</p>
      </section>
    `);
  }

  // Work Experience
  const expHtml = () => {
    if (!doc.experience || doc.experience.length === 0) return "";
    const items = doc.experience.map(exp => `
      <div class="entry-block">
        <div class="entry-header">
          <div class="entry-title-row">
            <span class="entry-role">${escapeHtml(exp.title)}</span>
            <span class="entry-separator">—</span>
            <span class="entry-company">${escapeHtml(exp.company)}</span>
          </div>
          <div class="entry-meta">
            ${exp.location ? `<span class="entry-location">${escapeHtml(exp.location)}</span>` : ""}
            ${exp.location && exp.dates ? `<span class="meta-dot">•</span>` : ""}
            ${exp.dates ? `<span class="entry-dates">${escapeHtml(exp.dates)}</span>` : ""}
          </div>
        </div>
        <ul class="entry-bullets">
          ${exp.bullets.map(b => `<li>${formatInlineMarkdown(b)}</li>`).join("")}
        </ul>
      </div>
    `).join("");

    return `
      <section class="resume-section">
        <h2 class="section-title">Work Experience</h2>
        ${items}
      </section>
    `;
  };

  // Education
  const eduHtml = () => {
    if (!doc.education || doc.education.length === 0) return "";
    const items = doc.education.map(edu => `
      <div class="entry-block education-entry">
        <div class="entry-header">
          <div class="entry-title-row">
            <span class="entry-role">${escapeHtml(edu.degree)}</span>
            <span class="entry-separator">,</span>
            <span class="entry-company">${escapeHtml(edu.institution)}</span>
          </div>
          <div class="entry-meta">
            ${edu.gpa ? `<span class="entry-location">GPA: ${escapeHtml(edu.gpa)}</span>` : ""}
            ${edu.gpa && edu.dates ? `<span class="meta-dot">•</span>` : ""}
            ${edu.dates ? `<span class="entry-dates">${escapeHtml(edu.dates)}</span>` : ""}
          </div>
        </div>
      </div>
    `).join("");

    return `
      <section class="resume-section">
        <h2 class="section-title">Education</h2>
        ${items}
      </section>
    `;
  };

  // Projects
  const projHtml = () => {
    if (!doc.projects || doc.projects.length === 0) return "";
    const items = doc.projects.map(p => `
      <div class="entry-block">
        <div class="entry-header">
          <div class="entry-title-row">
            <span class="entry-role">${escapeHtml(p.name)}</span>
            ${p.technologies && p.technologies.length > 0 ? `<span class="tech-badge-list">[${escapeHtml(p.technologies.join(", "))}]</span>` : ""}
          </div>
          ${p.dates ? `<div class="entry-meta"><span class="entry-dates">${escapeHtml(p.dates)}</span></div>` : ""}
        </div>
        <ul class="entry-bullets">
          ${p.bullets.map(b => `<li>${formatInlineMarkdown(b)}</li>`).join("")}
        </ul>
      </div>
    `).join("");

    return `
      <section class="resume-section">
        <h2 class="section-title">Technical Projects</h2>
        ${items}
      </section>
    `;
  };

  // Technical Skills
  const skillsHtml = () => {
    if (!doc.skills) return "";
    let content = "";
    if (Array.isArray(doc.skills) && doc.skills.length > 0) {
      if (typeof doc.skills[0] === "string") {
        content = `<p class="skills-flat">${(doc.skills as string[]).map(s => escapeHtml(s)).join(", ")}</p>`;
      } else {
        content = `
          <div class="skills-grid">
            ${(doc.skills as ResumeSkillCategory[]).map(cat => `
              <div class="skill-category-row">
                <strong class="skill-category-label">${escapeHtml(cat.category)}:</strong>
                <span class="skill-category-items">${cat.items.map(s => escapeHtml(s)).join(", ")}</span>
              </div>
            `).join("")}
          </div>
        `;
      }
    }

    return `
      <section class="resume-section">
        <h2 class="section-title">Technical Skills</h2>
        ${content}
      </section>
    `;
  };

  // Order sections per template
  if (templateId === "student-fresher") {
    sectionsHtml.push(eduHtml(), projHtml(), skillsHtml(), expHtml());
  } else if (templateId === "technical") {
    sectionsHtml.push(skillsHtml(), expHtml(), projHtml(), eduHtml());
  } else {
    sectionsHtml.push(expHtml(), projHtml(), skillsHtml(), eduHtml());
  }

  // Certifications
  if (doc.certifications && doc.certifications.length > 0) {
    sectionsHtml.push(`
      <section class="resume-section">
        <h2 class="section-title">Certifications</h2>
        <ul class="entry-bullets">
          ${doc.certifications.map(c => {
            const str = typeof c === "string" ? c : `${c.name}${c.issuer ? ` — ${c.issuer}` : ""}${c.date ? ` (${c.date})` : ""}`;
            return `<li>${escapeHtml(str)}</li>`;
          }).join("")}
        </ul>
      </section>
    `);
  }

  // Achievements
  if (doc.achievements && doc.achievements.length > 0) {
    sectionsHtml.push(`
      <section class="resume-section">
        <h2 class="section-title">Key Achievements</h2>
        <ul class="entry-bullets">
          ${doc.achievements.map(a => `<li>${formatInlineMarkdown(a)}</li>`).join("")}
        </ul>
      </section>
    `);
  }

  return `<!DOCTYPE html>
<html lang="en" data-template="${templateId}">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    @page { size: letter; margin: 0.5in; }
    @media print {
      body { margin: 0; padding: 0; background: #ffffff !important; color: #000000 !important; }
      .no-print { display: none !important; }
      .resume-container { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; padding: 0 !important; }
      .entry-block, .resume-section, li { page-break-inside: avoid; break-inside: avoid; }
      h2.section-title { page-break-after: avoid; break-after: avoid; }
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px 12px;
      background: #f1f5f9;
      color: #0f172a;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .resume-container {
      background: #ffffff;
      max-width: 820px;
      margin: 0 auto;
      padding: 44px 48px;
      box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.08);
      line-height: 1.45;
    }
    
    /* Template Specific Fonts & Colors */
    [data-template="ats-classic"] { font-family: "Times New Roman", Times, Georgia, serif; }
    [data-template="ats-classic"] .candidate-name { text-align: center; font-size: 24pt; letter-spacing: 0.5px; }
    [data-template="ats-classic"] .candidate-contacts { justify-content: center; }
    [data-template="ats-classic"] .section-title { border-bottom: 1.5pt solid #0f172a; font-size: 11pt; text-transform: uppercase; letter-spacing: 1px; }

    [data-template="modern-pro"] { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    [data-template="modern-pro"] .candidate-name { font-size: 23pt; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
    [data-template="modern-pro"] .section-title { font-size: 11pt; font-weight: 700; color: #0f766e; border-bottom: 1.5pt solid #ccfbf1; text-transform: uppercase; letter-spacing: 0.5px; }

    [data-template="technical"] { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    [data-template="technical"] .candidate-name { font-size: 22pt; font-weight: 800; color: #0f172a; }
    [data-template="technical"] .section-title { font-size: 10.5pt; font-weight: 700; color: #0369a1; border-bottom: 1.5pt solid #e0f2fe; text-transform: uppercase; letter-spacing: 0.5px; }
    [data-template="technical"] .tech-badge-list { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 8.5pt; color: #0284c7; margin-left: 6px; }

    [data-template="minimal-exec"] { font-family: Georgia, serif; }
    [data-template="minimal-exec"] .candidate-name { text-align: center; font-size: 22pt; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; }
    [data-template="minimal-exec"] .candidate-contacts { justify-content: center; font-size: 9pt; }
    [data-template="minimal-exec"] .section-title { text-align: center; border-bottom: 0.75pt solid #cbd5e1; font-size: 10pt; letter-spacing: 2px; text-transform: uppercase; }

    [data-template="student-fresher"] { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    [data-template="student-fresher"] .candidate-name { font-size: 22pt; font-weight: 700; color: #1e293b; }
    [data-template="student-fresher"] .section-title { font-size: 10.5pt; font-weight: 700; color: #334155; border-bottom: 1pt solid #cbd5e1; text-transform: uppercase; }

    /* Structural Classes */
    .candidate-name { margin: 0 0 4px 0; color: #0f172a; }
    .professional-title { margin: 0 0 6px 0; font-size: 11pt; color: #475569; font-weight: 500; ${isCentered ? "text-align: center;" : ""} }
    .candidate-contacts {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 12px;
      font-size: 9.5pt;
      color: #334155;
      margin-bottom: 16px;
      align-items: center;
    }
    .candidate-contacts a { color: inherit; text-decoration: none; }
    .candidate-contacts a:hover { text-decoration: underline; color: #0284c7; }

    .resume-section { margin-top: 14px; margin-bottom: 14px; }
    .section-title {
      margin: 0 0 8px 0;
      padding-bottom: 3px;
    }
    .summary-text {
      font-size: 9.5pt;
      line-height: 1.45;
      margin: 0;
      color: #1e293b;
    }

    .entry-block { margin-bottom: 10px; }
    .entry-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 10pt;
      margin-bottom: 3px;
    }
    .entry-title-row { font-weight: 600; color: #0f172a; }
    .entry-role { font-weight: 700; }
    .entry-separator { margin: 0 4px; color: #64748b; font-weight: 400; }
    .entry-company { color: #334155; font-weight: 600; }
    .entry-meta { font-size: 9pt; color: #64748b; text-align: right; }
    .meta-dot { margin: 0 4px; }

    .entry-bullets {
      margin: 3px 0 0 16px;
      padding: 0;
      list-style-type: disc;
    }
    .entry-bullets li {
      font-size: 9.5pt;
      line-height: 1.4;
      margin-bottom: 2px;
      color: #1e293b;
    }

    .skills-grid { display: flex; flex-direction: column; gap: 3px; }
    .skill-category-row { font-size: 9.5pt; line-height: 1.35; }
    .skill-category-label { font-weight: 700; color: #0f172a; margin-right: 4px; }
    .skill-category-items { color: #334155; }
    .skills-flat { font-size: 9.5pt; line-height: 1.4; margin: 0; color: #334155; }

    strong { font-weight: 700; }
    em { font-style: italic; }
  </style>
</head>
<body>
  <div class="resume-container">
    <header class="resume-header">
      <h1 class="candidate-name">${escapeHtml(doc.header.name)}</h1>
      ${doc.header.professionalTitle ? `<div class="professional-title">${escapeHtml(doc.header.professionalTitle)}</div>` : ""}
      ${contactList.length > 0 ? `<div class="candidate-contacts">${contactList.join('<span class="meta-dot">|</span>')}</div>` : ""}
    </header>
    ${sectionsHtml.join("\n")}
  </div>
</body>
</html>`;
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
