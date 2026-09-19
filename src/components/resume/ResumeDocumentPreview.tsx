import React, { useState } from "react";
import { 
  ResumeDocument, 
  ResumeTemplateId, 
  ResumeSkillCategory 
} from "../../types";
import { 
  Printer, 
  FileSpreadsheet, 
  Copy, 
  Check, 
  Download, 
  ZoomIn, 
  ZoomOut, 
  Maximize2,
  FileText,
  Briefcase,
  Layers,
  ChevronDown
} from "lucide-react";
import { 
  generateDocxBlob, 
  generatePrintableHtml, 
  generatePlainText, 
  triggerDownload, 
  sanitizeExportFileName,
  DOCX_MIME_TYPE 
} from "../../lib/exportEngine";

interface ResumeDocumentPreviewProps {
  document: ResumeDocument;
  targetCompany?: string;
  targetRole?: string;
  activeTemplate: ResumeTemplateId;
  onTemplateChange: (template: ResumeTemplateId) => void;
  onTrackApplication?: () => void;
  isTracked?: boolean;
}

const TEMPLATES: { id: ResumeTemplateId; label: string; desc: string; icon: string }[] = [
  { id: "ats-classic", label: "ATS Classic", desc: "Single-column traditional layout with maximum ATS parseability", icon: "📄" },
  { id: "modern-pro", label: "Modern Pro", desc: "Clean contemporary typography with subtle slate accents", icon: "✨" },
  { id: "technical", label: "Technical", desc: "Prominent skills matrix and architecture project tags", icon: "💻" },
  { id: "minimal-exec", label: "Minimal Executive", desc: "Understated elegance, refined spacing, and leadership focus", icon: "🏛️" },
  { id: "student-fresher", label: "Student / Fresher", desc: "Education and projects prioritized in compact 1-page density", icon: "🎓" }
];

export const ResumeDocumentPreview: React.FC<ResumeDocumentPreviewProps> = ({
  document: doc,
  targetCompany,
  targetRole,
  activeTemplate,
  onTemplateChange,
  onTrackApplication,
  isTracked = false
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [copied, setCopied] = useState(false);

  // Download DOCX
  const handleExportDocx = async () => {
    try {
      setIsExportingDocx(true);
      const filename = sanitizeExportFileName(doc.header.name, targetCompany, targetRole, "docx");
      const blob = await generateDocxBlob(doc, activeTemplate);
      triggerDownload(blob, filename, DOCX_MIME_TYPE);
    } catch (err: any) {
      alert(`DOCX Export failed: ${err.message || "Unknown error"}`);
    } finally {
      setIsExportingDocx(false);
    }
  };

  // Print / Vector PDF
  const handlePrintPdf = () => {
    const html = generatePrintableHtml(doc, activeTemplate);
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups to print/export PDF.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 400);
  };

  // Copy Plain Text
  const handleCopyText = async () => {
    try {
      const text = generatePlainText(doc);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Clipboard copy failed", e);
    }
  };

  // Download TXT
  const handleDownloadTxt = () => {
    const text = generatePlainText(doc);
    const filename = sanitizeExportFileName(doc.header.name, targetCompany, targetRole, "txt");
    triggerDownload(text, filename, "text/plain");
  };

  const isCentered = activeTemplate === "ats-classic" || activeTemplate === "minimal-exec";

  // Section renderers
  const renderSummary = () => {
    if (!doc.summary) return null;
    return (
      <section className="resume-preview-section mb-4">
        <h3 className={`section-heading font-bold uppercase tracking-wider text-xs pb-1 mb-2 ${
          activeTemplate === "modern-pro" ? "text-teal-700 border-b-2 border-teal-100" :
          activeTemplate === "technical" ? "text-sky-700 border-b-2 border-sky-100" :
          activeTemplate === "minimal-exec" ? "text-center text-slate-800 border-b border-slate-300 tracking-[0.15em]" :
          "text-slate-900 border-b-2 border-slate-900"
        }`}>
          Professional Summary
        </h3>
        <p className="text-[13px] leading-relaxed text-slate-700 text-justify">
          {doc.summary}
        </p>
      </section>
    );
  };

  const renderExperience = () => {
    if (!doc.experience || doc.experience.length === 0) return null;
    return (
      <section className="resume-preview-section mb-4">
        <h3 className={`section-heading font-bold uppercase tracking-wider text-xs pb-1 mb-2.5 ${
          activeTemplate === "modern-pro" ? "text-teal-700 border-b-2 border-teal-100" :
          activeTemplate === "technical" ? "text-sky-700 border-b-2 border-sky-100" :
          activeTemplate === "minimal-exec" ? "text-center text-slate-800 border-b border-slate-300 tracking-[0.15em]" :
          "text-slate-900 border-b-2 border-slate-900"
        }`}>
          Work Experience
        </h3>
        <div className="space-y-3">
          {doc.experience.map((exp, idx) => (
            <div key={idx} className="experience-item">
              <div className="flex justify-between items-baseline text-xs mb-1">
                <div className="font-semibold text-slate-900">
                  <span className="font-bold text-slate-950">{exp.title}</span>
                  <span className="text-slate-400 mx-1.5">—</span>
                  <span className="text-slate-700">{exp.company}</span>
                </div>
                <div className="text-[11px] text-slate-500 font-medium">
                  {exp.location && <span>{exp.location}</span>}
                  {exp.location && exp.dates && <span className="mx-1">•</span>}
                  {exp.dates && <span>{exp.dates}</span>}
                </div>
              </div>
              <ul className="list-disc ml-4 space-y-1 text-[12.5px] leading-relaxed text-slate-700">
                {exp.bullets.map((b, bIdx) => (
                  <li key={bIdx} dangerouslySetInnerHTML={{ __html: formatInline(b) }} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderProjects = () => {
    if (!doc.projects || doc.projects.length === 0) return null;
    return (
      <section className="resume-preview-section mb-4">
        <h3 className={`section-heading font-bold uppercase tracking-wider text-xs pb-1 mb-2.5 ${
          activeTemplate === "modern-pro" ? "text-teal-700 border-b-2 border-teal-100" :
          activeTemplate === "technical" ? "text-sky-700 border-b-2 border-sky-100" :
          activeTemplate === "minimal-exec" ? "text-center text-slate-800 border-b border-slate-300 tracking-[0.15em]" :
          "text-slate-900 border-b-2 border-slate-900"
        }`}>
          Technical Projects
        </h3>
        <div className="space-y-3">
          {doc.projects.map((proj, idx) => (
            <div key={idx} className="project-item">
              <div className="flex justify-between items-baseline text-xs mb-1">
                <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <span className="font-bold text-slate-950">{proj.name}</span>
                  {proj.technologies && proj.technologies.length > 0 && (
                    <span className="text-[11px] font-mono text-sky-700 font-normal">
                      [{proj.technologies.join(", ")}]
                    </span>
                  )}
                </div>
                {proj.dates && <div className="text-[11px] text-slate-500 font-medium">{proj.dates}</div>}
              </div>
              <ul className="list-disc ml-4 space-y-1 text-[12.5px] leading-relaxed text-slate-700">
                {proj.bullets.map((b, bIdx) => (
                  <li key={bIdx} dangerouslySetInnerHTML={{ __html: formatInline(b) }} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderSkills = () => {
    if (!doc.skills) return null;
    return (
      <section className="resume-preview-section mb-4">
        <h3 className={`section-heading font-bold uppercase tracking-wider text-xs pb-1 mb-2 ${
          activeTemplate === "modern-pro" ? "text-teal-700 border-b-2 border-teal-100" :
          activeTemplate === "technical" ? "text-sky-700 border-b-2 border-sky-100" :
          activeTemplate === "minimal-exec" ? "text-center text-slate-800 border-b border-slate-300 tracking-[0.15em]" :
          "text-slate-900 border-b-2 border-slate-900"
        }`}>
          Technical Skills
        </h3>
        {Array.isArray(doc.skills) && doc.skills.length > 0 && (
          typeof doc.skills[0] === "string" ? (
            <p className="text-[12.5px] leading-relaxed text-slate-700">
              {(doc.skills as string[]).join(", ")}
            </p>
          ) : (
            <div className="space-y-1 text-[12.5px] leading-relaxed text-slate-700">
              {(doc.skills as ResumeSkillCategory[]).map((cat, idx) => (
                <div key={idx} className="flex gap-1.5">
                  <strong className="text-slate-900 font-semibold min-w-max">{cat.category}:</strong>
                  <span>{cat.items.join(", ")}</span>
                </div>
              ))}
            </div>
          )
        )}
      </section>
    );
  };

  const renderEducation = () => {
    if (!doc.education || doc.education.length === 0) return null;
    return (
      <section className="resume-preview-section mb-4">
        <h3 className={`section-heading font-bold uppercase tracking-wider text-xs pb-1 mb-2 ${
          activeTemplate === "modern-pro" ? "text-teal-700 border-b-2 border-teal-100" :
          activeTemplate === "technical" ? "text-sky-700 border-b-2 border-sky-100" :
          activeTemplate === "minimal-exec" ? "text-center text-slate-800 border-b border-slate-300 tracking-[0.15em]" :
          "text-slate-900 border-b-2 border-slate-900"
        }`}>
          Education
        </h3>
        <div className="space-y-1.5">
          {doc.education.map((edu, idx) => (
            <div key={idx} className="flex justify-between items-baseline text-xs">
              <div>
                <span className="font-bold text-slate-900">{edu.degree}</span>
                <span className="text-slate-400 mx-1.5">,</span>
                <span className="text-slate-700">{edu.institution}</span>
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                {edu.gpa && <span>GPA: {edu.gpa}</span>}
                {edu.gpa && edu.dates && <span className="mx-1">•</span>}
                {edu.dates && <span>{edu.dates}</span>}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  const renderCertifications = () => {
    if (!doc.certifications || doc.certifications.length === 0) return null;
    return (
      <section className="resume-preview-section mb-4">
        <h3 className={`section-heading font-bold uppercase tracking-wider text-xs pb-1 mb-2 ${
          activeTemplate === "modern-pro" ? "text-teal-700 border-b-2 border-teal-100" :
          activeTemplate === "technical" ? "text-sky-700 border-b-2 border-sky-100" :
          activeTemplate === "minimal-exec" ? "text-center text-slate-800 border-b border-slate-300 tracking-[0.15em]" :
          "text-slate-900 border-b-2 border-slate-900"
        }`}>
          Certifications
        </h3>
        <ul className="list-disc ml-4 space-y-1 text-[12.5px] leading-relaxed text-slate-700">
          {doc.certifications.map((c, idx) => {
            const str = typeof c === "string" ? c : `${c.name}${c.issuer ? ` — ${c.issuer}` : ""}${c.date ? ` (${c.date})` : ""}`;
            return <li key={idx}>{str}</li>;
          })}
        </ul>
      </section>
    );
  };

  const renderAchievements = () => {
    if (!doc.achievements || doc.achievements.length === 0) return null;
    return (
      <section className="resume-preview-section mb-4">
        <h3 className={`section-heading font-bold uppercase tracking-wider text-xs pb-1 mb-2 ${
          activeTemplate === "modern-pro" ? "text-teal-700 border-b-2 border-teal-100" :
          activeTemplate === "technical" ? "text-sky-700 border-b-2 border-sky-100" :
          activeTemplate === "minimal-exec" ? "text-center text-slate-800 border-b border-slate-300 tracking-[0.15em]" :
          "text-slate-900 border-b-2 border-slate-900"
        }`}>
          Key Achievements
        </h3>
        <ul className="list-disc ml-4 space-y-1 text-[12.5px] leading-relaxed text-slate-700">
          {doc.achievements.map((a, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: formatInline(a) }} />
          ))}
        </ul>
      </section>
    );
  };

  // Contacts
  const contactParts = [
    doc.header.email,
    doc.header.phone,
    doc.header.location,
    doc.header.linkedin,
    doc.header.github,
    doc.header.portfolio
  ].filter(Boolean) as string[];

  // Ordering based on template
  const renderOrderedSections = () => {
    if (activeTemplate === "student-fresher") {
      return (
        <>
          {renderSummary()}
          {renderEducation()}
          {renderProjects()}
          {renderSkills()}
          {renderExperience()}
          {renderCertifications()}
          {renderAchievements()}
        </>
      );
    } else if (activeTemplate === "technical") {
      return (
        <>
          {renderSummary()}
          {renderSkills()}
          {renderExperience()}
          {renderProjects()}
          {renderEducation()}
          {renderCertifications()}
          {renderAchievements()}
        </>
      );
    } else {
      return (
        <>
          {renderSummary()}
          {renderExperience()}
          {renderProjects()}
          {renderSkills()}
          {renderEducation()}
          {renderCertifications()}
          {renderAchievements()}
        </>
      );
    }
  };

  return (
    <div className="resume-preview-wrapper flex flex-col items-center w-full">
      {/* TOOLBAR */}
      <div className="w-full bg-slate-900 text-white rounded-2xl p-3.5 mb-5 shadow-lg border border-slate-800 flex flex-wrap items-center justify-between gap-3">
        {/* TEMPLATE PICKER */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-cyan-400" /> Template:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => onTemplateChange(t.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTemplate === t.id
                    ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                }`}
                title={t.desc}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* CONTROLS & EXPORTS */}
        <div className="flex items-center gap-2">
          {/* Zoom */}
          <div className="flex items-center bg-slate-800 rounded-xl p-0.5 border border-slate-700">
            <button
              onClick={() => setZoomLevel(z => Math.max(z - 10, 70))}
              className="p-1.5 hover:text-cyan-400 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono px-2 text-slate-300">{zoomLevel}%</span>
            <button
              onClick={() => setZoomLevel(z => Math.min(z + 10, 140))}
              className="p-1.5 hover:text-cyan-400 transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoomLevel(100)}
              className="p-1.5 hover:text-cyan-400 transition-colors border-l border-slate-700"
              title="Reset Zoom"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Print PDF */}
          <button
            onClick={handlePrintPdf}
            className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
            title="Open clean printable document for PDF export"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>

          {/* Export DOCX */}
          <button
            onClick={handleExportDocx}
            disabled={isExportingDocx}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
            title="Download genuine Microsoft Word (.docx) document"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{isExportingDocx ? "Generating..." : "DOCX"}</span>
          </button>

          {/* Copy Plain Text */}
          <button
            onClick={handleCopyText}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 border border-slate-700 transition-all"
            title="Copy plain text to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>

          {/* Download TXT */}
          <button
            onClick={handleDownloadTxt}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition-all"
            title="Download formatted Plain Text (.txt)"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Track Application */}
          {onTrackApplication && (
            <button
              onClick={onTrackApplication}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all ${
                isTracked 
                  ? "bg-emerald-950 text-emerald-300 border border-emerald-800" 
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm"
              }`}
              title="Log submission to Application Tracker"
            >
              {isTracked ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Briefcase className="w-3.5 h-3.5" />}
              <span>{isTracked ? "Tracked" : "Track"}</span>
            </button>
          )}
        </div>
      </div>

      {/* DOCUMENT CANVAS CONTAINER (A4 / Letter Paper Rendering) */}
      <div 
        className="w-full flex justify-center overflow-x-auto py-4 px-2 bg-slate-100 rounded-2xl border border-slate-200 shadow-inner"
        style={{ minHeight: "880px" }}
      >
        <div
          id="resume-printable-document"
          className={`bg-white text-slate-900 shadow-2xl transition-all duration-200 origin-top rounded-sm ${
            activeTemplate === "ats-classic" ? "font-serif" :
            activeTemplate === "minimal-exec" ? "font-serif" :
            "font-sans"
          }`}
          style={{
            width: "816px", // Standard Letter 8.5in at 96 DPI
            minHeight: "1056px", // Standard Letter 11in at 96 DPI
            padding: "48px 56px",
            transform: `scale(${zoomLevel / 100})`,
            transformOrigin: "top center",
            marginBottom: zoomLevel < 100 ? `-${(1056 * (100 - zoomLevel)) / 100}px` : "24px"
          }}
        >
          {/* HEADER */}
          <header className={`mb-4 pb-3 ${isCentered ? "text-center" : "text-left"}`}>
            <h1 className={`font-extrabold tracking-tight text-slate-950 ${
              activeTemplate === "ats-classic" ? "text-2xl uppercase tracking-wider" :
              activeTemplate === "minimal-exec" ? "text-2xl uppercase tracking-[0.18em] font-light" :
              "text-3xl font-black"
            }`}>
              {doc.header.name}
            </h1>

            {doc.header.professionalTitle && (
              <div className="text-xs font-semibold text-slate-600 mt-1">
                {doc.header.professionalTitle}
              </div>
            )}

            {contactParts.length > 0 && (
              <div className={`flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-slate-600 mt-2 ${isCentered ? "justify-center" : "justify-start"}`}>
                {contactParts.map((item, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <span className="text-slate-300">|</span>}
                    <span>{item}</span>
                  </React.Fragment>
                ))}
              </div>
            )}
          </header>

          {/* DYNAMIC TEMPLATE SECTIONS */}
          <main className="resume-body">
            {renderOrderedSections()}
          </main>
        </div>
      </div>
    </div>
  );
};

function formatInline(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>");
}
