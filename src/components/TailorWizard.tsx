import React, { useState } from "react";
import { ResumeFile, GapReport, RequirementProfile, ParsedResume, MissingItem, TailorRecommendation } from "../types";
import { 
  Sparkles, CheckCircle, Download, Copy, Check, TrendingUp, TrendingDown,
  Compass, Info, Cpu, AlertTriangle, CheckSquare, Lock, 
  RefreshCw, XCircle, ArrowLeft, Printer, FileText, FileSpreadsheet,
  Link, Globe, ExternalLink, BarChart3, ShieldAlert, Layers, Briefcase
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { collection, doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { validateExportReadiness, verifyExportContentIntegrity } from "../lib/exportValidator";
import { sanitizeExportFileName, generateDocxBlob, generatePrintableHtml, triggerDownload } from "../lib/exportEngine";

interface TailorWizardProps {
  userId: string;
  selectedResume: ResumeFile | null;
  onAnalysisCreated: () => void;
}

function mapFrontendAiError(errorCode?: string, errorMsg?: string): { title: string; message: string } {
  const code = errorCode || "";
  const message = errorMsg || "An unexpected error occurred during processing.";

  let title = "Analysis Unavailable";
  if (code === "AI_CONFIGURATION_ERROR") {
    title = "AI Service Not Configured";
  } else if (code === "AI_AUTHENTICATION_ERROR") {
    title = "AI Authentication Failed";
  } else if (code === "AI_PERMISSION_ERROR") {
    title = "AI Permission Denied";
  } else if (code === "AI_MODEL_UNAVAILABLE") {
    title = "AI Model Unavailable";
  } else if (code === "AI_RATE_LIMITED" || code === "AI_QUOTA_EXCEEDED") {
    title = "AI Rate Limit Exceeded";
  } else if (code === "AI_TIMEOUT") {
    title = "AI Request Timeout";
  } else if (code === "AI_INVALID_RESPONSE" || code === "AI_MALFORMED_RESPONSE") {
    title = "AI Output Malformed";
  } else if (code === "VALIDATION_ERROR" || code === "FACTUAL_VALIDATION_FAILED") {
    title = "Factual Validation Rejected";
  } else if (code === "MISSING_REQUIRED_DATA" || code === "INVALID_PROFILE_HASH") {
    title = "Incomplete Analysis Context";
  } else if (code === "AI_PROVIDER_ERROR") {
    title = "AI Service Error";
  } else if (code === "INTERNAL_SERVER_ERROR") {
    title = "Internal Server Error";
  }

  return { title, message };
}

// Wraps fetch + JSON parsing so that a non-JSON server response (crash, Express
// default error, plain-text error from any middleware) never surfaces as a raw
// SyntaxError in the UI. Instead it throws a clean, readable Error.
async function safeFetchJson(
  url: string,
  options: RequestInit
): Promise<{ res: Response; json: any }> {
  const res = await fetch(url, options);
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `The server returned an unexpected response (HTTP ${res.status}). ` +
        "Please ensure the application server is running correctly and retry."
    );
  }
  return { res, json };
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

  // Universal Job Ingestion state
  const [jobUrl, setJobUrl] = useState("");
  const [isImportingJob, setIsImportingJob] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedJobData, setImportedJobData] = useState<{
    jobId: string;
    snapshotId: string;
    source: any;
    status: string;
    companyName: string;
    title: string;
  } | null>(null);

  // Pipeline states (Part 3 - Fail Closed)
  const [step, setStep] = useState<"SETUP" | "PROCESSING" | "DASHBOARD" | "LOCKED" | "ERROR">("SETUP");
  const [loadingMessage, setLoadingMessage] = useState("");
  const [errorDetails, setErrorDetails] = useState<{ title: string; message: string }>({ title: "", message: "" });

  // Data states
  const [frozenProfile, setFrozenProfile] = useState<RequirementProfile | null>(null);
  const [parsedResume, setParsedResume] = useState<ParsedResume | null>(null);
  const [gapReport, setGapReport] = useState<GapReport | null>(null);
  
  // Single-issue Tailoring UI state (per-item caching, loading, and fail-closed error handling)
  const [activeMissingItem, setActiveMissingItem] = useState<MissingItem | null>(null);
  const [tailorRecommendations, setTailorRecommendations] = useState<Record<string, TailorRecommendation>>({});
  const [loadingGapItemTitle, setLoadingGapItemTitle] = useState<string | null>(null);
  const [gapErrorItemTitle, setGapErrorItemTitle] = useState<string | null>(null);
  const [gapErrorDetails, setGapErrorDetails] = useState<{ title: string; message: string; code?: string } | null>(null);

  const getGapItemKey = (item: MissingItem) => {
    const itemIdentifier = item.id || item.title;
    const resId = selectedResume?.id || "default_res";
    const profileHash = frozenProfile?.profileHash || frozenProfile?.id || "default_prof";
    return `${resId}:::${profileHash}:::${itemIdentifier}`;
  };

  // Checkboxes & Batch Tailoring states
  const [selectedItems, setSelectedItems] = useState<MissingItem[]>([]);
  const [batchResult, setBatchResult] = useState<{ tailoredContent: string; explanations: any[] } | null>(null);
  const [isBatchTailoring, setIsBatchTailoring] = useState(false);
  const [dashboardTab, setDashboardTab] = useState<"checklist" | "tailored" | "intelligence">("checklist");
  const [copiedText, setCopiedText] = useState(false);

  // Dynamic Gemini Key Configuration State
  const [newApiKey, setNewApiKey] = useState("");
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyConfigError, setKeyConfigError] = useState<string | null>(null);
  const [keyConfigSuccess, setKeyConfigSuccess] = useState<string | null>(null);

  const handleSaveApiKey = async () => {
    if (!newApiKey.trim()) return;
    setIsSavingKey(true);
    setKeyConfigError(null);
    setKeyConfigSuccess(null);
    try {
      const res = await fetch("/api/configure-gemini-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: newApiKey.trim() })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setKeyConfigError(data.error?.message || "Failed to verify API key with Google AI.");
        return;
      }
      setKeyConfigSuccess("Gemini API key verified and connected successfully! Retrying analysis...");
      setNewApiKey("");
      setTimeout(() => {
        startPipeline();
      }, 1000);
    } catch (err: any) {
      setKeyConfigError(err.message || "Failed to connect to server.");
    } finally {
      setIsSavingKey(false);
    }
  };

  // Market & Role Intelligence states
  const [marketIntelligence, setMarketIntelligence] = useState<any | null>(null);
  const [isLoadingIntelligence, setIsLoadingIntelligence] = useState(false);
  const [intelligenceError, setIntelligenceError] = useState<string | null>(null);

  const fetchMarketIntelligence = async (company: string, role: string, candidateSkills: string[] = []) => {
    if (!company && !role) return;
    setIsLoadingIntelligence(true);
    setIntelligenceError(null);
    try {
      const res = await fetch("/api/intelligence/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: company,
          roleTitle: role,
          candidateSkills
        })
      });
      const data = await res.json();
      if (res.ok && data.success && data.data) {
        setMarketIntelligence(data.data);
      } else {
        setIntelligenceError(data.error?.message || "Could not retrieve market intelligence.");
      }
    } catch (err: any) {
      console.warn("Intelligence fetch failed:", err);
      setIntelligenceError(err.message || "Failed to load market intelligence.");
    } finally {
      setIsLoadingIntelligence(false);
    }
  };

  const [trackedSuccess, setTrackedSuccess] = useState(false);

  const handleTrackApplication = async () => {
    if (!selectedResume || !targetCompany || !targetRole) return;
    try {
      const snapshot = {
        atsScore: (batchResult as any)?.scoreComparison?.afterAtsScore || gapReport?.atsScore || 0,
        targetMatchScore: (batchResult as any)?.scoreComparison?.afterTargetMatch || gapReport?.targetMatchScore || 0,
        requiredMatched: gapReport?.scoreBreakdown?.requiredMatched || 0,
        requiredTotal: gapReport?.scoreBreakdown?.requiredTotal || 0,
        preferredMatched: gapReport?.scoreBreakdown?.preferredMatched || 0,
        preferredTotal: gapReport?.scoreBreakdown?.preferredTotal || 0,
        criticalGapsCount: gapReport?.scoreBreakdown?.criticalGapsCount || 0,
        requirementProfileHash: frozenProfile?.profileHash || frozenProfile?.id || "hash_draft",
        intelligenceDatasetVersion: frozenProfile?.datasetVersion || "v1",
        capturedAt: new Date().toISOString()
      };

      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          jobId: importedJobData?.jobId || `job_${targetCompany.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
          resumeId: selectedResume.id,
          tailoredResumeId: `tailored_${Date.now()}`,
          companyName: targetCompany,
          roleTitle: targetRole,
          appliedAt: new Date().toISOString(),
          outcome: "APPLIED",
          scoreSnapshot: snapshot,
          resumeVersionName: `Tailored - ${selectedResume.name || "Resume"}`,
          isTailored: true,
          beforeAtsScore: (batchResult as any)?.scoreComparison?.beforeAtsScore,
          afterAtsScore: (batchResult as any)?.scoreComparison?.afterAtsScore,
          beforeTargetMatch: (batchResult as any)?.scoreComparison?.beforeTargetMatch,
          afterTargetMatch: (batchResult as any)?.scoreComparison?.afterTargetMatch
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTrackedSuccess(true);
        setTimeout(() => setTrackedSuccess(false), 4000);
      } else {
        alert(data.error?.message || "Could not track application.");
      }
    } catch (err: any) {
      alert(err.message || "Network error tracking application.");
    }
  };

  // Cross-Resume State Isolation (Part 26 - Resume Version Integrity)
  React.useEffect(() => {
    setStep("SETUP");
    setFrozenProfile(null);
    setParsedResume(null);
    setGapReport(null);
    setSelectedItems([]);
    setBatchResult(null);
    setActiveMissingItem(null);
    setTailorRecommendations({});
    setLoadingGapItemTitle(null);
    setGapErrorItemTitle(null);
    setGapErrorDetails(null);
    setMarketIntelligence(null);
    setIntelligenceError(null);
    setTrackedSuccess(false);
    setErrorDetails({ title: "", message: "" });
  }, [selectedResume?.id]);

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

    // Pre-Analysis Resume Quality Gate (Part 22)
    if (selectedResume.extractionStatus === "EXTRACTION_FAILED") {
      setErrorDetails({
        title: "Resume Extraction Incomplete",
        message: "The selected resume has an incomplete or corrupted text extraction. Please edit or re-upload the file in your Resume Vault before running an ATS analysis."
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
      // Generate Requirement Profile
      setLoadingMessage("Generating Frozen Requirement Profile...");
      const { res: profileRes, json: profileJson } = await safeFetchJson("/api/generate-requirement-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          targetCompany: targetCompany.trim(), 
          targetRole: targetRole.trim(), 
          jobDescription: jobDescription.trim(), 
          experienceLevel 
        })
      });
      
      if (!profileRes.ok || !profileJson.success || !profileJson.data) {
        const errorInfo = mapFrontendAiError(
          profileJson.error?.code,
          profileJson.error?.message || "Requirement engine failed to extract verified requirements."
        );
        setErrorDetails(errorInfo);
        setStep("ERROR");
        return;
      }
      const profileData: RequirementProfile = profileJson.data;
      if (importedJobData) {
        profileData.jobId = importedJobData.jobId;
        profileData.snapshotId = importedJobData.snapshotId;
      }
      setFrozenProfile(profileData);

      // Parse Resume Structure
      setLoadingMessage("Parsing Current Resume Structure...");
      const { res: parseRes, json: parseJson } = await safeFetchJson("/api/parse-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText: selectedResume.content })
      });

      if (!parseRes.ok || !parseJson.success || !parseJson.data) {
        const errorInfo = mapFrontendAiError(
          parseJson.error?.code,
          parseJson.error?.message || "Resume parser failed to extract structured entities."
        );
        setErrorDetails(errorInfo);
        setStep("ERROR");
        return;
      }
      const parsedData: ParsedResume = parseJson.data;
      setParsedResume(parsedData);

      // Phase 3 & 4: Objective Gap Analysis
      setLoadingMessage("Phase 3: Performing Strict Gap Analysis...");
      await runGapAnalysis(parsedData, profileData);
      
    } catch (err: any) {
      console.error("Pipeline failure:", err);
      const isNetworkFailure = err instanceof TypeError && err.message === "Failed to fetch";
      setErrorDetails({
        title: isNetworkFailure ? "Server Unreachable" : "Analysis Unavailable",
        message: isNetworkFailure
          ? "Unable to connect to the Resumix analysis server. Please ensure the application server is running (npm run dev) and try again."
          : (err.message || "Resumix could not complete the analysis because the service returned an invalid response.")
      });
      setStep("ERROR");
    }
  };

  const runGapAnalysis = async (parsed: ParsedResume, profile: RequirementProfile) => {
    setLoadingMessage("Analyzing Missing Requirements...");
    const { res: gapRes, json: gapJson } = await safeFetchJson("/api/gap-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parsedResume: parsed,
        frozenProfile: profile,
        rawResumeText: selectedResume?.content || ""
      })
    });

    if (!gapRes.ok || !gapJson.success || !gapJson.data) {
      const errorInfo = mapFrontendAiError(
        gapJson.error?.code,
        gapJson.error?.message || "Gap analysis engine failed to calculate verified matches."
      );
      setErrorDetails(errorInfo);
      setStep("ERROR");
      return;
    }
    const gapData: GapReport = gapJson.data;
    setGapReport(gapData);

    // Fetch Market & Role Intelligence patterns
    const candidateSkills = parsed?.skills || [];
    fetchMarketIntelligence(targetCompany, targetRole, candidateSkills);

    // Save only verified real gap reports to Firestore
    try {
      const gapReportId = doc(collection(db, "users", userId, "gapReports")).id;
      await setDoc(doc(db, "users", userId, "gapReports", gapReportId), {
        ...gapData,
        id: gapReportId,
        userId,
        resumeId: selectedResume?.id,
        targetCompany,
        targetRole,
        requirementProfileId: profile.id || profile.profileHash,
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
    const itemKey = getGapItemKey(item);

    setActiveMissingItem(item);
    setGapErrorItemTitle(null);
    setGapErrorDetails(null);

    // 1. Return cached recommendation if already fetched for this exact resume + profile + requirement
    if (tailorRecommendations[itemKey]) {
      return;
    }

    // 2. Prevent duplicate concurrent requests for the same item
    if (loadingGapItemTitle === item.title) {
      return;
    }

    setLoadingGapItemTitle(item.title);

    // 3. Timeout Protection: 15-second AbortController to prevent infinite hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 15000);

    try {
      const res = await fetch("/api/tailor-gap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeId: selectedResume?.id,
          resumeText: selectedResume?.content || "",
          profileHash: frozenProfile?.profileHash || frozenProfile?.id,
          requirementId: item.id,
          targetCompany,
          targetRole,
          experienceLevel,
          jobDescription,
          frozenProfile,
          missingItem: item
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const data = await res.json();
      if (!res.ok || !data.success || !data.data) {
        const mappedErr = mapFrontendAiError(
          data.error?.code,
          data.error?.message || "Failed to generate single fix recommendation."
        );
        setGapErrorItemTitle(item.title);
        setGapErrorDetails({
          title: mappedErr.title,
          message: mappedErr.message,
          code: data.error?.code
        });
        return;
      }

      setTailorRecommendations(prev => ({
        ...prev,
        [itemKey]: data.data
      }));
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error("Single fix explanation error:", err);

      let title = "Unable to Generate Explanation";
      let message = err.message || "Failed to generate an evidence-based explanation.";

      if (err.name === "AbortError") {
        title = "Request Timeout";
        message = "Suggestion generation timed out. Please retry.";
      } else if (err.message && err.message.includes("Failed to fetch")) {
        title = "Network Failure";
        message = "Network request failed. Please check your connection and retry.";
      }

      setGapErrorItemTitle(item.title);
      setGapErrorDetails({ title, message });
    } finally {
      setLoadingGapItemTitle(null);
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
          parsedResume,
          frozenProfile,
          selectedItems
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.data) {
        const errorInfo = mapFrontendAiError(
          data.error?.code,
          data.error?.message || "Failed to perform factual resume optimization."
        );
        setErrorDetails(errorInfo);
        setStep("ERROR");
        return;
      }
      setBatchResult(data.data);
      setDashboardTab("tailored");
    } catch (err: any) {
      console.error("Batch tailor error:", err);
      setErrorDetails({
        title: "Tailoring Validation Error",
        message: err.message || "Failed to generate tailored resume without factual violations."
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
    setGapErrorItemTitle(null);
    setGapErrorDetails(null);
  };

  const [exportError, setExportError] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleExport = (format: "pdf" | "docx" | "md" | "print") => {
    setExportError(null);
    const content = batchResult?.tailoredContent || selectedResume?.content || "";
    
    // Strict Export Readiness Validation Gate
    const validation = validateExportReadiness({
      status: batchResult ? "FINAL_OPTIMIZED" : "DRAFT",
      tailoredContent: content,
      parsedResume: parsedResume || undefined,
    });

    if (!validation.isValid) {
      setExportError(`Export blocked: ${validation.errors.join(", ")}`);
      return;
    }

    const candidateName = parsedResume?.contactInfo?.name || "Candidate";
    const filename = sanitizeExportFileName(candidateName, targetCompany, targetRole, format === "docx" ? "docx" : format === "md" ? "md" : "html");

    if (format === "docx") {
      const docxBlob = generateDocxBlob(content, parsedResume || undefined);
      triggerDownload(docxBlob, filename);
    } else if (format === "md") {
      const mdBlob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
      triggerDownload(mdBlob, filename);
    } else if (format === "pdf" || format === "print") {
      const htmlContent = generatePrintableHtml(content, `${targetRole} - ${candidateName}`);
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
        }, 500);
      } else {
        // Fallback to direct download of printable HTML
        const htmlBlob = new Blob([htmlContent], { type: "text/html;charset=utf-8;" });
        triggerDownload(htmlBlob, filename);
      }
    }
  };

  const handleImportJobUrl = async () => {
    if (!jobUrl || !jobUrl.trim()) return;
    setIsImportingJob(true);
    setImportError(null);
    try {
      const res = await fetch("/api/jobs/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: jobUrl.trim(), company: targetCompany, role: targetRole })
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.data) {
        throw new Error(data.error?.message || "Failed to import job posting from URL.");
      }
      const fetched = data.data;
      if (fetched.job) {
        setTargetCompany(fetched.job.companyName || targetCompany);
        setTargetRole(fetched.job.title || targetRole);
        setJobDescription(fetched.snapshot?.description || "");
        setImportedJobData({
          jobId: fetched.job.jobId,
          snapshotId: fetched.snapshot?.snapshotId,
          source: fetched.job.source,
          status: fetched.job.status,
          companyName: fetched.job.companyName,
          title: fetched.job.title
        });
      }
    } catch (err: any) {
      setImportError(err.message || "Failed to import job from source.");
    } finally {
      setIsImportingJob(false);
    }
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
    const isAiConfigIssue =
      errorDetails.title === "AI Permission Denied" ||
      errorDetails.title === "AI Service Not Configured" ||
      errorDetails.title === "AI Authentication Failed";

    return (
      <div className="py-12 flex flex-col items-center justify-center text-center bg-red-50/70 backdrop-blur-xl border border-red-200 rounded-3xl p-8 shadow-sm animate-fadeIn">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-4 border border-red-200">
          <XCircle className="w-8 h-8" />
        </div>
        <h3 className="text-red-900 font-display font-bold text-2xl mb-2">
          {errorDetails.title || "Analysis Unavailable"}
        </h3>
        <p className="text-red-700 text-sm font-medium mb-4 max-w-lg">
          {errorDetails.message || "Resumix could not complete the analysis because the required service did not return valid verified data."}
        </p>

        {isAiConfigIssue && (
          <div className="mb-6 w-full max-w-lg bg-white/95 backdrop-blur-md p-5 rounded-2xl border border-red-200 shadow-sm text-left">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Connect Gemini API Key
              </span>
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noreferrer"
                className="text-cyan-600 hover:text-cyan-700 font-bold text-xs flex items-center gap-1 hover:underline"
              >
                Get Free API Key <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <p className="text-slate-500 text-xs mb-3">
              Paste your Gemini API key from Google AI Studio below to test and connect instantly. It will be securely stored server-side.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="AIzaSy..."
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-slate-50 font-mono"
              />
              <button
                type="button"
                onClick={handleSaveApiKey}
                disabled={isSavingKey || !newApiKey.trim()}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-sm shrink-0"
              >
                {isSavingKey ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Verifying...
                  </>
                ) : (
                  "Save & Connect"
                )}
              </button>
            </div>
            {keyConfigError && (
              <p className="mt-2 text-xs text-red-600 font-medium bg-red-50 p-2 rounded-lg border border-red-100">
                {keyConfigError}
              </p>
            )}
            {keyConfigSuccess && (
              <p className="mt-2 text-xs text-green-700 font-medium bg-green-50 p-2 rounded-lg border border-green-100">
                {keyConfigSuccess}
              </p>
            )}
            <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
              Alternatively, enable the <strong>Generative Language API</strong> in Google Cloud Console for project <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">gemini-reumixxxx</code>.
            </div>
          </div>
        )}

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

        <div className="flex flex-wrap justify-center gap-3">
          <button 
            onClick={() => handleExport("pdf")}
            className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl flex items-center gap-2 transition-all shadow-[0_4px_20px_rgba(34,197,94,0.3)] text-xs"
          >
            <Printer className="w-3.5 h-3.5" /> Export PDF
          </button>
          <button 
            onClick={() => handleExport("docx")}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center gap-2 transition-all shadow-sm text-xs"
          >
            <FileText className="w-3.5 h-3.5" /> Word (.docx)
          </button>
          <button 
            onClick={() => handleExport("md")}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl flex items-center gap-2 transition-all shadow-sm text-xs"
          >
            <Download className="w-3.5 h-3.5" /> Markdown (.md)
          </button>
          <button onClick={() => setStep("SETUP")} className="px-5 py-2.5 bg-white text-slate-600 border border-slate-200 font-bold rounded-xl hover:bg-slate-50 transition-all text-xs">
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
          <button 
            onClick={() => {
              setDashboardTab("intelligence");
              if (!marketIntelligence && !isLoadingIntelligence) {
                const candidateSkills = parsedResume?.skills?.map((s) => s.name) || [];
                fetchMarketIntelligence(targetCompany, targetRole, candidateSkills);
              }
            }}
            className={`px-6 py-3 font-display font-bold text-sm transition-all border-b-2 flex items-center gap-2 ${
              dashboardTab === "intelligence" ? "border-cyan-500 text-cyan-600" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Market Intelligence
            {marketIntelligence && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                marketIntelligence.evidenceStrength === "STRONG_EVIDENCE" ? "bg-emerald-100 text-emerald-700" :
                marketIntelligence.evidenceStrength === "MODERATE_EVIDENCE" ? "bg-cyan-100 text-cyan-700" :
                marketIntelligence.evidenceStrength === "LIMITED_EVIDENCE" ? "bg-amber-100 text-amber-700" :
                "bg-slate-100 text-slate-600"
              }`}>
                {marketIntelligence.evidenceStrength?.replace("_EVIDENCE", "") || "DATA"}
              </span>
            )}
          </button>
        </div>

        {dashboardTab === "checklist" && (
          <>
            {/* CATEGORY SCORECARD (Calculated from Real Data) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <ScoreCard title="ATS Compatibility" score={gapReport.atsScore ?? gapReport.scores.atsCompatibility} />
              <ScoreCard title="Target Match" score={gapReport.targetMatchScore ?? gapReport.scores.companyMatch} />
              <ScoreCard title="Required Skills" score={gapReport.scoreBreakdown?.requiredPercentage ?? gapReport.scores.requiredSkills} />
              <ScoreCard title="Experience Match" score={gapReport.scoreBreakdown?.experienceMatchScore ?? gapReport.scores.experienceMatch} />
            </div>

            {/* SCORE BREAKDOWN STRIP */}
            {gapReport.scoreBreakdown && (
              <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-slate-600 font-medium">
                    Required: <strong className="text-slate-900">{gapReport.scoreBreakdown.requiredMatched} / {gapReport.scoreBreakdown.requiredTotal}</strong>
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-600 font-medium">
                    Preferred: <strong className="text-slate-900">{gapReport.scoreBreakdown.preferredMatched} / {gapReport.scoreBreakdown.preferredTotal}</strong>
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-600 font-medium">
                    Keywords: <strong className="text-slate-900">{gapReport.scoreBreakdown.keywordsMatched} / {gapReport.scoreBreakdown.keywordsTotal}</strong>
                  </span>
                </div>
                <div>
                  <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] uppercase tracking-wider ${
                    gapReport.scoreBreakdown.criticalGapsCount === 0 
                      ? "bg-green-100 text-green-700" 
                      : "bg-red-100 text-red-700"
                  }`}>
                    {gapReport.scoreBreakdown.criticalGapsCount === 0 ? "Ready to Apply" : `${gapReport.scoreBreakdown.criticalGapsCount} Critical Gap(s)`}
                  </span>
                </div>
              </div>
            )}

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
                              disabled={loadingGapItemTitle === item.title}
                              className={`text-xs font-bold flex items-center gap-1 transition-all ${
                                loadingGapItemTitle === item.title 
                                  ? 'text-slate-400 cursor-not-allowed'
                                  : 'text-cyan-600 hover:text-cyan-700'
                              }`}
                            >
                              <Info className="w-3.5 h-3.5" /> Explain single fix
                            </button>
                          ) : (
                            <button 
                              onClick={() => {
                                setActiveMissingItem(null);
                                setGapErrorItemTitle(null);
                                setGapErrorDetails(null);
                              }}
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
                              {loadingGapItemTitle === item.title ? (
                                <div className="flex items-center gap-3 text-cyan-600 text-sm font-bold py-2">
                                  <RefreshCw className="w-4 h-4 animate-spin" /> Formulating truthful suggestion...
                                </div>
                              ) : gapErrorItemTitle === item.title && gapErrorDetails ? (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs text-red-800 space-y-2">
                                  <div className="flex items-center gap-2 font-bold text-red-700">
                                    <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                                    <span>{gapErrorDetails.title}</span>
                                  </div>
                                  <p className="text-red-700 font-medium">{gapErrorDetails.message}</p>
                                  <div className="flex gap-2 pt-1">
                                    <button 
                                      onClick={() => handleFixItem(item)}
                                      className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-all text-xs flex items-center gap-1.5 shadow-sm"
                                    >
                                      <RefreshCw className="w-3 h-3" /> Retry
                                    </button>
                                    <button 
                                      onClick={() => {
                                        setActiveMissingItem(null);
                                        setGapErrorItemTitle(null);
                                        setGapErrorDetails(null);
                                      }}
                                      className="px-3.5 py-1.5 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-50 transition-all text-xs font-semibold"
                                    >
                                      Close
                                    </button>
                                  </div>
                                </div>
                              ) : tailorRecommendations[getGapItemKey(item)] ? (
                                <div className="space-y-3">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Target Section</span>
                                      <span className="text-xs font-bold text-slate-800 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                                        {tailorRecommendations[getGapItemKey(item)].section}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Status</span>
                                      <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800">
                                        {tailorRecommendations[getGapItemKey(item)].evidenceStatus}
                                      </span>
                                    </div>
                                  </div>
                                  
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Suggested Phrasing / Project Idea</span>
                                    <div className="bg-white border border-cyan-200 p-3 rounded-lg text-xs text-slate-700 italic border-l-4 border-l-cyan-500">
                                      "{tailorRecommendations[getGapItemKey(item)].suggestedSentence}"
                                    </div>
                                  </div>

                                  {tailorRecommendations[getGapItemKey(item)].reason && (
                                    <p className="text-xs text-slate-600 font-medium">
                                      {tailorRecommendations[getGapItemKey(item)].reason}
                                    </p>
                                  )}
                                  
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
        )}

        {dashboardTab === "tailored" && batchResult && (
          /* BATCH TAILORED RESULT VIEW */
          <div className="space-y-6">
            {/* FINALITY BADGE & METRIC BAR */}
            <div className="bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-transparent p-5 rounded-3xl border border-emerald-500/30 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-emerald-600" /> Final Tailored Resume
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Verified Truth Preservation
                  </span>
                </div>
                <h4 className="text-base font-bold text-slate-900">
                  Target-Optimized Draft for {targetRole} at {targetCompany}
                </h4>
                <p className="text-xs text-slate-600">
                  100% evidence-based improvements without fabricated metrics, companies, or unpossessed skills.
                </p>
              </div>

              {/* BEFORE VS AFTER SCORE COMPARISON */}
              {batchResult && (batchResult as any).scoreComparison && (
                <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-center px-3 border-r border-slate-100">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">ATS Score</span>
                    <span className="text-sm font-bold text-slate-800">
                      {(batchResult as any).scoreComparison.beforeAtsScore}% → <strong className="text-emerald-600">{(batchResult as any).scoreComparison.afterAtsScore}%</strong>
                    </span>
                  </div>
                  <div className="text-center px-3">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Target Match</span>
                    <span className="text-sm font-bold text-slate-800">
                      {(batchResult as any).scoreComparison.beforeTargetMatch}% → <strong className="text-cyan-600">{(batchResult as any).scoreComparison.afterTargetMatch}%</strong>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* EXPORT ACTION BUTTONS */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">Verified Formats:</span>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-medium">PDF (ATS Print)</span>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-medium">DOCX (Native)</span>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-medium">Plain Text</span>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleExport("pdf")}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
                  title="Print / Save as clean ATS PDF"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print PDF</span>
                </button>

                <button 
                  onClick={() => handleExport("docx")}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
                  title="Export native Microsoft Word document"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export DOCX</span>
                </button>

                <button 
                  onClick={() => copyToClipboard(batchResult?.tailoredContent || selectedResume?.content || "")}
                  className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
                  title="Copy full text to clipboard"
                >
                  {copiedText ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copy Text</span>
                    </>
                  )}
                </button>

                <button 
                  onClick={handleTrackApplication}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
                  title="Record this tailored submission in Application Tracker"
                >
                  {trackedSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Tracked</span>
                    </>
                  ) : (
                    <>
                      <Briefcase className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Track Application</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* AUDIT LOG & EXPLANATIONS */}
            {batchResult.explanations && batchResult.explanations.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-cyan-600" /> Tailoring Action Audit Trail
                </h5>
                <div className="space-y-2">
                  {batchResult.explanations.map((exp: any, idx: number) => (
                    <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                      <div className="flex justify-between">
                        <strong className="text-slate-800">{exp.requirement}</strong>
                        <span className="text-cyan-700 font-semibold">{exp.actionTaken}</span>
                      </div>
                      <div className="flex gap-4 text-[11px]">
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

        {dashboardTab === "intelligence" && (
          /* UNIVERSAL MARKET & ROLE INTELLIGENCE VIEW */
          <div className="space-y-6">
            {/* INTEL HEADER */}
            <div className="bg-white/80 backdrop-blur-md border border-slate-200 p-6 rounded-3xl shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2.5 py-1 bg-cyan-100 text-cyan-800 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-cyan-600" />
                    Market & Role Intelligence
                  </span>
                  {marketIntelligence && (
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      marketIntelligence.evidenceStrength === "STRONG_EVIDENCE" ? "bg-emerald-100 text-emerald-800 border border-emerald-300" :
                      marketIntelligence.evidenceStrength === "MODERATE_EVIDENCE" ? "bg-cyan-100 text-cyan-800 border border-cyan-300" :
                      marketIntelligence.evidenceStrength === "LIMITED_EVIDENCE" ? "bg-amber-100 text-amber-800 border border-amber-300" :
                      "bg-slate-100 text-slate-700 border border-slate-300"
                    }`}>
                      {marketIntelligence.evidenceStrength.replace("_", " ")}
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-display font-bold text-slate-900">
                  Observed Hiring Patterns for {targetRole || "Role"}
                  {targetCompany && <span className="text-slate-400"> at </span>}
                  {targetCompany}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {marketIntelligence ? (
                    <span>
                      Synthesized from <strong>{marketIntelligence.totalPostingsAnalyzed}</strong> verified job postings (Dataset {marketIntelligence.datasetVersion})
                    </span>
                  ) : (
                    <span>Universal cross-posting market frequency & qualification analytics</span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const candidateSkills = parsedResume?.skills?.map((s) => s.name) || [];
                    fetchMarketIntelligence(targetCompany, targetRole, candidateSkills);
                  }}
                  disabled={isLoadingIntelligence}
                  className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-sm"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingIntelligence ? "animate-spin text-cyan-600" : "text-slate-500"}`} />
                  <span>{isLoadingIntelligence ? "Analyzing Postings..." : "Refresh Intelligence"}</span>
                </button>
              </div>
            </div>

            {/* STATUTORY NON-MISLEADING DISCLAIMER (MANDATORY TRANSPARENCY) */}
            <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900">
                <strong className="font-bold block mb-0.5">Empirical Job-Posting Pattern Disclosures:</strong>
                {marketIntelligence?.disclaimer || (
                  "Statistical Market Observation: These percentages and co-occurrence patterns describe observed job-posting requirements from verified public data sources. They represent market patterns and are NOT hiring, interview, or rejection decisions made by employers."
                )}
              </div>
            </div>

            {/* ERROR OR LOADING STATE */}
            {isLoadingIntelligence && (
              <div className="p-12 bg-white border border-slate-200 rounded-3xl text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-cyan-500 animate-spin mx-auto" />
                <h4 className="font-bold text-slate-800 text-sm">Aggregating Verified Market Snapshots...</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Calculating deterministic frequency distributions, co-occurrences, and sample-size basis across real job postings.
                </p>
              </div>
            )}

            {!isLoadingIntelligence && intelligenceError && (
              <div className="p-6 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-800 text-xs">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                <span>{intelligenceError}</span>
              </div>
            )}

            {/* MAIN INTELLIGENCE CONTENT */}
            {!isLoadingIntelligence && marketIntelligence && (
              <div className="space-y-6">
                {/* SAMPLE SIZE & BASIS BANNER */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Postings Analyzed</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold font-display text-slate-900">
                        {marketIntelligence.totalPostingsAnalyzed}
                      </span>
                      <span className="text-xs text-slate-500">public verified specs</span>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Evidence Quality Tier</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-bold font-display text-slate-900">
                        {marketIntelligence.evidenceStrength.replace("_EVIDENCE", "").replace("_DATA", "")}
                      </span>
                      <span className="text-xs text-slate-500">
                        {marketIntelligence.evidenceStrength === "STRONG_EVIDENCE" ? "(30+ Postings)" :
                         marketIntelligence.evidenceStrength === "MODERATE_EVIDENCE" ? "(10–29 Postings)" :
                         marketIntelligence.evidenceStrength === "LIMITED_EVIDENCE" ? "(3–9 Postings)" :
                         "(<3 Postings)"}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Dataset Hash & Version</span>
                    <div className="font-mono text-xs text-slate-700 truncate" title={marketIntelligence.datasetVersion}>
                      {marketIntelligence.datasetVersion}
                    </div>
                  </div>
                </div>

                {/* INSUFFICIENT DATA NOTICE IF UNDER 3 POSTINGS */}
                {marketIntelligence.totalPostingsAnalyzed < 3 && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600 flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-800 block">Limited Initial Sample Size ({marketIntelligence.totalPostingsAnalyzed} Postings)</strong>
                      Import more public job posting URLs for {targetCompany || "this role"} in the Setup tab using Job URL Ingestion to deepen the statistical profile.
                    </div>
                  </div>
                )}

                {/* CANDIDATE SKILL COVERAGE VS MARKET PATTERNS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* MATCHING VERIFIED SKILLS */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        Skills You Possess (Market High-Demand)
                      </h4>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        {marketIntelligence.candidateMatchingRequirements?.length || 0}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Verified skills from your resume that frequently appear in postings for this role.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {marketIntelligence.candidateMatchingRequirements?.length > 0 ? (
                        marketIntelligence.candidateMatchingRequirements.map((req: string, idx: number) => (
                          <span key={idx} className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium rounded-lg flex items-center gap-1.5">
                            <Check className="w-3 h-3 text-emerald-600" />
                            {req}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400 italic">No common market skills matched yet.</span>
                      )}
                    </div>
                  </div>

                  {/* FREQUENT MARKET PATTERNS NOT IN CURRENT RESUME */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                        <Compass className="w-4 h-4 text-cyan-600" />
                        Frequent Market Requirements (Not In Resume)
                      </h4>
                      <span className="text-xs font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-full">
                        {marketIntelligence.candidateMissingFrequentRequirements?.length || 0}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Frequently observed in peer postings. <em>(Market observation only — not assigned to you unless truthful)</em>.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {marketIntelligence.candidateMissingFrequentRequirements?.length > 0 ? (
                        marketIntelligence.candidateMissingFrequentRequirements.map((item: any, idx: number) => (
                          <span key={idx} className="px-3 py-1 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg flex items-center gap-2">
                            <span>{item.requirementName}</span>
                            <span className="text-[10px] font-bold text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded">
                              {item.frequencyPercentage}%
                            </span>
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400 italic">You possess all frequent market requirements analyzed!</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* REQUIREMENT FREQUENCIES BREAKDOWN (0% - 100%) */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-base text-slate-900 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-cyan-600" />
                        Empirical Requirement Frequency Distribution
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Exact appearance frequency across {marketIntelligence.totalPostingsAnalyzed} analyzed postings. Zero-division safe.
                      </p>
                    </div>
                    <span className="text-xs font-bold text-slate-400">
                      Sorted by Frequency
                    </span>
                  </div>

                  <div className="space-y-3 pt-2">
                    {marketIntelligence.topRequirements?.length > 0 ? (
                      marketIntelligence.topRequirements.map((req: any, idx: number) => (
                        <div key={idx} className="p-3 bg-slate-50/70 hover:bg-slate-50 border border-slate-100 rounded-xl transition-all space-y-1.5">
                          <div className="flex justify-between items-center text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800">{req.requirementName}</span>
                              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-500 font-semibold">
                                {req.category}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-slate-500 text-[11px]">
                                {req.occurrences} of {req.totalPostingsEvaluated} postings ({req.requiredOccurrences} mandatory, {req.preferredOccurrences} preferred)
                              </span>
                              <span className="font-bold text-cyan-700 bg-cyan-50 border border-cyan-200 px-2 py-0.5 rounded-md text-xs">
                                {req.frequencyPercentage}%
                              </span>
                            </div>
                          </div>
                          {/* PROGRESS BAR */}
                          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div 
                              className="bg-cyan-500 h-full rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(100, Math.max(0, req.frequencyPercentage))}%` }}
                            />
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 italic text-center py-4">No requirement statistics available yet.</p>
                    )}
                  </div>
                </div>

                {/* CO-OCCURRENCE PATTERNS & TREND VELOCITY */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* CO-OCCURRENCE */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                    <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-purple-600" />
                      Statistically Co-Occurring Technologies
                    </h4>
                    <p className="text-xs text-slate-500">
                      Technologies frequently requested together in public postings (non-causal).
                    </p>
                    <div className="space-y-2 pt-1">
                      {marketIntelligence.coOccurrences?.length > 0 ? (
                        marketIntelligence.coOccurrences.slice(0, 6).map((co: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center p-2.5 bg-purple-50/40 border border-purple-100 rounded-xl text-xs">
                            <span className="font-bold text-purple-900">
                              {co.requirementA} + {co.requirementB}
                            </span>
                            <span className="text-[10px] font-bold text-purple-700 bg-purple-100/70 px-2 py-0.5 rounded-full">
                              {co.coOccurrencePercentage}% ({co.coOccurrenceCount} postings)
                            </span>
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400 italic">No co-occurrences detected with sufficient sample size.</span>
                      )}
                    </div>
                  </div>

                  {/* TREND DIRECTION */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                    <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      Observed Temporal Velocity
                    </h4>
                    <p className="text-xs text-slate-500">
                      Directional change between chronological snapshot samples.
                    </p>
                    <div className="space-y-2 pt-1">
                      {marketIntelligence.trends?.length > 0 ? (
                        marketIntelligence.trends.slice(0, 6).map((tr: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs">
                            <span className="font-bold text-slate-800">{tr.requirementName}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                              tr.direction === "TRENDING_UP" ? "bg-emerald-100 text-emerald-800" :
                              tr.direction === "TRENDING_DOWN" ? "bg-red-100 text-red-800" :
                              tr.direction === "STABLE" ? "bg-slate-200 text-slate-700" :
                              "bg-slate-100 text-slate-500"
                            }`}>
                              {tr.direction === "TRENDING_UP" && <TrendingUp className="w-3 h-3 text-emerald-600" />}
                              {tr.direction === "TRENDING_DOWN" && <TrendingDown className="w-3 h-3 text-red-600" />}
                              {tr.direction.replace("_", " ")} ({tr.changePercentage > 0 ? `+${tr.changePercentage}%` : `${tr.changePercentage}%`})
                            </span>
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400 italic">Sufficient chronological splits needed to evaluate velocity.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
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
        {/* UNIVERSAL JOB URL INGESTION BOX */}
        <div className="p-4 bg-cyan-50/50 border border-cyan-200/80 rounded-2xl space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
              <Link className="w-3.5 h-3.5 text-cyan-600" /> Import Real Job from URL (Optional)
            </span>
            <span className="text-[10px] font-semibold text-cyan-700 bg-cyan-100/70 px-2 py-0.5 rounded-full">
              Greenhouse, Lever, Ashby, JSON-LD
            </span>
          </div>

          <div className="flex gap-2">
            <input 
              type="url" 
              placeholder="Paste public job posting URL (e.g. boards.greenhouse.io/... or jobs.lever.co/...)"
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-cyan-400 font-medium"
            />
            <button
              type="button"
              onClick={handleImportJobUrl}
              disabled={isImportingJob || !jobUrl.trim()}
              className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm shrink-0"
            >
              {isImportingJob ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <Globe className="w-3.5 h-3.5" />
                  <span>Import Real Job</span>
                </>
              )}
            </button>
          </div>

          {importError && (
            <div className="text-xs text-red-600 font-medium flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <span>{importError}</span>
            </div>
          )}

          {importedJobData && (
            <div className="p-3 bg-white border border-cyan-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded-md font-bold text-[10px] uppercase tracking-wider flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-green-600" /> {importedJobData.source.provider}
                </span>
                <span className="text-slate-600 font-medium">
                  Status: <strong className="text-slate-900">{importedJobData.status}</strong>
                </span>
                <span className="text-slate-400">•</span>
                <span className="text-slate-500 text-[11px]">
                  Retrieved: {new Date(importedJobData.source.retrievedAt).toLocaleDateString()}
                </span>
              </div>

              {importedJobData.source.sourceUrl && (
                <a 
                  href={importedJobData.source.sourceUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-cyan-600 hover:text-cyan-700 font-bold text-[11px] flex items-center gap-1"
                >
                  <span>View Original Job Posting</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}
        </div>

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
