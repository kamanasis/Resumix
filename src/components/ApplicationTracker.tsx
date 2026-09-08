import React, { useState, useEffect } from "react";
import { 
  ApplicationRecord, 
  ApplicationOutcome, 
  OutcomeConfidence, 
  OutcomeEvidenceSource, 
  OutcomeSummaryAnalytics, 
  ResumeFile 
} from "../types";
import { 
  Briefcase, 
  Plus, 
  Calendar, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  ChevronRight, 
  Search, 
  Filter, 
  Layers, 
  TrendingUp, 
  Info, 
  ShieldCheck, 
  RefreshCw, 
  FileText, 
  Sparkles, 
  Building2, 
  UserCheck 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ApplicationTrackerProps {
  userId: string;
  resumes: ResumeFile[];
}

export default function ApplicationTracker({ userId, resumes }: ApplicationTrackerProps) {
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [personalAnalytics, setPersonalAnalytics] = useState<OutcomeSummaryAnalytics | null>(null);
  const [globalAnalytics, setGlobalAnalytics] = useState<OutcomeSummaryAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<"list" | "insights">("list");

  // Filtering & search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAppForUpdate, setSelectedAppForUpdate] = useState<ApplicationRecord | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Form states for creation
  const [newCompany, setNewCompany] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newJobId, setNewJobId] = useState("");
  const [newResumeId, setNewResumeId] = useState("");
  const [newAppliedDate, setNewAppliedDate] = useState(new Date().toISOString().substring(0, 10));
  const [newNotes, setNewNotes] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states for status update
  const [updateOutcome, setUpdateOutcome] = useState<ApplicationOutcome>("INTERVIEW");
  const [updateDate, setUpdateDate] = useState(new Date().toISOString().substring(0, 10));
  const [updateNotes, setUpdateNotes] = useState("");
  const [updateConfidence, setUpdateConfidence] = useState<OutcomeConfidence>("USER_REPORTED");
  const [updateEvidenceSource, setUpdateEvidenceSource] = useState<OutcomeEvidenceSource>("EMAIL");
  const [isUpdating, setIsUpdating] = useState(false);

  // Load user applications
  const fetchApplications = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/applications?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.data)) {
        setApplications(data.data);
      }
    } catch (err) {
      console.warn("Could not fetch applications:", err);
    } finally {
      setLoading(false);
    }
  };

  // Load outcome analytics
  const fetchAnalytics = async () => {
    try {
      const [personalRes, globalRes] = await Promise.all([
        fetch(`/api/outcome-intelligence/personal?userId=${encodeURIComponent(userId)}`),
        fetch(`/api/outcome-intelligence`)
      ]);
      const personalData = await personalRes.json();
      const globalData = await globalRes.json();

      if (personalData.success) setPersonalAnalytics(personalData.data);
      if (globalData.success) setGlobalAnalytics(globalData.data);
    } catch (err) {
      console.warn("Could not fetch outcome analytics:", err);
    }
  };

  useEffect(() => {
    fetchApplications();
    fetchAnalytics();
  }, [userId]);

  // View timeline events
  const handleOpenUpdateModal = async (app: ApplicationRecord) => {
    setSelectedAppForUpdate(app);
    setUpdateOutcome(app.outcome);
    setUpdateNotes("");
    setUpdateDate(new Date().toISOString().substring(0, 10));
    setUpdateConfidence(app.outcomeConfidence || "USER_REPORTED");
    setUpdateEvidenceSource(app.outcomeEvidenceSource || "EMAIL");
    setLoadingTimeline(true);

    try {
      const res = await fetch(`/api/applications/${app.applicationId}?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      if (res.ok && data.success && data.data?.events) {
        setTimelineEvents(data.data.events);
      }
    } catch (err) {
      console.warn("Could not fetch timeline events:", err);
    } finally {
      setLoadingTimeline(false);
    }
  };

  // Submit new application
  const handleCreateApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompany.trim() || !newRole.trim()) {
      setCreateError("Company name and role title are required.");
      return;
    }
    const chosenResume = resumes.find(r => r.id === newResumeId) || resumes[0];
    if (!chosenResume) {
      setCreateError("Please upload or select a resume first.");
      return;
    }

    setIsSubmitting(true);
    setCreateError(null);

    const snapshot = {
      atsScore: 85,
      targetMatchScore: 80,
      requiredMatched: 5,
      requiredTotal: 6,
      preferredMatched: 2,
      preferredTotal: 3,
      criticalGapsCount: 1,
      requirementProfileHash: `prof_${Date.now()}`,
      capturedAt: new Date().toISOString()
    };

    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          jobId: newJobId.trim() || `job_${newCompany.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
          resumeId: chosenResume.id,
          companyName: newCompany.trim(),
          roleTitle: newRole.trim(),
          appliedAt: newAppliedDate,
          userNotes: newNotes.trim(),
          outcome: "APPLIED",
          scoreSnapshot: snapshot,
          resumeVersionName: chosenResume.fileName || "Primary Resume"
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to create application record.");
      }

      setShowCreateModal(false);
      setNewCompany("");
      setNewRole("");
      setNewNotes("");
      await fetchApplications();
      await fetchAnalytics();
    } catch (err: any) {
      setCreateError(err.message || "Failed to record application.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit status update
  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppForUpdate) return;

    setIsUpdating(true);
    try {
      const res = await fetch(`/api/applications/${selectedAppForUpdate.applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          outcome: updateOutcome,
          outcomeDate: updateDate,
          userNotes: updateNotes.trim(),
          confidence: updateConfidence,
          evidenceSource: updateEvidenceSource
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || "Failed to update outcome.");
      }

      setSelectedAppForUpdate(null);
      await fetchApplications();
      await fetchAnalytics();
    } catch (err: any) {
      alert(err.message || "Could not update status.");
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusColor = (outcome: ApplicationOutcome) => {
    switch (outcome) {
      case "APPLIED":
        return "bg-cyan-100 text-cyan-800 border-cyan-200";
      case "RECRUITER_SCREEN":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "INTERVIEW":
      case "TECHNICAL_INTERVIEW":
      case "FINAL_ROUND":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "OFFER":
      case "HIRED":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "REJECTED":
        return "bg-slate-200 text-slate-700 border-slate-300";
      case "WITHDRAWN":
        return "bg-amber-100 text-amber-800 border-amber-200";
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const filteredApplications = applications.filter(app => {
    const matchesSearch = 
      app.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.roleTitle.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || app.outcome === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* HEADER BAR */}
      <div className="bg-white/80 backdrop-blur-md border border-slate-200 p-6 rounded-3xl shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 bg-cyan-100 text-cyan-800 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Briefcase className="w-3 h-3 text-cyan-600" /> Application Intelligence & Learning
            </span>
          </div>
          <h2 className="text-2xl font-display font-bold text-slate-900">
            Application Tracker
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Track verified submissions, preserve historical score snapshots, and observe real hiring progression.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveView("list")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeView === "list" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              My Applications ({applications.length})
            </button>
            <button
              onClick={() => setActiveView("insights")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeView === "insights" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Outcome Insights
            </button>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Track Application</span>
          </button>
        </div>
      </div>

      {activeView === "list" ? (
        <>
          {/* SEARCH & FILTERS */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search company or role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-cyan-400 font-medium"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:outline-none"
              >
                <option value="ALL">All Outcomes</option>
                <option value="APPLIED">Applied</option>
                <option value="RECRUITER_SCREEN">Recruiter Screen</option>
                <option value="INTERVIEW">Interview</option>
                <option value="OFFER">Offer</option>
                <option value="HIRED">Hired</option>
                <option value="REJECTED">Rejected</option>
                <option value="WITHDRAWN">Withdrawn</option>
              </select>
            </div>
          </div>

          {/* APPLICATION CARDS */}
          {loading ? (
            <div className="p-16 bg-white border border-slate-200 rounded-3xl text-center space-y-3">
              <RefreshCw className="w-7 h-7 text-cyan-500 animate-spin mx-auto" />
              <p className="text-xs font-bold text-slate-600">Loading tracked applications...</p>
            </div>
          ) : filteredApplications.length === 0 ? (
            <div className="p-16 bg-white border border-slate-200 rounded-3xl text-center space-y-4">
              <div className="w-12 h-12 bg-cyan-50 text-cyan-600 rounded-2xl flex items-center justify-center mx-auto border border-cyan-100">
                <Briefcase className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-sm">No Applications Recorded Yet</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  When you submit a tailored resume to a company, record the application here to preserve your score snapshot and track milestones.
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 shadow-sm transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Track First Application</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredApplications.map((app) => (
                <div
                  key={app.applicationId}
                  className="bg-white border border-slate-200 hover:border-cyan-300 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all space-y-4"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${getStatusColor(app.outcome)}`}>
                        {app.outcome.replace("_", " ")}
                      </span>
                      <h3 className="font-display font-bold text-base text-slate-900 mt-2">
                        {app.roleTitle}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>{app.companyName}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleOpenUpdateModal(app)}
                      className="text-xs font-bold text-cyan-600 hover:text-cyan-700 bg-cyan-50 hover:bg-cyan-100 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 shrink-0"
                    >
                      <span>Update</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* IMMUTABLE POINT-IN-TIME SCORE SNAPSHOT */}
                  {app.scoreSnapshot && (
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Submitted Match</span>
                        <strong className="text-cyan-700 font-bold text-sm">
                          {app.scoreSnapshot.targetMatchScore}%
                        </strong>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">ATS Score</span>
                        <strong className="text-slate-800 font-bold text-sm">
                          {app.scoreSnapshot.atsScore}%
                        </strong>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      Applied: {app.appliedAt ? new Date(app.appliedAt).toLocaleDateString() : "Recent"}
                    </span>
                    <span className="truncate max-w-[150px]" title={app.resumeVersionName}>
                      {app.resumeVersionName || "Customized Draft"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* OUTCOME INSIGHTS & STATISTICAL PATTERNS VIEW */
        <div className="space-y-6">
          {/* STATUTORY DISCLAIMER CALLOUT */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 space-y-0.5">
              <strong className="font-bold block">Descriptive Outcome Observation Disclosures:</strong>
              <p>
                Outcome statistics describe observed application progression rates from verified historical records.
                They are non-causal associations and do NOT predict or guarantee hiring outcomes for any individual candidate.
              </p>
            </div>
          </div>

          {/* PERSONAL APPLICATION PROGRESSION */}
          {personalAnalytics && (
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-base font-display font-bold text-slate-900">
                    Personal Application History
                  </h3>
                  <p className="text-xs text-slate-500">
                    Based on {personalAnalytics.sampleSize} eligible submissions tracked in your workspace.
                  </p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${
                  personalAnalytics.evidenceLevel === "STRONG_EVIDENCE" ? "bg-emerald-100 text-emerald-800" :
                  personalAnalytics.evidenceLevel === "MODERATE_EVIDENCE" ? "bg-cyan-100 text-cyan-800" :
                  personalAnalytics.evidenceLevel === "LIMITED_EVIDENCE" ? "bg-amber-100 text-amber-800" :
                  "bg-slate-100 text-slate-600"
                }`}>
                  {personalAnalytics.evidenceLevel.replace("_EVIDENCE", "")}
                </span>
              </div>

              {personalAnalytics.sampleSize < 3 ? (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-1">
                  <p className="text-xs font-bold text-slate-700">Limited Personal Sample Size ({personalAnalytics.sampleSize})</p>
                  <p className="text-xs text-slate-500">Track more submissions to generate personal progression patterns.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Recruiter Screens</span>
                    <span className="text-xl font-bold font-display text-blue-700">
                      {personalAnalytics.recruiterScreenRate}%
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      {personalAnalytics.recruiterScreenCount} of {personalAnalytics.sampleSize}
                    </span>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Interviews</span>
                    <span className="text-xl font-bold font-display text-purple-700">
                      {personalAnalytics.interviewRate}%
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      {personalAnalytics.interviewCount} of {personalAnalytics.sampleSize}
                    </span>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Offers</span>
                    <span className="text-xl font-bold font-display text-emerald-700">
                      {personalAnalytics.offerRate}%
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      {personalAnalytics.offerCount} of {personalAnalytics.sampleSize}
                    </span>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Rejections</span>
                    <span className="text-xl font-bold font-display text-slate-700">
                      {personalAnalytics.rejectedRate}%
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      {personalAnalytics.rejectedCount} of {personalAnalytics.sampleSize}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AGGREGATE OBSERVED MARKET OUTCOMES */}
          {globalAnalytics && (
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-base font-display font-bold text-slate-900">
                    System-Wide Outcome Observations
                  </h3>
                  <p className="text-xs text-slate-500">
                    Aggregated across {globalAnalytics.sampleSize} eligible verified applications (Dataset {globalAnalytics.datasetVersion}).
                  </p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${
                  globalAnalytics.evidenceLevel === "STRONG_EVIDENCE" ? "bg-emerald-100 text-emerald-800" :
                  globalAnalytics.evidenceLevel === "MODERATE_EVIDENCE" ? "bg-cyan-100 text-cyan-800" :
                  globalAnalytics.evidenceLevel === "LIMITED_EVIDENCE" ? "bg-amber-100 text-amber-800" :
                  "bg-slate-100 text-slate-600"
                }`}>
                  {globalAnalytics.evidenceLevel.replace("_EVIDENCE", "")}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Recruiter Screen Rate</span>
                  <span className="text-xl font-bold font-display text-blue-700">
                    {globalAnalytics.recruiterScreenRate}%
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    {globalAnalytics.recruiterScreenCount} candidates
                  </span>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Interview Progression</span>
                  <span className="text-xl font-bold font-display text-purple-700">
                    {globalAnalytics.interviewRate}%
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    {globalAnalytics.interviewCount} candidates
                  </span>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Offer Rate</span>
                  <span className="text-xl font-bold font-display text-emerald-700">
                    {globalAnalytics.offerRate}%
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    {globalAnalytics.offerCount} candidates
                  </span>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Reported Rejections</span>
                  <span className="text-xl font-bold font-display text-slate-700">
                    {globalAnalytics.rejectedRate}%
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    {globalAnalytics.rejectedCount} candidates
                  </span>
                </div>
              </div>

              {/* CORRELATION ANALYSIS */}
              {globalAnalytics.correlations && globalAnalytics.correlations.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                  <span className="text-xs font-bold text-slate-700 block">Observed Score Associations:</span>
                  {globalAnalytics.correlations.map((corr, idx) => (
                    <div key={idx} className="p-3 bg-cyan-50/60 border border-cyan-100 rounded-xl text-xs text-cyan-900">
                      {corr.description}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CREATE APPLICATION MODAL */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="font-display font-bold text-lg text-slate-900">
                  Track New Job Application
                </h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {createError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <form onSubmit={handleCreateApplication} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Company</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Google, Microsoft, Startup XYZ"
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-cyan-400 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Role Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Software Engineer, Product Designer"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-cyan-400 font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Applied Date</label>
                    <input
                      type="date"
                      required
                      value={newAppliedDate}
                      onChange={(e) => setNewAppliedDate(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Resume Version</label>
                    <select
                      value={newResumeId}
                      onChange={(e) => setNewResumeId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-cyan-400 font-medium"
                    >
                      {resumes.map(r => (
                        <option key={r.id} value={r.id}>{r.fileName}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Job Reference (Optional)</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Applied via referral or career portal"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>Save Application</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* UPDATE STATUS & TIMELINE MODAL */}
      <AnimatePresence>
        {selectedAppForUpdate && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-display font-bold text-lg text-slate-900">
                    Update Outcome Status
                  </h3>
                  <span className="text-xs text-slate-500">
                    {selectedAppForUpdate.roleTitle} at {selectedAppForUpdate.companyName}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedAppForUpdate(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleUpdateStatus} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">New Outcome Milestone</label>
                  <select
                    value={updateOutcome}
                    onChange={(e) => setUpdateOutcome(e.target.value as ApplicationOutcome)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-cyan-400"
                  >
                    <option value="APPLIED">Applied (Initial Submission)</option>
                    <option value="RECRUITER_SCREEN">Recruiter Screen</option>
                    <option value="INTERVIEW">Interview</option>
                    <option value="TECHNICAL_INTERVIEW">Technical Interview</option>
                    <option value="FINAL_ROUND">Final Round</option>
                    <option value="OFFER">Offer Extended</option>
                    <option value="HIRED">Hired</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="WITHDRAWN">Application Withdrawn</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Milestone Date</label>
                    <input
                      type="date"
                      required
                      value={updateDate}
                      onChange={(e) => setUpdateDate(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Evidence Source</label>
                    <select
                      value={updateEvidenceSource}
                      onChange={(e) => setUpdateEvidenceSource(e.target.value as OutcomeEvidenceSource)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-cyan-400"
                    >
                      <option value="EMAIL">Email Notification</option>
                      <option value="RECRUITER_MESSAGE">Recruiter Message</option>
                      <option value="CAREER_PORTAL">Career Portal</option>
                      <option value="USER_ENTERED">User Entered</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Outcome Notes</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Completed initial 30-minute phone screen"
                    value={updateNotes}
                    onChange={(e) => setUpdateNotes(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>

                {/* HISTORICAL MILESTONE EVENTS TIMELINE */}
                {timelineEvents.length > 0 && (
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Milestone Timeline</span>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {timelineEvents.map((evt, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs text-slate-600 bg-white p-2 rounded-lg border border-slate-100">
                          <span className="font-semibold text-slate-800">{evt.newOutcome.replace("_", " ")}</span>
                          <span className="text-[10px] text-slate-400">{new Date(evt.eventDate).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedAppForUpdate(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdating}
                    className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    {isUpdating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    <span>Record Milestone</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
