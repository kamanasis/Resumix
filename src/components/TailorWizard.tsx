import React, { useState } from "react";
import { ResumeFile, GapReport, RequirementProfile, ParsedResume, MissingItem, TailorRecommendation } from "../types";
import { 
  Sparkles, CheckCircle, Download, Copy, Check, TrendingUp, 
  Compass, Info, Cpu, AlertTriangle, CheckSquare, Lock, 
  RefreshCw, XCircle, ArrowLeft
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

  // Pipeline states (Part 3 - Fail Closed)
  const [step, setStep] = useState<"SETUP" | "PROCESSING" | "DASHBOARD" | "LOCKED" | "ERROR">("SETUP");
  const [loadingMessage, setLoadingMessage] = useState("");
  const [errorDetails, setErrorDetails] = useState<{ title: string; message: string }>({ title: "", message: "" });

  // Data states
  const [frozenProfile, setFrozenProfile] = useState<RequirementProfile | null>(null);
  const [parsedResume, setParsedResume] = useState<ParsedResume | null>(null);
  const [gapReport, setGapReport] = useState<GapReport | null>(null);
  
  // Single-issue Tailoring UI state
  const [activeMissingItem, setActiveMissingItem] = useState<MissingItem | null>(null);
  const [tailorRecommendation, setTailorRecommendation] = useState<TailorRecommendation | null>(null);
  const [isTailoring, setIsTailoring] = useState(false);

  // Checkboxes & Batch Tailoring states
  const [selectedItems, setSelectedItems] = useState<MissingItem[]>([]);
  const [batchResult, setBatchResult] = useState<{ tailoredContent: string; explanations: any[] } | null>(null);
  const [isBatchTailoring, setIsBatchTailoring] = useState(false);
  const [dashboardTab, setDashboardTab] = useState<"checklist" | "tailored">("checklist");
  const [copiedText, setCopiedText] = useState(false);

  const startPipeline = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!selectedResume) {
      setErrorDetails({
        title: "No Resume Selected",
        message: "Please select or upload a resume from your Resume Vault before starting the analysis."
      });
      setStep("ERROR");
      return;
    }
    if (!targetCompany.trim() || !targetRole.trim()) {
      setErrorDetails({
        title: "Missing Target Information",
        message: "Target company name and target job role are required to extract valid requirements."
      });
      setStep("ERROR");
      return;
    }

    setStep("PROCESSING");
    setErrorDetails({ title: "", message: "" });

    try {
      // Phase 1: Generate Requirement Profile
      setLoadingMessage("Phase 1: Generating Frozen Requirement Profile...");
      const profileRes = await fetch("/api/generate-requirement-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          targetCompany: targetCompany.trim(), 
          targetRole: targetRole.trim(), 
          jobDescription: jobDescription.trim(), 
          experienceLevel 
        })
      });
      
      const profileJson = await profileRes.json();
      if (!profileRes.ok || !profileJson.success || !profileJson.data) {
        throw new Error(profileJson.error?.message || "Requirement engine failed to extract verified requirements.");
      }
      const profileData: RequirementProfile = profileJson.data;
      setFrozenProfile(profileData);

      // Phase 2: Parse Resume Structure
      setLoadingMessage("Phase 2: Parsing Current Resume Structure...");
      const parseRes = await fetch("/api/parse-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText: selectedResume.content })
      });

      const parseJson = await parseRes.json();
      if (!parseRes.ok || !parseJson.success || !parseJson.data) {
        throw new Error(parseJson.error?.message || "Resume parser failed to extract structured entities.");
      }
      const parsedData: ParsedResume = parseJson.data;
      setParsedResume(parsedData);

      // Phase 3 & 4: Objective Gap Analysis
      setLoadingMessage("Phase 3: Performing Strict Gap Analysis...");
      await runGapAnalysis(parsedData, profileData);
      
    } catch (err: any) {
      console.error("Pipeline failure:", err);
      setErrorDetails({
        title: "Analysis Unavailable",
        message: err.message || "Resumix could not complete the analysis because the service returned an invalid response."
      });
      setStep("ERROR");
    }
  };

  const runGapAnalysis = async (parsed: ParsedResume, profile: RequirementProfile) => {
    setLoadingMessage("Analyzing Missing Requirements...");
    const gapRes = await fetch("/api/gap-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parsedResume: parsed, frozenProfile: profile })
    });

    const gapJson = await gapRes.json();
    if (!gapRes.ok || !gapJson.success || !gapJson.data) {
      throw new Error(gapJson.error?.message || "Gap analysis engine failed to calculate verified matches.");
    }
    const gapData: GapReport = gapJson.data;
    setGapReport(gapData);

    // Save only verified real gap reports to Firestore
    try {
      const gapReportId = doc(collection(db, "users", userId, "gapReports")).id;
      await setDoc(doc(db, "users", userId, "gapReports", gapReportId), {
        ...gapData,
        id: gapReportId,
        userId,
        resumeId: selectedResume?.id,
        createdAt: new Date().toISOString()
      });
    } catch (saveErr) {
      console.warn("Could not save gap report to Firestore:", saveErr);
    }

    if (gapData.isReadyToApply) {
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
      const data = await res.json();
      if (!res.ok || !data.success || !data.data) {
        throw new Error(data.error?.message || "Failed to generate single fix recommendation.");
      }
      setTailorRecommendation(data.data);
    } catch (err: any) {
      console.error(err);
      setActiveMissingItem(null);
    } finally {
      setIsTailoring(false);
    }
  };

  const handleToggleCheckbox = (item: MissingItem) => {
    if (selectedItems.some(i => i.title === item.title)) {
      setSelectedItems(selectedItems.filter(i => i.title !== item.title));
    } else {
      setSelectedItems([...selectedItems, item]);
    }
  };

  const handleBatchTailor = async () => {
    if (selectedItems.length === 0) return;
    setIsBatchTailoring(true);

    try {
      const res = await fetch("/api/tailor-resume-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText: selectedResume?.content,
          frozenProfile,
          selectedItems
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.data) {
        throw new Error(data.error?.message || "Failed to perform batch tailoring.");
      }
      setBatchResult(data.data);
      setDashboardTab("tailored");
    } catch (err: any) {
      console.error("Batch tailor error:", err);
      setErrorDetails({
        title: "Batch Tailoring Error",
        message: err.message || "Failed to generate tailored resume."
      });
      setStep("ERROR");
    } finally {
      setIsBatchTailoring(false);
    }
  };

  const handleMarkResolved = async (item: MissingItem) => {
    if (!gapReport || !parsedResume || !frozenProfile) return;
    
    setStep("PROCESSING");
    setLoadingMessage("Re-validating Resume against requirements...");
    
    const updatedParsed = { ...parsedResume };
    if (item.type === "Skill" || item.type === "Technology") {
      updatedParsed.skills = [...updatedParsed.skills, item.title];
    }
    
    try {
      await runGapAnalysis(updatedParsed, frozenProfile);
    } catch (err: any) {
      setErrorDetails({
        title: "Re-validation Error",
        message: err.message || "Failed to re-evaluate updated resume."
      });
      setStep("ERROR");
    }
    setActiveMissingItem(null);
    setTailorRecommendation(null);
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

  // -------------------------------------------------------------------------------- //
  // UI STATES: PROCESSING, ERROR, LOCKED, DASHBOARD, SETUP
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
        <span className="text-xs text-slate-400">Performing objective requirement mapping without data fabrication...</span>
      </div>
    );
  }

  // FAIL CLOSED ERROR STATE (Part 3 & 21)
  if (step === "ERROR") {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-center bg-red-50/70 backdrop-blur-xl border border-red-200 rounded-3xl p-8 shadow-sm animate-fadeIn">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-4 border border-red-200">
          <XCircle className="w-8 h-8" />
        </div>
        <h3 className="text-red-900 font-display font-bold text-2xl mb-2">
          {errorDetails.title || "Analysis Unavailable"}
        </h3>
        <p className="text-red-700 text-sm font-medium mb-6 max-w-lg">
          {errorDetails.message || "Resumix could not complete the analysis because the required service did not return valid verified data."}
        </p>
        <div className="flex gap-3">
          <button 
            onClick={() => startPipeline()}
            className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center gap-2 transition-all shadow-sm text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry Analysis
          </button>
          <button 
            onClick={() => {
              setStep("SETUP");
              setErrorDetails({ title: "", message: "" });
            }} 
            className="px-6 py-2.5 bg-white text-slate-700 border border-slate-300 font-bold rounded-xl hover:bg-slate-50 transition-all text-xs flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Go Back to Setup
          </button>
        </div>
      </div>
    );
  }

  if (step === "LOCKED") {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-center bg-green-50/70 backdrop-blur-xl border border-green-200 rounded-3xl p-8 shadow-sm">
        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 border border-green-200">
          <CheckCircle className="w-10 h-10" />
        </div>
        <h3 className="text-green-900 font-display font-bold text-3xl mb-2">Resume Meets Target Requirements</h3>
        <p className="text-green-800 text-sm font-medium mb-6 max-w-md">
          Your resume has verified evidence for all required skills in the Target Profile for <strong>{targetRole}</strong> at <strong>{targetCompany}</strong>.
        </p>
        
        <div className="flex gap-4 mb-8">
          <div className="bg-white p-4 rounded-2xl border border-green-200 shadow-sm w-36">
            <span className="block text-3xl font-display font-bold text-green-600">
              {gapReport?.scores.atsCompatibility !== undefined ? `${gapReport.scores.atsCompatibility}%` : "—"}
            </span>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">ATS Score</span>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-green-200 shadow-sm w-36">
            <span className="block text-3xl font-display font-bold text-green-600">
              {gapReport?.scores.requiredSkills !== undefined ? `${gapReport.scores.requiredSkills}%` : "—"}
            </span>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Required Skills</span>
          </div>
        </div>

        <p className="text-slate-500 text-xs mb-6">No unaddressed critical gaps detected against available specifications.</p>

        <div className="flex gap-3">
          <button 
            onClick={() => downloadTextFile(`${targetCompany}_Tailored_Resume.md`, batchResult?.tailoredContent || selectedResume?.content || "")}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl flex items-center gap-2 transition-all shadow-[0_4px_20px_rgba(34,197,94,0.3)] text-xs"
          >
            <Download className="w-4 h-4" /> Download Resume (Markdown)
          </button>
          <button onClick={() => setStep("SETUP")} className="px-6 py-3 bg-white text-slate-600 border border-slate-200 font-bold rounded-xl hover:bg-slate-50 transition-all text-xs">
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
        <div className="bg-white/70 backdrop-blur-md border border-slate-200 p-6 rounded-3xl shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 bg-cyan-100 text-cyan-700 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                <Lock className="w-3 h-3" /> Target Profile Active
              </span>
            </div>
            <h3 className="text-2xl font-display font-bold text-slate-900">
              {targetRole} <span className="text-slate-400">at</span> {targetCompany}
            </h3>
            <p className="text-slate-500 text-xs mt-1">
              Verified {gapReport.missingItems?.length || 0} gap(s) against required qualifications.
            </p>
          </div>
          
          <div className="flex flex-col items-end">
            <span className="text-xs font-bold text-slate-600">Calculated Completion</span>
            <div className="flex items-center gap-3 mt-1">
              <div className="w-32 bg-slate-200 h-2 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }} 
                  animate={{ width: `${gapReport.overallCompletion || 0}%` }} 
                  className="bg-cyan-500 h-full shadow-[0_0_8px_#22d3ee]"
                />
              </div>
              <span className="text-lg font-display font-bold text-cyan-600">{gapReport.overallCompletion || 0}%</span>
            </div>
          </div>
        </div>

        {/* TABS NAVIGATION */}
        <div className="flex border-b border-slate-200">
          <button 
            onClick={() => setDashboardTab("checklist")}
            className={`px-6 py-3 font-display font-bold text-sm transition-all border-b-2 ${
              dashboardTab === "checklist" ? "border-cyan-500 text-cyan-600" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Checklist ({gapReport.missingItems?.length || 0} Gaps)
          </button>
          {batchResult && (
            <button 
              onClick={() => setDashboardTab("tailored")}
              className={`px-6 py-3 font-display font-bold text-sm transition-all border-b-2 ${
                dashboardTab === "tailored" ? "border-cyan-500 text-cyan-600" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              Tailored Draft
            </button>
          )}
        </div>

        {dashboardTab === "checklist" ? (
          <>
            {/* CATEGORY SCORECARD (Calculated from Real Data) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <ScoreCard title="ATS Score" score={gapReport.scores.atsCompatibility} />
              <ScoreCard title="Required Skills" score={gapReport.scores.requiredSkills} />
              <ScoreCard title="Experience Match" score={gapReport.scores.experienceMatch} />
              <ScoreCard title="Formatting" score={gapReport.scores.formatting} />
            </div>

            {/* MISSING REQUIREMENT CARDS */}
            <div className="mt-8">
              <h3 className="text-lg font-display font-bold text-slate-800 mb-4 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-cyan-500" />
                Verified Requirements Checklist
              </h3>
              
              {(!gapReport.missingItems || gapReport.missingItems.length === 0) ? (
                <div className="p-8 bg-green-50 border border-green-200 rounded-2xl text-center">
                  <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                  <p className="text-green-800 font-bold">All mandatory requirements met in the current resume!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {gapReport.missingItems.map((item, idx) => (
                    <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex gap-4">
                      
                      {/* Checkbox for batch tailoring selection */}
                      <div className="pt-1 select-none">
                        <input 
                          type="checkbox"
                          checked={selectedItems.some(i => i.title === item.title)}
                          onChange={() => handleToggleCheckbox(item)}
                          className="w-5 h-5 accent-cyan-500 cursor-pointer rounded border-slate-300"
                        />
                      </div>

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
                          {item.atsImpact && (
                            <span className="ml-auto text-[10px] font-bold text-cyan-600 bg-cyan-50 px-2 py-1 rounded-lg">Impact: {item.atsImpact}</span>
                          )}
                        </div>
                        
                        <h4 className="text-base font-bold text-slate-800 mb-1">{item.title}</h4>
                        <p className="text-sm text-slate-600 mb-3">{item.reason}</p>
                        
                        <div className="flex gap-2">
                          {activeMissingItem?.title !== item.title ? (
                            <button 
                              onClick={() => handleFixItem(item)}
                              className="text-xs font-bold text-cyan-600 hover:text-cyan-700 flex items-center gap-1"
                            >
                              <Info className="w-3.5 h-3.5" /> Explain single fix
                            </button>
                          ) : (
                            <button 
                              onClick={() => setActiveMissingItem(null)}
                              className="text-xs font-bold text-slate-500 hover:text-slate-600"
                            >
                              Hide explanation
                            </button>
                          )}
                        </div>

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
                                  <RefreshCw className="w-4 h-4 animate-spin" /> Formulating truthful suggestion...
                                </div>
                              ) : tailorRecommendation ? (
                                <div className="space-y-3">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Target Section</span>
                                      <span className="text-xs font-bold text-slate-800 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">{tailorRecommendation.section}</span>
                                    </div>
                                    <div>
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Status</span>
                                      <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800">
                                        {tailorRecommendation.evidenceStatus}
                                      </span>
                                    </div>
                                  </div>
                                  
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Suggested Phrasing / Project Idea</span>
                                    <div className="bg-white border border-cyan-200 p-3 rounded-lg text-xs text-slate-700 italic border-l-4 border-l-cyan-500">
                                      "{tailorRecommendation.suggestedSentence}"
                                    </div>
                                  </div>
                                  
                                  <div className="pt-2 flex gap-3">
                                    <button onClick={() => handleMarkResolved(item)} className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm">
                                      <Check className="w-3.5 h-3.5" /> Mark Resolved & Re-Validate
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </motion.div>
                          )}
                        </AnimatePresence>

                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* STICKY BATCH TAILOR BUTTON */}
            {selectedItems.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-xl flex items-center gap-6 z-50 border border-slate-700"
              >
                <div className="text-xs">
                  <span className="font-bold block">{selectedItems.length} Item(s) Selected</span>
                  <span className="text-slate-400">Optimize resume to address selected items</span>
                </div>
                <button 
                  onClick={handleBatchTailor}
                  disabled={isBatchTailoring}
                  className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all"
                >
                  {isBatchTailoring ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Optimizing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generate Optimized Resume</span>
                    </>
                  )}
                </button>
              </motion.div>
            )}
          </>
        ) : (
          /* BATCH TAILORED RESULT VIEW */
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200">
              <span className="text-sm font-bold text-slate-800">Optimized Resume Draft</span>
              <div className="flex gap-2">
                <button 
                  onClick={() => copyToClipboard(batchResult?.tailoredContent || "")}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg flex items-center gap-1 transition-all"
                >
                  {copiedText ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedText ? "Copied" : "Copy"}</span>
                </button>
                <button 
                  onClick={() => downloadTextFile(`${targetCompany}_Tailored_Resume.md`, batchResult?.tailoredContent || "")}
                  className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-bold rounded-lg flex items-center gap-1 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download (.md)</span>
                </button>
              </div>
            </div>

            {/* EXPLANATIONS */}
            {batchResult?.explanations && batchResult.explanations.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-cyan-500" />
                  Tailoring Changes Explained
                </h4>
                <div className="grid md:grid-cols-2 gap-4">
                  {batchResult.explanations.map((exp, idx) => (
                    <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">{exp.whatChanged}</span>
                        <p className="text-xs text-slate-600 leading-relaxed font-medium mb-3">{exp.why}</p>
                      </div>
                      <div className="flex justify-between items-center border-t border-slate-100 pt-2 text-[10px] font-bold">
                        <span className="text-green-600">ATS Benefit: {exp.atsBenefit}</span>
                        <span className="text-slate-400">Recruiter: {exp.recruiterBenefit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-2xl p-6 font-mono text-xs overflow-auto max-h-[500px] whitespace-pre-wrap leading-relaxed text-slate-700">
              {batchResult?.tailoredContent}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button 
                onClick={async () => {
                  setStep("PROCESSING");
                  setLoadingMessage("Validating tailored resume against requirements...");
                  const parsedData = { 
                    ...parsedResume, 
                    skills: [...(parsedResume?.skills || []), ...selectedItems.map(i => i.title)] 
                  } as ParsedResume;
                  try {
                    await runGapAnalysis(parsedData, frozenProfile!);
                  } catch (err: any) {
                    setErrorDetails({
                      title: "Re-validation Error",
                      message: err.message || "Failed to validate tailored resume."
                    });
                    setStep("ERROR");
                  }
                }}
                className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all"
              >
                <CheckCircle className="w-4 h-4" /> Save & Re-Validate Match Score
              </button>
            </div>
          </div>
        )}

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
            Requirement & Gap Engine
          </h2>
          <p className="text-slate-500 text-xs">
            Analyze target role requirements truthfully against your resume
          </p>
        </div>
      </div>

      <form onSubmit={startPipeline} className="space-y-5 bg-white/70 backdrop-blur-md p-6 border border-slate-200 rounded-3xl shadow-sm">
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className="block text-slate-700 text-xs font-bold mb-2 uppercase tracking-wider">Target Company Name *</label>
            <input
              type="text" required placeholder="e.g. Google, Deloitte, Shopify"
              value={targetCompany} onChange={(e) => setTargetCompany(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-cyan-400 transition-all font-medium"
            />
          </div>
          <div>
            <label className="block text-slate-700 text-xs font-bold mb-2 uppercase tracking-wider">Target Job Role *</label>
            <input
              type="text" required placeholder="e.g. Rust Developer, Django Backend Engineer, Frontend Specialist"
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
              <option value="Fresher / Graduate">Fresher / Graduate</option>
              <option value="1–2 years">1–2 years</option>
              <option value="3–5 years">3–5 years</option>
              <option value="5+ years">5+ years</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-slate-700 text-xs font-bold mb-2 uppercase tracking-wider">
            Job Description (Highest Priority Source of Truth)
          </label>
          <textarea
            rows={4} 
            placeholder="Paste actual Job Description here to extract exact required skills and standards..."
            value={jobDescription} 
            onChange={(e) => setJobDescription(e.target.value)}
            className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-cyan-400 transition-all resize-none font-medium"
          />
        </div>

        <div className="pt-2 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-slate-500 text-xs flex items-center gap-2">
            Using Resume: {selectedResume ? <strong className="text-slate-800">{selectedResume.name}</strong> : <span className="text-red-500 font-semibold">None selected</span>}
          </div>
          <button
            type="submit" disabled={!selectedResume}
            className="px-8 py-3 bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-[0_4px_20px_rgba(6,182,212,0.3)] transition-all clickable-cursor"
          >
            <Cpu className="w-4 h-4" /> Start Deterministic Analysis
          </button>
        </div>
      </form>
    </div>
  );
}

// -----------------------------
// ScoreCard Helper Component
// -----------------------------
function ScoreCard({ title, score }: { title: string; score: number }) {
  const isHigh = score >= 80;
  const isMedium = score >= 50 && score < 80;
  
  const colorClass = isHigh ? "text-green-600 bg-green-50" : isMedium ? "text-amber-600 bg-amber-50" : "text-red-600 bg-red-50";
  const barClass = isHigh ? "bg-green-500" : isMedium ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
      <div className="flex justify-between items-start mb-4">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider leading-tight">{title}</span>
        <span className={`px-2 py-1 rounded-lg text-xs font-display font-bold ${colorClass}`}>
          {typeof score === "number" && !isNaN(score) ? `${score}%` : "—"}
        </span>
      </div>
      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }} 
          animate={{ width: `${Math.min(100, Math.max(0, score || 0))}%` }} 
          className={`h-full ${barClass}`} 
        />
      </div>
    </div>
  );
}
