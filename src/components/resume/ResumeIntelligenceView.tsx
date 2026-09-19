import React, { useState, useMemo, useEffect, useRef } from "react";
import { 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle, 
  Sparkles, 
  FileText, 
  Award, 
  ArrowRight,
  HelpCircle,
  Clock,
  Eye,
  Check,
  Filter,
  CheckCircle2,
  RefreshCw,
  Edit3,
  Trash2,
  Layers,
  ChevronDown,
  ChevronUp,
  XCircle,
  Lock,
  Briefcase,
  Target,
  FileCode,
  ListFilter,
  ArrowUpRight
} from "lucide-react";
import { 
  ParsedResume, 
  RealtimeIntelligenceReport, 
  StructuredRecommendation, 
  RecommendationSeverity, 
  RecommendationCategory 
} from "../../types";
import { analyzeResumeRealtime, applyRecommendationSafely } from "../../lib/resumeIntelligenceEngine";

export interface ResumeIntelligenceViewProps {
  userId?: string;
  parsedResume: ParsedResume;
  rawText: string;
  resumeName?: string;
  resumeId?: string;
  targetCompany?: string;
  targetRole?: string;
  jobDescription?: string;
  onUpdateResumeText?: (updatedText: string) => void;
  onProceedToTailor?: () => void;
}

export type ViewTab = "analyzed" | "original" | "improvements" | "tailored";

export default function ResumeIntelligenceView({
  userId = "current_user",
  parsedResume,
  rawText,
  resumeName = "Candidate Resume",
  resumeId = "live_resume",
  targetCompany = "",
  targetRole = "",
  jobDescription = "",
  onUpdateResumeText,
  onProceedToTailor
}: ResumeIntelligenceViewProps) {
  // User Control: 4 Distinct Views
  const [activeTab, setActiveTab] = useState<ViewTab>("analyzed");

  // Analysis mode
  const [activeMode, setActiveMode] = useState<"GENERAL" | "TARGETED">(
    targetCompany || targetRole || jobDescription ? "TARGETED" : "GENERAL"
  );

  // Filters
  const [selectedPriority, setSelectedPriority] = useState<"ALL" | "HIGH" | "MEDIUM" | "LOW">("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>("ALL");
  const [expandedRecId, setExpandedRecId] = useState<string | null>(null);
  const [comparingRecId, setComparingRecId] = useState<string | null>(null);
  const [askingWhyRecId, setAskingWhyRecId] = useState<string | null>(null);
  const [editingRecId, setEditingRecId] = useState<string | null>(null);
  const [editedSnippet, setEditedSnippet] = useState<string>("");

  // Action states tracking
  const [appliedIds, setAppliedIds] = useState<string[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [actionNotice, setActionNotice] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Version tracking & debouncing
  const [resumeVersion, setResumeVersion] = useState(1);
  const [analysisVersion, setAnalysisVersion] = useState(1);
  const [currentText, setCurrentText] = useState(rawText);

  // Keep local text synced with prop
  useEffect(() => {
    setCurrentText(rawText);
  }, [rawText]);

  // Synchronous initial analysis
  const report: RealtimeIntelligenceReport = useMemo(() => {
    return analyzeResumeRealtime(parsedResume, currentText, {
      targetCompany: activeMode === "TARGETED" ? targetCompany : undefined,
      targetRole: activeMode === "TARGETED" ? targetRole : undefined,
      jobDescription: activeMode === "TARGETED" ? jobDescription : undefined,
      resumeVersion,
      analysisVersion,
      appliedRecommendationIds: appliedIds,
      dismissedRecommendationIds: dismissedIds
    });
  }, [
    parsedResume, 
    currentText, 
    activeMode, 
    targetCompany, 
    targetRole, 
    jobDescription, 
    resumeVersion, 
    analysisVersion, 
    appliedIds, 
    dismissedIds
  ]);

  // Record privacy-safe learning event
  const logLearningEvent = (eventType: string, metadata: Record<string, any>) => {
    try {
      fetch("/api/learning/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          eventType,
          companyName: targetCompany || undefined,
          roleTitle: targetRole || undefined,
          metadata
        })
      }).catch(() => {});
    } catch {}
  };

  // Filter recommendations
  const filteredRecommendations = useMemo(() => {
    return report.recommendations.filter(r => {
      if (r.status === "DISMISSED") return false;
      if (selectedPriority !== "ALL" && r.severity !== selectedPriority) return false;
      if (selectedCategory !== "ALL" && r.category !== selectedCategory) return false;
      if (selectedSectionFilter !== "ALL" && r.section.toLowerCase() !== selectedSectionFilter.toLowerCase()) return false;
      return true;
    });
  }, [report.recommendations, selectedPriority, selectedCategory, selectedSectionFilter]);

  // Section-by-section analysis counts
  const sectionAudits = useMemo(() => {
    const getRecsForSection = (secName: string) => 
      report.recommendations.filter(r => r.status === "ACTIVE" && r.section.toLowerCase().includes(secName.toLowerCase()));

    return [
      {
        id: "summary",
        name: "Summary",
        status: parsedResume.summary && parsedResume.summary.trim().length > 25 ? "VERIFIED" : "OPPORTUNITY",
        entriesText: parsedResume.summary ? "1 entry analyzed" : "0 entries detected",
        issuesCount: getRecsForSection("Summary").length,
        details: parsedResume.summary ? "Core candidate specialization statement detected." : "Missing professional summary or career objective."
      },
      {
        id: "experience",
        name: "Experience",
        status: report.structuralMetrics.experienceCount > 0 ? "VERIFIED" : "WARNING",
        entriesText: `${report.structuralMetrics.experienceCount} entries analyzed`,
        issuesCount: getRecsForSection("Experience").length,
        details: `${report.structuralMetrics.experienceCount} professional roles with verified duration and company markers.`
      },
      {
        id: "projects",
        name: "Projects",
        status: report.structuralMetrics.projectCount > 0 ? "VERIFIED" : "OPPORTUNITY",
        entriesText: `${report.structuralMetrics.projectCount} entries analyzed`,
        issuesCount: getRecsForSection("Project").length,
        details: `${report.structuralMetrics.projectCount} projects demonstrating hands-on technical execution.`
      },
      {
        id: "skills",
        name: "Skills",
        status: report.structuralMetrics.skillCount >= 3 ? "VERIFIED" : "WARNING",
        entriesText: `${report.structuralMetrics.skillCount} skills analyzed`,
        issuesCount: getRecsForSection("Skill").length,
        details: `${report.structuralMetrics.skillCount} distinct technical skills parsed with evidence mapping.`
      },
      {
        id: "education",
        name: "Education",
        status: report.structuralMetrics.educationCount > 0 ? "VERIFIED" : "WARNING",
        entriesText: `${report.structuralMetrics.educationCount} entries analyzed`,
        issuesCount: getRecsForSection("Education").length,
        details: `${report.structuralMetrics.educationCount} academic degrees/institutions identified.`
      }
    ];
  }, [parsedResume, report]);

  // Apply a recommendation safely
  const handleApply = (rec: StructuredRecommendation) => {
    setActionNotice(null);
    const result = applyRecommendationSafely(currentText, parsedResume, rec);

    if (!result.success) {
      setActionNotice({
        type: "error",
        text: result.error || "Unable to apply recommendation safely."
      });
      return;
    }

    // Update text and record applied recommendation
    const newText = result.updatedText;
    setCurrentText(newText);
    setAppliedIds(prev => [...prev, rec.id]);
    setResumeVersion(v => v + 1);
    setAnalysisVersion(v => v + 1);

    logLearningEvent("RECOMMENDATION_APPLIED", {
      recommendationId: rec.id,
      category: rec.category,
      severity: rec.severity,
      section: rec.section
    });

    if (onUpdateResumeText) {
      onUpdateResumeText(newText);
    }

    setActionNotice({
      type: "success",
      text: `Applied "${rec.title}" with strict fact & metric preservation.`
    });
  };

  // Dismiss a recommendation
  const handleDismiss = (rec: StructuredRecommendation) => {
    setDismissedIds(prev => [...prev, rec.id]);
    logLearningEvent("RECOMMENDATION_DISMISSED", {
      recommendationId: rec.id,
      category: rec.category,
      severity: rec.severity
    });
    setActionNotice({
      type: "info",
      text: "Recommendation dismissed."
    });
  };

  // Save manual edit
  const handleSaveManualEdit = (rec: StructuredRecommendation) => {
    if (!editedSnippet.trim()) {
      setEditingRecId(null);
      return;
    }

    if (rec.originalSnippet && currentText.includes(rec.originalSnippet)) {
      const updatedText = currentText.replace(rec.originalSnippet, editedSnippet.trim());
      setCurrentText(updatedText);
      setAppliedIds(prev => [...prev, rec.id]);
      setResumeVersion(v => v + 1);
      setAnalysisVersion(v => v + 1);

      logLearningEvent("RECOMMENDATION_EDITED", {
        recommendationId: rec.id,
        category: rec.category
      });

      if (onUpdateResumeText) {
        onUpdateResumeText(updatedText);
      }
      setActionNotice({
        type: "success",
        text: "Custom edit saved successfully."
      });
    }

    setEditingRecId(null);
    setEditedSnippet("");
  };

  const getPriorityBadgeClass = (severity: RecommendationSeverity) => {
    switch (severity) {
      case "HIGH":
        return "bg-rose-50 text-rose-700 border-rose-200 font-extrabold";
      case "MEDIUM":
        return "bg-amber-50 text-amber-700 border-amber-200 font-bold";
      case "LOW":
        return "bg-slate-100 text-slate-700 border-slate-200 font-medium";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-emerald-400";
    if (score >= 70) return "text-cyan-400";
    if (score >= 55) return "text-amber-400";
    return "text-rose-400";
  };

  return (
    <div className="w-full space-y-6 animate-fadeIn">
      {/* Hero Intelligence Header */}
      <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white rounded-3xl p-6 md:p-8 shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 rounded-full text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                Real-Time Resume Intelligence
              </span>
              <span className="px-3 py-1 bg-slate-800 text-slate-300 rounded-full text-[10px] font-bold border border-slate-700">
                {resumeName}
              </span>
              <span className="px-2.5 py-0.5 bg-slate-800/80 text-slate-400 text-[10px] rounded-md font-mono">
                v{resumeVersion}.{analysisVersion}
              </span>
            </div>

            <h2 className="text-2xl md:text-3xl font-display font-extrabold text-white tracking-tight">
              Resume Intelligence & Health: <span className={getScoreColor(report.overallHealthScore)}>{report.overallHealthScore}/100</span>
            </h2>
            <p className="text-slate-300 text-xs max-w-xl leading-relaxed">
              Continuous live analysis evaluating structure, content strength, ATS compatibility, and evidence anchors.
            </p>

            {/* Mode Switcher: Mode A vs Mode B */}
            <div className="flex items-center gap-2 pt-2">
              <span className="text-slate-400 text-xs font-semibold">Mode:</span>
              <button
                type="button"
                onClick={() => setActiveMode("GENERAL")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeMode === "GENERAL"
                    ? "bg-cyan-500 text-white shadow-sm"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                General Resume Health
              </button>
              <button
                type="button"
                onClick={() => setActiveMode("TARGETED")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeMode === "TARGETED"
                    ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-sm"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                <Target className="w-3.5 h-3.5" />
                Target Job Mode
              </button>
            </div>
          </div>

          {/* Overall Health & Match Ring Card */}
          <div className="flex items-center gap-4 bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shrink-0 shadow-lg">
            <div className="text-center">
              <div className="inline-flex items-baseline gap-1">
                <span className={`text-5xl font-display font-extrabold ${getScoreColor(report.overallHealthScore)}`}>
                  {report.overallHealthScore}
                </span>
                <span className="text-lg font-bold text-slate-500">/100</span>
              </div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                Resume Health
              </span>
            </div>

            {activeMode === "TARGETED" && (
              <div className="pl-4 border-l border-slate-800 text-center">
                <div className="inline-flex items-baseline gap-1">
                  <span className="text-3xl font-display font-extrabold text-cyan-300">
                    {report.targetMatchScore !== null ? `${report.targetMatchScore}%` : "—"}
                  </span>
                </div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-cyan-400/90 mt-1">
                  Target Match
                </span>
              </div>
            )}

            {onProceedToTailor && (
              <div className="pl-4 border-l border-slate-800 hidden lg:block">
                <button
                  onClick={onProceedToTailor}
                  className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Tailor to Job</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Targeted Mode Context Notice */}
        {activeMode === "TARGETED" && (
          <div className="mt-5 pt-4 border-t border-slate-800 text-xs text-slate-300 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>
                Targeting: <strong className="text-white">{targetRole || "Specified Role"}</strong> at <strong className="text-white">{targetCompany || "Target Employer"}</strong>
              </span>
            </div>
            {!jobDescription && (
              <span className="text-[11px] text-amber-300 bg-amber-500/10 px-3 py-1 rounded-lg border border-amber-400/30">
                Target-specific analysis requires a job description or verified job evidence.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div className={`p-4 rounded-2xl text-xs flex items-center justify-between gap-3 animate-fadeIn ${
          actionNotice.type === "success" 
            ? "bg-emerald-50 text-emerald-900 border border-emerald-200" 
            : actionNotice.type === "error"
            ? "bg-rose-50 text-rose-900 border border-rose-200"
            : "bg-slate-50 text-slate-800 border border-slate-200"
        }`}>
          <div className="flex items-center gap-2">
            {actionNotice.type === "success" && <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
            {actionNotice.type === "error" && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
            {actionNotice.type === "info" && <HelpCircle className="w-4 h-4 text-slate-600 shrink-0" />}
            <span>{actionNotice.text}</span>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="text-[11px] font-bold underline hover:opacity-75"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* User Control: 4 Clear Distinct Tabs (Section 24) */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveTab("analyzed")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "analyzed"
              ? "bg-slate-900 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Analyzed Resume</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("improvements")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "improvements"
              ? "bg-slate-900 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Suggested Improvements</span>
          <span className="px-1.5 py-0.2 bg-cyan-500 text-white rounded-full text-[10px]">
            {report.summary.totalCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("original")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "original"
              ? "bg-slate-900 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <FileCode className="w-3.5 h-3.5" />
          <span>Original Resume</span>
        </button>

        {onProceedToTailor && (
          <button
            type="button"
            onClick={onProceedToTailor}
            className="ml-auto px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <span>Tailored Resume</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* VIEW 1: ORIGINAL RESUME (Raw Untouched Text) */}
      {activeTab === "original" && (
        <div className="bg-white/80 backdrop-blur-md border border-slate-200 p-6 rounded-3xl shadow-sm space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
            <div>
              <h3 className="text-slate-800 font-display font-bold text-base">
                Original Verified Resume
              </h3>
              <p className="text-slate-500 text-xs">
                This is your authentic source resume text. Resumix never silently alters this source.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500 font-mono">
              <span>{report.structuralMetrics.wordCount} words</span>
              <span>•</span>
              <span>{currentText.length} characters</span>
            </div>
          </div>

          <pre className="p-5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-xs font-mono leading-relaxed whitespace-pre-wrap max-h-[500px] overflow-y-auto">
            {currentText}
          </pre>
        </div>
      )}

      {/* VIEW 2: ANALYZED RESUME (Section-by-Section Analysis Inspector) */}
      {activeTab === "analyzed" && (
        <div className="space-y-6 animate-fadeIn">
          {/* 6 Core Dimensions Scorecards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white/80 backdrop-blur-md border border-slate-200 p-4 rounded-2xl shadow-sm space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">ATS Readiness</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-800">{report.atsScore}%</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-cyan-500 h-full rounded-full" style={{ width: `${report.atsScore}%` }} />
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-md border border-slate-200 p-4 rounded-2xl shadow-sm space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Content Quality</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-800">{report.contentQualityScore}%</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${report.contentQualityScore}%` }} />
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-md border border-slate-200 p-4 rounded-2xl shadow-sm space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Structure</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-800">{report.structureScore}%</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-blue-500 h-full rounded-full" style={{ width: `${report.structureScore}%` }} />
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-md border border-slate-200 p-4 rounded-2xl shadow-sm space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Evidence Strength</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-800">{report.evidenceStrengthScore}%</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${report.evidenceStrengthScore}%` }} />
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-md border border-slate-200 p-4 rounded-2xl shadow-sm space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Readability</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-800">{report.readabilityScore}%</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-purple-500 h-full rounded-full" style={{ width: `${report.readabilityScore}%` }} />
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-md border border-slate-200 p-4 rounded-2xl shadow-sm space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Word Count</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-800">~{report.structuralMetrics.wordCount}</span>
              </div>
              <span className="text-[10px] text-slate-400 block truncate">
                {report.structuralMetrics.detectedSectionsCount} sections verified
              </span>
            </div>
          </div>

          {/* Section 23: Section-by-Section Analysis Cards */}
          <div className="space-y-4">
            <div>
              <h3 className="text-slate-800 font-display font-bold text-base">
                Section-by-Section Inspection
              </h3>
              <p className="text-slate-500 text-xs">
                Inspect entry coverage, identified issues, and targeted improvement opportunities per section.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sectionAudits.map(sec => (
                <div 
                  key={sec.id}
                  className="bg-white/80 backdrop-blur-md border border-slate-200 p-5 rounded-3xl shadow-sm space-y-3 flex flex-col justify-between hover:border-cyan-300 transition-all"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-display font-bold text-sm text-slate-800">
                        {sec.name}
                      </h4>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        sec.status === "VERIFIED" 
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}>
                        {sec.status}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 font-semibold">
                      {sec.entriesText}
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed">
                      {sec.details}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-cyan-700">
                      {sec.issuesCount} improvement {sec.issuesCount === 1 ? "opportunity" : "opportunities"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSectionFilter(sec.name);
                        setActiveTab("improvements");
                      }}
                      className="text-xs font-bold text-cyan-600 hover:text-cyan-800 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <span>View Recommendations</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: SUGGESTED IMPROVEMENTS (Actionable Recommendations) */}
      {activeTab === "improvements" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="text-slate-800 font-display font-bold text-base">
                Prioritized Actionable Recommendations
              </h3>
              <p className="text-slate-500 text-xs">
                Review, apply, or edit improvements. Every recommendation preserves authentic evidence.
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Section Filter */}
              {selectedSectionFilter !== "ALL" && (
                <button
                  onClick={() => setSelectedSectionFilter("ALL")}
                  className="px-3 py-1 bg-cyan-100 text-cyan-800 text-xs font-bold rounded-lg border border-cyan-200 flex items-center gap-1"
                >
                  <span>Section: {selectedSectionFilter}</span>
                  <XCircle className="w-3 h-3" />
                </button>
              )}

              {/* Priority Filters */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
                <button
                  onClick={() => setSelectedPriority("ALL")}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    selectedPriority === "ALL" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  All ({report.summary.totalCount})
                </button>
                <button
                  onClick={() => setSelectedPriority("HIGH")}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    selectedPriority === "HIGH" ? "bg-rose-500 text-white shadow-sm" : "text-slate-500 hover:text-rose-600"
                  }`}
                >
                  High ({report.summary.highCount})
                </button>
                <button
                  onClick={() => setSelectedPriority("MEDIUM")}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    selectedPriority === "MEDIUM" ? "bg-amber-500 text-white shadow-sm" : "text-slate-500 hover:text-amber-600"
                  }`}
                >
                  Medium ({report.summary.mediumCount})
                </button>
                <button
                  onClick={() => setSelectedPriority("LOW")}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    selectedPriority === "LOW" ? "bg-slate-700 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Low ({report.summary.lowCount})
                </button>
              </div>
            </div>
          </div>

          {/* Findings List */}
          {filteredRecommendations.length === 0 ? (
            <div className="p-10 text-center bg-white/70 backdrop-blur-md rounded-3xl border border-slate-200 space-y-2">
              <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto" />
              <h4 className="font-display font-bold text-sm text-slate-800">
                No recommendations found matching current filters.
              </h4>
              <p className="text-slate-500 text-xs">
                All detected issues in this view have been addressed or dismissed.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRecommendations.map(rec => {
                const isComparing = comparingRecId === rec.id;
                const isAskingWhy = askingWhyRecId === rec.id;
                const isEditing = editingRecId === rec.id;

                return (
                  <div
                    key={rec.id}
                    className={`bg-white/80 backdrop-blur-md border rounded-3xl p-5 shadow-sm transition-all duration-200 space-y-4 ${
                      rec.severity === "HIGH" 
                        ? "border-rose-200/80 hover:border-rose-300" 
                        : rec.severity === "MEDIUM" 
                        ? "border-amber-200/80 hover:border-amber-300" 
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {/* Card Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] border uppercase ${getPriorityBadgeClass(rec.severity)}`}>
                          {rec.severity} PRIORITY
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 uppercase">
                          {rec.category.replace(/_/g, " ")}
                        </span>
                        <span className="text-[11px] text-slate-400 font-semibold">
                          • {rec.section}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 self-end sm:self-auto">
                        {rec.suggestedSnippet && rec.status === "ACTIVE" && (
                          <button
                            type="button"
                            onClick={() => handleApply(rec)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Apply</span>
                          </button>
                        )}

                        {rec.originalSnippet && (
                          <button
                            type="button"
                            onClick={() => {
                              if (isEditing) {
                                setEditingRecId(null);
                              } else {
                                setEditingRecId(rec.id);
                                setEditedSnippet(rec.suggestedSnippet || rec.originalSnippet || "");
                              }
                            }}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>{isEditing ? "Cancel Edit" : "Edit Myself"}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setAskingWhyRecId(isAskingWhy ? null : rec.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                            isAskingWhy 
                              ? "bg-cyan-100 text-cyan-800 border border-cyan-300" 
                              : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                          }`}
                        >
                          <HelpCircle className="w-3.5 h-3.5" />
                          <span>Ask Why</span>
                        </button>

                        {rec.originalSnippet && rec.suggestedSnippet && (
                          <button
                            type="button"
                            onClick={() => setComparingRecId(isComparing ? null : rec.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                              isComparing 
                                ? "bg-cyan-100 text-cyan-800 border border-cyan-300" 
                                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                            }`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Compare</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDismiss(rec)}
                          title="Dismiss recommendation"
                          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Title & Core Problem */}
                    <div className="space-y-1">
                      <h4 className="text-slate-800 font-display font-bold text-sm">
                        {rec.title}
                      </h4>
                      <p className="text-slate-600 text-xs leading-relaxed">
                        {rec.problem}
                      </p>
                    </div>

                    {/* Inline Edit Editor */}
                    {isEditing && (
                      <div className="p-4 bg-cyan-50/70 border border-cyan-200 rounded-2xl space-y-3 animate-fadeIn">
                        <span className="text-[11px] font-bold text-cyan-900 block">
                          Edit Bullet Myself (Preserving Verified Evidence)
                        </span>
                        <textarea
                          rows={3}
                          value={editedSnippet}
                          onChange={e => setEditedSnippet(e.target.value)}
                          className="w-full p-3 bg-white border border-cyan-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingRecId(null)}
                            className="px-3 py-1.5 text-slate-600 text-xs font-semibold hover:bg-white rounded-lg cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveManualEdit(rec)}
                            className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold rounded-xl shadow-sm cursor-pointer"
                          >
                            Save Changes
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Before / After Comparison View */}
                    {isComparing && rec.originalSnippet && rec.suggestedSnippet && (
                      <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-3 animate-fadeIn border border-slate-800">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                          <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                            <Eye className="w-3.5 h-3.5" />
                            Before & After Comparison
                          </span>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400">
                            <span className="flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" /> Facts Preserved
                            </span>
                            <span className="flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" /> Metrics Protected
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/70 space-y-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                              Original Verified Resume
                            </span>
                            <p className="text-slate-300 leading-relaxed font-sans text-xs">
                              {rec.originalSnippet}
                            </p>
                          </div>
                          <div className="p-3 bg-cyan-950/40 rounded-xl border border-cyan-800/60 space-y-1">
                            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">
                              Improved Presentation
                            </span>
                            <p className="text-cyan-100 leading-relaxed font-sans text-xs">
                              {rec.suggestedSnippet}
                            </p>
                          </div>
                        </div>

                        <div className="pt-2 text-[11px] text-slate-400 flex items-center justify-between">
                          <span>{rec.safeAction}</span>
                          {rec.status === "ACTIVE" && (
                            <button
                              type="button"
                              onClick={() => handleApply(rec)}
                              className="px-3 py-1 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-lg text-xs cursor-pointer"
                            >
                              Apply This Improvement
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Ask Why Explainer Panel */}
                    {isAskingWhy && (
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs animate-fadeIn">
                        <div className="space-y-2">
                          <div>
                            <strong className="text-slate-900 block font-semibold mb-0.5">1. What is the problem?</strong>
                            <span className="text-slate-600">{rec.problem}</span>
                          </div>
                          <div>
                            <strong className="text-slate-900 block font-semibold mb-0.5">2. Why does it matter?</strong>
                            <span className="text-slate-600">{rec.whyItMatters}</span>
                          </div>
                          <div>
                            <strong className="text-slate-900 block font-semibold mb-0.5">3. What evidence supports this?</strong>
                            <span className="text-slate-600">{rec.evidence}</span>
                          </div>
                          <div>
                            <strong className="text-slate-900 block font-semibold mb-0.5">4. What can Resumix safely change?</strong>
                            <span className="text-emerald-700">{rec.safeAction}</span>
                          </div>
                          <div>
                            <strong className="text-slate-900 block font-semibold mb-0.5">5. What will Resumix NOT invent?</strong>
                            <span className="text-rose-700 flex items-center gap-1 mt-0.5">
                              <Lock className="w-3 h-3" />
                              {rec.whatWillNotInvent}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
