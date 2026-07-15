import React, { useState, useEffect } from "react";
import { ResumeFile, ResumeAnalysis } from "../types";
import { 
  Sparkles, 
  Send, 
  CheckCircle, 
  FileCheck, 
  Download, 
  Copy, 
  Check, 
  TrendingUp, 
  Compass,
  Briefcase,
  Info,
  ListTodo,
  Cpu,
  AlertTriangle,
  Key,
  FileText,
  CheckSquare,
  MapPin,
  UserCheck,
  Globe,
  Building,
  Award,
  Terminal,
  Plus
} from "lucide-react";
import { collection, doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

interface TailorWizardProps {
  userId: string;
  selectedResume: ResumeFile | null;
  onAnalysisCreated: () => void;
}

const LOADING_STEPS = [
  "Initializing Resumix AI Engine...",
  "Scanning resume context & credentials...",
  "Connecting to company intelligence API...",
  "Synthesizing Deloitte & target company standards...",
  "Extracting matching semantic skills and tech-stack gaps...",
  "Drafting optimized, impact-driven bullet points...",
  "Aligning content with ATS ranking guidelines...",
  "Generating match scoring matrix...",
  "Polishing final suggestions and action items...",
];

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

export default function TailorWizard({
  userId,
  selectedResume,
  onAnalysisCreated,
}: TailorWizardProps) {
  // Input states
  const [targetCompany, setTargetCompany] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("1–2 years");
  const [location, setLocation] = useState("");
  const [jobDescription, setJobDescription] = useState("");

  // UI/Flow states
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");
  const [copiedText, setCopiedText] = useState(false);
  const [copiedChanges, setCopiedChanges] = useState(false);
  const [resultTab, setResultTab] = useState<string>("overview");

  // Result state
  const [analysisResult, setAnalysisResult] = useState<ResumeAnalysis | null>(null);

  // Rotate loading text steps
  useEffect(() => {
    let intervalId: number;
    if (loading) {
      intervalId = window.setInterval(() => {
        setLoadingStep((prev) => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
      }, 2500);
    } else {
      setLoadingStep(0);
    }
    return () => clearInterval(intervalId);
  }, [loading]);

  const handleTailor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResume) {
      setError("Please select or upload a resume from your files first.");
      return;
    }
    if (!targetCompany || !targetRole) {
      setError("Please fill in target company name and target job role.");
      return;
    }

    setLoading(true);
    setError("");
    setAnalysisResult(null);

    try {
      const response = await fetch("/api/tailor-resume", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resumeText: selectedResume.content,
          targetCompany,
          targetRole,
          jobDescription,
          experienceLevel,
          location,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to tailor resume.");
      }

      const data = await response.json();

      // Create a unique Firestore ID for this analysis
      const analysisId = doc(collection(db, "users", userId, "analyses")).id;
      const analysisDocRef = doc(db, "users", userId, "analyses", analysisId);

      const newAnalysis: ResumeAnalysis = {
        id: analysisId,
        userId: userId,
        resumeId: selectedResume.id,
        resumeName: selectedResume.name,
        targetCompany,
        targetRole,
        jobDescription,
        createdAt: new Date().toISOString(),
        matchingScore: data.matchingScore || 0,
        tailoredContent: data.tailoredContent || "",
        suggestedChanges: data.suggestedChanges || "",
        
        // Save PRD Company-Specific fields
        experienceLevel,
        location: location || undefined,
        overview: data.overview || undefined,
        hiringTrends: data.hiringTrends || undefined,
        responsibilities: data.responsibilities || undefined,
        requiredTechnologies: data.requiredTechnologies || undefined,
        softSkills: data.softSkills || undefined,
        projectExpectations: data.projectExpectations || undefined,
        missingSkills: data.missingSkills || undefined,
        missingProjects: data.missingProjects || undefined,
        missingCertifications: data.missingCertifications || undefined,
        weakExperienceAreas: data.weakExperienceAreas || undefined,
        recommendations: data.recommendations || undefined,
        tailoredBullets: data.tailoredBullets || undefined,
        atsKeywords: data.atsKeywords || undefined
      };

      // Clean undefined fields for Firestore compatibility
      const cleanAnalysis = Object.fromEntries(
        Object.entries(newAnalysis).filter(([_, value]) => value !== undefined)
      );

      // Save to Firebase (durable persistence) with a timeout of 2.5 seconds to prevent Firestore offline/configuration hangs from blocking the user from seeing their results
      const savePromise = setDoc(analysisDocRef, cleanAnalysis);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Firestore write took too long")), 2500)
      );

      try {
        await Promise.race([savePromise, timeoutPromise]);
      } catch (saveErr: any) {
        console.warn("Firestore save took too long or failed, continuing to show results in UI:", saveErr);
      }

      setAnalysisResult(newAnalysis);
      onAnalysisCreated();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during the tailoring process. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, isChanges: boolean) => {
    navigator.clipboard.writeText(text);
    if (isChanges) {
      setCopiedChanges(true);
      setTimeout(() => setCopiedChanges(false), 2000);
    } else {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    }
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

  return (
    <div className="w-full space-y-6">
      {/* Title */}
      <div className="flex items-center gap-3 mb-2 pb-4 border-b border-cyan-100">
        <div className="w-10 h-10 bg-cyan-100 border border-cyan-200 rounded-xl flex items-center justify-center text-cyan-600 shrink-0 shadow-sm">
          <Compass className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-slate-800 font-display font-bold text-lg">
            Job Customization Tool
          </h2>
          <p className="text-slate-500 text-xs">
            Align your credentials perfectly to your desired position
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50/70 backdrop-blur-md border border-red-200 rounded-2xl text-red-700 text-sm flex items-center gap-2 animate-fadeIn">
          <CheckCircle className="w-5 h-5 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Target Forms */}
      {!loading && !analysisResult && (
        <form onSubmit={handleTailor} className="space-y-5 bg-white/45 backdrop-blur-md p-6 border border-slate-100/80 rounded-3xl shadow-sm">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
            <Building className="w-4 h-4 text-cyan-500" />
            <h3 className="text-slate-800 font-display font-bold text-sm">Target Job Configuration</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label className="block text-slate-700 text-xs font-bold mb-2 uppercase tracking-wider">
                Target Company Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Google, Deloitte, Stripe"
                value={targetCompany}
                onChange={(e) => setTargetCompany(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-slate-700 text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-medium"
              />
            </div>

            <div>
              <label className="block text-slate-700 text-xs font-bold mb-2 uppercase tracking-wider">
                Target Job Role / Title *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Graphic Designer, Frontend Developer"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-slate-700 text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-medium"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label className="block text-slate-700 text-xs font-bold mb-2 uppercase tracking-wider">
                Experience Level *
              </label>
              <select
                value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-slate-700 text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-medium appearance-none cursor-pointer"
                style={{ backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center', backgroundSize: '16px' }}
              >
                <option value="Fresher">Fresher</option>
                <option value="1–2 years">1–2 years</option>
                <option value="3–5 years">3–5 years</option>
                <option value="5+ years">5+ years</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 text-xs font-bold mb-2 uppercase tracking-wider">
                Location (Optional)
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. India, USA, Remote"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-slate-700 text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-medium"
                />
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-slate-700 text-xs font-bold mb-2 uppercase tracking-wider flex items-center justify-between">
              <span>Job Description / Requirements (Optional)</span>
              <span className="text-[10px] text-slate-400 font-normal">AI will auto-research if blank</span>
            </label>
            <textarea
              rows={4}
              placeholder="Optional: Paste complete job requirements or listing details to give the AI research layer extra context..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-slate-700 text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all resize-none font-medium leading-relaxed"
            />
          </div>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-slate-500 text-xs flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] shrink-0" />
              <span>
                Using Resume:{" "}
                {selectedResume ? (
                  <strong className="text-slate-800 font-bold">{selectedResume.name}</strong>
                ) : (
                  <span className="text-red-500 font-bold italic">None selected</span>
                )}
              </span>
            </div>

            <button
              type="submit"
              disabled={!selectedResume}
              className="px-8 py-3 bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-300 disabled:shadow-none text-white text-sm font-bold rounded-xl flex items-center gap-2 shadow-[0_4px_20px_rgba(6,182,212,0.3)] hover:shadow-[0_4px_24px_rgba(6,182,212,0.4)] transition-all shrink-0 clickable-cursor"
            >
              <Sparkles className="w-4 h-4" />
              <span>Tailor Resume</span>
            </button>
          </div>
        </form>
      )}

      {/* Optimization Process Loading State */}
      {loading && (
        <div className="py-12 flex flex-col items-center justify-center text-center bg-white/70 backdrop-blur-xl border border-white rounded-3xl p-8 shadow-sm">
          <div className="relative mb-6">
            {/* Pulsing ring */}
            <div className="w-20 h-20 border-4 border-cyan-100 border-t-cyan-500 rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-cyan-500 animate-pulse" />
            </div>
          </div>
          
          <h3 className="text-slate-800 font-display font-bold text-xl mb-1.5">
            Optimizing Your Resume
          </h3>
          <p className="text-cyan-600 text-sm font-semibold mb-4 max-w-sm">
            {LOADING_STEPS[loadingStep]}
          </p>

          <div className="w-full max-w-md bg-slate-100 h-2.5 rounded-full overflow-hidden mb-2 border border-slate-200/50">
            <div 
              className="bg-cyan-500 h-full transition-all duration-1000 ease-out shadow-[0_0_8px_#22d3ee]" 
              style={{ width: `${((loadingStep + 1) / LOADING_STEPS.length) * 100}%` }}
            />
          </div>
          <span className="text-slate-400 text-xs">This takes about 10-15 seconds</span>
        </div>
      )}

      {/* Optimization Result Visualizer */}
      {analysisResult && (
        <div className="space-y-6 animate-fadeIn">
          {/* Header Dashboard Metrics */}
          <div className="bg-white/45 backdrop-blur-md border border-slate-100 p-5 rounded-3xl shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-cyan-100 text-cyan-700 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  Tailored Successfully
                </span>
                {analysisResult.experienceLevel && (
                  <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-[10px] font-bold">
                    {analysisResult.experienceLevel}
                  </span>
                )}
                {analysisResult.location && (
                  <span className="px-2.5 py-1 bg-teal-50 text-teal-700 border border-teal-100 rounded-full text-[10px] font-bold flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {analysisResult.location}
                  </span>
                )}
              </div>
              <h3 className="text-xl font-display font-bold text-slate-900 mt-2">
                {analysisResult.targetRole} @ {analysisResult.targetCompany}
              </h3>
              <p className="text-slate-500 text-xs mt-0.5">
                Optimized resume designed for standard ATS parameters and hiring rules
              </p>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                onClick={() => setAnalysisResult(null)}
                className="flex-1 md:flex-none px-4 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all clickable-cursor text-center"
              >
                Configure New Goal
              </button>
              <button
                onClick={() => downloadTextFile(`${analysisResult.targetCompany}_Tailored_Resume.md`, analysisResult.tailoredContent)}
                className="flex-1 md:flex-none px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm clickable-cursor"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Resume</span>
              </button>
            </div>
          </div>

          {/* 8 RESULT TABS NAVIGATION */}
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
                          strokeDasharray={`${analysisResult.matchingScore}, 100`}
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-display font-extrabold text-white">{analysisResult.matchingScore}%</span>
                        <span className="text-[9px] text-cyan-300 font-bold uppercase tracking-wider">Match Score</span>
                      </div>
                    </div>
                    <p className="text-xs text-center font-medium text-slate-300">
                      {analysisResult.matchingScore >= 85
                        ? "Excellent alignment! Optimized for ATS."
                        : analysisResult.matchingScore >= 70
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
                        {analysisResult.recommendations || "Your resume has been tailored for the requested role. Incorporate targeted keywords, highlight quantifiable metrics, and review the missing skills tab for full compliance."}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Company Goal</span>
                        <span className="text-xs font-bold text-slate-800">{analysisResult.targetCompany}</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Target Position</span>
                        <span className="text-xs font-bold text-slate-800">{analysisResult.targetRole}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {analysisResult.weakExperienceAreas && analysisResult.weakExperienceAreas.length > 0 && (
                  <div className="border-t border-slate-100 pt-5">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span>Experience Weaknesses & Alignment Gaps</span>
                    </h4>
                    <div className="grid md:grid-cols-2 gap-3">
                      {analysisResult.weakExperienceAreas.map((weak, idx) => (
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
                      {analysisResult.overview || `${analysisResult.targetCompany} is widely known for professional excellence, demanding high competency, attention to details, and strong ownership in this specific field.`}
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl space-y-2">
                    <div className="flex items-center gap-1.5 border-b border-slate-200/60 pb-2">
                      <TrendingUp className="w-4 h-4 text-cyan-600" />
                      <h4 className="text-slate-800 font-display font-bold text-sm">Current Hiring Trends & Selection Focus</h4>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">
                      {analysisResult.hiringTrends || "Focus is highly on modern technical frameworks, quantified metrics of success, scale delivery, and highly collaborative product ownership."}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl space-y-2">
                  <div className="flex items-center gap-1.5 border-b border-slate-200/60 pb-2">
                    <Award className="w-4 h-4 text-cyan-600" />
                    <h4 className="text-slate-800 font-display font-bold text-sm">Portfolio & Project Standards</h4>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium">
                    {analysisResult.projectExpectations || "Candidates should highlight full-lifecycle deliverables, architectural decisions, design consistency, or professional enterprise-ready products."}
                  </p>
                </div>

                {analysisResult.softSkills && analysisResult.softSkills.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5">Key Soft Skills Valued</h4>
                    <div className="flex flex-wrap gap-2">
                      {analysisResult.softSkills.map((skill, idx) => (
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
                  <p className="text-slate-500 text-xs">Standard expectations for {analysisResult.targetRole} role at {analysisResult.targetCompany}</p>
                </div>

                <div className="space-y-2.5 pt-2">
                  {analysisResult.responsibilities && analysisResult.responsibilities.length > 0 ? (
                    analysisResult.responsibilities.map((resp, idx) => (
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
                  <p className="text-slate-500 text-xs">Tools, frameworks, and stacks commonly requested by {analysisResult.targetCompany} for {analysisResult.targetRole}</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2">
                  {analysisResult.requiredTechnologies && analysisResult.requiredTechnologies.length > 0 ? (
                    analysisResult.requiredTechnologies.map((tech, idx) => (
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
                      {analysisResult.missingSkills && analysisResult.missingSkills.length > 0 ? (
                        analysisResult.missingSkills.map((skill, idx) => (
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
                      {analysisResult.missingCertifications && analysisResult.missingCertifications.length > 0 ? (
                        analysisResult.missingCertifications.map((cert, idx) => (
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
                {analysisResult.missingProjects && analysisResult.missingProjects.length > 0 && (
                  <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <Plus className="w-4 h-4 text-cyan-600" />
                      <span>Recommended Showcase Projects to Add</span>
                    </h4>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {analysisResult.missingProjects.map((proj, idx) => (
                        <div key={idx} className="p-4 bg-white border border-slate-200/50 rounded-xl text-xs text-slate-700 font-medium shadow-sm hover:shadow-md transition-all">
                          {proj}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tailored Bullet Replacements */}
                {analysisResult.tailoredBullets && analysisResult.tailoredBullets.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckSquare className="w-4 h-4 text-cyan-600" />
                      <span>Tailored Bullet Point Replacements (Before / After)</span>
                    </h4>
                    
                    <div className="space-y-4">
                      {analysisResult.tailoredBullets.map((bullet, idx) => (
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
                  {analysisResult.atsKeywords && analysisResult.atsKeywords.length > 0 ? (
                    analysisResult.atsKeywords.map((kw, idx) => (
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
                    onClick={() => copyToClipboard(analysisResult.tailoredContent, false)}
                    className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors clickable-cursor"
                  >
                    {copiedText ? <Check className="w-3.5 h-3.5 text-cyan-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedText ? "Copied Resume" : "Copy Resume"}</span>
                  </button>
                </div>

                <div className="markdown-body overflow-y-auto max-h-[550px] border border-slate-200/50 p-5 rounded-2xl bg-white pr-2 font-sans select-text">
                  <div className="whitespace-pre-wrap leading-relaxed text-sm text-slate-700">
                    {analysisResult.tailoredContent}
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
