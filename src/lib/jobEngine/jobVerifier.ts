// ============================================================================
// RESUMIX STAGE 6: JOB CONTENT VERIFIER & FAIL-CLOSED GATE
// ============================================================================
// Enforces strict truth verification on all ingested jobs.
// Rejects binary garbage, error pages, CAPTCHAs, and auth walls.
// Zero dummy data and zero synthetic fallbacks.
// ============================================================================

export interface VerificationResult {
  isValid: boolean;
  errorCode?: string;
  reason?: string;
  evidenceQuality: number; // 0.0 to 1.0
}

const CAPTCHA_PATTERNS = [
  /cf-turnstile/i,
  /cf-challenge-running/i,
  /recaptcha/i,
  /hcaptcha/i,
  /verify\s+you\s+are\s+(a\s+)?human/i,
  /checking\s+your\s+browser/i,
  /cloudflare\s+ray\s+id/i,
  /attention\s+required!\s+\|\s+cloudflare/i,
  /please\s+complete\s+the\s+security\s+check/i
];

const AUTH_WALL_PATTERNS = [
  /sign\s+in\s+to\s+(view|apply|continue)/i,
  /employee\s+(portal\s+)?login/i,
  /sso\s+authentication\s+required/i,
  /internal\s+jobs?\s+portal/i,
  /enter\s+your\s+work\s+email\s+to\s+sign\s+in/i
];

const ERROR_PAGE_PATTERNS = [
  /404\s+not\s+found/i,
  /page\s+not\s+found/i,
  /this\s+job\s+(is\s+no\s+longer\s+available|has\s+expired|was\s+removed)/i,
  /the\s+posting\s+has\s+closed/i,
  /500\s+internal\s+server\s+error/i,
  /access\s+denied/i,
  /403\s+forbidden/i
];

/**
 * Validates raw and parsed job posting content before ingestion.
 */
export function verifyJobContent(title: string, description: string, rawHtml?: string): VerificationResult {
  // 1. Empty content check
  if (!description || typeof description !== "string" || description.trim().length === 0) {
    return {
      isValid: false,
      errorCode: "JOB_EXTRACTION_FAILED",
      reason: "Job description is empty or contains only whitespace.",
      evidenceQuality: 0
    };
  }

  const trimmedDesc = description.trim();
  const textToCheck = `${title} ${trimmedDesc} ${rawHtml || ""}`;

  // 2. Binary garbage detection
  const nonPrintable = trimmedDesc.replace(/[\s\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF]/g, "");
  if (nonPrintable.length / trimmedDesc.length > 0.15) {
    return {
      isValid: false,
      errorCode: "INVALID_RESUME_TEXT",
      reason: "Job description contains corrupted binary or unreadable character streams.",
      evidenceQuality: 0
    };
  }

  // 3. CAPTCHA & Bot Protection Detection
  for (const pattern of CAPTCHA_PATTERNS) {
    if (pattern.test(textToCheck)) {
      return {
        isValid: false,
        errorCode: "JOB_SOURCE_BLOCKED",
        reason: "Source is protected by a CAPTCHA or bot verification challenge. Cannot scrape behind access controls.",
        evidenceQuality: 0
      };
    }
  }

  // 4. Authentication / Login Wall Detection
  for (const pattern of AUTH_WALL_PATTERNS) {
    if (pattern.test(textToCheck)) {
      return {
        isValid: false,
        errorCode: "JOB_SOURCE_AUTHENTICATION_REQUIRED",
        reason: "Source requires employee authentication or SSO login.",
        evidenceQuality: 0
      };
    }
  }

  // 5. Error & Expired Page Detection
  for (const pattern of ERROR_PAGE_PATTERNS) {
    if (pattern.test(textToCheck)) {
      return {
        isValid: false,
        errorCode: "JOB_POSTING_UNAVAILABLE",
        reason: "Source returned a 404, 403, or expired job page notification.",
        evidenceQuality: 0
      };
    }
  }

  // 6. Substantive content and length check
  const wordCount = trimmedDesc.split(/\s+/).filter(w => w.length > 0).length;
  if (trimmedDesc.length < 40 || wordCount < 6) {
    return {
      isValid: false,
      errorCode: "JOB_EXTRACTION_FAILED",
      reason: `Job description is too brief (${wordCount} words) to extract verifiable job requirements.`,
      evidenceQuality: 0.1
    };
  }

  // If text is brief (< 100 characters or < 18 words), require verifiable requirement or skill tokens
  if (trimmedDesc.length < 100 || wordCount < 18) {
    const hasVerifiableSkills = /(python|react|javascript|typescript|node|java|rust|golang|\bgo\b|aws|azure|sql|kubernetes|docker|c\+\+|c#|responsibilit|qualificat|require|modeling|consulting|design|figma|ui\/ux|analytics|data|healthcare|engineering|research|marketing|finance|accounting|sales|management)/i.test(trimmedDesc);
    if (!hasVerifiableSkills) {
      return {
        isValid: false,
        errorCode: "JOB_EXTRACTION_FAILED",
        reason: "Job description is too brief and lacks verifiable technical or qualification requirements.",
        evidenceQuality: 0.1
      };
    }
  }

  // 7. Calculate evidence quality score based on substantive indicators
  let quality = 0.5;
  const lowerDesc = trimmedDesc.toLowerCase();
  
  if (lowerDesc.includes("responsibilit") || lowerDesc.includes("role") || lowerDesc.includes("duties")) quality += 0.15;
  if (lowerDesc.includes("qualificat") || lowerDesc.includes("require") || lowerDesc.includes("skill")) quality += 0.15;
  if (lowerDesc.includes("experience") || lowerDesc.includes("degree") || lowerDesc.includes("education")) quality += 0.1;
  if (wordCount >= 100) quality += 0.1;

  quality = Math.min(1.0, Math.max(0.2, quality));

  return {
    isValid: true,
    evidenceQuality: quality
  };
}
