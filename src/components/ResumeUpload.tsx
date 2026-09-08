import React, { useState, useRef } from "react";
import { 
  UploadCloud, FileText, CheckCircle, AlertCircle, Edit, Save, 
  ClipboardPaste, ShieldCheck, AlertTriangle, Layers, Award
} from "lucide-react";
import { collection, doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { validateExtraction } from "../lib/extractionValidator";
import { ExtractionQuality, ExtractionStatus } from "../types";

interface ResumeUploadProps {
  userId: string;
  onUploadSuccess: () => void;
}

export default function ResumeUpload({ userId, onUploadSuccess }: ResumeUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isManualPasteOpen, setIsManualPasteOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualContent, setManualContent] = useState("");
  
  // States for verification modal/view
  const [parsedFile, setParsedFile] = useState<{ 
    name: string; 
    size: number; 
    type: string; 
    content: string;
    status: ExtractionStatus;
    quality: ExtractionQuality;
  } | null>(null);
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
              .replace(/\/[\w]+/g, "")
              .replace(/\[\d+\]/g, "")
              .replace(/\s+/g, " ")
              .trim();

            resolve(cleaned);
          };
          reader.readAsArrayBuffer(file);
        });
      }

      const { status, quality, userMessage } = validateExtraction(textContent, {
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream"
      });

      setParsedFile({
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        content: textContent || "",
        status,
        quality
      });
      setEditContent(textContent || "");

      if (status === "EXTRACTION_FAILED" || status === "EXTRACTION_PARTIAL") {
        setError(userMessage);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to parse file. You can paste the resume text manually.");
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
    
    // Re-evaluate edited content
    const isEdited = editContent !== parsedFile.content;
    const { status, quality, userMessage } = validateExtraction(editContent, {
      name: parsedFile.name,
      size: editContent.length,
      type: parsedFile.type
    });

    if (status === "EXTRACTION_FAILED") {
      setError(userMessage || "Resume content is invalid or too short.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const resumeId = doc(collection(db, "users", userId, "resumes")).id;
      const resumeDocRef = doc(db, "users", userId, "resumes", resumeId);

      await setDoc(resumeDocRef, {
        id: resumeId,
        userId: userId,
        name: parsedFile.name || "My_Resume.txt",
        size: editContent.length,
        type: parsedFile.type || "text/plain",
        uploadedAt: new Date().toISOString(),
        content: editContent.trim(),
        extractionStatus: status,
        extractionQuality: quality,
        originalFileMeta: {
          name: parsedFile.name,
          size: parsedFile.size,
          type: parsedFile.type
        },
        isUserEdited: isEdited
      });

      setSuccess(`Resume "${parsedFile.name}" verified and saved to vault!`);
      setParsedFile(null);
      setEditContent("");
      onUploadSuccess();
      
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      console.error(err);
      setError("Failed to save resume document to database.");
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = manualTitle.trim() || "Manual_Resume.txt";
    const { status, quality, userMessage } = validateExtraction(manualContent, {
      name: title,
      size: manualContent.length,
      type: "text/plain"
    });

    if (status === "EXTRACTION_FAILED") {
      setError(userMessage || "Please provide valid resume text.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const resumeId = doc(collection(db, "users", userId, "resumes")).id;
      const resumeDocRef = doc(db, "users", userId, "resumes", resumeId);

      await setDoc(resumeDocRef, {
        id: resumeId,
        userId: userId,
        name: title.endsWith(".txt") || title.endsWith(".md") ? title : `${title}.txt`,
        size: manualContent.length,
        type: "text/plain",
        uploadedAt: new Date().toISOString(),
        content: manualContent.trim(),
        extractionStatus: "EXTRACTION_SUCCESS",
        extractionQuality: quality,
        originalFileMeta: {
          name: title,
          size: manualContent.length,
          type: "text/plain"
        },
        isUserEdited: false
      });

      setSuccess(`Resume "${title}" successfully created and saved!`);
      setManualTitle("");
      setManualContent("");
      setIsManualPasteOpen(false);
      onUploadSuccess();
    } catch (err: any) {
      console.error(err);
      setError("Failed to save resume to database.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Notifications */}
      {error && (
        <div className="p-4 bg-amber-50/90 backdrop-blur-md border border-amber-200 rounded-2xl text-amber-900 text-sm flex items-start gap-3 animate-fadeIn">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold block">Extraction Notice</span>
            <span className="text-xs text-amber-800">{error}</span>
          </div>
          <button
            onClick={() => setError("")}
            className="text-amber-600 hover:text-amber-800 text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50/90 backdrop-blur-md border border-emerald-200 rounded-2xl text-emerald-800 text-sm flex items-center gap-2 animate-fadeIn">
          <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Main Mode Toggle: Drag & Drop vs Direct Text Paste */}
      {!parsedFile && !isManualPasteOpen && (
        <div className="space-y-4">
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`bg-white/70 backdrop-blur-xl border rounded-3xl p-8 text-center cursor-pointer hover:border-cyan-400 transition-all duration-300 flex flex-col items-center justify-center min-h-[200px] group relative ${
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
            <div className="w-16 h-16 bg-cyan-100 rounded-2xl flex items-center justify-center mb-4 border border-cyan-200 group-hover:scale-105 transition-transform duration-300 shadow-[0_4px_12px_rgba(6,182,212,0.1)]">
              <UploadCloud className="w-8 h-8 text-cyan-600" />
            </div>
            <h3 className="text-slate-800 font-display font-bold text-base mb-1">
              Upload Resume File
            </h3>
            <p className="text-slate-500 text-xs mb-4 max-w-sm">
              Drag and drop your PDF, TXT, or MD resume to extract contents
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                className="bg-cyan-500 hover:bg-cyan-600 text-white font-semibold py-2.5 px-6 rounded-xl shadow-[0_4px_14px_rgba(6,182,212,0.25)] transition-all text-xs clickable-cursor"
              >
                Browse Files
              </button>
            </div>
            {loading && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center z-10">
                <div className="w-8 h-8 border-3 border-cyan-100 border-t-cyan-600 rounded-full animate-spin mb-2" />
                <p className="text-cyan-700 text-xs font-semibold">Extracting & validating resume content...</p>
              </div>
            )}
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setIsManualPasteOpen(true)}
              className="text-xs text-slate-500 hover:text-cyan-600 font-medium flex items-center gap-1.5 py-1 px-3 rounded-lg hover:bg-white transition-all clickable-cursor"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>Or paste resume text manually</span>
            </button>
          </div>
        </div>
      )}

      {/* Manual Paste Form */}
      {isManualPasteOpen && !parsedFile && (
        <form onSubmit={handleManualSubmit} className="bg-white/70 backdrop-blur-xl border border-white rounded-3xl p-6 shadow-sm animate-fadeIn space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-cyan-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-cyan-100 border border-cyan-200 rounded-xl flex items-center justify-center text-cyan-600">
                <ClipboardPaste className="w-4 h-4" />
              </div>
              <h4 className="text-slate-800 font-display font-semibold text-sm">
                Paste Plain Text Resume
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setIsManualPasteOpen(false)}
              className="px-3 py-1.5 text-slate-500 hover:text-slate-700 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Back to Upload
            </button>
          </div>

          <div>
            <label className="block text-slate-600 text-xs font-semibold mb-1">
              Resume Label / Title
            </label>
            <input
              type="text"
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder="e.g. Senior_FullStack_2026.txt"
              className="w-full px-3.5 py-2 bg-white/70 border border-slate-200 rounded-xl text-slate-800 text-xs focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
            />
          </div>

          <div>
            <label className="block text-slate-600 text-xs font-semibold mb-1">
              Resume Text Content (Raw Text / Markdown)
            </label>
            <textarea
              required
              rows={8}
              value={manualContent}
              onChange={(e) => setManualContent(e.target.value)}
              placeholder="Paste your full resume text including Summary, Skills, Work Experience, Education..."
              className="w-full p-3.5 bg-white/70 border border-slate-200 rounded-2xl text-slate-700 text-xs font-mono focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 resize-y"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setManualContent("");
                setIsManualPasteOpen(false);
              }}
              className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 text-xs font-semibold rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || manualContent.trim().length < 30}
              className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Resume</span>
            </button>
          </div>
        </form>
      )}

      {/* Verification & Text Customizer View */}
      {parsedFile && (
        <div className="bg-white/70 backdrop-blur-xl border border-white rounded-3xl p-6 shadow-sm animate-fadeIn space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-cyan-100">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-cyan-100 border border-cyan-200 rounded-xl flex items-center justify-center text-cyan-600 shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-slate-800 font-display font-semibold text-sm">
                    Review Extracted Resume
                  </h4>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    parsedFile.status === "EXTRACTION_SUCCESS"
                      ? "bg-emerald-100 text-emerald-800"
                      : parsedFile.status === "EXTRACTION_PARTIAL"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-red-100 text-red-800"
                  }`}>
                    {parsedFile.status.replace("EXTRACTION_", "")}
                  </span>
                </div>
                <p className="text-slate-500 text-xs truncate max-w-xs sm:max-w-md">
                  File: {parsedFile.name} ({(parsedFile.size / 1024).toFixed(1)} KB)
                </p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => {
                  setParsedFile(null);
                  setError("");
                }}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 text-xs font-semibold rounded-xl transition-colors clickable-cursor border border-slate-200/50"
              >
                Upload Another File
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
                    <span>Confirm & Save to Vault</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quality Audit Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Characters</span>
              <span className="font-mono font-bold text-slate-800">{editContent.length}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Words</span>
              <span className="font-mono font-bold text-slate-800">
                {editContent.trim().split(/\s+/).filter(Boolean).length}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Quality Score</span>
              <span className="font-bold text-cyan-700">
                {parsedFile.quality.qualityScore}/100
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Sections Found</span>
              <span className="font-semibold text-slate-700 truncate block">
                {parsedFile.quality.detectedSections.length > 0 
                  ? parsedFile.quality.detectedSections.join(", ") 
                  : "None detected"}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 text-xs flex items-center gap-1">
                <Edit className="w-3.5 h-3.5 text-slate-400" />
                Edit text directly below if any section was missed during extraction.
              </span>
            </div>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={10}
              className="w-full p-4 bg-white/50 backdrop-blur-sm border border-slate-200 rounded-2xl text-slate-700 text-xs font-mono focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all resize-y leading-relaxed"
              placeholder="Paste or edit resume text contents..."
            />
          </div>
        </div>
      )}
    </div>
  );
}
