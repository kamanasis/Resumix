import React, { useState, useRef } from "react";
import { UploadCloud, FileText, CheckCircle, AlertCircle, Edit, Save } from "lucide-react";
import { collection, doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

interface ResumeUploadProps {
  userId: string;
  onUploadSuccess: () => void;
}

export default function ResumeUpload({ userId, onUploadSuccess }: ResumeUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // States for verification modal/view
  const [parsedFile, setParsedFile] = useState<{ name: string; size: number; type: string; content: string } | null>(null);
  const [editContent, setEditContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse file to text content
  const processFile = async (file: File) => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      let textContent = "";

      if (file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
        textContent = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve((e.target?.result as string) || "");
          reader.onerror = () => reject(new Error("Failed to read text file."));
          reader.readAsText(file);
        });
      } else {
        // Binary files (PDF, DOC, DOCX, etc.)
        // Extract ASCII printable characters dynamically
        textContent = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("Failed to read binary file."));
          reader.onload = (e) => {
            const buffer = e.target?.result as ArrayBuffer;
            if (!buffer) {
              resolve("");
              return;
            }
            const uint8 = new Uint8Array(buffer);
            let extracted = "";
            let chunk = "";
            for (let i = 0; i < uint8.length; i++) {
              const char = uint8[i];
              // Keep printable ASCII + whitespace
              if ((char >= 32 && char <= 126) || char === 10 || char === 13 || char === 9) {
                chunk += String.fromCharCode(char);
              } else {
                if (chunk.trim().length > 2) {
                  extracted += chunk + " ";
                }
                chunk = "";
              }
            }
            if (chunk.trim().length > 2) {
              extracted += chunk;
            }

            // Clean up PDF markers/clutter
            const cleaned = extracted
              .replace(/\/[\w]+/g, "") // remove slash tags
              .replace(/\[\d+\]/g, "") // remove spacing arrays
              .replace(/\s+/g, " ") // normalize whitespace
              .trim();

            resolve(cleaned);
          };
          reader.readAsArrayBuffer(file);
        });
      }

      if (!textContent || textContent.trim().length < 20) {
        throw new Error(
          "We couldn't extract sufficient text from this file. It might be empty or scanned. Please review/paste your resume text manually."
        );
      }

      // Open preview editor so users can adjust/verify parsed contents
      setParsedFile({
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        content: textContent,
      });
      setEditContent(textContent);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to parse file.");
    } finally {
      setLoading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const handleSaveToFirestore = async () => {
    if (!parsedFile) return;
    setLoading(true);
    setError("");

    try {
      const resumeId = doc(collection(db, "users", userId, "resumes")).id;
      const resumeDocRef = doc(db, "users", userId, "resumes", resumeId);

      await setDoc(resumeDocRef, {
        id: resumeId,
        userId: userId,
        name: parsedFile.name,
        size: parsedFile.size,
        type: parsedFile.type,
        uploadedAt: new Date().toISOString(),
        content: editContent,
      });

      setSuccess(`Resume "${parsedFile.name}" uploaded and parsed successfully!`);
      setParsedFile(null);
      onUploadSuccess();
      
      // Clear input
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      console.error(err);
      setError("Failed to save resume document to database.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      {/* Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-50/70 backdrop-blur-md border border-red-200 rounded-2xl text-red-700 text-sm flex items-center gap-2 animate-fadeIn">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-emerald-50/70 backdrop-blur-md border border-emerald-200 rounded-2xl text-emerald-800 text-sm flex items-center gap-2 animate-fadeIn">
          <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Main Drag & Drop Zone */}
      {!parsedFile && (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`bg-white/70 backdrop-blur-xl border border-white rounded-3xl p-8 shadow-sm text-center cursor-pointer hover:border-cyan-400 transition-all duration-300 flex flex-col items-center justify-center min-h-[220px] group relative ${
            dragActive
              ? "border-cyan-400 bg-cyan-50/40 shadow-[0_0_25px_rgba(6,182,212,0.15)]"
              : "border-slate-200"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.txt,.md,.docx,.doc"
            onChange={handleChange}
          />
          <div className="w-20 h-20 bg-cyan-100 rounded-2xl flex items-center justify-center mb-6 border border-cyan-200 group-hover:scale-105 transition-transform duration-300 shadow-[0_4px_12px_rgba(6,182,212,0.1)]">
            <UploadCloud className="w-10 h-10 text-cyan-600" />
          </div>
          <h3 className="text-slate-800 font-display font-bold text-lg mb-1">
            Upload Resume
          </h3>
          <p className="text-slate-500 text-sm mb-4 max-w-sm">
            Drag and drop your PDF or DOCX file to start AI tailoring
          </p>
          <button
            type="button"
            className="bg-cyan-500 hover:bg-cyan-600 text-white font-semibold py-3 px-8 rounded-xl shadow-[0_4px_20px_rgba(6,182,212,0.3)] transition-all clickable-cursor"
          >
            Browse Files
          </button>
          {loading && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center z-10">
              <div className="w-10 h-10 border-4 border-cyan-100 border-t-cyan-600 rounded-full animate-spin mb-2" />
              <p className="text-cyan-700 text-sm font-medium">Extracting resume content...</p>
            </div>
          )}
        </div>
      )}

      {/* Verification & Text Customizer View */}
      {parsedFile && (
        <div className="bg-white/70 backdrop-blur-xl border border-white rounded-3xl p-6 shadow-sm animate-fadeIn">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-cyan-100">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-cyan-100 border border-cyan-200 rounded-xl flex items-center justify-center text-cyan-600 shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-slate-800 font-display font-semibold text-sm">
                  Verify Extracted Text
                </h4>
                <p className="text-slate-500 text-xs truncate max-w-xs sm:max-w-md">
                  File: {parsedFile.name} ({(parsedFile.size / 1024).toFixed(1)} KB)
                </p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setParsedFile(null)}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 text-xs font-semibold rounded-xl transition-colors clickable-cursor border border-slate-200/50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveToFirestore}
                disabled={loading}
                className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all shadow-[0_4px_12px_rgba(6,182,212,0.2)] hover:shadow-[0_4px_20px_rgba(6,182,212,0.3)] clickable-cursor"
              >
                {loading ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Upload Resume</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 text-xs flex items-center gap-1">
                <Edit className="w-3.5 h-3.5 text-slate-400" />
                Review and make corrections below if needed.
              </span>
              <span className="text-slate-400 text-xs font-mono">
                {editContent.length} chars
              </span>
            </div>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={10}
              className="w-full p-4 bg-white/50 backdrop-blur-sm border border-slate-200 rounded-2xl text-slate-700 text-sm font-sans focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all resize-y"
              placeholder="Resume text contents..."
            />
          </div>
        </div>
      )}
    </div>
  );
}
