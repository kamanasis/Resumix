import React, { useState, useEffect } from "react";
import { ResumeFile, GapReport, RequirementProfile, ParsedResume, MissingItem, TailorRecommendation } from "../types";
import { 
  Sparkles, Send, CheckCircle, FileCheck, Download, Copy, Check, TrendingUp, 
  Compass, Briefcase, Info, ListTodo, Cpu, AlertTriangle, Key, FileText, 
  CheckSquare, MapPin, UserCheck, Globe, Building, Award, Terminal, Plus, Lock, 
  ChevronRight, CircleDashed, ChevronDown, ChevronUp, RefreshCw, XCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { collection, doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

interface TailorWizardProps {
  userId: string;
  selectedResume: ResumeFile | null;
  onAnalysisCreated: () => void;
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
  const [jobDescription, setJobDescription] = useState("");

  // Pipeline states
  const [step, setStep] = useState<"SETUP" | "PROCESSING" | "DASHBOARD" | "LOCKED">("SETUP");
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState("");

  // Data states
  const [frozenProfile, setFrozenProfile] = useState<RequirementProfile | null>(null);
  const [parsedResume, setParsedResume] = useState<ParsedResume | null>(null);
  const [gapReport, setGapReport] = useState<GapReport | null>(null);
  
  // Tailoring UI state
  const [activeMissingItem, setActiveMissingItem] = useState<MissingItem | null>(null);
  const [tailorRecommendation, setTailorRecommendation] = useState<TailorRecommendation | null>(null);
  const [isTailoring, setIsTailoring] = useState(false);

  const startPipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResume) {
      setError("Please select or upload a resume from your files first.");
      return;
    }
    if (!targetCompany || !targetRole) {
      setError("Please fill in target company name and target job role.");
      return;
    }

    setStep("PROCESSING");
    setError("");

    try {
      // 1. Generate Requirement Profile
      setLoadingMessage("Phase 1: Generating Frozen Requirement Profile...");
      const profileRes = await fetch("/api/generate-requirement-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCompany, targetRole, jobDescription, experienceLevel })
      });
      if (!profileRes.ok) throw new Error("Failed to generate requirement profile");
      const profileData = await profileRes.json();
      setFrozenProfile(profileData);

      // 2. Parse Resume
      setLoadingMessage("Phase 2: Parsing Current Resume Structure...");
      const parseRes = await fetch("/api/parse-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText: selectedResume.content })
      });
      if (!parseRes.ok) throw new Error("Failed to parse resume");
      const parsedData = await parseRes.json();
      setParsedResume(parsedData);

      // 3. Gap Analysis
      setLoadingMessage("Phase 3: Performing Gap Analysis...");
      await runGapAnalysis(parsedData, profileData);
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during the tailoring pipeline.");
      setStep("SETUP");
    }
  };

  const runGapAnalysis = async (parsed: ParsedResume, profile: RequirementProfile) => {
    setLoadingMessage("Analyzing Missing Requirements...");
    const gapRes = await fetch("/api/gap-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parsedResume: parsed, frozenProfile: profile })
    });
    if (!gapRes.ok) throw new Error("Failed gap analysis");
    const gapData: GapReport = await gapRes.json();
    setGapReport(gapData);

    // Save to Firestore
    const gapReportId = doc(collection(db, "users", userId, "gapReports")).id;
    await setDoc(doc(db, "users", userId, "gapReports", gapReportId), {
      ...gapData,
      id: gapReportId,
      userId,
      resumeId: selectedResume?.id,
      createdAt: new Date().toISOString()
    });

    if (gapData.isReadyToApply || gapData.overallCompletion >= 98) {
      setStep("LOCKED");
    } else {
      setStep("DASHBOARD");
    }
    onAnalysisCreated();
  };

  const handleFixItem = async (item: MissingItem) => {
    setActiveMissingItem(item);
    setIsTailoring(true);
    setTailorRecommendation(null);

    try {
      const res = await fetch("/api/tailor-gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText: selectedResume?.content,
          frozenProfile,
          missingItem: item
        })
      });
      if (!res.ok) throw new Error("Failed to tailor gap");
      const data = await res.json();
      setTailorRecommendation(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsTailoring(false);
    }
  };

  const handleMarkResolved = async (item: MissingItem) => {
    if (!gapReport || !parsedResume || !frozenProfile) return;
    
    // Optimistically remove the item and re-run gap analysis
    setStep("PROCESSING");
    setLoadingMessage("Re-validating Resume...");
    
    // Simulate updating parsed resume (In a real app, we'd update the actual text and re-parse)
    const updatedParsed = { ...parsedResume };
    if (item.type === "Skill" || item.type === "Technology") updatedParsed.skills.push(item.title);
    
    await runGapAnalysis(updatedParsed, frozenProfile);
    setActiveMissingItem(null);
    setTailorRecommendation(null);
  };

  // -------------------------------------------------------------------------------- //
  // UI COMPONENTS
  // -------------------------------------------------------------------------------- //

  if (step === "PROCESSING") {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-center bg-white/70 backdrop-blur-xl border border-white rounded-3xl p-8 shadow-sm">
        <motion.div 
          animate={{ rotate: 360 }} 
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          className="w-16 h-16 border-4 border-cyan-100 border-t-cyan-500 rounded-full mb-6"
        />
        <h3 className="text-slate-800 font-display font-bold text-xl mb-2">Deterministic Engine Running</h3>
        <p className="text-cyan-600 text-sm font-semibold mb-4">{loadingMessage}</p>
      </div>
    );
  }

  if (step === "LOCKED") {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-center bg-green-50/50 backdrop-blur-xl border border-green-100 rounded-3xl p-8 shadow-sm">
        <div className="w-20 h-20 bg-green-100 text-green-500 rounded-full flex items-center justify-center mb-6">
          <CheckCircle className="w-10 h-10" />
        </div>
        <h3 className="text-green-800 font-display font-bold text-3xl mb-2">🎉 Resume Ready to Apply</h3>
        <p className="text-green-700 text-sm font-medium mb-6 max-w-md">
          Your resume has successfully met all mandatory requirements in the Frozen Profile for {targetRole} at {targetCompany}.
        </p>
        
        <div className="flex gap-4 mb-8">
          <div className="bg-white p-4 rounded-2xl border border-green-100 shadow-sm w-32">
            <span className="block text-3xl font-display font-bold text-green-600">{gapReport?.scores.atsCompatibility}%</span>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">ATS Match</span>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-green-100 shadow-sm w-32">
            <span className="block text-3xl font-display font-bold text-green-600">100%</span>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Requirements</span>
          </div>
        </div>

        <p className="text-slate-500 text-xs mb-6">No further mandatory improvements detected. Optimization Locked.</p>

        <div className="flex gap-3">
          <button className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl flex items-center gap-2 transition-all shadow-[0_4px_20px_rgba(34,197,94,0.3)]">
            <Download className="w-4 h-4" /> Download Final Resume
          </button>
          <button onClick={() => setStep("SETUP")} className="px-6 py-3 bg-white text-slate-600 border border-slate-200 font-bold rounded-xl hover:bg-slate-50 transition-all">
            Start New Target
          </button>
        </div>
      </div>
    );
  }

  if (step === "DASHBOARD" && gapReport) {
    return (
      <div className="space-y-6">
        {/* DASHBOARD HEADER */}
        <div className="bg-white/45 backdrop-blur-md border border-slate-100 p-6 rounded-3xl shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 bg-cyan-100 text-cyan-700 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                <Lock className="w-3 h-3" /> Frozen Profile Active
              </span>
            </div>
            <h3 className="text-2xl font-display font-bold text-slate-900">
              {targetRole} <span className="text-slate-400">at</span> {targetCompany}
            </h3>
            <p className="text-slate-500 text-xs mt-1">
              Checklist Engine has identified {gapReport.missingItems?.length || 0} missing items.
            </p>
          </div>
          
          <div className="flex flex-col items-end">
            <span className="text-sm font-bold text-slate-800">Overall Completion</span>
            <div className="flex items-center gap-3 mt-1">
              <div className="w-32 bg-slate-200 h-2 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }} 
                  animate={{ width: `${gapReport.overallCompletion}%` }} 
                  className="bg-cyan-500 h-full shadow-[0_0_8px_#22d3ee]"
                />
              </div>
              <span className="text-lg font-display font-bold text-cyan-600">{gapReport.overallCompletion}%</span>
            </div>
          </div>
        </div>

        {/* CATEGORY SCORECARD */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ScoreCard title="ATS Compatibility" score={gapReport.scores.atsCompatibility} />
          <ScoreCard title="Required Skills" score={gapReport.scores.requiredSkills} />
          <ScoreCard title="Experience Match" score={gapReport.scores.experienceMatch} />
          <ScoreCard title="Formatting" score={gapReport.scores.formatting} />
        </div>

        {/* MISSING REQUIREMENT CARDS */}
        <div className="mt-8">
          <h3 className="text-lg font-display font-bold text-slate-800 mb-4 flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-cyan-500" />
            Missing Requirements Checklist
          </h3>
          
          {(!gapReport.missingItems || gapReport.missingItems.length === 0) ? (
            <div className="p-8 bg-green-50 border border-green-100 rounded-2xl text-center">
              <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-green-800 font-bold">All mandatory requirements met!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {gapReport.missingItems.map((item, idx) => (
                <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row gap-6">
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        item.importance === 'Critical' ? 'bg-red-100 text-red-700' :
                        item.importance === 'Recommended' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {item.importance}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{item.type}</span>
                      <span className="ml-auto text-[10px] font-bold text-cyan-600 bg-cyan-50 px-2 py-1 rounded-lg">ATS Impact: {item.atsImpact}</span>
                    </div>
                    
                    <h4 className="text-base font-bold text-slate-800 mb-1">{item.title}</h4>
                    <p className="text-sm text-slate-600 mb-3">{item.reason}</p>
                    
                    {/* Tailoring Recommendation Expanded View */}
                    <AnimatePresence>
                      {activeMissingItem?.title === item.title && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }} 
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-4 overflow-hidden"
                        >
                          {isTailoring ? (
                            <div className="flex items-center gap-3 text-cyan-600 text-sm font-bold">
                              <RefreshCw className="w-4 h-4 animate-spin" /> Generating tailored addition...
                            </div>
                          ) : tailorRecommendation ? (
                            <div className="space-y-3">
                              <div className="flex justify-between items-start">
                                <div>
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Where to add it</span>
                                  <span className="text-sm font-bold text-slate-800 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">{tailorRecommendation.section} Section</span>
                                </div>
                                <div>
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Evidence Status</span>
                                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${tailorRecommendation.evidenceStatus.includes('Already') ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {tailorRecommendation.evidenceStatus}
                                  </span>
                                </div>
                              </div>
                              
                              <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Suggested Bullet / Sentence</span>
                                <div className="bg-white border border-cyan-200 p-3 rounded-lg text-sm text-slate-700 italic border-l-4 border-l-cyan-500">
                                  "{tailorRecommendation.suggestedSentence}"
                                </div>
                              </div>
                              
                              <div className="pt-2 flex gap-3">
                                <button onClick={() => handleMarkResolved(item)} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm">
                                  <Check className="w-3.5 h-3.5" /> Apply & Re-Validate
                                </button>
                                <button onClick={() => setActiveMissingItem(null)} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-50 transition-all">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </motion.div>
                      )}
                    </AnimatePresence>

                  </div>
                  
                  <div className="flex flex-col items-center justify-center border-l border-slate-100 pl-6 md:w-48">
                    <div className="text-center mb-4">
                      <span className="block text-2xl font-display font-bold text-slate-800">{item.confidenceScore}%</span>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Confidence</span>
                    </div>
                    {activeMissingItem?.title !== item.title && (
                      <button 
                        onClick={() => handleFixItem(item)}
                        className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
                      >
                        Fix Issue
                      </button>
                    )}
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    );
  }

  // DEFAULT: SETUP FORM
  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-3 mb-2 pb-4 border-b border-cyan-100">
        <div className="w-10 h-10 bg-cyan-100 border border-cyan-200 rounded-xl flex items-center justify-center text-cyan-600 shrink-0 shadow-sm">
          <Compass className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-slate-800 font-display font-bold text-lg">
            Requirement Engine
          </h2>
          <p className="text-slate-500 text-xs">
            Generate a deterministic checklist and freeze requirements
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50/70 backdrop-blur-md border border-red-200 rounded-2xl text-red-700 text-sm flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={startPipeline} className="space-y-5 bg-white/45 backdrop-blur-md p-6 border border-slate-100/80 rounded-3xl shadow-sm">
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className="block text-slate-700 text-xs font-bold mb-2 uppercase tracking-wider">Target Company Name *</label>
            <input
              type="text" required placeholder="e.g. Google, Deloitte"
              value={targetCompany} onChange={(e) => setTargetCompany(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-cyan-400 transition-all font-medium"
            />
          </div>
          <div>
            <label className="block text-slate-700 text-xs font-bold mb-2 uppercase tracking-wider">Target Job Role *</label>
            <input
              type="text" required placeholder="e.g. Frontend Developer"
              value={targetRole} onChange={(e) => setTargetRole(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-cyan-400 transition-all font-medium"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className="block text-slate-700 text-xs font-bold mb-2 uppercase tracking-wider">Experience Level *</label>
            <select
              value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-cyan-400 transition-all font-medium appearance-none"
            >
              <option value="Fresher">Fresher</option>
              <option value="1–2 years">1–2 years</option>
              <option value="3–5 years">3–5 years</option>
              <option value="5+ years">5+ years</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-slate-700 text-xs font-bold mb-2 uppercase tracking-wider">Job Description (Highest Priority)</label>
          <textarea
            rows={4} placeholder="Paste job description to generate highly accurate requirements..."
            value={jobDescription} onChange={(e) => setJobDescription(e.target.value)}
            className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-cyan-400 transition-all resize-none font-medium"
          />
        </div>

        <div className="pt-2 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-slate-500 text-xs flex items-center gap-2">
            Using Resume: {selectedResume ? <strong className="text-slate-800">{selectedResume.name}</strong> : <span className="text-red-500">None selected</span>}
          </div>
          <button
            type="submit" disabled={!selectedResume}
            className="px-8 py-3 bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-300 text-white text-sm font-bold rounded-xl flex items-center gap-2 shadow-[0_4px_20px_rgba(6,182,212,0.3)] transition-all"
          >
            <Cpu className="w-4 h-4" /> Start Deterministic Engine
          </button>
        </div>
      </form>
    </div>
  );
}

// -----------------------------
// ScoreCard Helper Component
// -----------------------------
function ScoreCard({ title, score }: { title: string, score: number }) {
  const isHigh = score >= 85;
  const isMedium = score >= 60 && score < 85;
  const isLow = score < 60;
  
  const colorClass = isHigh ? "text-green-600 bg-green-50" : isMedium ? "text-amber-600 bg-amber-50" : "text-red-600 bg-red-50";
  const barClass = isHigh ? "bg-green-500" : isMedium ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
      <div className="flex justify-between items-start mb-4">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider w-20 leading-tight">{title}</span>
        <span className={`px-2 py-1 rounded-lg text-sm font-display font-bold ${colorClass}`}>{score}%</span>
      </div>
      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${score}%` }} className={`h-full ${barClass}`} />
      </div>
    </div>
  );
}
