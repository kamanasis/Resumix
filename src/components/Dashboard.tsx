import { useState, useEffect } from "react";
import { auth, db, firebaseConfig } from "../lib/firebase";
import { signOut } from "firebase/auth";
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy 
} from "firebase/firestore";
import { ResumeFile, ResumeAnalysis } from "../types";
import { 
  FileText, 
  Sparkles, 
  History, 
  LogOut, 
  Menu, 
  X, 
  TrendingUp, 
  Briefcase, 
  Users,
  Shield,
  Copy,
  Check,
  ExternalLink,
  GraduationCap
} from "lucide-react";
import ResumeUpload from "./ResumeUpload";
import ResumeList from "./ResumeList";
import TailorWizard from "./TailorWizard";
import AnalysisHistory from "./AnalysisHistory";
import FresherHub from "./FresherHub";

interface DashboardProps {
  user: any;
}

type Tab = "resumes" | "tailor" | "fresher" | "history";

export default function Dashboard({ user }: DashboardProps) {
  // Navigation & UI state
  const [activeTab, setActiveTab] = useState<Tab>("resumes");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [copiedRules, setCopiedRules] = useState(false);

  // Firestore Sync state
  const [resumes, setResumes] = useState<ResumeFile[]>([]);
  const [analyses, setAnalyses] = useState<ResumeAnalysis[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Sync uploaded resumes from Firestore
  useEffect(() => {
    const resumesQuery = query(
      collection(db, "users", user.uid, "resumes"),
      orderBy("uploadedAt", "desc")
    );

    const unsubscribe = onSnapshot(resumesQuery, (snapshot) => {
      const docs: ResumeFile[] = [];
      snapshot.forEach((doc) => {
        docs.push(doc.data() as ResumeFile);
      });
      setResumes(docs);
      setPermissionError(false);
      
      // Auto-select first resume if nothing is selected yet
      if (docs.length > 0 && !selectedResumeId) {
        setSelectedResumeId(docs[0].id);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error loading resumes:", error);
      if (error.code === "permission-denied" || error.message?.toLowerCase().includes("permission")) {
        setPermissionError(true);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user.uid]);

  // Sync resume analyses from Firestore
  useEffect(() => {
    const analysesQuery = query(
      collection(db, "users", user.uid, "analyses"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(analysesQuery, (snapshot) => {
      const docs: ResumeAnalysis[] = [];
      snapshot.forEach((doc) => {
        docs.push(doc.data() as ResumeAnalysis);
      });
      setAnalyses(docs);
      setPermissionError(false);
    }, (error) => {
      console.error("Error loading analyses:", error);
      if (error.code === "permission-denied" || error.message?.toLowerCase().includes("permission")) {
        setPermissionError(true);
      }
    });

    return () => unsubscribe();
  }, [user.uid]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  // Get active selected resume helper
  const getSelectedResume = () => {
    return resumes.find((r) => r.id === selectedResumeId) || null;
  };

  // Stats summaries
  const highestMatchScore = analyses.length > 0 
    ? Math.max(...analyses.map(a => a.matchingScore)) 
    : 0;

  const handleResumeSelect = (id: string) => {
    setSelectedResumeId(id);
    // Automatically switch tabs to let them customize once they select
    setActiveTab("tailor");
  };

  return (
    <div className="min-h-screen flex bg-[#F0F9FF] font-sans text-slate-800 overflow-hidden">
      
      {/* MOBILE HEADER BAR */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-[#020617] text-white z-40 px-4 flex items-center justify-between border-b border-cyan-500/20 shadow-md">
        <div className="flex items-center gap-2">
          <span className="font-display font-bold text-2xl tracking-tight text-white">Resumix<span className="text-cyan-400">.</span></span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 hover:bg-white/5 rounded-lg text-slate-300 transition-colors clickable-cursor"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* SIDEBAR (Responsive minimalist deep dark sidebar with neon accents) */}
      <aside
        className={`fixed lg:sticky top-0 bottom-0 left-0 w-64 bg-[#020617] text-white z-50 flex flex-col justify-between transition-transform duration-300 transform border-r border-cyan-500/20 shadow-2xl lg:relative lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Subtle top glow element from theme */}
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent pointer-events-none"></div>

        <div className="flex flex-col flex-1 p-6 pt-20 lg:pt-8 relative z-10">
          {/* Sidebar App Brand */}
          <div className="hidden lg:block mb-8 pb-4">
            <h1 className="text-3xl font-display font-bold text-white tracking-tight">
              Resumix<span className="text-cyan-400">.</span>
            </h1>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-2 flex-1">
            <button
              onClick={() => {
                setActiveTab("resumes");
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-300 clickable-cursor ${
                activeTab === "resumes"
                  ? "bg-cyan-500/10 text-cyan-400 border-l-2 border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.05)]"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <div className={`w-2 h-2 rounded-full transition-all duration-300 ${activeTab === "resumes" ? "bg-cyan-400 shadow-[0_0_8px_#22d3ee]" : "bg-transparent"}`}></div>
              <FileText className="w-4 h-4" />
              <span>Resume Vault</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("tailor");
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-300 clickable-cursor ${
                activeTab === "tailor"
                  ? "bg-cyan-500/10 text-cyan-400 border-l-2 border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.05)]"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <div className={`w-2 h-2 rounded-full transition-all duration-300 ${activeTab === "tailor" ? "bg-cyan-400 shadow-[0_0_8px_#22d3ee]" : "bg-transparent"}`}></div>
              <Sparkles className="w-4 h-4" />
              <span>Customization Tool</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("fresher");
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-300 clickable-cursor ${
                activeTab === "fresher"
                  ? "bg-cyan-500/10 text-cyan-400 border-l-2 border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.05)]"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <div className={`w-2 h-2 rounded-full transition-all duration-300 ${activeTab === "fresher" ? "bg-cyan-400 shadow-[0_0_8px_#22d3ee]" : "bg-transparent"}`}></div>
              <GraduationCap className="w-4 h-4" />
              <span>Fresher Hub</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("history");
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-300 clickable-cursor ${
                activeTab === "history"
                  ? "bg-cyan-500/10 text-cyan-400 border-l-2 border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.05)]"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <div className={`w-2 h-2 rounded-full transition-all duration-300 ${activeTab === "history" ? "bg-cyan-400 shadow-[0_0_8px_#22d3ee]" : "bg-transparent"}`}></div>
              <History className="w-4 h-4" />
              <span>Optimization History</span>
            </button>
          </nav>
        </div>

        {/* User Account Area / Footer */}
        <div className="p-6 border-t border-slate-800/50 bg-[#020617] relative z-10 flex flex-col gap-4">
          <div className="flex items-center gap-3 px-1">
            <div className="w-10 h-10 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center font-display font-bold text-sm shrink-0">
              {user.displayName ? user.displayName.substring(0, 2).toUpperCase() : "U"}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold text-white truncate">
                {user.displayName || "User"}
              </h4>
              <p className="text-xs text-cyan-600 truncate">
                {user.email}
              </p>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 text-slate-400 hover:text-red-400 transition-colors py-2 px-2 text-sm clickable-cursor"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col h-full bg-gradient-to-br from-white via-cyan-50 to-blue-50 overflow-y-auto pt-16 lg:pt-0">
        
        {/* TOP HEADER */}
        <header className="h-20 border-b border-cyan-100 px-6 lg:px-10 flex items-center justify-between bg-white/40 backdrop-blur-md shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Welcome back, {user.displayName?.split(" ")[0] || "Alex"} <span className="text-cyan-600">👋</span>
            </h2>
            <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">
              Standard Account Dashboard
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-slate-900">{user.displayName || "Alex Rivera"}</p>
              <p className="text-xs text-cyan-600">{user.email || "alex@resumix.io"}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-cyan-100 border border-cyan-200 flex items-center justify-center font-bold text-cyan-700 shadow-sm">
              {user.displayName ? user.displayName.substring(0, 2).toUpperCase() : "AR"}
            </div>
          </div>
        </header>

        {/* PAGE CONTENT WRAPPER */}
        <div className="p-6 lg:p-8 flex-1 flex flex-col gap-6 w-full max-w-7xl mx-auto">
          
          {/* Firestore Rules Configuration Banner */}
          {permissionError && (
            <div className="bg-amber-50/90 backdrop-blur-md border border-amber-200 rounded-3xl p-6 shadow-md animate-fadeIn flex flex-col md:flex-row gap-6 items-start">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
                <Shield className="w-6 h-6" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="text-slate-900 font-display font-bold text-base">
                    Firestore Database Rules Required
                  </h3>
                  <p className="text-xs text-slate-600 mt-1">
                    You have successfully connected your personal Firebase project (<code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-amber-800">{firebaseConfig.projectId}</code>). To allow Resumix to store your resumes and analyses, you must set up your Cloud Firestore security rules in your Firebase Console.
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="block text-slate-700 text-xs font-bold uppercase tracking-wider">
                    Copy and Paste these Security Rules:
                  </span>
                  <div className="relative">
                    <pre className="p-4 bg-slate-900 text-slate-100 font-mono text-xs rounded-2xl overflow-x-auto border border-slate-800 max-h-48 select-text">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}`}
                    </pre>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}`);
                        setCopiedRules(true);
                        setTimeout(() => setCopiedRules(false), 2000);
                      }}
                      className="absolute top-3 right-3 p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all border border-slate-700 shadow-sm clickable-cursor flex items-center gap-1.5 text-xs font-bold"
                    >
                      {copiedRules ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Rules</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <a
                    href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/rules`}
                    target="_blank"
                    referrerPolicy="no-referrer"
                    className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-sm clickable-cursor"
                  >
                    <span>Open Firebase Rules Console</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl transition-all clickable-cursor"
                  >
                    Refresh Dashboard
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Quick Dashboard Overview Row - Minimalist Styled glass cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/70 backdrop-blur-xl border border-white rounded-3xl p-5 shadow-sm hover:border-cyan-400 transition-all flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-cyan-100 border border-cyan-200 text-cyan-600 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Resumes</span>
                <span className="text-lg font-bold font-display text-slate-800">{resumes.length}</span>
              </div>
            </div>

            <div className="bg-white/70 backdrop-blur-xl border border-white rounded-3xl p-5 shadow-sm hover:border-cyan-400 transition-all flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-cyan-100 border border-cyan-200 text-cyan-600 flex items-center justify-center shrink-0">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Jobs Tailored</span>
                <span className="text-lg font-bold font-display text-slate-800">{analyses.length}</span>
              </div>
            </div>

            <div className="bg-white/70 backdrop-blur-xl border border-white rounded-3xl p-5 shadow-sm hover:border-cyan-400 transition-all flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-cyan-100 border border-cyan-200 text-cyan-600 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Highest Match</span>
                <span className="text-lg font-bold font-display text-slate-800">
                  {highestMatchScore > 0 ? `${highestMatchScore}%` : "—"}
                </span>
              </div>
            </div>

            <div className="bg-white/70 backdrop-blur-xl border border-white rounded-3xl p-5 shadow-sm hover:border-cyan-400 transition-all flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-cyan-100 border border-cyan-200 text-cyan-600 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Selected File</span>
                <span className="text-xs font-semibold text-slate-800 truncate block">
                  {getSelectedResume() ? getSelectedResume()?.name : "None selected"}
                </span>
              </div>
            </div>
          </div>

          {/* Dynamic Tab Views - Glassmorphic Content Container */}
          <div className="bg-white/70 backdrop-blur-xl border border-white rounded-3xl p-6 lg:p-8 shadow-sm flex-1 flex flex-col min-h-[460px]">
            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-10 h-10 border-4 border-cyan-100 border-t-cyan-600 rounded-full animate-spin mb-3" />
                <p className="text-slate-500 text-sm font-medium">Synchronizing workspace files...</p>
              </div>
            ) : activeTab === "resumes" ? (
              <div className="space-y-6 flex-1 flex flex-col">
                <div>
                  <h2 className="text-slate-800 font-display font-bold text-xl mb-1">
                    Resume Vault
                  </h2>
                  <p className="text-slate-500 text-xs">
                    Upload, monitor, and configure your curriculum vitae copies
                  </p>
                </div>

                {/* Upload component */}
                <ResumeUpload 
                  userId={user.uid} 
                  onUploadSuccess={() => {}} 
                />

                {/* List component */}
                <ResumeList
                  resumes={resumes}
                  selectedResumeId={selectedResumeId}
                  onSelectResume={handleResumeSelect}
                  userId={user.uid}
                  onRefresh={() => {}}
                />
              </div>
            ) : activeTab === "tailor" ? (
              <TailorWizard
                userId={user.uid}
                selectedResume={getSelectedResume()}
                onAnalysisCreated={() => {}}
              />
            ) : activeTab === "fresher" ? (
              <FresherHub
                userId={user.uid}
                onResumeCreated={() => setActiveTab("resumes")}
              />
            ) : (
              <div className="space-y-4 flex-1 flex flex-col">
                <div>
                  <h2 className="text-slate-800 font-display font-bold text-xl mb-1">
                    Tailored Optimization History
                  </h2>
                  <p className="text-slate-500 text-xs">
                    Review and extract previously aligned ATS resume configurations
                  </p>
                </div>

                <AnalysisHistory
                  analyses={analyses}
                  userId={user.uid}
                  onRefresh={() => {}}
                />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
