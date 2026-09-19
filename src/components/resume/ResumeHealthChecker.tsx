import React, { useState, useMemo } from "react";
import { 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle, 
  TrendingUp, 
  Sparkles, 
  FileText, 
  Award, 
  Cpu, 
  Compass, 
  ArrowRight,
  HelpCircle,
  Clock,
  Eye,
  Check,
  Search,
  Filter
} from "lucide-react";
import { ParsedResume } from "../../types";
import { evaluateResumeHealth, ResumeHealthReport, HealthFinding, HealthCategoryScore } from "../../lib/resumeHealthEngine";

export interface ResumeHealthCheckerProps {
  parsedResume: ParsedResume;
  rawText?: string;
  resumeName?: string;
  onProceedToTailor?: () => void;
}

export default function ResumeHealthChecker({
  parsedResume,
  rawText = "",
  resumeName = "Curriculum Vitae",
  onProceedToTailor
}: ResumeHealthCheckerProps) {
  const [selectedPriority, setSelectedPriority] = useState<"ALL" | "HIGH" | "MEDIUM" | "LOW">("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(null);

  // Deterministically compute report
  const report: ResumeHealthReport = useMemo(() => {
    return evaluateResumeHealth(parsedResume, rawText);
  }, [parsedResume, rawText]);

  const filteredFindings = report.findings.filter((f) => {
    if (selectedPriority !== "ALL" && f.priority !== selectedPriority) return false;
    if (selectedCategory !== "ALL" && f.categoryId !== selectedCategory) return false;
    return true;
  });

  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-emerald-600 border-emerald-200 bg-emerald-50";
    if (score >= 70) return "text-cyan-600 border-cyan-200 bg-cyan-50";
    if (score >= 50) return "text-amber-600 border-amber-200 bg-amber-50";
    return "text-rose-600 border-rose-200 bg-rose-50";
  };

  const getProgressColor = (score: number) => {
    if (score >= 85) return "bg-emerald-500";
    if (score >= 70) return "bg-cyan-500";
    if (score >= 50) return "bg-amber-500";
    return "bg-rose-500";
  };

  return (
    <div className="w-full space-y-6 animate-fadeIn">
      {/* Hero Health Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white rounded-3xl p-6 md:p-8 shadow-xl border border-slate-700/80 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 rounded-full text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                Deterministic Resume Health Diagnostic
              </span>
              <span className="px-3 py-1 bg-slate-800 text-slate-300 rounded-full text-[10px] font-bold border border-slate-700">
                {resumeName}
              </span>
            </div>

            <h2 className="text-2xl md:text-3xl font-display font-extrabold text-white tracking-tight">
              Resume Health: <span className="text-cyan-300">{report.overallScore}/100</span>
            </h2>
            <p className="text-slate-300 text-xs max-w-xl leading-relaxed">
              Comprehensive structural and ATS readiness analysis evaluating 6 essential dimensions using verifiable resume evidence.
            </p>
          </div>

          {/* Overall Health Score Ring */}
          <div className="flex items-center gap-4 bg-slate-800/80 p-5 rounded-2xl border border-slate-700 shrink-0 shadow-lg">
            <div className="text-center">
              <div className="inline-flex items-baseline gap-1">
                <span className="text-5xl font-display font-extrabold text-white">
                  {report.overallScore}
                </span>
                <span className="text-lg font-bold text-slate-400">/100</span>
              </div>
              <span className={`block text-[10px] font-bold uppercase tracking-wider mt-1 px-2.5 py-0.5 rounded-full border ${
                report.overallScore >= 80 ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" :
                report.overallScore >= 60 ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" :
                "bg-amber-500/20 text-amber-300 border-amber-500/30"
              }`}>
                {report.rating} Rating
              </span>
            </div>

            {onProceedToTailor && (
              <div className="pl-4 border-l border-slate-700 hidden sm:block">
                <button
                  onClick={onProceedToTailor}
                  className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-cyan-500/20 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Tailor to Job</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Diagnostic Stats Bar */}
        <div className="mt-6 pt-5 border-t border-slate-700/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Identified Findings</span>
            <span className="text-base font-bold text-white mt-0.5 block">{report.summary.totalFindings} recommendations</span>
          </div>
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Quantified Impact</span>
            <span className="text-base font-bold text-cyan-300 mt-0.5 block">
              {report.summary.quantifiedBulletsCount} of {report.summary.totalBulletsCount} bullets ({report.summary.totalBulletsCount > 0 ? Math.round((report.summary.quantifiedBulletsCount / report.summary.totalBulletsCount) * 100) : 0}%)
            </span>
          </div>
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Action Verb Ratio</span>
            <span className="text-base font-bold text-emerald-300 mt-0.5 block">
              {report.summary.actionVerbsCount} strong verbs ({report.summary.totalBulletsCount > 0 ? Math.round((report.summary.actionVerbsCount / report.summary.totalBulletsCount) * 100) : 0}%)
            </span>
          </div>
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Estimated Word Count</span>
            <span className="text-base font-bold text-white mt-0.5 block">
              ~{report.summary.estimatedWordCount} words
            </span>
          </div>
        </div>
      </div>

      {/* 6 Category Dimension Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {report.categories.map((cat) => (
          <div
            key={cat.id}
            onClick={() => setSelectedCategory(selectedCategory === cat.id ? "ALL" : cat.id)}
            className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-sm ${
              selectedCategory === cat.id
                ? "bg-white border-cyan-400 ring-2 ring-cyan-100 shadow-md"
                : "bg-white/80 border-slate-200/80 hover:border-cyan-300 hover:bg-white"
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-bold text-slate-800">{cat.name}</span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${getScoreColor(cat.score)}`}>
                {cat.score}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all duration-500 ${getProgressColor(cat.score)}`}
                style={{ width: `${cat.score}%` }}
              />
            </div>

            <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed mb-3">
              {cat.summary}
            </p>

            <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium pt-2 border-t border-slate-100">
              <span>Weight: {cat.weight}%</span>
              <span className="text-cyan-700 font-bold">
                {cat.findingsCount} finding{cat.findingsCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Actionable Findings Section */}
      <div className="bg-white/80 backdrop-blur-xl border border-white rounded-3xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-lg font-display font-bold text-slate-900">
              Actionable Findings & Verification Insights
            </h3>
            <p className="text-slate-500 text-xs">
              Every finding is grounded directly in verified source evidence with strict anti-fabrication guidelines.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200/60 self-start sm:self-auto flex-wrap">
            <button
              onClick={() => setSelectedPriority("ALL")}
              className={`px-3 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                selectedPriority === "ALL" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              All ({report.findings.length})
            </button>
            <button
              onClick={() => setSelectedPriority("HIGH")}
              className={`px-3 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                selectedPriority === "HIGH" ? "bg-rose-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              High Priority ({report.summary.highPriorityCount})
            </button>
            <button
              onClick={() => setSelectedPriority("MEDIUM")}
              className={`px-3 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                selectedPriority === "MEDIUM" ? "bg-amber-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Medium ({report.summary.mediumPriorityCount})
            </button>
            <button
              onClick={() => setSelectedPriority("LOW")}
              className={`px-3 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                selectedPriority === "LOW" ? "bg-slate-700 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Low ({report.summary.lowPriorityCount})
            </button>
          </div>
        </div>

        {/* Findings List */}
        <div className="space-y-3">
          {filteredFindings.length === 0 ? (
            <div className="text-center py-10 bg-slate-50/60 border border-slate-100 rounded-2xl">
              <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-800">No findings in this view</h4>
              <p className="text-xs text-slate-500">All evaluated checks for this filter meet standard criteria.</p>
            </div>
          ) : (
            filteredFindings.map((finding) => {
              const isExpanded = expandedFindingId === finding.id;

              return (
                <div
                  key={finding.id}
                  className={`border rounded-2xl p-4 transition-all bg-white shadow-sm ${
                    finding.priority === "HIGH" ? "border-rose-200 hover:border-rose-300" :
                    finding.priority === "MEDIUM" ? "border-amber-200 hover:border-amber-300" :
                    "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div
                    onClick={() => setExpandedFindingId(isExpanded ? null : finding.id)}
                    className="flex items-start justify-between gap-4 cursor-pointer"
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider shrink-0 mt-0.5 ${
                        finding.priority === "HIGH" ? "bg-rose-100 text-rose-800 border border-rose-200" :
                        finding.priority === "MEDIUM" ? "bg-amber-100 text-amber-800 border border-amber-200" :
                        "bg-slate-100 text-slate-700 border border-slate-200"
                      }`}>
                        {finding.priority} PRIORITY
                      </span>

                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                          <span>{finding.title}</span>
                          {finding.section && (
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({finding.section})
                            </span>
                          )}
                        </h4>
                        <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-1">
                          {finding.whyItMatters}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="text-xs text-cyan-600 font-bold shrink-0 hover:text-cyan-700"
                    >
                      {isExpanded ? "Collapse" : "View Action"}
                    </button>
                  </div>

                  {/* Expanded 4-Part Detail */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-slate-100 space-y-3 text-xs animate-fadeIn">
                      {/* 1. Why it matters */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Why It Matters:
                        </span>
                        <p className="text-slate-700 leading-relaxed font-medium">
                          {finding.whyItMatters}
                        </p>
                      </div>

                      {/* 2. What Resumix can safely improve */}
                      <div className="p-3 bg-cyan-50/70 border border-cyan-100 rounded-xl space-y-1">
                        <span className="text-[10px] font-bold text-cyan-900 uppercase tracking-wider block">
                          What Resumix Can Safely Improve:
                        </span>
                        <p className="text-cyan-950 leading-relaxed">
                          {finding.whatResumixCanSafelyImprove}
                        </p>
                      </div>

                      {/* 3. What Resumix cannot invent (Anti-Fabrication Rule) */}
                      <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1 text-amber-950">
                        <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider block">
                          What Resumix Cannot Invent:
                        </span>
                        <p className="leading-relaxed">
                          {finding.whatResumixCannotInvent}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Call to Action */}
        {onProceedToTailor && (
          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              onClick={onProceedToTailor}
              className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white text-xs font-bold rounded-2xl flex items-center gap-2 transition-all shadow-md shadow-cyan-200 cursor-pointer"
            >
              <span>Continue to Job Tailoring & Requirements</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
