import { Trash2, FileText, Calendar, HardDrive, CheckCircle2 } from "lucide-react";
import { ResumeFile } from "../types";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useState } from "react";

interface ResumeListProps {
  resumes: ResumeFile[];
  selectedResumeId: string | null;
  onSelectResume: (resumeId: string) => void;
  userId: string;
  onRefresh: () => void;
}

export default function ResumeList({
  resumes,
  selectedResumeId,
  onSelectResume,
  userId,
  onRefresh,
}: ResumeListProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Format date
  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Unknown Date";
    }
  };

  // Handle file delete
  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const docRef = doc(db, "users", userId, "resumes", id);
      await deleteDoc(docRef);
      onRefresh();
      setDeleteId(null);
    } catch (err) {
      console.error("Error deleting resume:", err);
    } finally {
      setDeleting(false);
    }
  };

  if (resumes.length === 0) {
    return (
      <div className="text-center py-10 px-4 bg-white/40 backdrop-blur-md border border-white rounded-3xl">
        <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h4 className="text-slate-700 font-display font-bold text-sm mb-1">
          No resumes uploaded yet
        </h4>
        <p className="text-slate-500 text-xs max-w-xs mx-auto">
          Please upload your current resume in the section above to begin tailoring it for jobs.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-slate-800 font-display font-semibold text-xs uppercase tracking-wider">
          Your Resumes ({resumes.length})
        </h3>
        <span className="text-slate-400 text-xs">Select a file to tailor with AI</span>
      </div>

      <div className="grid gap-3">
        {resumes.map((resume) => {
          const isSelected = selectedResumeId === resume.id;
          return (
            <div
              key={resume.id}
              onClick={() => onSelectResume(resume.id)}
              className={`p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between group cursor-pointer ${
                isSelected
                  ? "border-cyan-400 bg-white shadow-[0_4px_20px_rgba(6,182,212,0.1)] scale-[1.01]"
                  : "border-slate-100 bg-white/50 backdrop-blur-sm hover:border-cyan-200 hover:bg-white"
              }`}
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 ${
                    isSelected ? "bg-cyan-100 text-cyan-600 border border-cyan-200" : "bg-slate-50 text-slate-400 border border-slate-100"
                  }`}
                >
                  {isSelected ? (
                    <CheckCircle2 className="w-6 h-6" />
                  ) : (
                    <FileText className="w-6 h-6" />
                  )}
                </div>

                <div className="min-w-0">
                  <h4
                    className={`text-sm font-semibold truncate ${
                      isSelected ? "text-slate-900" : "text-slate-700"
                    }`}
                  >
                    {resume.name}
                  </h4>
                  <div className="flex items-center gap-3 mt-1 text-slate-400 text-xs font-medium">
                    <span className="flex items-center gap-1 font-mono">
                      <HardDrive className="w-3.5 h-3.5" />
                      {formatSize(resume.size)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(resume.uploadedAt)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions Area */}
              <div className="flex items-center gap-1.5 ml-4">
                {deleteId === resume.id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      disabled={deleting}
                      onClick={() => handleDelete(resume.id)}
                      className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-all clickable-cursor"
                    >
                      {deleting ? "..." : "Delete"}
                    </button>
                    <button
                      disabled={deleting}
                      onClick={() => setDeleteId(null)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-all clickable-cursor"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteId(resume.id);
                    }}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 clickable-cursor border border-transparent hover:border-red-100"
                    title="Delete resume file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
