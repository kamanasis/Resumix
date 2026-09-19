import React, { useState, useRef } from "react";
import { 
  UploadCloud, FileText, CheckCircle, AlertCircle, Edit, Save, 
  ClipboardPaste, ShieldCheck, AlertTriangle, Layers, Award
} from "lucide-react";
import { collection, doc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { validateExtraction } from "../lib/extractionValidator";
import { extractTextFromDocx } from "../lib/docxExtractor";
import { extractTextFromPdf } from "../lib/pdfExtractor";
import { ExtractionQuality, ExtractionStatus } from "../types";

interface ResumeUploadProps {
  userId: string;
  onUploadSuccess: () => void;
}

export type UploadProcessingStep = 
  | "IDLE" 
  | "UPLOADING" 
  | "READING" 
  | "EXTRACTING" 
  | "UNDERSTANDING" 
  | "ANALYZING" 
  | "RECOMMENDING" 
  | "READY" 
  | "ERROR";

export default function ResumeUpload({ userId, onUploadSuccess }: ResumeUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [processingStep, setProcessingStep] = useState<UploadProcessingStep>("IDLE");
  const [activeFileInfo, setActiveFileInfo] = useState<{ name: string; size: number; type: string } | null>(null);
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

  // Format bytes helper
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Parse file to text content
  const processFile = async (file: File) => {
    // 1. Immediately register file info
    setActiveFileInfo({
      name: file.name,
      size: file.size,
      type: file.type || (file.name.endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf")
    });
    setLoading(true);
    setProcessingStep("UPLOADING");
    setError("");
    setSuccess("");

    try {
      // Step 2: Reading document
      setProcessingStep("READING");
      await new Promise(r => setTimeout(r, 100)); // Small tick to allow UI to render status
      
      let textContent = "";

      if (file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
        setProcessingStep("EXTRACTING");
        textContent = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve((e.target?.result as string) || "");
          reader.onerror = () => reject(new Error("Failed to read text file."));
          reader.readAsText(file);
        });
      } else if (file.name.toLowerCase().endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        setProcessingStep("EXTRACTING");
        // Genuine OpenXML DOCX parsing via JSZip
        const buffer = await file.arrayBuffer();
        const extraction = await extractTextFromDocx(buffer);
        if (!extraction.success) {
          throw new Error(extraction.error || "Failed to extract text from DOCX file. File may be corrupted or unreadable.");
        }
        textContent = extraction.text;
      } else if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
        setProcessingStep("EXTRACTING");
        const buffer = await file.arrayBuffer();
        const pdfResult = await extractTextFromPdf(buffer);
        if (!pdfResult.success) {
          if (pdfResult.isScanned) {
            throw new Error("This PDF appears to be a scanned image with no selectable text layer. Please upload a text-based document or paste your resume text.");
          }
          throw new Error(pdfResult.error || "Failed to extract selectable text from PDF document.");
        }
        textContent = pdfResult.text;
      } else {
        // Binary files with possible archive or text streams
        setProcessingStep("EXTRACTING");
        const buffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(buffer);

        // Check if file is secretly a DOCX archive with wrong extension
        if (uint8.length >= 4 && uint8[0] === 0x50 && uint8[1] === 0x4B && uint8[2] === 0x03 && uint8[3] === 0x04) {
          const extraction = await extractTextFromDocx(buffer);
          if (extraction.success && extraction.text.trim().length > 0) {
            textContent = extraction.text;
          }
        }

        // Try PDF extractor if starts with %PDF-
        if (!textContent && uint8.length >= 5 && String.fromCharCode(...uint8.slice(0, 5)) === "%PDF-") {
          const pdfResult = await extractTextFromPdf(buffer);
          if (pdfResult.success && pdfResult.text.trim().length > 0) {
            textContent = pdfResult.text;
          }
        }

        if (!textContent) {
          throw new Error("Unsupported document format. Please upload a PDF, DOCX, or TXT file.");
        }
      }

      // Step 3: Understanding resume structure & validating extraction
      setProcessingStep("UNDERSTANDING");
      await new Promise(r => setTimeout(r, 120));

      const { status, quality, userMessage } = validateExtraction(textContent, {
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream"
      });

      // Step 4: Analyzing & Recommending
      if (status === "EXTRACTION_SUCCESS" || status === "EXTRACTION_PARTIAL") {
        setProcessingStep("ANALYZING");
        await new Promise(r => setTimeout(r, 120));
        setProcessingStep("RECOMMENDING");
        await new Promise(r => setTimeout(r, 100));
        setProcessingStep("READY");
      } else {
        setProcessingStep("ERROR");
      }

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
      setProcessingStep("ERROR");
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
      {/* File Information Strip upon Drop/Selection */}
      {activeFileInfo && (
        <div className="p-3.5 bg-slate-900 text-white rounded-2xl border border-slate-700 flex items-center justify-between gap-3 text-xs animate-fadeIn">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-7 h-7 bg-cyan-500/20 text-cyan-400 rounded-lg flex items-center justify-center shrink-0 border border-cyan-500/30">
              <FileText className="w-4 h-4" />
            </div>
            <div className="truncate">
              <span className="font-bold text-white block truncate">{activeFileInfo.name}</span>
              <span className="text-[10px] text-slate-400 block">
                {activeFileInfo.type.includes("pdf") ? "Portable Document (PDF)" : activeFileInfo.type.includes("word") || activeFileInfo.name.endsWith(".docx") ? "Word Document (DOCX)" : "Plain Text Document"} • {formatFileSize(activeFileInfo.size)}
              </span>
            </div>
          </div>
          {loading && (
            <span className="px-2.5 py-1 bg-cyan-500/20 text-cyan-300 text-[10px] font-bold uppercase rounded-full border border-cyan-400/30 shrink-0 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              Processing
            </span>
          )}
        </div>
      )}

      {/* Extraction Failure / Scanned PDF Fail-Closed Card */}
      {error && (
        <div className="p-5 bg-rose-50/90 backdrop-blur-md border border-rose-200 rounded-3xl text-rose-900 text-xs space-y-3 animate-fadeIn">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center shrink-0 border border-rose-200">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1 space-y-1">
              <h4 className="font-display font-bold text-sm text-rose-950">
                We couldn't reliably read this resume.
              </h4>
              <p className="text-rose-800 leading-relaxed text-xs">
                {error}
              </p>
            </div>
          </div>
          <div className="pt-2 border-t border-rose-200/80 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setError("");
                setParsedFile(null);
                setActiveFileInfo(null);
                setProcessingStep("IDLE");
                fileInputRef.current?.click();
              }}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Re-upload Document
            </button>
            <button
              type="button"
              onClick={() => {
                setError("");
                setParsedFile(null);
                setActiveFileInfo(null);
                setProcessingStep("IDLE");
                setIsManualPasteOpen(true);
              }}
              className="px-4 py-2 bg-white hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Paste Resume Text
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
