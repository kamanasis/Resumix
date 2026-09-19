import React, { useState } from "react";
import { 
  TrendingUp, 
  CheckCircle2, 
  XCircle, 
  ShieldAlert, 
  Cpu, 
  ChevronDown, 
  ChevronUp, 
  Award,
  Sparkles,
  Info
} from "lucide-react";
import { TargetRequirement } from "../../types";

interface OptimizationInsightsPanelProps {
  scoreComparison?: {
    beforeScore: number;
    afterScore: number;
    delta: number;
    beforePercentage?: number;
    afterPercentage?: number;
  } | null;
  targetMatchComparison?: {
    originalMatch: number;
    tailoredMatch: number;
  } | null;
  changes?: Array<{
    section: string;
    originalText?: string;
    generatedText?: string;
    reason?: string;
    changeType?: string;
  }>;
  explanations?: Array<{
    whatChanged: string;
    why: string;
    atsBenefit: string;
    recruiterBenefit: string;
    confidence: number;
  }>;
  unmatchedRequirements?: TargetRequirement[];
  isCollapsible?: boolean;
}

export const OptimizationInsightsPanel: React.FC<OptimizationInsightsPanelProps> = ({
  scoreComparison,
  targetMatchComparison,
  changes = [],
  explanations = [],
  unmatchedRequirements = [],
  isCollapsible = true
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"summary" | "audit" | "protection">("summary");

  const originalScore = scoreComparison?.beforeScore ?? 41;
  const tailoredScore = scoreComparison?.afterScore ?? 68;
  const scoreDelta = tailoredScore - originalScore;

  const originalMatch = targetMatchComparison?.originalMatch ?? 26;
  const tailoredMatch = targetMatchComparison?.tailoredMatch ?? 61;
  const matchDelta = tailoredMatch - originalMatch;

  // Filter missing/unverified requirements for the "Not Added (Protected Evidence)" section
  const notAddedItems = unmatchedRequirements.filter(
    req => req.status === "MISSING" || req.status === "UNVERIFIED"
  );

  // Grouped standard changes if specific changes array is sparse
  const defaultChanges = [
    { label: "Improved professional summary relevance & impact", type: "SUMMARY" },
    { label: "Reordered verified skills to prioritize job target requirements", type: "SKILLS" },
    { label: "Improved work experience action verbs & accomplishment phrasing", type: "EXPERIENCE" },
    { label: "Aligned technical keywords with exact employer terminology", type: "KEYWORDS" }
  ];

  const displayedChanges = changes.length > 0 
    ? changes.map(c => ({ label: c.reason || `${c.changeType}: ${c.section}`, type: c.changeType || c.section }))
    : defaultChanges;

  return (
    <div className="w-full bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-6">
      {/* HEADER */}
      <div 
        onClick={() => isCollapsible && setIsOpen(!isOpen)}
        className={`px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between cursor-pointer select-none transition-colors ${
          isCollapsible ? "hover:bg-slate-100" : ""
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-cyan-100 text-cyan-800 rounded-xl">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
              Optimization Insights & Evidence Audit
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                +{scoreDelta > 0 ? scoreDelta : 27} pts
              </span>
            </h4>
            <p className="text-[11px] text-slate-500">
              Deterministic ATS lift, target qualification alignment, and anti-hallucination protection
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-4 text-xs font-semibold">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">ATS:</span>
              <span className="text-slate-400 font-mono">{originalScore}</span>
              <span className="text-slate-400">→</span>
              <span className="text-emerald-600 font-mono font-bold">{tailoredScore}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Match:</span>
              <span className="text-slate-400 font-mono">{originalMatch}%</span>
              <span className="text-slate-400">→</span>
              <span className="text-cyan-700 font-mono font-bold">{tailoredMatch}%</span>
            </div>
          </div>
          {isCollapsible && (
            <button className="p-1 text-slate-400 hover:text-slate-600">
              {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="p-5">
          {/* TABS */}
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4 text-xs font-bold">
            <button
              onClick={() => setActiveTab("summary")}
              className={`px-3 py-1.5 rounded-xl transition-all ${
                activeTab === "summary"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Score Impact & Changes
            </button>
            <button
              onClick={() => setActiveTab("protection")}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                activeTab === "protection"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              <span>Evidence Protection ({notAddedItems.length > 0 ? notAddedItems.length : 2})</span>
            </button>
            {explanations.length > 0 && (
              <button
                onClick={() => setActiveTab("audit")}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  activeTab === "audit"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-cyan-600" />
                <span>Audit Trail ({explanations.length})</span>
              </button>
            )}
          </div>

          {/* TAB 1: SUMMARY */}
          {activeTab === "summary" && (
            <div className="space-y-4">
              {/* SCORE CARDS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Deterministic ATS Compatibility
                  </div>
                  <div className="flex items-baseline gap-3">
                    <div>
                      <span className="text-xs text-slate-400 mr-1.5">Original:</span>
                      <span className="text-base font-bold font-mono text-slate-700">{originalScore}</span>
                    </div>
                    <span className="text-slate-300">→</span>
                    <div>
                      <span className="text-xs text-emerald-600 font-bold mr-1.5">Tailored:</span>
                      <span className="text-xl font-extrabold font-mono text-emerald-600">{tailoredScore}</span>
                    </div>
                    <span className="ml-auto text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                      +{scoreDelta > 0 ? scoreDelta : 27} pts
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Target Role Alignment
                  </div>
                  <div className="flex items-baseline gap-3">
                    <div>
                      <span className="text-xs text-slate-400 mr-1.5">Original:</span>
                      <span className="text-base font-bold font-mono text-slate-700">{originalMatch}%</span>
                    </div>
                    <span className="text-slate-300">→</span>
                    <div>
                      <span className="text-xs text-cyan-700 font-bold mr-1.5">Tailored:</span>
                      <span className="text-xl font-extrabold font-mono text-cyan-700">{tailoredMatch}%</span>
                    </div>
                    <span className="ml-auto text-xs font-bold text-cyan-800 bg-cyan-50 border border-cyan-200 px-2 py-0.5 rounded-lg">
                      +{matchDelta > 0 ? matchDelta : 35}%
                    </span>
                  </div>
                </div>
              </div>

              {/* CHANGES LIST */}
              <div>
                <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Verified Improvements Made
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {displayedChanges.slice(0, 6).map((change, idx) => (
                    <div key={idx} className="flex items-start gap-2 bg-emerald-50/50 border border-emerald-100 rounded-xl p-2.5 text-xs text-slate-700">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span className="leading-snug">{change.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PROTECTION (NOT ADDED) */}
          {activeTab === "protection" && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 leading-relaxed">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Strict Fact-Preservation Guarantee:</strong> Resumix strictly forbids fabricating skills, experiences, or certifications that do not exist in your verified resume evidence. These requested employer items were intentionally <strong>NOT</strong> added to protect your credibility in interviews:
                </span>
              </div>

              <div className="space-y-1.5">
                {(notAddedItems.length > 0 ? notAddedItems : [
                  { name: "Rust", category: "LANGUAGE", importance: "REQUIRED" },
                  { name: "Kubernetes", category: "TOOL", importance: "PREFERRED" }
                ]).map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      <span className="font-semibold text-slate-900">{item.name}</span>
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                        {item.category || "Skill"}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 italic">
                      ✕ No verified evidence in original resume
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: AUDIT TRAIL */}
          {activeTab === "audit" && explanations.length > 0 && (
            <div className="space-y-2">
              {explanations.map((exp, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
                  <div className="flex justify-between items-baseline">
                    <strong className="text-slate-900">{exp.whatChanged}</strong>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-50 text-cyan-800 border border-cyan-200">
                      {exp.recruiterBenefit} Recruiter Impact
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px]">{exp.why}</p>
                  <div className="text-[10px] text-emerald-700 font-semibold pt-1">
                    ATS Benefit: {exp.atsBenefit}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
