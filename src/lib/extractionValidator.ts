// Deterministic Resume Extraction & Anomaly Detection Validator
import { ExtractionQuality, ExtractionStatus } from "../types";

const STANDARD_SECTION_HEADERS = [
  { name: "Contact", regex: /(?:email|phone|mobile|address|linkedin|github|portfolio|contact)/i },
  { name: "Summary", regex: /(?:summary|objective|professional summary|profile|about me)/i },
  { name: "Skills", regex: /(?:skills|technical skills|technologies|competencies|core skills|tools)/i },
  { name: "Experience", regex: /(?:experience|work experience|employment|work history|professional experience)/i },
  { name: "Education", regex: /(?:education|academic background|qualifications|university|degrees)/i },
  { name: "Projects", regex: /(?:projects|personal projects|key projects|academic projects)/i },
  { name: "Certifications", regex: /(?:certifications|certificates|licenses|credentials)/i },
  { name: "Achievements", regex: /(?:achievements|awards|honors|accomplishments)/i },
];

export interface FileMetadataInput {
  name?: string;
  size?: number;
  type?: string;
}

export function validateExtraction(
  text: string,
  fileMeta?: FileMetadataInput
): {
  status: ExtractionStatus;
  quality: ExtractionQuality;
  userMessage: string;
} {
  const warnings: string[] = [];
  const detectedSections: string[] = [];

  const raw = text || "";
  const trimmed = raw.trim();
  const charCount = trimmed.length;
  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const fileSize = fileMeta?.size || 0;
  const fileName = fileMeta?.name || "resume";

  let isScanned = false;
  let isCorrupted = false;

  // 1. Check for completely empty extraction
  if (charCount === 0) {
    return {
      status: "EXTRACTION_FAILED",
      quality: {
        charCount: 0,
        wordCount: 0,
        qualityScore: 0,
        isScanned: fileSize > 20000,
        isCorrupted: false,
        detectedSections: [],
        warnings: ["No text could be extracted from this document."],
      },
      userMessage: fileSize > 20000
        ? "This file appears to be a scanned image-based PDF with no selectable text layer. Please upload a text-based document or paste your resume text."
        : "The uploaded file is empty. Please upload a valid resume.",
    };
  }

  // 2. Scanned PDF Detection (High file size but tiny character / word count)
  if (fileSize > 40000 && wordCount < 25) {
    isScanned = true;
    warnings.push(
      `File size is ${(fileSize / 1024).toFixed(0)}KB, but only ${wordCount} words were extracted. The document is likely an image scan without an OCR text layer.`
    );
  }

  // 3. Binary Garbage & Non-Printable Character Analysis
  const printableMatches = trimmed.match(/[\x20-\x7E\r\n\t]/g) || [];
  const printableRatio = printableMatches.length / charCount;
  const alphaNumericMatches = trimmed.match(/[a-zA-Z0-9]/g) || [];
  const alphaRatio = alphaNumericMatches.length / charCount;

  if (printableRatio < 0.85 || alphaRatio < 0.40) {
    isCorrupted = true;
    warnings.push("Extracted content contains a high percentage of non-text binary artifacts.");
  }

  // 4. Repeated Character / Infinite Loop Glitch Detection
  if (/(.)\1{20,}/.test(trimmed)) {
    isCorrupted = true;
    warnings.push("Document contains repeated character sequences indicative of an extraction decoder error.");
  }

  // 5. Section Header Detection
  for (const sec of STANDARD_SECTION_HEADERS) {
    if (sec.regex.test(trimmed)) {
      detectedSections.push(sec.name);
    }
  }

  // 6. Multi-Column Scrambling Anomaly Check
  const lineCount = trimmed.split("\n").filter(l => l.trim().length > 0).length;
  const avgWordsPerLine = lineCount > 0 ? wordCount / lineCount : 0;
  if (avgWordsPerLine < 1.5 && lineCount > 40) {
    warnings.push("Short broken line fragments detected; text order may have been rearranged across columns.");
  }

  // 7. Calculate Comprehensive Quality Score (0 - 100)
  let qualityScore = 100;

  if (isScanned) qualityScore -= 70;
  if (isCorrupted) qualityScore -= 60;
  if (charCount < 150) qualityScore -= 35;
  else if (charCount < 300) qualityScore -= 15;

  if (detectedSections.length === 0) qualityScore -= 25;
  else if (detectedSections.length < 2) qualityScore -= 10;

  qualityScore = Math.max(0, Math.min(100, qualityScore));

  // 8. Assign Deterministic Extraction Status
  let status: ExtractionStatus;
  let userMessage = "";

  if (isScanned || isCorrupted || qualityScore < 30 || charCount < 50) {
    status = "EXTRACTION_FAILED";
    userMessage = isScanned
      ? "This PDF appears to be scanned or image-based with no extractable text layer. Please upload a text-based PDF/DOCX or paste the resume text."
      : "Resume extraction failed or content is corrupted. Please review the text or paste your resume manually.";
  } else if (qualityScore < 70 || detectedSections.length < 2) {
    status = "EXTRACTION_PARTIAL";
    userMessage = "Extraction completed with partial coverage. Some standard sections may be missing. Please verify the extracted text below.";
  } else {
    status = "EXTRACTION_SUCCESS";
    userMessage = "Resume text extracted and validated successfully.";
  }

  const quality: ExtractionQuality = {
    charCount,
    wordCount,
    qualityScore,
    isScanned,
    isCorrupted,
    detectedSections,
    warnings,
  };

  return { status, quality, userMessage };
}
