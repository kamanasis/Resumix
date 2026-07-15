import React, { useState } from "react";
import { ResumeAnalysis } from "../types";
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
  Compass
} from "lucide-react";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";

interface AnalysisHistoryProps {
  analyses: ResumeAnalysis[];
  userId: string;
  onRefresh: () => void;
}

function safeString(val: any): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) {
    return val.map(item => (typeof item === "string" ? item : JSON.stringify(item))).join("\n");
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
  userId,
  onRefresh,
}: AnalysisHistoryProps) {
  const [selectedAnalysis, setSelectedAnalysis] = useState<ResumeAnalysis | null>(null);
  const [copiedText, setCopiedText] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<string>("overview");

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Unknown Date";
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const downloadTextFile = (filename: string, content: string) => {
    const element = document.createElement("a");
    const file = new Blob([content], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedAnalysis?.id === id) {
      setSelectedAnalysis(null);
    }
    setDeletingId(id);
    try {
      const docRef = doc(db, "users", userId, "analyses", id);
      await deleteDoc(docRef);
      onRefresh();
    } catch (err) {
      console.error("Error deleting analysis:", err);
    } finally {
      setDeletingId(null);
    }
  };

  if (analyses.length === 0) {
    return (
      <div className="text-center py-10 px-4 bg-white/40 backdrop-blur-md border border-white rounded-3xl">
        <Sparkles className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h4 className="text-slate-700 font-display font-bold text-sm mb-1">
          No optimization history yet
        </h4>
        <p className="text-slate-500 text-xs max-w-xs mx-auto">
          Use the Customization Tool to tailor your first resume. Your historical logs will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Selection View or List View */}
      {!selectedAnalysis ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-slate-800 font-display font-semibold text-xs uppercase tracking-wider">
              Optimization History ({analyses.length})
            </h3>
          </div>

          <div className="grid gap-3">
            {analyses.map((analysis) => {
              const isExcellent = analysis.matchingScore >= 80;
              const isModerate = analysis.matchingScore >= 60 && analysis.matchingScore < 80;

              return (
                <div
                  key={analysis.id}
                  onClick={() => setSelectedAnalysis(analysis)}
                  className="p-4 rounded-2xl border border-white bg-white/60 backdrop-blur-sm hover:border-cyan-400 hover:bg-white transition-all duration-300 flex items-center justify-between cursor-pointer group shadow-sm hover:shadow-md"
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    {/* Score badge */}
                    <div
                      className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center font-display font-bold text-sm shrink-0 border ${
                        isExcellent
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : isModerate
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-red-50 text-red-700 border-red-200"
                      }`}
                    >
                      <span className="text-base font-bold">{analysis.matchingScore}%</span>
                      <span className="text-[7px] font-bold uppercase tracking-widest leading-none">Match</span>
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-slate-800 font-bold truncate text-sm">
                        {analysis.targetCompany} • {analysis.targetRole}
                      </h4>
                      <p className="text-slate-500 text-xs truncate mt-0.5 font-medium">
                        Based on: {analysis.resumeName}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400 font-medium">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{formatDate(analysis.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => handleDelete(analysis.id, e)}
                      disabled={deletingId === analysis.id}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100 clickable-cursor"
                      title="Delete analysis log"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-cyan-500 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Detailed View of historical analysis with 8-tab system */
        <div className="space-y-6 animate-fadeIn">
          {/* Header Action bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-3 border-b border-cyan-100">
            <button
              onClick={() => setSelectedAnalysis(null)}
              className="text-cyan-600 hover:text-cyan-500 text-xs font-bold flex items-center gap-1.5 clickable-cursor"
            >
              ← Back to History List
            </button>
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                onClick={() => downloadTextFile(`${selectedAnalysis.targetCompany}_Tailored_Resume.md`, selectedAnalysis.tailoredContent)}
                className="flex-1 sm:flex-none py-2 px-4 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm clickable-cursor"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Resume</span>
              </button>
              <button
                onClick={() => copyToClipboard(selectedAnalysis.tailoredContent)}
                className="flex-1 sm:flex-none py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all clickable-cursor"
              >
                {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedText ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>

          {/* Quick Header Banner */}
          <div className="bg-white/45 backdrop-blur-md border border-slate-100 p-5 rounded-3xl shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-cyan-100 text-cyan-700 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  Saved Optimization
                </span>
                {selectedAnalysis.experienceLevel && (
                  <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-[10px] font-bold">
                    {selectedAnalysis.experienceLevel}
                  </span>
                )}
                {selectedAnalysis.location && (
                  <span className="px-2.5 py-1 bg-teal-50 text-teal-700 border border-teal-100 rounded-full text-[10px] font-bold flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {selectedAnalysis.location}
                  </span>
                )}
              </div>
              <h3 className="text-xl font-display font-bold text-slate-900 mt-2">
                {selectedAnalysis.targetRole} @ {selectedAnalysis.targetCompany}
              </h3>
              <p className="text-slate-500 text-xs mt-0.5">
                Saved on {formatDate(selectedAnalysis.createdAt)} • Derived from {selectedAnalysis.resumeName}
              </p>
            </div>

            <div className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl text-cyan-700 font-display font-extrabold text-sm shadow-sm shrink-0">
              {selectedAnalysis.matchingScore}% Match Rate
            </div>
          </div>

          {/* 8 TABS FOR HISTORICAL VIEW */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-slate-100">
            <button
              onClick={() => setResultTab("overview")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap clickable-cursor ${
                resultTab === "overview"
                  ? "bg-cyan-500 text-white shadow-sm shadow-cyan-300"
                  : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/60"
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Overview</span>
            </button>
            <button
              onClick={() => setResultTab("details")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap clickable-cursor ${
                resultTab === "details"
                  ? "bg-cyan-500 text-white shadow-sm shadow-cyan-300"
                  : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/60"
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Job Details</span>
            </button>
            <button
              onClick={() => setResultTab("responsibilities")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap clickable-cursor ${
                resultTab === "responsibilities"
                  ? "bg-cyan-500 text-white shadow-sm shadow-cyan-300"
                  : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/60"
              }`}
            >
              <ListTodo className="w-3.5 h-3.5" />
              <span>Responsibilities</span>
            </button>
            <button
              onClick={() => setResultTab("tech")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap clickable-cursor ${
                resultTab === "tech"
                  ? "bg-cyan-500 text-white shadow-sm shadow-cyan-300"
                  : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/60"
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Technologies</span>
            </button>
            <button
              onClick={() => setResultTab("skills")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap clickable-cursor ${
                resultTab === "skills"
                  ? "bg-cyan-500 text-white shadow-sm shadow-cyan-300"
                  : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/60"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Missing Skills</span>
            </button>
            <button
              onClick={() => setResultTab("improvements")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap clickable-cursor ${
                resultTab === "improvements"
                  ? "bg-cyan-500 text-white shadow-sm shadow-cyan-300"
                  : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/60"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Resume Improvements</span>
            </button>
            <button
              onClick={() => setResultTab("keywords")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap clickable-cursor ${
                resultTab === "keywords"
                  ? "bg-cyan-500 text-white shadow-sm shadow-cyan-300"
                  : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/60"
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>ATS Keywords</span>
            </button>
            <button
              onClick={() => setResultTab("resume")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap clickable-cursor ${
                resultTab === "resume"
                  ? "bg-cyan-500 text-white shadow-sm shadow-cyan-300"
                  : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200/60"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Tailored Resume</span>
            </button>
          </div>

          {/* TAB CONTENT CARDS */}
          <div className="bg-white/70 backdrop-blur-xl border border-white p-6 rounded-3xl shadow-sm animate-fadeIn min-h-[350px]">
            
            {/* 1. OVERVIEW TAB */}
            {resultTab === "overview" && (
              <div className="space-y-6">
                <div className="grid md:grid-cols-12 gap-6 items-center">
                  <div className="md:col-span-4 flex flex-col items-center justify-center p-6 bg-slate-900 text-white rounded-3xl relative overflow-hidden shadow-md">
                    <div className="absolute -top-12 -right-12 w-32 h-32 bg-cyan-400 opacity-10 rounded-full blur-2xl"></div>
                    <div className="relative w-28 h-28 mb-3">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                        <path
                          className="text-slate-800"
                          strokeWidth="3"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          className="text-cyan-400"
                          strokeWidth="3.5"
                          strokeDasharray={`${selectedAnalysis.matchingScore}, 100`}
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-display font-extrabold text-white">{selectedAnalysis.matchingScore}%</span>
                        <span className="text-[9px] text-cyan-300 font-bold uppercase tracking-wider">Match Score</span>
                      </div>
                    </div>
                    <p className="text-xs text-center font-medium text-slate-300">
                      {selectedAnalysis.matchingScore >= 85
                        ? "Excellent alignment! Optimized for ATS."
                        : selectedAnalysis.matchingScore >= 70
                        ? "Good fit, but has key skill gaps to resolve."
                        : "Requires substantial resume updates."}
                    </p>
                  </div>

                  <div className="md:col-span-8 space-y-4">
                    <div className="bg-cyan-50/50 border border-cyan-100 p-5 rounded-2xl">
                      <h4 className="text-slate-900 font-display font-bold text-sm mb-1.5 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-cyan-500" />
                        <span>AI Optimization Recommendation</span>
                      </h4>
                      <p className="text-xs text-slate-700 leading-relaxed font-medium">
                        {selectedAnalysis.recommendations || "Your resume has been tailored for the requested role. Incorporate targeted keywords, highlight quantifiable metrics, and review the missing skills tab for full compliance."}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Company Goal</span>
                        <span className="text-xs font-bold text-slate-800">{selectedAnalysis.targetCompany}</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Target Position</span>
                        <span className="text-xs font-bold text-slate-800">{selectedAnalysis.targetRole}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {selectedAnalysis.weakExperienceAreas && selectedAnalysis.weakExperienceAreas.length > 0 && (
                  <div className="border-t border-slate-100 pt-5">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span>Experience Weaknesses & Alignment Gaps</span>
                    </h4>
                    <div className="grid md:grid-cols-2 gap-3">
                      {selectedAnalysis.weakExperienceAreas.map((weak, idx) => (
                        <div key={idx} className="p-3 bg-amber-50/50 border border-amber-100/50 rounded-xl text-xs text-slate-700 font-medium">
                          {weak}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2. JOB DETAILS TAB */}
            {resultTab === "details" && (
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl space-y-2">
                    <div className="flex items-center gap-1.5 border-b border-slate-200/60 pb-2">
                      <Building className="w-4 h-4 text-cyan-600" />
                      <h4 className="text-slate-800 font-display font-bold text-sm">Company Overview & Culture</h4>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">
                      {selectedAnalysis.overview || `${selectedAnalysis.targetCompany} is widely known for professional excellence, demanding high competency, attention to details, and strong ownership in this specific field.`}
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl space-y-2">
                    <div className="flex items-center gap-1.5 border-b border-slate-200/60 pb-2">
                      <TrendingUp className="w-4 h-4 text-cyan-600" />
                      <h4 className="text-slate-800 font-display font-bold text-sm">Current Hiring Trends & Selection Focus</h4>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">
                      {selectedAnalysis.hiringTrends || "Focus is highly on modern technical frameworks, quantified metrics of success, scale delivery, and highly collaborative product ownership."}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl space-y-2">
                  <div className="flex items-center gap-1.5 border-b border-slate-200/60 pb-2">
                    <Award className="w-4 h-4 text-cyan-600" />
                    <h4 className="text-slate-800 font-display font-bold text-sm">Portfolio & Project Standards</h4>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium">
                    {selectedAnalysis.projectExpectations || "Candidates should highlight full-lifecycle deliverables, architectural decisions, design consistency, or professional enterprise-ready products."}
                  </p>
                </div>

                {selectedAnalysis.softSkills && selectedAnalysis.softSkills.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5">Key Soft Skills Valued</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedAnalysis.softSkills.map((skill, idx) => (
                        <span key={idx} className="px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. RESPONSIBILITIES TAB */}
            {resultTab === "responsibilities" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-slate-800 font-display font-bold text-base mb-1">Company-Specific Responsibilities</h3>
                  <p className="text-slate-500 text-xs">Standard expectations for {selectedAnalysis.targetRole} role at {selectedAnalysis.targetCompany}</p>
                </div>

                <div className="space-y-2.5 pt-2">
                  {selectedAnalysis.responsibilities && selectedAnalysis.responsibilities.length > 0 ? (
                    selectedAnalysis.responsibilities.map((resp, idx) => (
                      <div key={idx} className="flex gap-3 p-3.5 bg-slate-50 rounded-xl items-start border border-slate-100">
                        <div className="w-5 h-5 rounded-md bg-cyan-100 border border-cyan-200 flex items-center justify-center text-cyan-600 shrink-0 text-[10px] font-bold mt-0.5">
                          {idx + 1}
                        </div>
                        <span className="text-xs text-slate-700 font-medium leading-relaxed">{resp}</span>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-slate-500 text-xs text-center">
                      No specific responsibilities generated. General responsibilities are aligned in the tailored resume.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 4. TECHNOLOGIES TAB */}
            {resultTab === "tech" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-slate-800 font-display font-bold text-base mb-1">Required Technologies & Stacks</h3>
                  <p className="text-slate-500 text-xs">Tools, frameworks, and stacks commonly requested by {selectedAnalysis.targetCompany} for {selectedAnalysis.targetRole}</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2">
                  {selectedAnalysis.requiredTechnologies && selectedAnalysis.requiredTechnologies.length > 0 ? (
                    selectedAnalysis.requiredTechnologies.map((tech, idx) => (
                      <div key={idx} className="p-4 bg-slate-50 hover:bg-slate-100/80 transition-colors border border-slate-200/50 rounded-xl flex items-center gap-2.5">
                        <Terminal className="w-4 h-4 text-cyan-600 shrink-0" />
                        <span className="text-xs font-bold text-slate-800">{tech}</span>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full p-4 text-slate-500 text-xs text-center">
                      No technology stacks specifically extracted. Check the standard requirements on overview tab.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 5. MISSING SKILLS TAB */}
            {resultTab === "skills" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-slate-800 font-display font-bold text-base mb-1">Critical Skill & Experience Gaps</h3>
                  <p className="text-slate-500 text-xs">These attributes are highly expected by recruiter bots but are missing or weak in your resume</p>
                </div>

                <div className="grid md:grid-cols-2 gap-6 pt-2">
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Missing Technical Skills</span>
                    </h4>
                    <div className="space-y-2">
                      {selectedAnalysis.missingSkills && selectedAnalysis.missingSkills.length > 0 ? (
                        selectedAnalysis.missingSkills.map((skill, idx) => (
                          <div key={idx} className="p-3 bg-red-50/50 border border-red-100 rounded-xl text-xs text-slate-800 font-medium flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" />
                            <span>{skill}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-slate-400 text-xs italic">No critical missing skills found. Great job!</div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-orange-600 uppercase tracking-wider flex items-center gap-1.5">
                      <Award className="w-4 h-4" />
                      <span>Missing Certifications / Credentials</span>
                    </h4>
                    <div className="space-y-2">
                      {selectedAnalysis.missingCertifications && selectedAnalysis.missingCertifications.length > 0 ? (
                        selectedAnalysis.missingCertifications.map((cert, idx) => (
                          <div key={idx} className="p-3 bg-orange-50/50 border border-orange-100 rounded-xl text-xs text-slate-800 font-medium flex items-center gap-2">
                            <Plus className="w-3.5 h-3.5 text-orange-600" />
                            <span>{cert}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-slate-400 text-xs italic">No mandatory certifications missing.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 6. RESUME IMPROVEMENTS TAB */}
            {resultTab === "improvements" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-slate-800 font-display font-bold text-base mb-1">Tailored Resume Improvements</h3>
                  <p className="text-slate-500 text-xs">Actionable optimization tips and project ideas to stand out during reviews</p>
                </div>

                {/* Missing Projects */}
                {selectedAnalysis.missingProjects && selectedAnalysis.missingProjects.length > 0 && (
                  <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <Plus className="w-4 h-4 text-cyan-600" />
                      <span>Recommended Showcase Projects to Add</span>
                    </h4>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {selectedAnalysis.missingProjects.map((proj, idx) => (
                        <div key={idx} className="p-4 bg-white border border-slate-200/50 rounded-xl text-xs text-slate-700 font-medium shadow-sm hover:shadow-md transition-all">
                          {proj}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tailored Bullet Replacements */}
                {selectedAnalysis.tailoredBullets && selectedAnalysis.tailoredBullets.length > 0 ? (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckSquare className="w-4 h-4 text-cyan-600" />
                      <span>Tailored Bullet Point Replacements (Before / After)</span>
                    </h4>
                    
                    <div className="space-y-4">
                      {selectedAnalysis.tailoredBullets.map((bullet, idx) => (
                        <div key={idx} className="grid md:grid-cols-2 gap-4 p-4 border border-slate-200/60 rounded-2xl bg-white shadow-sm hover:border-cyan-200 transition-all">
                          <div className="space-y-1">
                            <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider">Current Bullet:</span>
                            <p className="text-xs text-slate-500 italic leading-relaxed">{bullet.current}</p>
                          </div>
                          <div className="space-y-1 border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-4">
                            <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">ATS Improved Bullet:</span>
                            <p className="text-xs text-slate-800 font-semibold leading-relaxed">{bullet.improved}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Standard Suggested Changes Fallback if no structured bullet point replacements exist */
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <FileCheck className="w-3.5 h-3.5 text-cyan-600" />
                      <span>Suggested Changes</span>
                    </h4>
                    <div className="markdown-body text-xs overflow-y-auto max-h-[450px] pr-2 font-medium leading-relaxed">
                      <div dangerouslySetInnerHTML={{ __html: safeString(selectedAnalysis.suggestedChanges).replace(/\n/g, "<br/>") }} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 7. ATS KEYWORDS TAB */}
            {resultTab === "keywords" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-slate-800 font-display font-bold text-base mb-1">ATS Optimization Keywords</h3>
                  <p className="text-slate-500 text-xs">Incorporate these dynamic search terms throughout your resume skills, experience, or summary sections</p>
                </div>

                <div className="flex flex-wrap gap-2.5 pt-2">
                  {selectedAnalysis.atsKeywords && selectedAnalysis.atsKeywords.length > 0 ? (
                    selectedAnalysis.atsKeywords.map((kw, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          navigator.clipboard.writeText(kw);
                          alert(`Copied "${kw}" to clipboard!`);
                        }}
                        className="px-3.5 py-2 bg-slate-50 hover:bg-cyan-50 hover:text-cyan-700 hover:border-cyan-200 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                        title="Click to copy keyword"
                      >
                        <Key className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-500 shrink-0" />
                        <span>{kw}</span>
                      </button>
                    ))
                  ) : (
                    <div className="p-4 text-slate-500 text-xs">No specific keywords extracted.</div>
                  )}
                </div>
              </div>
            )}

            {/* 8. TAILORED RESUME TAB */}
            {resultTab === "resume" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-slate-800 font-display font-bold text-base mb-0.5">Fully Tailored Resume Preview</h3>
                    <p className="text-slate-500 text-xs">Copy or download the complete markdown resume below</p>
                  </div>

                  <button
                    onClick={() => copyToClipboard(selectedAnalysis.tailoredContent)}
                    className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors clickable-cursor"
                  >
                    {copiedText ? <Check className="w-3.5 h-3.5 text-cyan-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedText ? "Copied Resume" : "Copy Resume"}</span>
                  </button>
                </div>

                <div className="markdown-body overflow-y-auto max-h-[550px] border border-slate-200/50 p-5 rounded-2xl bg-white pr-2 font-sans select-text">
                  <div className="whitespace-pre-wrap leading-relaxed text-sm text-slate-700">
                    {selectedAnalysis.tailoredContent}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
