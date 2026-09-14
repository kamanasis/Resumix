import React, { useState } from "react";
import { ResumeAnalysis, ResumeFile } from "../types";
import { 
  Sparkles, 
  Trash2, 
  Calendar, 
  ArrowRight, 
  FileCheck, 
  TrendingUp, 
  Copy, 
  Check, 
  Download,
  Briefcase,
  ListTodo,
  Cpu,
  AlertTriangle,
  Key,
  FileText,
  MapPin,
  Building,
  Award,
  Terminal,
  Plus,
  CheckSquare,
  Compass,
  Printer,
  Search,
  Filter,
  ExternalLink,
  ChevronRight,
  Clock,
  ShieldCheck
} from "lucide-react";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { 
  sanitizeExportFileName, 
  generatePrintableHtml, 
  generateDocxBlob, 
  triggerDownload,
  DOCX_MIME_TYPE
} from "../lib/exportEngine";

export interface UnifiedHistoryItem {
  id: string;
  type: "TAILORED" | "DIAGNOSTIC";
  targetCompany: string;
  targetRole: string;
  resumeId: string;
  resumeName: string;
  createdAt: string;
  atsScore: number;
  beforeAtsScore?: number;
  afterAtsScore?: number;
  atsScoreDelta?: number;
  scoreBreakdown?: {
    requiredSkills?: number;
    roleAlignment?: number;
    keywordCoverage?: number;
    experienceMatch?: number;
    preferredSkills?: number;
    atsReadability?: number;
    educationMatch?: number;
  };
  tailoredContent: string;
  tailoredBullets: { current: string; improved: string }[];
  suggestedChanges: string;
  missingSkills: string[];
  missingCertifications: string[];
  missingProjects: string[];
  weakExperienceAreas: string[];
  requiredTechnologies: string[];
  softSkills: string[];
  atsKeywords: string[];
  responsibilities: string[];
  jobDescription?: string;
  experienceLevel?: string;
  location?: string;
  overview?: string;
  hiringTrends?: string;
  projectExpectations?: string;
  recommendations?: string;
}

interface AnalysisHistoryProps {
  analyses: ResumeAnalysis[];
  gapReports?: any[];
  resumes?: ResumeFile[];
  userId: string;
  selectedResumeId?: string | null;
  onSelectResume?: (id: string) => void;
  onRefresh?: () => void;
  onOpenInTailor?: (context: {
    company?: string;
    role?: string;
    jobDescription?: string;
    resumeId?: string;
  }) => void;
  onTrackApplication?: (context: {
    company?: string;
    role?: string;
    resumeId?: string;
  }) => void;
}

export function sanitizeHistoryString(val?: string): string {
  if (!val) return "";
  let clean = val.trim();
  // Strip all rogue backslashes and boundary slashes (e.g., 'google\' -> 'google')
  clean = clean.replace(/\\+/g, " ").replace(/^\/+|\/+$/g, "").trim();
  clean = clean.replace(/\s+/g, " ");
  // Title-case if all lowercase or all uppercase (e.g. 'google' -> 'Google', 'deloitte' -> 'Deloitte')
  if ((clean === clean.toLowerCase() || clean === clean.toUpperCase()) && clean.length > 0) {
    clean = clean
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return clean;
}

export function getScoreTier(score: number): {
  label: string;
  badgeClass: string;
  textClass: string;
  ringColor: string;
} {
  if (score >= 80) {
    return {
      label: "Strong Match",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
      textClass: "text-emerald-700",
      ringColor: "#10b981",
    };
  }
  if (score >= 50) {
    return {
      label: "Partial Match",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
      textClass: "text-amber-700",
      ringColor: "#f59e0b",
    };
  }
  return {
    label: "Low Match",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    textClass: "text-red-700",
    ringColor: "#ef4444",
  };
}

export function formatHistoryDate(isoString?: string): string {
  if (!isoString) return "Recent";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "Recent";
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "Recent";
  }
}

function safeString(val: any): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) {
    return val
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .join("\n");
  }
  if (typeof val === "object") {
    return Object.entries(val)
      .map(([key, value]) => {
        const valStr = typeof value === "string" ? value : JSON.stringify(value);
        return `- **${key}**: ${valStr}`;
      })
      .join("\n");
  }
  return String(val);
}

export default function AnalysisHistory({
  analyses,
  gapReports = [],
  resumes = [],
  userId,
  selectedResumeId,
  onSelectResume,
  onRefresh,
  onOpenInTailor,
  onTrackApplication,
}: AnalysisHistoryProps) {
  const [selectedItem, setSelectedItem] = useState<UnifiedHistoryItem | null>(null);
  const [filterType, setFilterType] = useState<"ALL" | "TAILORED" | "DIAGNOSTIC">("ALL");
  const [filterBySelectedResume, setFilterBySelectedResume] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedText, setCopiedText] = useState(false);
  const [copiedKeyword, setCopiedKeyword] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<string>("overview");
  const [openInTailorToast, setOpenInTailorToast] = useState(false);
  const [trackApplicationToast, setTrackApplicationToast] = useState(false);

  // Resume lookup mapping helper
  const resumeMap = new Map<string, string>();
  for (const r of resumes) {
    if (r.id) resumeMap.set(r.id, r.name || "Resume document");
  }

  // Transform analyses into unified items
  const unifiedAnalyses: UnifiedHistoryItem[] = analyses.map((a) => {
    const scoreVal =
      typeof (a as any).afterAtsScore === "number" && (a as any).afterAtsScore > 0
        ? (a as any).afterAtsScore
        : typeof a.matchingScore === "number" && a.matchingScore > 0
        ? a.matchingScore
        : typeof (a as any).atsScore === "number"
        ? (a as any).atsScore
        : 0;
    const cleanCompany = sanitizeHistoryString(a.targetCompany) || "Target Employer";
    const cleanRole = sanitizeHistoryString(a.targetRole) || "Role";
    const resumeName = a.resumeName || (a.resumeId ? resumeMap.get(a.resumeId) : "") || "Curriculum Vitae";

    return {
      id: a.id,
      type: "TAILORED",
      targetCompany: cleanCompany,
      targetRole: cleanRole,
      resumeId: a.resumeId,
      resumeName,
      createdAt: a.createdAt,
      atsScore: scoreVal,
      beforeAtsScore: (a as any).beforeAtsScore,
      afterAtsScore: (a as any).afterAtsScore ?? scoreVal,
      atsScoreDelta: (a as any).atsScoreDelta,
      scoreBreakdown: (a as any).scores || (a as any).scoreComparison?.breakdown,
      tailoredContent: a.tailoredContent || "",
      tailoredBullets: a.tailoredBullets || [],
      suggestedChanges: a.suggestedChanges || "",
      missingSkills: a.missingSkills || [],
      missingCertifications: a.missingCertifications || [],
      missingProjects: a.missingProjects || [],
      weakExperienceAreas: a.weakExperienceAreas || [],
      requiredTechnologies: a.requiredTechnologies || [],
      softSkills: a.softSkills || [],
      atsKeywords: a.atsKeywords || [],
      responsibilities: a.responsibilities || [],
      jobDescription: a.jobDescription || "",
      experienceLevel: a.experienceLevel,
      location: a.location,
      overview: a.overview,
      hiringTrends: a.hiringTrends,
      projectExpectations: a.projectExpectations,
      recommendations: a.recommendations,
    };
  });

  // Transform gapReports into unified items
  const unifiedGapReports: UnifiedHistoryItem[] = gapReports.map((g) => {
    const scoreVal =
      typeof g.atsScore === "number" && g.atsScore > 0
        ? g.atsScore
        : typeof g.targetMatchScore === "number" && g.targetMatchScore > 0
        ? g.targetMatchScore
        : typeof g.scores?.atsCompatibility === "number"
        ? g.scores.atsCompatibility
        : 0;
    const cleanCompany = sanitizeHistoryString(g.targetCompany || g.company || g.companyName) || "Target Employer";
    const cleanRole = sanitizeHistoryString(g.targetRole || g.role || g.title) || "Role";
    const resumeName = g.resumeName || (g.resumeId ? resumeMap.get(g.resumeId) : "") || "Curriculum Vitae";

    const missingSkillsList = (g.missingItems || [])
      .map((item: any) => typeof item === "string" ? item : item.title || item.name)
      .filter(Boolean);

    const weakList = (g.weakItems || [])
      .map((item: any) => typeof item === "string" ? item : item.title || item.name)
      .filter(Boolean);

    return {
      id: g.id,
      type: "DIAGNOSTIC",
      targetCompany: cleanCompany,
      targetRole: cleanRole,
      resumeId: g.resumeId,
      resumeName,
      createdAt: g.createdAt,
      atsScore: scoreVal,
      scoreBreakdown: g.scores,
      tailoredContent: "",
      tailoredBullets: [],
      suggestedChanges: "",
      missingSkills: missingSkillsList,
      missingCertifications: [],
      missingProjects: [],
      weakExperienceAreas: weakList,
      requiredTechnologies: g.requiredTechnologies || [],
      softSkills: g.softSkills || [],
      atsKeywords: g.atsKeywords || [],
      responsibilities: g.responsibilities || [],
      jobDescription: g.jobDescription || "",
      recommendations: g.overallAssessment || g.summary,
    };
  });

  // Merge and deduplicate by ID
  const seenIds = new Set<string>();
  const allUnifiedItems: UnifiedHistoryItem[] = [];
  for (const item of [...unifiedAnalyses, ...unifiedGapReports]) {
    if (item.id && !seenIds.has(item.id)) {
      seenIds.add(item.id);
      allUnifiedItems.push(item);
    }
  }

  // Sort descending by date
  allUnifiedItems.sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  // Apply filter & search
  const filteredItems = allUnifiedItems.filter((item) => {
    if (filterType === "TAILORED" && item.type !== "TAILORED") return false;
    if (filterType === "DIAGNOSTIC" && item.type !== "DIAGNOSTIC") return false;
    if (filterBySelectedResume && selectedResumeId && item.resumeId !== selectedResumeId) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCompany = item.targetCompany.toLowerCase().includes(q);
      const matchRole = item.targetRole.toLowerCase().includes(q);
      const matchResume = item.resumeName.toLowerCase().includes(q);
      return matchCompany || matchRole || matchResume;
    }
    return true;
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const copyKeyword = (kw: string) => {
    navigator.clipboard.writeText(kw);
    setCopiedKeyword(kw);
    setTimeout(() => setCopiedKeyword(null), 1500);
  };

  const handleDelete = async (item: UnifiedHistoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedItem?.id === item.id) {
      setSelectedItem(null);
    }
    setDeletingId(item.id);
    try {
      const collectionName = item.type === "DIAGNOSTIC" ? "gapReports" : "analyses";
      const docRef = doc(db, "users", userId, collectionName, item.id);
      await deleteDoc(docRef);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Error deleting optimization record:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleExport = async (format: "pdf" | "docx" | "md", item: UnifiedHistoryItem) => {
    const content = item.tailoredContent;
    if (!content) return;
    const filename = sanitizeExportFileName(
      "Candidate",
      item.targetCompany,
      item.targetRole,
      format === "docx" ? "docx" : format === "md" ? "md" : "html"
    );

    if (format === "docx") {
      try {
        const docxBlob = await generateDocxBlob(content);
        triggerDownload(docxBlob, filename, DOCX_MIME_TYPE);
      } catch (err: any) {
        console.error("DOCX generation error:", err);
        alert(err.message || "Failed to generate DOCX document.");
      }
    } else if (format === "md") {
      const mdBlob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
      triggerDownload(mdBlob, filename);
    } else if (format === "pdf") {
      const htmlContent = generatePrintableHtml(content, `${item.targetRole} - ${item.targetCompany}`);
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
        }, 500);
      } else {
        const htmlBlob = new Blob([htmlContent], { type: "text/html;charset=utf-8;" });
        triggerDownload(htmlBlob, filename);
      }
    }
  };

  const handleLoadInTailorWizard = (item: UnifiedHistoryItem) => {
    if (onOpenInTailor) {
      onOpenInTailor({
        company: item.targetCompany,
        role: item.targetRole,
        jobDescription: item.jobDescription,
        resumeId: item.resumeId,
      });
      setOpenInTailorToast(true);
      setTimeout(() => setOpenInTailorToast(false), 2500);
    }
  };

  const handleTrackInApplications = (item: UnifiedHistoryItem) => {
    if (onTrackApplication) {
      onTrackApplication({
        company: item.targetCompany,
        role: item.targetRole,
        resumeId: item.resumeId,
      });
      setTrackApplicationToast(true);
      setTimeout(() => setTrackApplicationToast(false), 2500);
    }
  };

  if (allUnifiedItems.length === 0) {
    return (
      <div className="text-center py-14 px-6 bg-white/50 backdrop-blur-md border border-white rounded-3xl shadow-sm">
        <div className="w-14 h-14 bg-cyan-100 text-cyan-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-cyan-200">
          <Sparkles className="w-7 h-7" />
        </div>
        <h4 className="text-slate-800 font-display font-bold text-base mb-1.5">
          No Optimization History Yet
        </h4>
        <p className="text-slate-500 text-xs max-w-md mx-auto leading-relaxed mb-6">
          When you perform deterministic ATS compatibility evaluations or generate tailored resumes in the Customization Tool, your records and export configurations will appear here.
        </p>
        {onOpenInTailor && (
          <button
            onClick={() => onOpenInTailor({})}
            className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-bold rounded-xl inline-flex items-center gap-2 transition-all shadow-sm clickable-cursor"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Launch Customization Tool</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Toast Notifications */}
      {openInTailorToast && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-3 rounded-2xl shadow-xl border border-cyan-500/30 flex items-center gap-2.5 animate-fadeIn">
          <Check className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>Loaded into Customization Tool workspace!</span>
        </div>
      )}
      {trackApplicationToast && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-3 rounded-2xl shadow-xl border border-cyan-500/30 flex items-center gap-2.5 animate-fadeIn">
          <Check className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>Switched to Applications Tracker!</span>
        </div>
      )}

      {/* Main List View */}
      {!selectedItem ? (
        <div className="space-y-4">
          {/* Header & Filter Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-slate-800 font-display font-bold text-xl mb-1">
                Tailored Optimization & ATS History
              </h2>
              <p className="text-slate-500 text-xs">
                Review and extract previously aligned ATS resume configurations and deterministic diagnostic reports
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-2xl border border-slate-200/60 self-start md:self-auto flex-wrap">
              <button
                onClick={() => setFilterType("ALL")}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all clickable-cursor ${
                  filterType === "ALL"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                All ({allUnifiedItems.length})
              </button>
              <button
                onClick={() => setFilterType("TAILORED")}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all clickable-cursor ${
                  filterType === "TAILORED"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Tailored Resumes ({unifiedAnalyses.length})
              </button>
              <button
                onClick={() => setFilterType("DIAGNOSTIC")}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all clickable-cursor ${
                  filterType === "DIAGNOSTIC"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                ATS Diagnostics ({unifiedGapReports.length})
              </button>
              {selectedResumeId && (
                <button
                  onClick={() => setFilterBySelectedResume(!filterBySelectedResume)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all clickable-cursor flex items-center gap-1 ${
                    filterBySelectedResume
                      ? "bg-cyan-500 text-white shadow-sm"
                      : "text-cyan-700 bg-cyan-50/70 hover:bg-cyan-100 border border-cyan-200/50"
                  }`}
                  title="Filter by currently active selected resume"
                >
                  <FileText className="w-3 h-3" />
                  <span>Selected File Only</span>
                </button>
              )}
            </div>
          </div>

          {/* Search Field */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by company, job role, or resume name..."
              className="w-full pl-10 pr-4 py-2.5 text-xs bg-white/70 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all placeholder:text-slate-400"
            />
          </div>

          {/* List Items Grid */}
          <div className="grid gap-3">
            {filteredItems.map((item) => {
              const tier = getScoreTier(item.atsScore);
              const isTailored = item.type === "TAILORED";

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className="p-4 rounded-2xl border border-white bg-white/70 backdrop-blur-sm hover:border-cyan-400 hover:bg-white transition-all duration-300 flex items-center justify-between cursor-pointer group shadow-sm hover:shadow-md"
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    {/* Score Badge */}
                    <div
                      className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-display font-bold shrink-0 border ${tier.badgeClass} shadow-sm transition-transform group-hover:scale-105`}
                    >
                      <span className="text-base font-extrabold leading-none">{item.atsScore}%</span>
                      <span className="text-[7px] font-bold uppercase tracking-wider mt-0.5">ATS Score</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wider ${
                            isTailored
                              ? "bg-cyan-100 text-cyan-700 border border-cyan-200"
                              : "bg-indigo-100 text-indigo-700 border border-indigo-200"
                          }`}
                        >
                          {isTailored ? "Tailored Resume" : "ATS Diagnostic"}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${tier.badgeClass}`}>
                          {tier.label}
                        </span>
                        {item.atsScoreDelta !== undefined && item.atsScoreDelta > 0 && (
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-0.5">
                            <TrendingUp className="w-2.5 h-2.5" />
                            <span>+{item.atsScoreDelta}% Lift</span>
                          </span>
                        )}
                      </div>

                      <h4 className="text-slate-900 font-bold truncate text-sm">
                        {item.targetCompany} • {item.targetRole}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5 text-xs flex-wrap">
                        <span className="text-slate-500 truncate font-medium">
                          Based on: <span className="text-slate-700 font-semibold">{item.resumeName}</span>
                        </span>
                        {selectedResumeId && item.resumeId === selectedResumeId ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-cyan-100 text-cyan-700 border border-cyan-200 shrink-0">
                            Active File
                          </span>
                        ) : item.resumeId && onSelectResume ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectResume(item.resumeId);
                            }}
                            className="px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 border border-transparent hover:border-cyan-200 transition-all shrink-0 clickable-cursor"
                            title="Set this resume as active in workspace"
                          >
                            Set Active
                          </button>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400 font-medium">
                        <Calendar className="w-3 h-3" />
                        <span>{formatHistoryDate(item.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    {onOpenInTailor && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLoadInTailorWizard(item);
                        }}
                        className="px-2.5 py-1.5 text-xs font-bold rounded-xl bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border border-cyan-200/80 flex items-center gap-1 transition-all shadow-sm clickable-cursor"
                        title="Load into Customization Tool"
                      >
                        <Sparkles className="w-3 h-3 text-cyan-600" />
                        <span className="hidden sm:inline">Customize</span>
                      </button>
                    )}
                    {onTrackApplication && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTrackInApplications(item);
                        }}
                        className="px-2.5 py-1.5 text-xs font-bold rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1 transition-all shadow-sm clickable-cursor"
                        title="Track in Applications"
                      >
                        <Briefcase className="w-3 h-3 text-slate-500" />
                        <span className="hidden sm:inline">Track</span>
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDelete(item, e)}
                      disabled={deletingId === item.id}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100 clickable-cursor"
                      title="Delete log"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="w-8 h-8 rounded-xl bg-slate-50 group-hover:bg-cyan-50 flex items-center justify-center transition-all">
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-cyan-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredItems.length === 0 && (
            <div className="text-center py-10 px-4 bg-white/40 border border-white rounded-3xl">
              <p className="text-slate-500 text-xs font-medium">
                No matching records found for "{searchQuery}".
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Detailed View */
        <div className="space-y-6 animate-fadeIn">
          {/* Header Action Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-3 border-b border-cyan-100">
            <button
              onClick={() => setSelectedItem(null)}
              className="text-cyan-600 hover:text-cyan-700 text-xs font-bold flex items-center gap-1.5 transition-colors clickable-cursor"
            >
              ← Back to History List
            </button>

            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              {/* Load in Tailor Wizard */}
              {onOpenInTailor && (
                <button
                  onClick={() => handleLoadInTailorWizard(selectedItem)}
                  className="py-2 px-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-sm shadow-cyan-200 clickable-cursor"
                  title="Load into Customization Tool to refine or retarget"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Open in Tailor Tool</span>
                </button>
              )}

              {/* Track in Applications */}
              {onTrackApplication && (
                <button
                  onClick={() => handleTrackInApplications(selectedItem)}
                  className="py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all clickable-cursor shadow-sm"
                  title="Track this position in Application Tracker"
                >
                  <Briefcase className="w-3.5 h-3.5 text-cyan-600" />
                  <span>Track Application</span>
                </button>
              )}

              {/* Multi-Format Export for Tailored Content */}
              {selectedItem.tailoredContent && (
                <>
                  <button
                    onClick={() => handleExport("pdf", selectedItem)}
                    className="py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all clickable-cursor shadow-sm"
                    title="Print or Save clean ATS PDF"
                  >
                    <Printer className="w-3.5 h-3.5 text-cyan-600" />
                    <span>Print PDF</span>
                  </button>
                  <button
                    onClick={() => handleExport("docx", selectedItem)}
                    className="py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all clickable-cursor shadow-sm"
                    title="Export Word Document (.docx)"
                  >
                    <FileText className="w-3.5 h-3.5 text-cyan-600" />
                    <span>DOCX</span>
                  </button>
                  <button
                    onClick={() => copyToClipboard(selectedItem.tailoredContent)}
                    className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all clickable-cursor"
                  >
                    {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedText ? "Copied" : "Copy"}</span>
                  </button>
                </>
              )}

              {/* Delete Record */}
              <button
                onClick={(e) => handleDelete(selectedItem, e)}
                disabled={deletingId === selectedItem.id}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-slate-200 clickable-cursor"
                title="Delete this record"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Hero Information Card */}
          <div className="bg-white/80 backdrop-blur-xl border border-white p-6 rounded-3xl shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                    selectedItem.type === "TAILORED"
                      ? "bg-cyan-100 text-cyan-800 border border-cyan-200"
                      : "bg-indigo-100 text-indigo-800 border border-indigo-200"
                  }`}
                >
                  {selectedItem.type === "TAILORED" ? "Tailored Resume Record" : "Deterministic ATS Diagnostic"}
                </span>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${getScoreTier(selectedItem.atsScore).badgeClass}`}>
                  {getScoreTier(selectedItem.atsScore).label}
                </span>
                {selectedItem.experienceLevel && (
                  <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-[10px] font-bold">
                    {selectedItem.experienceLevel}
                  </span>
                )}
                {selectedItem.location && (
                  <span className="px-2.5 py-1 bg-teal-50 text-teal-700 border border-teal-100 rounded-full text-[10px] font-bold flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {selectedItem.location}
                  </span>
                )}
              </div>

              <h3 className="text-2xl font-display font-bold text-slate-900 tracking-tight">
                {selectedItem.targetRole} @ {selectedItem.targetCompany}
              </h3>
              <p className="text-slate-500 text-xs font-medium">
                Saved on {formatHistoryDate(selectedItem.createdAt)} • Derived from <span className="text-slate-700 font-semibold">{selectedItem.resumeName}</span>
              </p>
            </div>

            {/* Score Showcase Gauge */}
            <div className="flex items-center gap-4 bg-slate-50/80 p-4 rounded-2xl border border-slate-200/60 shrink-0">
              <div className="text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  ATS Compatibility
                </span>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-3xl font-display font-extrabold text-slate-900">
                    {selectedItem.atsScore}%
                  </span>
                </div>
              </div>

              {selectedItem.beforeAtsScore !== undefined && selectedItem.afterAtsScore !== undefined && (
                <div className="pl-4 border-l border-slate-200 text-left">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                    Optimization Lift
                  </span>
                  <div className="text-xs font-bold text-slate-700 mt-0.5">
                    {selectedItem.beforeAtsScore}% → {selectedItem.afterAtsScore}%
                  </div>
                  {selectedItem.atsScoreDelta !== undefined && (
                    <span className="text-[10px] font-extrabold text-emerald-600 block mt-0.5">
                      +{selectedItem.atsScoreDelta}% ATS Match
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-slate-200/60">
            <button
              onClick={() => setResultTab("overview")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap clickable-cursor ${
                resultTab === "overview"
                  ? "bg-cyan-500 text-white shadow-sm shadow-cyan-300"
                  : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/60"
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>ATS & Overview</span>
            </button>

            {selectedItem.tailoredContent && (
              <button
                onClick={() => setResultTab("resume")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap clickable-cursor ${
                  resultTab === "resume"
                    ? "bg-cyan-500 text-white shadow-sm shadow-cyan-300"
                    : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/60"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Tailored Resume</span>
              </button>
            )}

            {selectedItem.tailoredBullets && selectedItem.tailoredBullets.length > 0 && (
              <button
                onClick={() => setResultTab("bullets")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap clickable-cursor ${
                  resultTab === "bullets"
                    ? "bg-cyan-500 text-white shadow-sm shadow-cyan-300"
                    : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/60"
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Bullet Improvements ({selectedItem.tailoredBullets.length})</span>
              </button>
            )}

            <button
              onClick={() => setResultTab("tech")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap clickable-cursor ${
                resultTab === "tech"
                  ? "bg-cyan-500 text-white shadow-sm shadow-cyan-300"
                  : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/60"
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Skills & Keywords</span>
            </button>

            <button
              onClick={() => setResultTab("gaps")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap clickable-cursor ${
                resultTab === "gaps"
                  ? "bg-cyan-500 text-white shadow-sm shadow-cyan-300"
                  : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/60"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Gaps & Gating</span>
            </button>

            <button
              onClick={() => setResultTab("job")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap clickable-cursor ${
                resultTab === "job"
                  ? "bg-cyan-500 text-white shadow-sm shadow-cyan-300"
                  : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/60"
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Job Details</span>
            </button>
          </div>

          {/* Active Tab Content Card */}
          <div className="bg-white/80 backdrop-blur-xl border border-white p-6 rounded-3xl shadow-sm min-h-[360px]">
            
            {/* 1. ATS & OVERVIEW TAB */}
            {resultTab === "overview" && (
              <div className="space-y-6">
                <div className="grid md:grid-cols-12 gap-6 items-start">
                  {/* Score Breakdown Column */}
                  <div className="md:col-span-6 space-y-4">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-cyan-600" />
                      <span>Deterministic Category Breakdown</span>
                    </h4>

                    {selectedItem.scoreBreakdown ? (
                      <div className="space-y-2.5">
                        {Object.entries(selectedItem.scoreBreakdown).map(([cat, val]) => {
                          const numVal = typeof val === "number" ? val : 0;
                          const title = cat.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase());
                          return (
                            <div key={cat} className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                              <div className="flex justify-between items-center text-xs font-semibold mb-1.5">
                                <span className="text-slate-700">{title}</span>
                                <span className="text-slate-900 font-bold">{numVal}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                                  style={{ width: `${Math.min(100, Math.max(0, numVal))}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs text-slate-600 leading-relaxed font-medium">
                        Deterministic score of <strong className="text-slate-900">{selectedItem.atsScore}%</strong> computed across required skills evidence, role alignment keywords, and experience depth for {selectedItem.targetRole}.
                      </div>
                    )}
                  </div>

                  {/* Summary & Readiness Card */}
                  <div className="md:col-span-6 space-y-4">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-cyan-600" />
                      <span>ATS Readiness Assessment</span>
                    </h4>

                    <div className="bg-cyan-50/60 border border-cyan-100 p-5 rounded-2xl">
                      <p className="text-xs text-slate-700 leading-relaxed font-medium">
                        {selectedItem.recommendations ||
                          (selectedItem.atsScore >= 80
                            ? "Strong match! The verified evidence in your resume shows deep alignment with the target requirements."
                            : selectedItem.atsScore >= 50
                            ? "Good foundation, but has critical technical or role requirements that should be emphasized in your resume bullets."
                            : "Low compatibility with the specified job posting. Consider addressing missing technologies and experience depth.")}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                          Company Goal
                        </span>
                        <span className="text-xs font-bold text-slate-800">{selectedItem.targetCompany}</span>
                      </div>
                      <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                          Target Position
                        </span>
                        <span className="text-xs font-bold text-slate-800">{selectedItem.targetRole}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. TAILORED RESUME TAB */}
            {resultTab === "resume" && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <h4 className="text-slate-900 font-display font-bold text-sm">
                      Tailored Resume Document
                    </h4>
                    <p className="text-slate-500 text-xs">
                      Export to Word (DOCX), Print PDF, or Copy markdown
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleExport("pdf", selectedItem)}
                      className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-sm clickable-cursor"
                    >
                      <Printer className="w-3.5 h-3.5 text-cyan-600" />
                      <span>Print PDF</span>
                    </button>
                    <button
                      onClick={() => handleExport("docx", selectedItem)}
                      className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-sm clickable-cursor"
                    >
                      <FileText className="w-3.5 h-3.5 text-cyan-600" />
                      <span>DOCX</span>
                    </button>
                    <button
                      onClick={() => copyToClipboard(selectedItem.tailoredContent)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all clickable-cursor"
                    >
                      {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedText ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>

                <div className="markdown-body overflow-y-auto max-h-[550px] border border-slate-200/60 p-6 rounded-2xl bg-white select-text leading-relaxed text-xs text-slate-800 font-sans shadow-inner">
                  <div className="whitespace-pre-wrap font-sans">{selectedItem.tailoredContent}</div>
                </div>
              </div>
            )}

            {/* 3. BULLET IMPROVEMENTS TAB */}
            {resultTab === "bullets" && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-slate-900 font-display font-bold text-sm mb-1">
                    ATS Bullet Point Transformations
                  </h4>
                  <p className="text-slate-500 text-xs">
                    Before and after comparison of resume bullet points aligned with verified impact metrics
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  {selectedItem.tailoredBullets.map((bullet, idx) => (
                    <div
                      key={idx}
                      className="grid md:grid-cols-2 gap-4 p-4 border border-slate-200/60 rounded-2xl bg-white shadow-sm hover:border-cyan-200 transition-all"
                    >
                      <div className="space-y-1">
                        <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider flex items-center gap-1">
                          <span>Original Bullet:</span>
                        </span>
                        <p className="text-xs text-slate-500 italic leading-relaxed">{bullet.current}</p>
                      </div>
                      <div className="space-y-1 border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-4">
                        <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider flex items-center gap-1">
                          <span>ATS Optimized Bullet:</span>
                        </span>
                        <p className="text-xs text-slate-800 font-semibold leading-relaxed">{bullet.improved}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. SKILLS & KEYWORDS TAB */}
            {resultTab === "tech" && (
              <div className="space-y-6">
                {/* ATS Keywords */}
                {selectedItem.atsKeywords && selectedItem.atsKeywords.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Key className="w-4 h-4 text-cyan-600" />
                        <span>ATS Optimization Keywords (Click to Copy)</span>
                      </h4>
                      {copiedKeyword && (
                        <span className="text-[10px] text-emerald-600 font-bold">
                          Copied "{copiedKeyword}"!
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedItem.atsKeywords.map((kw, idx) => (
                        <button
                          key={idx}
                          onClick={() => copyKeyword(kw)}
                          className="px-3 py-1.5 bg-slate-50 hover:bg-cyan-50 hover:text-cyan-700 border border-slate-200 hover:border-cyan-300 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                        >
                          <Key className="w-3 h-3 text-slate-400" />
                          <span>{kw}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Required Technologies */}
                {selectedItem.requiredTechnologies && selectedItem.requiredTechnologies.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Terminal className="w-4 h-4 text-cyan-600" />
                      <span>Required Technologies & Stacks</span>
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedItem.requiredTechnologies.map((tech, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1.5 bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl flex items-center gap-1.5"
                        >
                          <Cpu className="w-3 h-3 text-cyan-600" />
                          <span>{tech}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Soft Skills */}
                {selectedItem.softSkills && selectedItem.softSkills.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-cyan-600" />
                      <span>Valued Soft Skills</span>
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedItem.softSkills.map((skill, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 5. GAPS & GATING TAB */}
            {resultTab === "gaps" && (
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Missing Skills */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Missing Technical Requirements</span>
                    </h4>
                    <div className="space-y-2">
                      {selectedItem.missingSkills && selectedItem.missingSkills.length > 0 ? (
                        selectedItem.missingSkills.map((skill, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-red-50/50 border border-red-100 rounded-xl text-xs text-slate-800 font-medium flex items-center gap-2"
                          >
                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" />
                            <span>{skill}</span>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-slate-500 text-xs italic">
                          No critical missing technical requirements found.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Alignment & Experience Gaps */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1.5">
                      <Award className="w-4 h-4" />
                      <span>Experience Alignment Areas</span>
                    </h4>
                    <div className="space-y-2">
                      {selectedItem.weakExperienceAreas && selectedItem.weakExperienceAreas.length > 0 ? (
                        selectedItem.weakExperienceAreas.map((weak, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-amber-50/50 border border-amber-100 rounded-xl text-xs text-slate-800 font-medium flex items-center gap-2"
                          >
                            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full shrink-0" />
                            <span>{weak}</span>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-slate-500 text-xs italic">
                          No severe experience gaps identified.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 6. JOB DETAILS TAB */}
            {resultTab === "job" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-slate-900 font-display font-bold text-sm mb-1">
                    Target Job Description & Responsibilities
                  </h4>
                  <p className="text-slate-500 text-xs">
                    Requirements evaluated for {selectedItem.targetRole} @ {selectedItem.targetCompany}
                  </p>
                </div>

                {selectedItem.jobDescription ? (
                  <div className="bg-slate-50 border border-slate-200/60 p-5 rounded-2xl">
                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Target Job Description Text
                    </h5>
                    <div className="text-xs text-slate-700 leading-relaxed font-medium whitespace-pre-wrap max-h-[350px] overflow-y-auto">
                      {selectedItem.jobDescription}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-slate-500 text-xs">
                    No custom job description was persisted for this run. Universal role expectations were applied.
                  </div>
                )}

                {selectedItem.responsibilities && selectedItem.responsibilities.length > 0 && (
                  <div className="space-y-2.5">
                    <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Role Responsibilities
                    </h5>
                    {selectedItem.responsibilities.map((resp, idx) => (
                      <div
                        key={idx}
                        className="flex gap-3 p-3.5 bg-slate-50 rounded-xl items-start border border-slate-100"
                      >
                        <div className="w-5 h-5 rounded-md bg-cyan-100 border border-cyan-200 flex items-center justify-center text-cyan-600 shrink-0 text-[10px] font-bold mt-0.5">
                          {idx + 1}
                        </div>
                        <span className="text-xs text-slate-700 font-medium leading-relaxed">{resp}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
