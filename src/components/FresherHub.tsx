import React, { useState, useEffect } from "react";
import { 
  Building, 
  GraduationCap, 
  Sparkles, 
  Plus, 
  Code, 
  Award, 
  Terminal, 
  Check, 
  Copy, 
  Download, 
  BookOpen, 
  ChevronRight, 
  Info, 
  Activity, 
  FileCheck, 
  Save, 
  Lightbulb, 
  RefreshCw,
  XCircle
} from "lucide-react";
import { collection, doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

interface FresherHubProps {
  userId: string;
  onResumeCreated?: () => void;
}

interface ProjectSuggestion {
  title: string;
  description: string;
  impact: string;
}

interface FresherData {
  overview: string;
  hiringStandards: string;
  recommendedSkills: string[];
  recommendedCertifications: string[];
  suggestedProjects: ProjectSuggestion[];
  interviewTips: string[];
  starterResume: string;
}

const LOADING_STEPS = [
  "Connecting to entry-level career intelligence...",
  "Synthesizing hiring standards for target role...",
  "Formulating realistic practice project blueprints...",
  "Drafting certified skill roadmaps for candidates...",
  "Structuring a clean, ATS-friendly starter resume draft...",
  "Validating entry-level role recommendations..."
];

export default function FresherHub({ userId, onResumeCreated }: FresherHubProps) {
  // Input fields
  const [targetCompany, setTargetCompany] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [fieldsOfInterest, setFieldsOfInterest] = useState("");
  const [academicProjects, setAcademicProjects] = useState("");
  const [strengths, setStrengths] = useState("");

  // Flow / Loading state
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Result state
  const [fresherResult, setFresherResult] = useState<FresherData | null>(null);
  const [activeTab, setActiveTab] = useState<"insights" | "skills" | "projects" | "tips" | "resume">("insights");
  const [copiedResume, setCopiedResume] = useState(false);
  const [savedToVault, setSavedToVault] = useState(false);

  // Cycling loading step phrases
  useEffect(() => {
    let interval: any;
    if (loading) {
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev + 1) % LOADING_STEPS.length);
      }, 3000);
    } else {
      setLoadingStep(0);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCompany.trim() || !targetRole.trim()) {
      setError("Target Company and Target Role are required.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    setSavedToVault(false);
    setFresherResult(null);

    try {
      const response = await fetch("/api/generate-fresher-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetCompany: targetCompany.trim(),
          targetRole: targetRole.trim(),
          fieldsOfInterest: fieldsOfInterest.trim(),
          academicProjects: academicProjects.trim(),
          strengths: strengths.trim(),
        }),
      });

      const resData = await response.json();
      if (!response.ok || !resData.success || !resData.data) {
        throw new Error(resData.error?.message || "Failed to generate fresher career guide.");
      }

      setFresherResult(resData.data);
      setActiveTab("insights");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred during research synthesis.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToVault = async () => {
    if (!fresherResult) return;
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const resumeId = doc(collection(db, "users", userId, "resumes")).id;
      const resumeDocRef = doc(db, "users", userId, "resumes", resumeId);

      const cleanName = `Starter_${targetCompany.replace(/\s+/g, "_")}_${targetRole.replace(/\s+/g, "_")}.md`;

      await setDoc(resumeDocRef, {
        id: resumeId,
        userId: userId,
        name: cleanName,
        size: fresherResult.starterResume.length,
        type: "text/markdown",
        uploadedAt: new Date().toISOString(),
        content: fresherResult.starterResume,
      });

      setSavedToVault(true);
      setSuccess(`Starter draft saved as "${cleanName}" in your Resume Vault.`);
      if (onResumeCreated) {
        onResumeCreated();
      }
    } catch (err: any) {
      console.error(err);
      setError("Failed to save draft resume to your Vault. Please check database permissions.");
    } finally {
      setLoading(false);
    }
  };

  const downloadResumeFile = () => {
    if (!fresherResult) return;
    const element = document.createElement("a");
    const file = new Blob([fresherResult.starterResume], { type: "text/markdown" });
    element.href = URL.createObjectURL(file);
    element.download = `${targetCompany}_${targetRole}_Starter_Resume.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const copyResumeToClipboard = () => {
    if (!fresherResult) return;
    navigator.clipboard.writeText(fresherResult.starterResume);
    setCopiedResume(true);
    setTimeout(() => setCopiedResume(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <GraduationCap className="w-5 h-5 text-cyan-600" />
          <h2 className="text-slate-800 font-display font-bold text-xl">
            Fresher Career Roadmap & Starter Builder
          </h2>
        </div>
        <p className="text-slate-500 text-xs">
          Building your first resume? Enter your target company and entry-level role to generate verified skill milestones, practice project blueprints, and a starter template.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50/90 border border-red-200 text-red-800 text-xs rounded-2xl flex items-start gap-2.5 font-medium animate-fadeIn">
          <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold block">Generation Unavailable</span>
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError("")}
            className="text-red-500 hover:text-red-700 font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded-2xl flex items-start gap-2.5 font-medium animate-fadeIn">
          <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
          <span>{success}</span>
        </div>
      )}

      {/* 1. INPUT FORM */}
      {!loading && !fresherResult && (
        <form onSubmit={handleGenerate} className="space-y-5 bg-white/70 backdrop-blur-md p-6 border border-slate-200 rounded-3xl shadow-sm">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
            <Sparkles className="w-4 h-4 text-cyan-500" />
            <h3 className="text-slate-800 font-display font-bold text-sm">Target Company & Entry-Level Goal</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label className="block text-slate-700 text-xs font-bold mb-2 uppercase tracking-wider">
                Target Company *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Google, Deloitte, Microsoft, Canva"
                value={targetCompany}
                onChange={(e) => setTargetCompany(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-slate-700 text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-medium"
              />
            </div>

            <div>
              <label className="block text-slate-700 text-xs font-bold mb-2 uppercase tracking-wider">
                Target Role / Title *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Junior Frontend Developer, Associate Software Engineer"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-slate-700 text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 text-xs font-bold mb-2 uppercase tracking-wider flex items-center justify-between">
              <span>Fields of Interest / Academic Major (Optional)</span>
              <span className="text-[10px] text-slate-400 font-normal">Helps tailor suggested technologies</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Computer Science, Web Development, Cloud Computing"
              value={fieldsOfInterest}
              onChange={(e) => setFieldsOfInterest(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-slate-700 text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-medium"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label className="block text-slate-700 text-xs font-bold mb-2 uppercase tracking-wider">
                Academic Coursework / Existing Projects (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Completed Data Structures, Built a simple React blog..."
                value={academicProjects}
                onChange={(e) => setAcademicProjects(e.target.value)}
                className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-slate-700 text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all resize-none font-medium leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-slate-700 text-xs font-bold mb-2 uppercase tracking-wider">
                Core Strengths & Extracurriculars (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Fast learner, hackathon participant, competitive programming..."
                value={strengths}
                onChange={(e) => setStrengths(e.target.value)}
                className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-slate-700 text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all resize-none font-medium leading-relaxed"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-4 bg-cyan-500 hover:bg-cyan-600 text-white font-display font-bold text-xs rounded-2xl shadow-[0_4px_20px_rgba(6,182,212,0.25)] transition-all flex items-center justify-center gap-2 clickable-cursor"
          >
            <Sparkles className="w-4 h-4" />
            <span>Generate Roadmap & Starter Resume Draft</span>
          </button>
        </form>
      )}

      {/* 2. LOADING SCREEN */}
      {loading && !fresherResult && (
        <div className="bg-white/70 backdrop-blur-md border border-slate-200 p-10 rounded-3xl text-center space-y-6 shadow-sm min-h-[350px] flex flex-col justify-center items-center">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-4 border-cyan-100 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <div className="space-y-2 max-w-md">
            <h4 className="text-slate-800 font-display font-bold text-base">
              Synthesizing Entry-Level Roadmap
            </h4>
            <p className="text-cyan-600 text-xs font-semibold animate-pulse">
              {LOADING_STEPS[loadingStep]}
            </p>
          </div>
        </div>
      )}

      {/* 3. RESULTS PANEL */}
      {fresherResult && (
        <div className="space-y-6 animate-fadeIn">
          {/* Top Info Banner */}
          <div className="bg-slate-900 text-white p-6 rounded-3xl border border-cyan-500/20 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-5 relative overflow-hidden">
            <div className="relative z-10 space-y-1">
              <span className="px-2.5 py-0.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-full text-[10px] font-bold uppercase tracking-wider inline-block">
                Starter Blueprint
              </span>
              <h3 className="text-xl font-display font-bold">
                Junior {targetRole} at {targetCompany}
              </h3>
              <p className="text-slate-400 text-xs font-medium">
                Practice project recommendations and starter resume draft
              </p>
            </div>

            <div className="flex gap-2.5 relative z-10 w-full md:w-auto">
              <button
                onClick={() => setFresherResult(null)}
                className="flex-1 md:flex-none px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/10 text-xs font-bold rounded-xl transition-all text-center"
              >
                Configure New Goal
              </button>
              <button
                onClick={handleSaveToVault}
                disabled={savedToVault}
                className={`flex-1 md:flex-none px-4 py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                  savedToVault 
                    ? "bg-emerald-600 text-white cursor-default" 
                    : "bg-cyan-500 hover:bg-cyan-600 text-white"
                }`}
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savedToVault ? "Saved to Vault!" : "Save Starter to Vault"}</span>
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-2 overflow-x-auto pb-2 border-b border-slate-200">
            <button
              onClick={() => setActiveTab("insights")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                activeTab === "insights"
                  ? "bg-cyan-500 text-white shadow-sm"
                  : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200"
              }`}
            >
              <Building className="w-3.5 h-3.5" />
              <span>Role Insights</span>
            </button>
            <button
              onClick={() => setActiveTab("skills")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                activeTab === "skills"
                  ? "bg-cyan-500 text-white shadow-sm"
                  : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200"
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>Skills Roadmap</span>
            </button>
            <button
              onClick={() => setActiveTab("projects")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                activeTab === "projects"
                  ? "bg-cyan-500 text-white shadow-sm"
                  : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200"
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>Practice Projects</span>
            </button>
            <button
              onClick={() => setActiveTab("tips")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                activeTab === "tips"
                  ? "bg-cyan-500 text-white shadow-sm"
                  : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Interview Tips</span>
            </button>
            <button
              onClick={() => setActiveTab("resume")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                activeTab === "resume"
                  ? "bg-cyan-500 text-white shadow-sm"
                  : "bg-white hover:bg-slate-50 text-slate-600 border border-slate-200"
              }`}
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>Starter Resume</span>
            </button>
          </div>

          {/* Active Tab Content Card */}
          <div className="bg-white/70 backdrop-blur-xl border border-slate-200 p-6 rounded-3xl shadow-sm min-h-[350px]">
            
            {/* INSIGHTS TAB */}
            {activeTab === "insights" && (
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="p-5 bg-cyan-50/50 border border-cyan-100 rounded-2xl space-y-2">
                    <h4 className="text-slate-800 font-display font-bold text-sm flex items-center gap-2">
                      <Building className="w-4 h-4 text-cyan-600" />
                      <span>Entry-Level Expectations</span>
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">
                      {fresherResult.overview}
                    </p>
                  </div>

                  <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <h4 className="text-slate-800 font-display font-bold text-sm flex items-center gap-2">
                      <Activity className="w-4 h-4 text-cyan-600" />
                      <span>Hiring Standards</span>
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">
                      {fresherResult.hiringStandards}
                    </p>
                  </div>
                </div>

                <div className="p-5 bg-amber-50/70 border border-amber-200 rounded-2xl flex gap-3.5 items-start">
                  <Lightbulb className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h5 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Truth in Resume Guidance</h5>
                    <p className="text-xs text-slate-700 leading-relaxed font-medium">
                      Ensure that projects and skills are only added to your final resume once you have built and understood them. Practical demonstration beats unverified claims in entry-level screening.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* SKILLS ROADMAP TAB */}
            {activeTab === "skills" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-slate-800 font-display font-bold text-base mb-1">Entry-Level Technical Roadmap</h3>
                  <p className="text-slate-500 text-xs">Recommended skills and foundational knowledge for {targetRole} at {targetCompany}</p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-cyan-600 uppercase tracking-wider flex items-center gap-1.5">
                      <Terminal className="w-4 h-4" />
                      <span>Key Technical Skills to Learn</span>
                    </h4>
                    <div className="grid grid-cols-1 gap-2">
                      {fresherResult.recommendedSkills.map((skill, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 flex items-center gap-2">
                          <ChevronRight className="w-3.5 h-3.5 text-cyan-500" />
                          <span>{skill}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1.5">
                      <Award className="w-4 h-4" />
                      <span>Recommended Certifications / Coursework</span>
                    </h4>
                    <div className="grid grid-cols-1 gap-2">
                      {fresherResult.recommendedCertifications.map((cert, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 flex items-center gap-2">
                          <Plus className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span>{cert}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PROJECTS TAB (Part 23 - Suggested Practice Projects) */}
            {activeTab === "projects" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-slate-800 font-display font-bold text-base mb-1">Suggested Practice Projects</h3>
                  <p className="text-slate-500 text-xs">Build these practice projects to gain practical competence. Add them to your resume once completed.</p>
                </div>

                <div className="space-y-4">
                  {fresherResult.suggestedProjects.map((proj, idx) => (
                    <div key={idx} className="p-5 border border-slate-200 rounded-2xl bg-white shadow-sm space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-cyan-100 text-cyan-600 flex items-center justify-center font-bold text-xs">
                            {idx + 1}
                          </div>
                          <h4 className="text-slate-900 font-display font-bold text-sm">
                            {proj.title}
                          </h4>
                        </div>
                        <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-bold uppercase tracking-wider">
                          Suggested Practice Blueprint
                        </span>
                      </div>

                      <div className="space-y-2">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">How to build this project:</span>
                        <p className="text-xs text-slate-600 leading-relaxed font-medium">
                          {proj.description}
                        </p>
                      </div>

                      <div className="p-3 bg-cyan-50/50 border border-cyan-100 rounded-xl space-y-1">
                        <span className="text-[10px] text-cyan-700 font-bold uppercase tracking-wider block">Recommended bullet phrasing (once built):</span>
                        <p className="text-xs text-slate-800 font-semibold leading-relaxed">
                          "{proj.impact}"
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* INTERVIEW TIPS TAB */}
            {activeTab === "tips" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-slate-800 font-display font-bold text-base mb-1">Entry-Level Interview Preparation</h3>
                  <p className="text-slate-500 text-xs">Guidance for technical screenings and behavioral interviews at {targetCompany}</p>
                </div>

                <div className="space-y-3">
                  {fresherResult.interviewTips.map((tip, idx) => (
                    <div key={idx} className="flex gap-3 p-4 bg-slate-50 rounded-xl items-start border border-slate-200">
                      <div className="w-5 h-5 rounded-md bg-cyan-100 border border-cyan-200 flex items-center justify-center text-cyan-600 shrink-0 text-[10px] font-bold mt-0.5">
                        {idx + 1}
                      </div>
                      <span className="text-xs text-slate-700 font-medium leading-relaxed">{tip}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STARTER RESUME TAB */}
            {activeTab === "resume" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div>
                    <h3 className="text-slate-800 font-display font-bold text-base mb-0.5">Starter Resume Draft (Markdown)</h3>
                    <p className="text-slate-500 text-xs">A structured template with placeholder fields and suggested project sections.</p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={copyResumeToClipboard}
                      className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
                    >
                      {copiedResume ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedResume ? "Copied" : "Copy Template"}</span>
                    </button>
                    <button
                      onClick={downloadResumeFile}
                      className="py-2 px-3 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download (.md)</span>
                    </button>
                  </div>
                </div>

                <div className="markdown-body overflow-y-auto max-h-[500px] border border-slate-200 p-5 rounded-2xl bg-white font-sans select-text">
                  <div className="whitespace-pre-wrap leading-relaxed text-xs text-slate-700 font-mono">
                    {fresherResult.starterResume}
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
