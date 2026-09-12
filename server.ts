import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import {
  computeProfileHash,
  generateRequirementId,
  deduplicateRequirements,
  normalizeTechnologyName,
  TargetRequirement
} from "./src/lib/requirementEngine";
import {
  evaluateResumeAgainstRequirements,
  EvaluationResult
} from "./src/lib/atsEngine";
import {
  validateTailoredResume,
  ValidationResult,
  extractNumericMetrics
} from "./src/lib/tailoringValidator";
import {
  compareScores,
  evaluateFinality
} from "./src/lib/tailoringEngine";
import {
  generatePrintableHtml,
  sanitizeExportFileName
} from "./src/lib/exportEngine";
import {
  validateExportReadiness
} from "./src/lib/exportValidator";
import { globalJobIngestionEngine } from "./src/lib/jobEngine";
import { globalIntelligenceEngine } from "./src/lib/intelligenceEngine";
import { 
  globalApplicationStore, 
  globalOutcomeIntelligenceEngine, 
  captureScoreSnapshot 
} from "./src/lib/outcomeEngine";
import { ParsedResume } from "./src/types";

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = 3000;

// Set up larger limit for resume texts and files
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve favicon to prevent 404 console errors
app.get("/favicon.ico", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "favicon.svg"));
});

// Standard API Response Envelope Helpers
function sendSuccess(res: express.Response, data: any, status = 200) {
  return res.status(status).json({ success: true, data });
}

function sendError(res: express.Response, code: string, message: string, status = 500, details?: any) {
  return res.status(status).json({
    success: false,
    code,
    error: {
      code,
      message,
      ...(details ? { details } : {})
    },
    message
  });
}

// Canonical Gemini Model configuration (overridable via process.env.GEMINI_MODEL)
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

/**
 * Resilient AI content generator with quota failover support across compatible Gemini models.
 */
async function generateAiContent(ai: GoogleGenAI, options: any) {
  const models = [
    process.env.GEMINI_MODEL,
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-flash-latest",
    "gemini-2.5-flash"
  ].filter((m, idx, arr): m is string => Boolean(m && m.trim()) && arr.indexOf(m) === idx);

  let lastError: any;
  for (const model of models) {
    try {
      return await ai.models.generateContent({
        ...options,
        model
      });
    } catch (err: any) {
      lastError = err;
      const msg = err?.message || String(err);
      const isRecoverable =
        err?.status === 429 ||
        err?.status === 503 ||
        err?.status === 404 ||
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("high demand") ||
        msg.includes("not_found") ||
        msg.includes("is not found");

      if (isRecoverable && model !== models[models.length - 1]) {
        console.warn(`Gemini model ${model} unavailable/rate-limited, trying failover model...`);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// Backend liveness check — does NOT call Gemini, does NOT expose secrets
app.get("/api/health", (_req, res) => {
  const key = process.env.GEMINI_API_KEY;
  const aiConfigured = Boolean(key && key.trim() && key !== "MY_GEMINI_API_KEY");
  return sendSuccess(res, {
    status: "ok",
    backend: "healthy",
    ai: aiConfigured ? "configured" : "unconfigured"
  });
});

export interface ClassifiedAiError {
  httpStatus: number;
  code:
    | "AI_CONFIGURATION_ERROR"
    | "AI_AUTHENTICATION_ERROR"
    | "AI_PERMISSION_ERROR"
    | "AI_MODEL_UNAVAILABLE"
    | "AI_RATE_LIMITED"
    | "AI_TIMEOUT"
    | "AI_MALFORMED_RESPONSE"
    | "AI_PROVIDER_ERROR";
  message: string;
}

/**
 * Inspects a raw error from the Google GenAI SDK and returns a structured
 * { httpStatus, code, message } representing the actual failure reason.
 *
 * Mapped provider error conditions:
 *   AI_CONFIGURATION_ERROR   (503) — GEMINI_API_KEY is missing from environment.
 *   AI_AUTHENTICATION_ERROR  (401) — Key is invalid, revoked, or unauthenticated.
 *   AI_PERMISSION_ERROR      (403) — Key exists but Generative Language API is blocked or disabled.
 *   AI_RATE_LIMITED          (429) — Quota exhausted or rate limit hit.
 *   AI_MODEL_UNAVAILABLE     (503) — Requested model not found or deprecated.
 *   AI_TIMEOUT               (504) — Request exceeded deadline or timed out.
 *   AI_PROVIDER_ERROR        (502) — Generic upstream API or argument error.
 *
 * Never exposes the raw API key or internal stack trace to callers.
 */
export function classifyAiError(error: any): ClassifiedAiError {
  const raw = error?.message || String(error);

  let providerStatus: number | undefined;
  let providerReason: string | undefined;
  let providerMsg: string | undefined;
  try {
    const jsonStart = raw.indexOf("{");
    if (jsonStart !== -1) {
      const parsed = JSON.parse(raw.slice(jsonStart));
      providerStatus = parsed?.error?.code;
      providerReason = parsed?.error?.details?.[0]?.reason || parsed?.error?.status;
      providerMsg = parsed?.error?.message;
    }
  } catch {
    providerStatus = error?.status;
  }

  const status = providerStatus ?? error?.status;
  const combined = `${raw} ${providerReason || ""} ${providerMsg || ""}`.toLowerCase();

  if (
    !process.env.GEMINI_API_KEY ||
    !process.env.GEMINI_API_KEY.trim() ||
    process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY" ||
    combined.includes("gemini_api_key")
  ) {
    return {
      httpStatus: 503,
      code: "AI_CONFIGURATION_ERROR",
      message: "GEMINI_API_KEY is not configured on the server. Please add a valid Gemini API key from Google AI Studio (https://aistudio.google.com/app/apikey) to .env.local and restart the server."
    };
  }

  // 1. Timeout / Deadline exceeded / Network disconnect (504)
  if (
    status === 504 ||
    combined.includes("timeout") ||
    combined.includes("deadline_exceeded") ||
    combined.includes("etimedout") ||
    combined.includes("fetch failed") ||
    combined.includes("econnrefused") ||
    combined.includes("enotfound") ||
    combined.includes("abort") ||
    error?.code === "ETIMEDOUT" ||
    error?.code === "ECONNREFUSED" ||
    error?.code === "ENOTFOUND"
  ) {
    return {
      httpStatus: 504,
      code: "AI_TIMEOUT",
      message: "The AI service request timed out or network connection failed. Please try again."
    };
  }

  // 2. Permission Denied / Service Blocked (403)
  if (
    status === 403 ||
    combined.includes("403") ||
    combined.includes("permission_denied") ||
    combined.includes("api_key_service_blocked") ||
    combined.includes("blocked")
  ) {
    const isServiceBlocked = combined.includes("api_key_service_blocked") || combined.includes("blocked");
    return {
      httpStatus: 403,
      code: "AI_PERMISSION_ERROR",
      message: isServiceBlocked
        ? "The configured Gemini API key does not have access to the Generative Language API. " +
          "Enable the 'Generative Language API' in the Google Cloud Console for your project, " +
          "or replace GEMINI_API_KEY in .env.local with a valid Gemini API key obtained from " +
          "https://aistudio.google.com/app/apikey"
        : "The AI provider refused the request due to a permissions error. Verify your GEMINI_API_KEY."
    };
  }

  // 3. Authentication error (401 / Invalid Key)
  if (
    status === 401 ||
    combined.includes("401") ||
    combined.includes("unauthenticated") ||
    combined.includes("api_key_invalid") ||
    combined.includes("invalid api key") ||
    combined.includes("key not valid")
  ) {
    return {
      httpStatus: 401,
      code: "AI_AUTHENTICATION_ERROR",
      message: "Authentication failed. The configured GEMINI_API_KEY is invalid, revoked, or expired. Obtain a new key from Google AI Studio and update .env.local."
    };
  }

  // 4. Rate limited / Quota exhausted (429)
  if (
    status === 429 ||
    combined.includes("429") ||
    combined.includes("resource_exhausted") ||
    combined.includes("quota") ||
    combined.includes("rate limit")
  ) {
    return {
      httpStatus: 429,
      code: "AI_RATE_LIMITED",
      message: "The Gemini API rate limit or quota has been exceeded. Please wait a moment and try again, or check your Google AI Studio quota."
    };
  }

  // 5. Model unavailable / deprecated (503)
  if (
    status === 404 ||
    combined.includes("not_found") ||
    combined.includes("model not found") ||
    combined.includes("is not found") ||
    combined.includes("not supported for this model")
  ) {
    return {
      httpStatus: 503,
      code: "AI_MODEL_UNAVAILABLE",
      message: `The configured Gemini model (${GEMINI_MODEL}) is unavailable or deprecated. Verify the model configuration in server.ts.`
    };
  }

  // 6. Malformed AI response (502)
  if (
    combined.includes("ai_malformed_response") ||
    combined.includes("malformed") ||
    combined.includes("unexpected token") ||
    combined.includes("unterminated string") ||
    combined.includes("is not valid json") ||
    error instanceof SyntaxError
  ) {
    return {
      httpStatus: 502,
      code: "AI_MALFORMED_RESPONSE",
      message: "The AI service returned an incomplete or unparseable response format. Please retry."
    };
  }

  // 7. Invalid argument / request format (502)
  if (status === 400 || combined.includes("invalid_argument")) {
    return {
      httpStatus: 502,
      code: "AI_PROVIDER_ERROR",
      message: "The AI provider rejected the request format. Please check the model request configuration."
    };
  }

  // 8. Generic AI Provider Error (502)
  return {
    httpStatus: 502,
    code: "AI_PROVIDER_ERROR",
    message: "The AI service returned an unexpected error. Please try again."
  };
}

// Lazy init for Google Gen AI with key rotation awareness
let aiClient: GoogleGenAI | null = null;
let lastApiKey: string | undefined = undefined;

function getAI(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !key.trim() || key === "MY_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }
  if (!aiClient || lastApiKey !== key) {
    aiClient = new GoogleGenAI({ apiKey: key });
    lastApiKey = key;
  }
  return aiClient;
}

// Safe Gemini Health Check API Endpoint
app.get("/api/gemini-health", async (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !key.trim() || key === "MY_GEMINI_API_KEY") {
    return sendError(
      res,
      "AI_CONFIGURATION_ERROR",
      "GEMINI_API_KEY is not configured on the server. Please add your key to .env.local and restart the server.",
      503,
      { configured: false }
    );
  }

  try {
    const ai = getAI();
    // Harmless minimal probe without resume information
    await generateAiContent(ai, {
      contents: "ping"
    });

    return sendSuccess(res, {
      status: "healthy",
      configured: true,
      model: GEMINI_MODEL,
      reachable: true
    });
  } catch (error: any) {
    console.error("Gemini health check probe failed:", error?.message || error);
    const classified = classifyAiError(error);
    return sendError(
      res,
      classified.code,
      classified.message,
      classified.httpStatus,
      {
        configured: true,
        model: GEMINI_MODEL,
        reachable: false
      }
    );
  }
});

// Safe server-side endpoint to configure GEMINI_API_KEY dynamically
app.post("/api/configure-gemini-key", async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 20) {
    return sendError(res, "INVALID_API_KEY", "Please provide a valid Gemini API key from Google AI Studio.", 400);
  }

  const trimmedKey = apiKey.trim();

  // Test the key against Gemini first
  try {
    const testClient = new GoogleGenAI({ apiKey: trimmedKey });
    await testClient.models.generateContent({
      model: GEMINI_MODEL,
      contents: "ping"
    });
  } catch (err: any) {
    console.error("API key validation probe failed:", err?.message || err);
    const classified = classifyAiError(err);
    return sendError(
      res,
      classified.code,
      `Key verification failed: ${classified.message}`,
      classified.httpStatus
    );
  }

  // Key is verified working! Update process.env and aiClient
  process.env.GEMINI_API_KEY = trimmedKey;
  aiClient = new GoogleGenAI({ apiKey: trimmedKey });
  lastApiKey = trimmedKey;

  // Persist to .env.local safely
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    let envContent = "";
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf8");
    }

    if (/^GEMINI_API_KEY=.*$/m.test(envContent)) {
      envContent = envContent.replace(/^GEMINI_API_KEY=.*$/m, `GEMINI_API_KEY="${trimmedKey}"`);
    } else {
      envContent = `GEMINI_API_KEY="${trimmedKey}"\n` + envContent;
    }

    fs.writeFileSync(envPath, envContent, "utf8");
  } catch (fsErr) {
    console.error("Failed to write to .env.local:", fsErr);
  }

  return sendSuccess(res, {
    message: "Gemini API key configured and verified successfully!",
    model: GEMINI_MODEL
  });
});

// ============================================================================
// STRICT OUTPUT VALIDATORS (Part 18 - Strict AI Output Validation)
// ============================================================================

function validateRequirementProfile(data: any): boolean {
  if (!data || typeof data !== "object") return false;
  const arrayFields = [
    "requiredSkills",
    "preferredSkills",
    "softSkills",
    "responsibilities",
    "atsKeywords",
    "certifications",
    "industryKeywords",
    "tools",
    "technologies"
  ];
  for (const field of arrayFields) {
    if (!Array.isArray(data[field])) return false;
  }
  const stringFields = [
    "experienceExpectations",
    "educationRequirements",
    "portfolioExpectations",
    "leadershipExpectations"
  ];
  for (const field of stringFields) {
    if (typeof data[field] !== "string") return false;
  }
  return true;
}

function validateParsedResume(data: any): boolean {
  if (!data || typeof data !== "object") return false;
  const arrayFields = [
    "skills",
    "projects",
    "experience",
    "achievements",
    "education",
    "certifications",
    "languages",
    "tools",
    "frameworks",
    "softSkills",
    "atsKeywords",
    "responsibilities",
    "quantifiedMetrics"
  ];
  for (const field of arrayFields) {
    if (!Array.isArray(data[field])) return false;
  }
  if (typeof data.summary !== "string") return false;
  if (data.skillEvidence && !Array.isArray(data.skillEvidence)) return false;
  if (data.contactInfo && typeof data.contactInfo !== "object") return false;
  return true;
}

function validateGapAnalysis(data: any): boolean {
  if (!data || typeof data !== "object") return false;
  if (!Array.isArray(data.missingItems)) return false;
  if (!Array.isArray(data.atsPresent) || !Array.isArray(data.atsMissing) || !Array.isArray(data.atsWeak) || !Array.isArray(data.atsOverused)) {
    return false;
  }
  if (!data.scores || typeof data.scores !== "object") return false;
  
  const scoreKeys = [
    "atsCompatibility",
    "requiredSkills",
    "preferredSkills",
    "experienceMatch",
    "projects",
    "achievements",
    "grammar",
    "formatting",
    "companyMatch",
    "softSkills",
    "leadership"
  ];
  for (const key of scoreKeys) {
    const val = data.scores[key];
    if (typeof val !== "number" || isNaN(val) || val < 0 || val > 100) return false;
  }

  if (typeof data.overallCompletion !== "number" || isNaN(data.overallCompletion) || data.overallCompletion < 0 || data.overallCompletion > 100) {
    return false;
  }
  if (typeof data.isReadyToApply !== "boolean") return false;

  for (const item of data.missingItems) {
    if (!item || typeof item !== "object") return false;
    if (!item.title || !item.type || !item.importance || !item.reason) return false;
  }

  return true;
}

function validateTailorGap(data: any): boolean {
  if (!data || typeof data !== "object") return false;
  if (typeof data.section !== "string" || !data.section.trim()) return false;
  if (typeof data.suggestedSentence !== "string" || !data.suggestedSentence.trim()) return false;
  if (typeof data.evidenceStatus !== "string") return false;
  if (typeof data.reason !== "string") return false;
  if (typeof data.atsImpact !== "string") return false;
  if (typeof data.confidence !== "number" || isNaN(data.confidence) || data.confidence < 0 || data.confidence > 100) return false;
  return true;
}

export function extractJsonFromAiResponse(rawText: string): any {
  if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
    throw new Error("EMPTY_AI_RESPONSE");
  }

  const trimmed = rawText.trim();

  // 1. Direct JSON parse
  try {
    return JSON.parse(trimmed);
  } catch {}

  // 2. Strip Markdown code block ```json ... ``` or ``` ... ```
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const fenceMatch = trimmed.match(fenceRegex);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {}
  }

  // 3. Find outermost matching braces { ... }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  throw new Error("AI_MALFORMED_RESPONSE");
}

function validateTailorBatch(data: any): boolean {
  if (!data || typeof data !== "object") return false;
  if (typeof data.tailoredContent !== "string" || data.tailoredContent.trim().length < 20) return false;
  if (!Array.isArray(data.explanations)) return false;
  for (const exp of data.explanations) {
    if (!exp.whatChanged || !exp.why) return false;
  }
  return true;
}

function validateFresherTemplate(data: any): boolean {
  if (!data || typeof data !== "object") return false;
  if (typeof data.overview !== "string" || typeof data.hiringStandards !== "string") return false;
  if (!Array.isArray(data.recommendedSkills) || !Array.isArray(data.recommendedCertifications) || !Array.isArray(data.suggestedProjects) || !Array.isArray(data.interviewTips)) {
    return false;
  }
  if (typeof data.starterResume !== "string" || data.starterResume.trim().length < 50) return false;
  return true;
}

function validateTailorResume(data: any): boolean {
  if (!data || typeof data !== "object") return false;
  if (typeof data.matchingScore !== "number" || isNaN(data.matchingScore) || data.matchingScore < 0 || data.matchingScore > 100) return false;
  if (typeof data.overview !== "string" || typeof data.hiringTrends !== "string" || typeof data.recommendations !== "string" || typeof data.tailoredContent !== "string") return false;
  if (!Array.isArray(data.responsibilities) || !Array.isArray(data.requiredTechnologies) || !Array.isArray(data.softSkills) || !Array.isArray(data.missingSkills) || !Array.isArray(data.missingProjects) || !Array.isArray(data.missingCertifications) || !Array.isArray(data.weakExperienceAreas) || !Array.isArray(data.atsKeywords) || !Array.isArray(data.tailoredBullets)) {
    return false;
  }
  return true;
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

// AI Tailor Resume API Endpoint (V1 Legacy & Direct Tailor)
app.post("/api/tailor-resume", async (req, res) => {
  try {
    const { resumeText, targetCompany, targetRole, jobDescription, experienceLevel, location } = req.body;

    if (!resumeText || !targetCompany || !targetRole) {
      return sendError(res, "MISSING_REQUIRED_FIELDS", "Missing required fields: resumeText, targetCompany, and targetRole are required.", 400);
    }

    if (typeof resumeText !== "string" || resumeText.trim().length < 30) {
      return sendError(res, "INVALID_RESUME_TEXT", "Resume text is too short or invalid for meaningful analysis.", 400);
    }

    const ai = getAI();
    
    const systemPrompt = `You are a strict, truthful ATS recruitment advisor and resume optimization engine.

TASK:
Analyze the uploaded resume data and tailor it specifically for:
- Target Company: "${targetCompany}"
- Target Job Role: "${targetRole}"
- Experience Level: "${experienceLevel || "1-2 years"}"
- Target Location: "${location || "Remote"}"
${jobDescription ? `- Job Description context provided: "${jobDescription}"` : "- Job Description context provided: None provided. Extract role-level requirements based on industry standards for this exact job title."}

CRITICAL ANTI-FABRICATION AND DATA INTEGRITY RULES:
1. PRIMARY SOURCE OF TRUTH: If a Job Description is provided above, extract requirements directly from it. Do not substitute generic requirements.
2. DETECT ROLE-SPECIFIC SKILLS: Identify genuine role-specific skills (e.g. Rust, Django, Kubernetes, Go, Spring Boot, React, AWS, Docker, Python, SQL) required for "${targetRole}".
3. NEVER CLAIM USER HAS SKILLS THEY LACK: If a required skill is not mentioned with evidence in the user's resume, list it in "missingSkills". DO NOT claim the user has it in "tailoredBullets" or "tailoredContent" as existing experience.
4. NO FABRICATED METRICS OR JOBS: Do not invent fake employers, clients, degrees, or fake metrics (e.g. "increased sales by 40%"). If improving bullet points, enhance the phrasing of real experiences only.
5. NO UNSUPPORTED RECRUITER STATISTICS: Do not invent statistics like "80% of recruiters" or "90% of companies".
6. VERIFIED COMPANY STANDARDS: If no verified company-specific criteria are provided in the job description or known verified sources, state in overview: "Standard role-level profile for ${targetRole}."

Your analysis MUST return a structured JSON response matching the exact schema.`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        matchingScore: {
          type: Type.INTEGER,
          description: "An integer between 0 and 100 calculated truthfully based on how many required skills/experiences are actually present in the resume."
        },
        overview: {
          type: Type.STRING,
          description: "Overview for this role. If company-specific info is not verified in the input, provide role-level expectations."
        },
        hiringTrends: {
          type: Type.STRING,
          description: "Candidate selection standards for this role."
        },
        responsibilities: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Specific responsibilities expected of this role."
        },
        requiredTechnologies: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Specific technologies, tools, or frameworks required for this role (e.g. Rust, Django, Kubernetes, React, AWS)."
        },
        softSkills: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Soft skills desired for candidates in this role."
        },
        projectExpectations: {
          type: Type.STRING,
          description: "Types of projects or deliverables candidates should feature."
        },
        missingSkills: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Critical skills required by the role that are NOT found in the user's resume."
        },
        missingProjects: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Suggested project types the user could build to bridge gaps."
        },
        missingCertifications: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Relevant industry certifications missing from the resume."
        },
        weakExperienceAreas: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Areas in the user's resume where experience is weak, unquantified, or missing."
        },
        recommendations: {
          type: Type.STRING,
          description: "Truthful, role-specific recommendations."
        },
        tailoredBullets: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              current: { type: Type.STRING },
              improved: { type: Type.STRING }
            },
            required: ["current", "improved"]
          }
        },
        atsKeywords: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Keywords and technical terms specific to this role."
        },
        tailoredContent: {
          type: Type.STRING,
          description: "Professionally formatted resume content in Markdown, improving wording of existing experience without fabricating missing skills or fake achievements."
        }
      },
      required: [
        "matchingScore",
        "overview",
        "hiringTrends",
        "responsibilities",
        "requiredTechnologies",
        "softSkills",
        "projectExpectations",
        "missingSkills",
        "missingProjects",
        "missingCertifications",
        "weakExperienceAreas",
        "recommendations",
        "tailoredBullets",
        "atsKeywords",
        "tailoredContent"
      ]
    };

    const prompt = `User's Current Resume:\n${resumeText}\n\nTarget Company: ${targetCompany}\nTarget Role: ${targetRole}\nLevel: ${experienceLevel || "Not Specified"}\nLocation: ${location || "Not Specified"}`;

    const response = await generateAiContent(ai, {
      contents: [
        { role: "user", parts: [{ text: systemPrompt + "\n\n" + prompt }] }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    const responseText = response.text;
    if (!responseText) {
      return sendError(res, "EMPTY_AI_RESPONSE", "Empty response received from AI service.", 502);
    }

    const result = JSON.parse(responseText);

    if (!validateTailorResume(result)) {
      return sendError(res, "INVALID_AI_OUTPUT", "AI response failed validation checks. No unverified data displayed.", 502);
    }

    // Populate suggestedChanges for backward compatibility
    if (!result.suggestedChanges) {
      const bulletImps = (result.tailoredBullets || [])
        .map((b: any) => `* **Original**: "${b.current}"\n  **Improved**: "${b.improved}"`)
        .join("\n\n");

      result.suggestedChanges = `
### Target Role Match Score: ${result.matchingScore || 0}%

### Role Recommendations
${result.recommendations || "No recommendations provided."}

### Critical Gaps Detected
* **Missing Skills**: ${(result.missingSkills || []).join(", ") || "None"}
* **Missing Projects**: ${(result.missingProjects || []).join(", ") || "None"}
* **Missing Certifications**: ${(result.missingCertifications || []).join(", ") || "None"}

### Tailored Bullet Point Enhancements
${bulletImps || "No bullet enhancements generated."}
      `.trim();
    }

    return sendSuccess(res, result);
  } catch (error: any) {
    console.error("Error in /api/tailor-resume:", error);
    const raw = error?.message || String(error);
    if (error?.status || raw.includes("PERMISSION_DENIED") || raw.includes("UNAUTHENTICATED") ||
        raw.includes("RESOURCE_EXHAUSTED") || raw.includes("INVALID_ARGUMENT") || raw.includes("ApiError")) {
      const classified = classifyAiError(error);
      return sendError(res, classified.code, classified.message, classified.httpStatus);
    }
    return sendError(res, "AI_SERVICE_ERROR", "Failed to tailor resume content.", 500, error.message || String(error));
  }
});

// AI Generate Fresher Suggestion & Starter Resume API Endpoint
app.post("/api/generate-fresher-template", async (req, res) => {
  try {
    const { targetCompany, targetRole, fieldsOfInterest, academicProjects, strengths } = req.body;

    if (!targetCompany || !targetRole) {
      return sendError(res, "MISSING_REQUIRED_FIELDS", "Missing required fields: targetCompany and targetRole are required.", 400);
    }

    const ai = getAI();

    const systemPrompt = `You are an entry-level university career specialist and resume blueprint advisor.

TASK:
Provide guidance for students or fresh graduates seeking entry-level positions at:
- Target Company: "${targetCompany}"
- Target Job Role: "${targetRole}"
${fieldsOfInterest ? `- Fields of Interest / Major: "${fieldsOfInterest}"` : ""}
${academicProjects ? `- Academic Projects / Coursework: "${academicProjects}"` : ""}
${strengths ? `- Strengths: "${strengths}"` : ""}

CRITICAL ANTI-FABRICATION AND DATA INTEGRITY RULES:
1. CLEARLY LABEL SUGGESTED PRACTICE PROJECTS: Any suggested projects are recommendations for projects the student CAN BUILD. Do not label them as already completed professional experience.
2. STARTER RESUME TEMPLATE: The generated resume is a STARTER DRAFT / TEMPLATE. Use placeholder contact info and clearly demarcate practice projects.
3. NO FAKE EMPLOYMENT: Do not invent fake companies, fake internships, or unverified work histories.
4. HONEST CRITERIA: State real standard entry-level hiring criteria for "${targetRole}".`;

    const fresherSchema = {
      type: Type.OBJECT,
      properties: {
        overview: {
          type: Type.STRING,
          description: "Junior/fresher hiring standards and expectations for this role."
        },
        hiringStandards: {
          type: Type.STRING,
          description: "Expected entry-level criteria (e.g. portfolio, coding tests, foundational knowledge)."
        },
        recommendedSkills: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Essential technical skills freshers should learn to qualify for this role."
        },
        recommendedCertifications: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Reputable industry certifications or coursework relevant to freshers."
        },
        suggestedProjects: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Suggested project title" },
              description: { type: Type.STRING, description: "Step-by-step guidance on how the student can build this project" },
              impact: { type: Type.STRING, description: "A realistic sample accomplishment bullet they can use once they finish building it" }
            },
            required: ["title", "description", "impact"]
          }
        },
        interviewTips: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Actionable tips for entry-level interviews."
        },
        starterResume: {
          type: Type.STRING,
          description: "A cleanly structured starter resume draft in Markdown format."
        }
      },
      required: [
        "overview",
        "hiringStandards",
        "recommendedSkills",
        "recommendedCertifications",
        "suggestedProjects",
        "interviewTips",
        "starterResume"
      ]
    };

    const prompt = `Generate an entry-level roadmap, learning suggestions, and starter resume draft for ${targetCompany} (${targetRole}).`;

    const response = await generateAiContent(ai, {
      contents: [
        { role: "user", parts: [{ text: systemPrompt + "\n\n" + prompt }] }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: fresherSchema,
      },
    });

    const responseText = response.text;
    if (!responseText) {
      return sendError(res, "EMPTY_AI_RESPONSE", "Empty response received from AI service.", 502);
    }

    const result = JSON.parse(responseText);

    if (!validateFresherTemplate(result)) {
      return sendError(res, "INVALID_AI_OUTPUT", "AI response failed validation checks.", 502);
    }

    return sendSuccess(res, result);
  } catch (error: any) {
    console.error("Error in /api/generate-fresher-template:", error);
    const raw = error?.message || String(error);
    if (error?.status || raw.includes("PERMISSION_DENIED") || raw.includes("UNAUTHENTICATED") ||
        raw.includes("RESOURCE_EXHAUSTED") || raw.includes("INVALID_ARGUMENT") || raw.includes("ApiError")) {
      const classified = classifyAiError(error);
      return sendError(res, classified.code, classified.message, classified.httpStatus);
    }
    return sendError(res, "AI_SERVICE_ERROR", "Failed to generate fresher career guide and resume.", 500, error.message || String(error));
  }
});

// Requirement Engine
app.post("/api/generate-requirement-profile", async (req, res) => {
  try {
    const body = (req && typeof req.body === "object" && req.body !== null) ? req.body : {};
    const targetCompany = String(body.targetCompany ?? body.company ?? "").trim();
    const targetRole = String(body.targetRole ?? body.role ?? "").trim();
    const jobDescription = typeof (body.jobDescription ?? body.description) === "string"
      ? (body.jobDescription ?? body.description).trim()
      : "";
    const experienceLevel = typeof (body.experienceLevel ?? body.experience) === "string"
      ? (body.experienceLevel ?? body.experience).trim()
      : "";
    const resumeId = body.resumeId ?? body.id;
    const resumeText = body.resumeText;

    if (!targetCompany || !targetRole) {
      return sendError(
        res,
        "INVALID_REQUEST",
        "Missing required fields: targetCompany (or company) and targetRole (or role) are required.",
        400
      );
    }

    if (body.resume === null || body.resume === "") {
      return sendError(res, "MISSING_RESUME", "Resume is required.", 400);
    }
    if (resumeId !== undefined && (typeof resumeId !== "string" || !resumeId.trim() || resumeId === "invalid" || resumeId === "invalid-id")) {
      return sendError(res, "INVALID_RESUME_ID", "Invalid resumeId provided.", 400);
    }
    if (resumeText !== undefined && (typeof resumeText !== "string" || resumeText.trim().length < 10)) {
      return sendError(res, "INVALID_RESUME_TEXT", "Resume text is missing or too short.", 400);
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key || !key.trim() || key === "MY_GEMINI_API_KEY") {
      return sendError(
        res,
        "AI_CONFIGURATION_ERROR",
        "GEMINI_API_KEY is not configured on the server. Please add your key to .env.local and restart the server.",
        503
      );
    }

    const ai = getAI();
    const systemPrompt = `You are an expert ATS recruitment requirement extraction engine.

TASK:
Generate a structured, frozen Requirement Profile for a candidate applying for:
- Target Company: "${targetCompany}"
- Target Job Role: "${targetRole}"
- Experience Level: "${experienceLevel || "Not Specified"}"
${jobDescription ? `- Job Description: "${jobDescription}"` : "- Job Description: None provided. Infer requirements strictly from standard industry requirements for this exact role."}

CRITICAL DATA INTEGRITY & SKILL DETECTION RULES:
1. JOB DESCRIPTION HAS HIGHEST PRIORITY: If a Job Description is provided, extract requirements directly from the text.
2. PRECISE ROLE-SPECIFIC SKILLS: Identify the exact technical skills required for "${targetRole}". For example:
   - Frontend: React, TypeScript, JavaScript, CSS, HTML, Testing, REST APIs.
   - Rust Developer: Rust, Cargo, ownership, borrowing, async Rust, Tokio, systems programming.
   - Django Developer: Python, Django, Django REST Framework, PostgreSQL, REST APIs.
   - DevOps: Linux, Docker, Kubernetes, CI/CD, AWS/GCP, Terraform.
   - Spring Boot: Java, Spring Boot, Maven/Gradle, SQL, REST APIs.
   Extract actual requirements matching "${targetRole}" instead of a generic fallback list.
3. DO NOT INVENT REQUIREMENTS: Do not hallucinate proprietary or fictitious requirements.
4. NO FAKE STATISTICS: Do not invent hiring or recruiter percentages.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        requiredSkills: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Non-negotiable required technical and domain skills" },
        preferredSkills: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Nice-to-have or preferred skills" },
        softSkills: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Essential soft skills" },
        responsibilities: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Core job responsibilities" },
        atsKeywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Key ATS terms and keywords" },
        experienceExpectations: { type: Type.STRING, description: "Expected years and depth of experience" },
        educationRequirements: { type: Type.STRING, description: "Education or degree expectations" },
        portfolioExpectations: { type: Type.STRING, description: "Portfolio or project expectations" },
        certifications: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Relevant certifications" },
        industryKeywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Industry domain keywords" },
        tools: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Relevant software tools" },
        technologies: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Frameworks, databases, and core technologies" },
        leadershipExpectations: { type: Type.STRING, description: "Leadership or collaboration expectations" }
      },
      required: [
        "requiredSkills",
        "preferredSkills",
        "softSkills",
        "responsibilities",
        "atsKeywords",
        "experienceExpectations",
        "educationRequirements",
        "portfolioExpectations",
        "certifications",
        "industryKeywords",
        "tools",
        "technologies",
        "leadershipExpectations"
      ]
    };

    let response: any;
    try {
      response = await generateAiContent(ai, {
        contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        config: { responseMimeType: "application/json", responseSchema: schema }
      });
    } catch (aiErr: any) {
      console.error("AI provider call failed in /api/generate-requirement-profile:", aiErr);
      const classified = classifyAiError(aiErr);
      return sendError(res, classified.code, classified.message, classified.httpStatus);
    }

    const responseText = response?.text;
    if (!responseText || typeof responseText !== "string" || !responseText.trim()) {
      return sendError(res, "EMPTY_AI_RESPONSE", "Empty response from requirement engine.", 502);
    }

    let result: any;
    try {
      result = extractJsonFromAiResponse(responseText);
    } catch (parseError) {
      console.error("AI returned malformed JSON:", responseText);
      return sendError(res, "AI_MALFORMED_RESPONSE", "The AI provider returned an invalid requirement profile.", 502);
    }

    if (!validateRequirementProfile(result)) {
      return sendError(res, "AI_INVALID_RESPONSE", "The AI provider returned an invalid requirement profile.", 502);
    }

    const profileHash = computeProfileHash(targetCompany, targetRole, experienceLevel || "", jobDescription);
    result.profileHash = profileHash;
    result.isFrozen = true;

    const structuredReqs: TargetRequirement[] = [];

    const addCategoryReqs = (
      names: string[],
      category: TargetRequirement["category"],
      importance: TargetRequirement["importance"]
    ) => {
      if (!Array.isArray(names)) return;
      for (const raw of names) {
        if (!raw || typeof raw !== "string" || !raw.trim()) continue;
        const canonical = normalizeTechnologyName(raw);
        const reqId = generateRequirementId(profileHash, canonical, category);
        const source = jobDescription && jobDescription.toLowerCase().includes(raw.toLowerCase())
          ? "JOB_DESCRIPTION"
          : "TARGET_ROLE";

        structuredReqs.push({
          requirementId: reqId,
          name: raw.trim(),
          canonicalName: canonical,
          category,
          importance,
          source,
          status: "MISSING",
          priority: importance === "REQUIRED" ? "CRITICAL" : importance === "PREFERRED" ? "HIGH" : "MEDIUM",
          confidence: 100,
          sourceQuote: source === "JOB_DESCRIPTION" ? `Extracted directly from Job Description: "${raw.trim()}"` : undefined
        });
      }
    };

    addCategoryReqs(result.requiredSkills || [], "TECHNICAL_SKILL", "REQUIRED");
    addCategoryReqs(result.technologies || [], "FRAMEWORK", "REQUIRED");
    addCategoryReqs(result.preferredSkills || [], "TECHNICAL_SKILL", "PREFERRED");
    addCategoryReqs(result.tools || [], "TOOL", "PREFERRED");
    addCategoryReqs(result.atsKeywords || [], "KEYWORD", "PREFERRED");
    addCategoryReqs(result.softSkills || [], "SOFT_SKILL", "OPTIONAL");
    addCategoryReqs(result.certifications || [], "CERTIFICATION", "PREFERRED");

    result.structuredRequirements = deduplicateRequirements(structuredReqs);

    return sendSuccess(res, result);
  } catch (error: any) {
    console.error("Error in /api/generate-requirement-profile:", error);
    const classified = classifyAiError(error);
    if (error?.status || classified.code !== "AI_PROVIDER_ERROR") {
      return sendError(res, classified.code, classified.message, classified.httpStatus);
    }
    return sendError(res, "INTERNAL_SERVER_ERROR", "Failed to generate requirement profile.", 500, error.message || String(error));
  }
});

// Resume Parser
app.post("/api/parse-resume", async (req, res) => {
  try {
    const { resumeText } = req.body;
    if (!resumeText || typeof resumeText !== "string" || resumeText.trim().length < 30) {
      return sendError(res, "INVALID_RESUME_TEXT", "Resume text is missing or too short for parsing.", 400);
    }

    const ai = getAI();
    const systemPrompt = `You are a strict, objective Resume Entity Parser.
Convert the raw resume text into a structured JSON representation adhering to FACT PRESERVATION.

CRITICAL TRUTH & FACT PRESERVATION RULES:
1. EXTRACT ONLY WHAT IS ACTUALLY WRITTEN in the source text.
2. DO NOT INVENT, ASSUME, OR FABRICATE ANY INFORMATION.
3. PRESERVE FACTUAL NAMES AND DATES:
   - Do not change company names (e.g. keep "ABC Technologies" as is).
   - Do not expand approximate dates (e.g. keep "2024" as "2024", do not guess "January 2024").
4. SECTIONS ABSENT IN SOURCE: If a section (e.g. certifications, projects, experience) is not in the text, leave the array empty ([]) or string empty (""). DO NOT insert sample or placeholder data.
5. SKILL EVIDENCE: For each extracted skill, capture the exact snippet / sentence from the resume as evidence.
6. NO INFERRED SKILLS: If the resume says "built web applications", extract "Web Applications". DO NOT invent "Django" or "Spring Boot" unless explicitly mentioned.
7. DEDUPLICATION: If multi-column formatting caused the same experience or project to repeat, extract only one clean instance.`;
    
    const schema = {
      type: Type.OBJECT,
      properties: {
        contactInfo: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            email: { type: Type.STRING },
            phone: { type: Type.STRING },
            location: { type: Type.STRING },
            linkedin: { type: Type.STRING },
            github: { type: Type.STRING },
            website: { type: Type.STRING }
          }
        },
        summary: { type: Type.STRING, description: "Professional summary or objective if explicitly present in resume." },
        skills: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Skills explicitly mentioned in resume" },
        skillEvidence: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              skill: { type: Type.STRING },
              evidence: { type: Type.STRING, description: "Exact sentence or context from resume confirming this skill" }
            },
            required: ["skill", "evidence"]
          }
        },
        projects: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING }
            },
            required: ["title", "description"]
          }
        },
        experience: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              role: { type: Type.STRING },
              company: { type: Type.STRING },
              duration: { type: Type.STRING },
              description: { type: Type.STRING }
            },
            required: ["role", "company", "duration", "description"]
          }
        },
        achievements: { type: Type.ARRAY, items: { type: Type.STRING } },
        education: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              degree: { type: Type.STRING },
              institution: { type: Type.STRING }
            },
            required: ["degree", "institution"]
          }
        },
        certifications: { type: Type.ARRAY, items: { type: Type.STRING } },
        languages: { type: Type.ARRAY, items: { type: Type.STRING } },
        tools: { type: Type.ARRAY, items: { type: Type.STRING } },
        frameworks: { type: Type.ARRAY, items: { type: Type.STRING } },
        softSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
        atsKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        responsibilities: { type: Type.ARRAY, items: { type: Type.STRING } },
        quantifiedMetrics: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: [
        "skills",
        "projects",
        "experience",
        "achievements",
        "education",
        "certifications",
        "languages",
        "tools",
        "frameworks",
        "softSkills",
        "atsKeywords",
        "summary",
        "responsibilities",
        "quantifiedMetrics"
      ]
    };

    let response: any;
    try {
      response = await generateAiContent(ai, {
        contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + resumeText }] }],
        config: { responseMimeType: "application/json", responseSchema: schema }
      });
    } catch (aiErr: any) {
      console.error("AI provider call failed in /api/parse-resume:", aiErr);
      const classified = classifyAiError(aiErr);
      return sendError(res, classified.code, classified.message, classified.httpStatus);
    }

    const responseText = response?.text;
    if (!responseText || typeof responseText !== "string" || !responseText.trim()) {
      return sendError(res, "EMPTY_AI_RESPONSE", "Empty response from resume parser.", 502);
    }

    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error("AI returned malformed JSON in parse-resume:", responseText);
      return sendError(res, "AI_INVALID_RESPONSE", "The AI provider returned an invalid resume parsing structure.", 502);
    }

    if (!validateParsedResume(result)) {
      return sendError(res, "INVALID_AI_OUTPUT", "Parsed resume output failed validation.", 502);
    }

    // Deterministic deduplication in backend
    if (Array.isArray(result.skills)) {
      const seen = new Set<string>();
      result.skills = result.skills.filter((s: string) => {
        const lower = s.toLowerCase().trim();
        if (!lower || seen.has(lower)) return false;
        seen.add(lower);
        return true;
      });
    }

    if (Array.isArray(result.experience)) {
      const expSeen = new Set<string>();
      result.experience = result.experience.filter((exp: any) => {
        const key = `${(exp.company || '').toLowerCase()}_${(exp.role || '').toLowerCase()}_${(exp.duration || '').toLowerCase()}`;
        if (expSeen.has(key)) return false;
        expSeen.add(key);
        return true;
      });
    }

    return sendSuccess(res, result);
  } catch (error: any) {
    console.error("Error in /api/parse-resume:", error);
    const classified = classifyAiError(error);
    if (classified.code !== "AI_PROVIDER_ERROR") {
      return sendError(res, classified.code, classified.message, classified.httpStatus);
    }
    return sendError(res, "RESUME_PARSER_ERROR", "Failed to parse resume.", 500, error.message || String(error));
  }
});

// Gap Analysis and ATS Engine
app.post("/api/gap-analysis", async (req, res) => {
  try {
    const { parsedResume, frozenProfile, rawResumeText } = req.body;
    if (!parsedResume || !frozenProfile) {
      return sendError(res, "MISSING_REQUIRED_DATA", "Missing parsedResume or frozenProfile in request.", 400);
    }

    // 1. Resolve structured requirements from frozen profile
    let structuredRequirements: TargetRequirement[] = [];
    if (Array.isArray(frozenProfile.structuredRequirements) && frozenProfile.structuredRequirements.length > 0) {
      structuredRequirements = frozenProfile.structuredRequirements;
    } else {
      // Reconstruct structured requirements deterministically from frozen profile fields
      const profileHash = frozenProfile.profileHash || computeProfileHash(
        frozenProfile.targetCompany || "",
        frozenProfile.targetRole || "",
        frozenProfile.experienceLevel || "",
        frozenProfile.jobDescription
      );

      const addCategoryReqs = (
        names: string[],
        category: TargetRequirement["category"],
        importance: TargetRequirement["importance"]
      ) => {
        for (const raw of names) {
          if (!raw || typeof raw !== "string" || !raw.trim()) continue;
          const canonical = normalizeTechnologyName(raw);
          const reqId = generateRequirementId(profileHash, canonical, category);
          const source = frozenProfile.jobDescription && frozenProfile.jobDescription.toLowerCase().includes(raw.toLowerCase())
            ? "JOB_DESCRIPTION"
            : "TARGET_ROLE";

          structuredRequirements.push({
            requirementId: reqId,
            name: raw.trim(),
            canonicalName: canonical,
            category,
            importance,
            source,
            status: "MISSING",
            priority: importance === "REQUIRED" ? "CRITICAL" : importance === "PREFERRED" ? "HIGH" : "MEDIUM",
            confidence: 100
          });
        }
      };

      addCategoryReqs(frozenProfile.requiredSkills || [], "TECHNICAL_SKILL", "REQUIRED");
      addCategoryReqs(frozenProfile.technologies || [], "FRAMEWORK", "REQUIRED");
      addCategoryReqs(frozenProfile.preferredSkills || [], "TECHNICAL_SKILL", "PREFERRED");
      addCategoryReqs(frozenProfile.tools || [], "TOOL", "PREFERRED");
      addCategoryReqs(frozenProfile.atsKeywords || [], "KEYWORD", "PREFERRED");
      addCategoryReqs(frozenProfile.softSkills || [], "SOFT_SKILL", "OPTIONAL");
      addCategoryReqs(frozenProfile.certifications || [], "CERTIFICATION", "PREFERRED");

      structuredRequirements = deduplicateRequirements(structuredRequirements);
    }

    // 2. Perform 100% Deterministic Evidence Matching & ATS Scoring
    const evaluation = evaluateResumeAgainstRequirements(
      parsedResume,
      structuredRequirements,
      rawResumeText || "",
      {
        targetRole: frozenProfile.targetRole,
        targetCompany: frozenProfile.targetCompany,
        jobDescription: frozenProfile.jobDescription
      }
    );

    const result = {
      id: `gap_${frozenProfile.profileHash || frozenProfile.id || Date.now()}`,
      userId: frozenProfile.userId || "user_current",
      resumeId: parsedResume.id || "res_current",
      requirementProfileId: frozenProfile.id || frozenProfile.profileHash || "prof_current",
      createdAt: new Date().toISOString(),
      missingItems: evaluation.missingItems,
      atsPresent: evaluation.categorizedGaps.matchedRequirements.map(r => r.name),
      atsMissing: evaluation.categorizedGaps.criticalGaps.map(g => g.title),
      atsWeak: evaluation.categorizedGaps.preferredGaps.map(g => g.title),
      atsOverused: [],
      scores: evaluation.categoryScores,
      atsScore: evaluation.atsScore,
      targetMatchScore: evaluation.targetMatchScore,
      scoreBreakdown: evaluation.scoreBreakdown,
      categorizedGaps: evaluation.categorizedGaps,
      completionState: evaluation.completionState,
      overallCompletion: evaluation.targetMatchScore,
      isReadyToApply: evaluation.isReadyToApply,
      scoreConfidence: evaluation.scoreConfidence,
      applicationReadiness: evaluation.applicationReadiness,
      highestImpactActions: evaluation.highestImpactActions,
      resumeQualityAudit: evaluation.resumeQualityAudit,
      scoreBreakdownDetails: evaluation.scoreBreakdownDetails
    };

    if (!validateGapAnalysis(result)) {
      return sendError(res, "INVALID_OUTPUT_STRUCTURE", "Gap analysis result failed validation checks.", 502);
    }

    return sendSuccess(res, result);
  } catch (error: any) {
    console.error("Error in /api/gap-analysis:", error);
    const classified = classifyAiError(error);
    if (classified.code !== "AI_PROVIDER_ERROR") {
      return sendError(res, classified.code, classified.message, classified.httpStatus);
    }
    return sendError(res, "GAP_ANALYSIS_ERROR", "Failed gap analysis.", 500, error.message || String(error));
  }
});

// Single Item Tailoring & Explanation API Endpoint
app.post("/api/tailor-gap", async (req, res) => {
  try {
    const { 
      resumeId, 
      resumeText, 
      profileHash, 
      requirementId, 
      frozenProfile, 
      missingItem 
    } = req.body;

    if (!frozenProfile || !missingItem) {
      return sendError(res, "MISSING_REQUIRED_DATA", "Missing frozenProfile or missingItem in request payload.", 400);
    }

    const resolvedProfileHash = profileHash || frozenProfile.profileHash || frozenProfile.id;
    if (!resolvedProfileHash || typeof resolvedProfileHash !== "string") {
      return sendError(res, "INVALID_PROFILE_HASH", "Missing or invalid profileHash in analysis context.", 400);
    }

    const resolvedReqId = requirementId || missingItem.id;
    const itemTitle = missingItem.title || missingItem.name;
    if (!itemTitle || typeof itemTitle !== "string" || !itemTitle.trim()) {
      return sendError(res, "INVALID_REQUIREMENT", "Missing requirement title in request payload.", 400);
    }

    // Resolve authoritative requirement from frozenProfile structuredRequirements if present
    let matchedReq: TargetRequirement | undefined;
    if (Array.isArray(frozenProfile.structuredRequirements) && frozenProfile.structuredRequirements.length > 0) {
      matchedReq = frozenProfile.structuredRequirements.find((r: any) => 
        r.requirementId === resolvedReqId ||
        (r.name && r.name.toLowerCase() === itemTitle.toLowerCase()) ||
        (r.canonicalName && r.canonicalName.toLowerCase() === normalizeTechnologyName(itemTitle).toLowerCase())
      );
    }

    // Preserve exact source evidence
    const sourceQuote = matchedReq?.sourceQuote || missingItem.sourceQuote || missingItem.reason;
    const category = matchedReq?.category || missingItem.category || "TECHNICAL_SKILL";
    const importance = matchedReq?.importance || missingItem.importance || "REQUIRED";

    const safeResumeText = typeof resumeText === "string" ? resumeText : "";
    const hasCandidateEvidence = safeResumeText.toLowerCase().includes(itemTitle.toLowerCase());

    const ai = getAI();
    const systemPrompt = `You are a strict, truthful ATS Career Intelligence Advisor and Technical Recruiter.
TASK: Formulate an evidence-based, actionable 7-part coaching explanation for ONE target requirement.

TARGET ROLE CONTEXT:
- Role: "${frozenProfile.targetRole || "Target Role"}"
- Company: "${frozenProfile.targetCompany || "Target Company"}"

TARGET REQUIREMENT:
- Title: "${itemTitle}" (${category} / ${importance})
- Source Evidence: "${sourceQuote || "Required by target job profile"}"

CANDIDATE EVIDENCE STATUS:
${hasCandidateEvidence 
  ? `The candidate resume contains text matching "${itemTitle}". Focus on how to clarify, quantify, or rephrase existing evidence.`
  : `The candidate resume has NO verified evidence for "${itemTitle}". DO NOT claim they have experience. Frame guidance as study roadmap, relevant practice project, or required confirmation before adding.`}

CRITICAL ANTI-FABRICATION RULES:
1. TRUTHFULNESS: Never claim candidate has mastered "${itemTitle}" if evidence is missing.
2. NO FAKE METRICS: Do not invent quantitative metrics (e.g. "improved by 40%", "$500k", "team of 10").
3. NO FAKE EMPLOYERS: Do not invent employment history or companies.
4. WHAT NOT TO CHANGE: Explicitly warn the user NOT to fabricate skills or invent accomplishments.
5. EVIDENCE STATUS:
   - If missing from resume: set evidenceStatus strictly to: "No verified evidence in resume — confirmation required before adding"
   - If present in resume: set evidenceStatus strictly to: "Supported by existing resume text"`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        section: { type: Type.STRING, description: "Relevant resume section (e.g. Skills, Projects, Experience, Education)" },
        suggestedSentence: { type: Type.STRING, description: "Truthful, actionable phrasing suggestion or practice project recommendation without fabricated metrics." },
        evidenceStatus: { type: Type.STRING, description: "Strict factual status of candidate evidence." },
        reason: { type: Type.STRING, description: "Clear explanation of why this requirement is critical for the target role." },
        atsImpact: { type: Type.STRING, description: "Expected impact on ATS parsing." },
        confidence: { type: Type.INTEGER, description: "Confidence score between 0 and 100." },
        whyItMatters: { type: Type.STRING, description: "Why this requirement matters for this specific role." },
        whatResumixFound: { type: Type.STRING, description: "Exact analysis of what Resumix found in the resume." },
        whatYouCanSafelyChange: { type: Type.STRING, description: "Safe, truthful changes the user can make if they possess the skill." },
        whatYouShouldNotChange: { type: Type.STRING, description: "Explicit warning of what NOT to do or fabricate." },
        exampleBetterVersion: { type: Type.STRING, description: "Example of a professional bullet point or project description without fabricated metrics." },
        expectedImpact: { type: Type.STRING, description: "Concrete impact on ATS and recruiter review." },
        evidenceNeeded: { type: Type.STRING, description: "Types of proof needed (projects, code, certifications)." }
      },
      required: ["section", "suggestedSentence", "evidenceStatus", "reason", "atsImpact", "confidence"]
    };

    const prompt = `Candidate Resume Excerpt:\n${safeResumeText ? safeResumeText.substring(0, 2000) : "No resume text provided."}`;

    const response = await generateAiContent(ai, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { 
        systemInstruction: systemPrompt,
        responseMimeType: "application/json", 
        responseSchema: schema,
        temperature: 0.1,
        maxOutputTokens: 2048
      }
    });

    const responseText = response.text;
    if (!responseText) {
      return sendError(res, "EMPTY_AI_RESPONSE", "The AI service returned an empty response. Please retry.", 502);
    }

    let result: any;
    try {
      result = extractJsonFromAiResponse(responseText);
    } catch (parseErr: any) {
      console.error("Failed to parse Gemini response for /api/tailor-gap:", responseText);
      return sendError(res, "AI_MALFORMED_RESPONSE", "The AI service returned an unparseable response format. Please retry.", 502);
    }

    // Populate reliable defaults for 7 coaching dimensions
    if (!result.whyItMatters) {
      result.whyItMatters = result.reason || `Target role specifies ${itemTitle} as a ${importance.toLowerCase()} qualification for ATS evaluation.`;
    }
    if (!result.whatResumixFound) {
      result.whatResumixFound = hasCandidateEvidence 
        ? `Found mentions of "${itemTitle}" in resume text, but evidence lacks depth or measurable outcomes.`
        : `No verified evidence of "${itemTitle}" was detected in your parsed resume.`;
    }
    if (!result.whatYouCanSafelyChange) {
      result.whatYouCanSafelyChange = hasCandidateEvidence
        ? `Clarify where you applied ${itemTitle} in your projects or work experience, and describe the technical context.`
        : `If you have genuine academic, project, or work experience with ${itemTitle}, add a concrete example with real context.`;
    }
    if (!result.whatYouShouldNotChange) {
      result.whatYouShouldNotChange = `Do NOT add "${itemTitle}" merely to inflate your ATS score if you do not have genuine experience.`;
    }
    if (!result.exampleBetterVersion) {
      result.exampleBetterVersion = result.suggestedSentence;
    }
    if (!result.expectedImpact) {
      result.expectedImpact = `${result.atsImpact || 'Positive'} impact on technical keyword coverage and recruiter evaluation.`;
    }
    if (!result.evidenceNeeded) {
      result.evidenceNeeded = `Project, coursework, internship, or work experience demonstrating ${itemTitle}.`;
    }

    if (!validateTailorGap(result)) {
      return sendError(res, "VALIDATION_ERROR", "The generated suggestion failed structural verification and was rejected.", 422);
    }

    // Factual validation: Ensure no unsupported quantitative metrics were fabricated in suggestedSentence
    const sentencesToValidate = [result.suggestedSentence, result.exampleBetterVersion].filter(Boolean);
    for (const sentence of sentencesToValidate) {
      const generatedMetrics = extractNumericMetrics(sentence);
      if (generatedMetrics.length > 0) {
        const originalMetrics = extractNumericMetrics(safeResumeText);
        const unsupported = generatedMetrics.filter(m => !originalMetrics.includes(m));
        if (unsupported.length > 0) {
          return sendError(
            res, 
            "VALIDATION_ERROR", 
            `The generated suggestion contained fabricated metrics (${unsupported.join(", ")}). Factual validation rejected this output.`,
            422
          );
        }
      }
    }

    return sendSuccess(res, result);
  } catch (error: any) {
    console.error("Error in /api/tailor-gap:", error);
    const classified = classifyAiError(error);
    return sendError(res, classified.code, classified.message, classified.httpStatus);
  }
});

// V2, V3 & V4 Deterministic Pipeline - Phase 5 & 14: Evidence-Based Tailoring Engine
app.post("/api/tailor-resume-batch", async (req, res) => {
  try {
    const { resumeText, parsedResume, frozenProfile, selectedItems, userApprovedAdditions } = req.body;
    if (!resumeText || !frozenProfile || !selectedItems) {
      return sendError(res, "MISSING_REQUIRED_DATA", "Missing resumeText, frozenProfile, or selectedItems.", 400);
    }

    if (!Array.isArray(selectedItems) || selectedItems.length === 0) {
      return sendError(res, "INVALID_SELECTED_ITEMS", "selectedItems must be a non-empty array.", 400);
    }

    // 1. Prepare structured requirements from frozen profile
    const structuredReqs: TargetRequirement[] = frozenProfile.structuredRequirements || [];

    // 2. Compute Before-Tailoring Stage 3 Evaluation
    const beforeParsed: ParsedResume = parsedResume || {
      skills: [],
      experience: [],
      education: [],
      projects: [],
      achievements: [],
      certifications: [],
      languages: [],
      tools: [],
      frameworks: [],
      softSkills: [],
      atsKeywords: [],
      responsibilities: [],
      quantifiedMetrics: [],
      summary: ""
    };
    const beforeEval = evaluateResumeAgainstRequirements(beforeParsed, structuredReqs, resumeText);

    const ai = getAI();
    const systemPrompt = `You are a strict, truthful Resume Optimization & Bullet Refinement Engine.

TASK:
Optimize the current resume by improving action verbs, technical phrasing, and keyword alignment strictly addressing the selected items.

CRITICAL TRUTH & FACT PRESERVATION RULES:
1. NEVER INVENT METRICS: Do not create fake percentages, dollar amounts, team sizes, or multiplier metrics (e.g., do NOT invent "45% improvement" or "team of 12").
2. NEVER INVENT TECHNOLOGIES: Only use technical skills that exist in the original resume. If the target requires Rust or Django and the user lacks it, DO NOT add it.
3. NEVER INVENT COMPANIES OR JOBS: Keep exact company names, roles, and dates.
4. PRESERVE SENIORITY: Do not promote interns or junior developers to Senior/Lead/Architect.
5. PRESERVE FACTUAL ABSENCE: If original has 0 projects or 0 certifications, do not fabricate new sections.
6. PROVIDE STRUCTURED PROVENANCE: For every bullet improved, state the exact original text, generated text, reason, and change type.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        tailoredContent: { type: Type.STRING, description: "Complete, professionally optimized resume in Markdown format." },
        changes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              section: { type: Type.STRING },
              originalText: { type: Type.STRING },
              generatedText: { type: Type.STRING },
              reason: { type: Type.STRING },
              relatedRequirementId: { type: Type.STRING },
              evidenceQuote: { type: Type.STRING },
              changeType: { type: Type.STRING, description: "REPHRASE, REORDER, CONDENSE, KEYWORD_ALIGNMENT, SECTION_RESTRUCTURE, CLARIFICATION, or USER_APPROVED_ADDITION" }
            },
            required: ["section", "originalText", "generatedText", "reason", "changeType"]
          }
        },
        explanations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              whatChanged: { type: Type.STRING, description: "Summary of specific edit" },
              why: { type: Type.STRING, description: "Reason for edit" },
              atsBenefit: { type: Type.STRING, description: "Expected ATS or recruiter benefit" },
              recruiterBenefit: { type: Type.STRING, description: "High, Medium, or Low" },
              confidence: { type: Type.INTEGER }
            },
            required: ["whatChanged", "why", "atsBenefit", "recruiterBenefit", "confidence"]
          }
        }
      },
      required: ["tailoredContent", "changes", "explanations"]
    };

    const prompt = `Original Resume Content:\n${resumeText}\n\nSelected Target Checklist Items:\n${JSON.stringify(selectedItems)}\n\nFrozen Requirement Profile:\n${JSON.stringify(frozenProfile)}`;

    const response = await generateAiContent(ai, {
      contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + prompt }] }],
      config: { 
        responseMimeType: "application/json", 
        responseSchema: schema,
        temperature: 0.1
      }
    });

    const responseText = response.text;
    if (!responseText) {
      return sendError(res, "EMPTY_AI_RESPONSE", "Empty response received from batch tailoring.", 502);
    }

    const result = JSON.parse(responseText);

    // Post-Generation Deterministic Factual Validation
    const validation = validateTailoredResume(
      beforeParsed,
      resumeText,
      result.tailoredContent,
      userApprovedAdditions || {}
    );

    if (!validation.isValid) {
      return sendError(
        res,
        "FACTUAL_VALIDATION_FAILED",
        "Generated resume contained unsupported claims or unpossessed skills.",
        422,
        validation.validationErrors
      );
    }

    // 4. Compute After-Tailoring Stage 3 Evaluation
    const afterEval = evaluateResumeAgainstRequirements(beforeParsed, structuredReqs, result.tailoredContent);
    const scoreComparison = compareScores(beforeEval, afterEval);
    const finality = evaluateFinality(validation, scoreComparison);

    result.scoreComparison = scoreComparison;
    result.validation = validation;
    result.isFinalVersion = finality.isFinalVersion;
    result.finalityStatus = finality.finalityStatus;

    return sendSuccess(res, result);
  } catch (error: any) {
    console.error("Error in /api/tailor-resume-batch:", error);
    const raw = error?.message || String(error);
    if (error?.status || raw.includes("PERMISSION_DENIED") || raw.includes("UNAUTHENTICATED") ||
        raw.includes("RESOURCE_EXHAUSTED") || raw.includes("INVALID_ARGUMENT") || raw.includes("ApiError")) {
      const classified = classifyAiError(error);
      return sendError(res, classified.code, classified.message, classified.httpStatus);
    }
    return sendError(res, "BATCH_TAILOR_ERROR", "Failed to perform batch tailoring.", 500, error.message || String(error));
  }
});

// Stage 5 Pipeline: Server-Side DOCX & Print HTML Export Endpoints (0 AI Calls)
app.post("/api/export-resume-docx", (req, res) => {
  try {
    const { tailoredContent, parsedResume, targetCompany, targetRole } = req.body;
    if (!tailoredContent || typeof tailoredContent !== "string") {
      return sendError(res, "INVALID_EXPORT_DATA", "tailoredContent is required for export.", 400);
    }

    const readiness = validateExportReadiness({ tailoredContent, isValid: true, finalityStatus: "FINAL_OPTIMIZED" });
    if (!readiness.canExport) {
      return sendError(res, "EXPORT_VALIDATION_FAILED", "Resume is not in valid exportable state.", 422, readiness.errors);
    }

    const filename = sanitizeExportFileName(parsedResume?.contactInfo?.name, targetRole, "docx");
    const htmlBody = generatePrintableHtml(tailoredContent, parsedResume);
    const docxTemplate = `
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8">
  <title>${filename}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.3; color: #000; }
    h1 { font-size: 18pt; font-weight: bold; border-bottom: 2pt solid #000; margin-bottom: 4pt; }
    h2 { font-size: 13pt; font-weight: bold; border-bottom: 1pt solid #666; margin-top: 12pt; margin-bottom: 4pt; }
    h3 { font-size: 11pt; font-weight: bold; margin-top: 8pt; margin-bottom: 2pt; }
    li { font-size: 10.5pt; margin-bottom: 3pt; }
  </style>
</head>
<body>
  ${htmlBody}
</body>
</html>`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/msword");
    return res.send(docxTemplate);
  } catch (error: any) {
    console.error("Error in /api/export-resume-docx:", error);
    return sendError(res, "DOCX_GENERATION_FAILED", "Failed to generate DOCX document.", 500);
  }
});

app.post("/api/export-resume-html", (req, res) => {
  try {
    const { tailoredContent, parsedResume } = req.body;
    if (!tailoredContent || typeof tailoredContent !== "string") {
      return sendError(res, "INVALID_EXPORT_DATA", "tailoredContent is required.", 400);
    }

    const html = generatePrintableHtml(tailoredContent, parsedResume);
    return sendSuccess(res, { html });
  } catch (error: any) {
    console.error("Error in /api/export-resume-html:", error);
    return sendError(res, "PDF_GENERATION_FAILED", "Failed to render printable document.", 500);
  }
});

// ============================================================================
// STAGE 6: UNIVERSAL JOB INGESTION API ROUTES
// ============================================================================

app.post("/api/jobs/resolve-source", (req, res) => {
  try {
    const { url, company, role, rawText } = req.body;
    const resolved = globalJobIngestionEngine.resolveSource({ url, company, role, rawText });
    return sendSuccess(res, resolved);
  } catch (error: any) {
    return sendError(res, "SOURCE_RESOLUTION_FAILED", "Failed to resolve job source.", 500, error.message);
  }
});

app.post("/api/jobs/import-url", async (req, res) => {
  try {
    const { url, company, role } = req.body;
    if (!url || typeof url !== "string") {
      return sendError(res, "INVALID_URL", "URL is required to import job.", 400);
    }
    const result = await globalJobIngestionEngine.importJobUrl(url, company, role);
    if (!result.success) {
      return sendError(res, result.error?.code || "JOB_IMPORT_FAILED", result.error?.message || "Failed to import job from URL.", 422, result.error?.details);
    }
    return sendSuccess(res, result);
  } catch (error: any) {
    return sendError(res, "JOB_IMPORT_FAILED", "Failed to import job from URL.", 500, error.message);
  }
});

app.post("/api/jobs/import-text", async (req, res) => {
  try {
    const { rawText, company, role } = req.body;
    if (!rawText || typeof rawText !== "string") {
      return sendError(res, "INVALID_TEXT", "Job description text is required.", 400);
    }
    const result = await globalJobIngestionEngine.importJobText(rawText, company, role);
    if (!result.success) {
      return sendError(res, result.error?.code || "JOB_EXTRACTION_FAILED", result.error?.message || "Failed to extract job from text.", 422, result.error?.details);
    }
    return sendSuccess(res, result);
  } catch (error: any) {
    return sendError(res, "JOB_EXTRACTION_FAILED", "Failed to process job text.", 500, error.message);
  }
});

app.post("/api/jobs/ingest", async (req, res) => {
  try {
    const input = req.body;
    const result = await globalJobIngestionEngine.ingestJob(input);
    if (!result.success) {
      return sendError(res, result.error?.code || "INGEST_FAILED", result.error?.message || "Failed to ingest job.", 422, result.error?.details);
    }
    return sendSuccess(res, result);
  } catch (error: any) {
    return sendError(res, "INGEST_FAILED", "Failed to ingest job.", 500, error.message);
  }
});

app.get("/api/jobs/:jobId", (req, res) => {
  try {
    const { jobId } = req.params;
    const job = globalJobIngestionEngine.getJob(jobId);
    if (!job) {
      return sendError(res, "JOB_NOT_FOUND", `Job ${jobId} not found.`, 404);
    }
    return sendSuccess(res, { job });
  } catch (error: any) {
    return sendError(res, "JOB_QUERY_FAILED", "Failed to retrieve job.", 500, error.message);
  }
});

app.get("/api/jobs/:jobId/snapshots", (req, res) => {
  try {
    const { jobId } = req.params;
    const snapshots = globalJobIngestionEngine.getJobSnapshots(jobId);
    return sendSuccess(res, { snapshots, count: snapshots.length });
  } catch (error: any) {
    return sendError(res, "SNAPSHOT_QUERY_FAILED", "Failed to retrieve job snapshots.", 500, error.message);
  }
});

// ============================================================================
// STAGE 7: UNIVERSAL COMPANY & ROLE INTELLIGENCE API ROUTES
// ============================================================================

app.post("/api/intelligence/company", async (req, res) => {
  try {
    const { companyName } = req.body;
    if (!companyName || typeof companyName !== "string") {
      return sendError(res, "INVALID_COMPANY_NAME", "companyName is required.", 400);
    }
    const profile = await globalIntelligenceEngine.getCompanyIntelligence(companyName);
    return sendSuccess(res, profile);
  } catch (error: any) {
    return sendError(res, "COMPANY_INTELLIGENCE_FAILED", "Failed to calculate company intelligence.", 500, error.message);
  }
});

app.post("/api/intelligence/role", async (req, res) => {
  try {
    const { roleName, companyName } = req.body;
    if (!roleName || typeof roleName !== "string") {
      return sendError(res, "INVALID_ROLE_NAME", "roleName is required.", 400);
    }
    const profile = await globalIntelligenceEngine.getRoleIntelligence(roleName, companyName);
    return sendSuccess(res, profile);
  } catch (error: any) {
    return sendError(res, "ROLE_INTELLIGENCE_FAILED", "Failed to calculate role intelligence.", 500, error.message);
  }
});

app.post("/api/intelligence/analyze", async (req, res) => {
  try {
    const { companyName, roleName, resumeSkills } = req.body;
    if (!companyName || !roleName) {
      return sendError(res, "INVALID_INPUT", "Both companyName and roleName are required.", 400);
    }
    const analysis = await globalIntelligenceEngine.analyzeTargetIntelligence({
      companyName,
      roleName,
      resumeSkills: Array.isArray(resumeSkills) ? resumeSkills : []
    });
    return sendSuccess(res, analysis);
  } catch (error: any) {
    return sendError(res, "INTELLIGENCE_ANALYSIS_FAILED", "Failed to analyze target intelligence.", 500, error.message);
  }
});

app.get("/api/intelligence/company/:companyId", async (req, res) => {
  try {
    const { companyId } = req.params;
    const profile = await globalIntelligenceEngine.getCompanyIntelligence(companyId);
    return sendSuccess(res, profile);
  } catch (error: any) {
    return sendError(res, "COMPANY_QUERY_FAILED", "Failed to query company intelligence.", 500, error.message);
  }
});

app.get("/api/intelligence/role/:roleId", async (req, res) => {
  try {
    const { roleId } = req.params;
    const profile = await globalIntelligenceEngine.getRoleIntelligence(roleId);
    return sendSuccess(res, profile);
  } catch (error: any) {
    return sendError(res, "ROLE_QUERY_FAILED", "Failed to query role intelligence.", 500, error.message);
  }
});

// ============================================================================
// APPLICATION TRACKING & OUTCOME INTELLIGENCE API ROUTES
// ============================================================================

app.post("/api/applications", async (req, res) => {
  try {
    const { userId, jobId, resumeId, companyName, roleTitle, scoreSnapshot } = req.body;
    if (!userId || !jobId || !resumeId || !companyName || !roleTitle) {
      return sendError(res, "INVALID_INPUT", "userId, jobId, resumeId, companyName, and roleTitle are required.", 400);
    }
    if (!scoreSnapshot || typeof scoreSnapshot !== "object") {
      return sendError(res, "MISSING_SCORE_SNAPSHOT", "A valid application-time scoreSnapshot is required.", 400);
    }
    const appRecord = globalApplicationStore.createApplication(req.body);
    return sendSuccess(res, appRecord, 201);
  } catch (error: any) {
    if (error.message?.includes("DUPLICATE_APPLICATION")) {
      return sendError(res, "DUPLICATE_APPLICATION", error.message, 409);
    }
    return sendError(res, "APPLICATION_CREATION_FAILED", "Failed to create application record.", 500, error.message);
  }
});

app.get("/api/applications", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (userId) {
      const records = globalApplicationStore.getApplicationsByUser(userId);
      return sendSuccess(res, records);
    }
    const all = globalApplicationStore.getAllApplications();
    return sendSuccess(res, all);
  } catch (error: any) {
    return sendError(res, "APPLICATIONS_QUERY_FAILED", "Failed to retrieve application records.", 500, error.message);
  }
});

app.get("/api/applications/:applicationId", async (req, res) => {
  try {
    const { applicationId } = req.params;
    const userId = req.query.userId as string | undefined;
    const record = globalApplicationStore.getApplication(applicationId, userId);
    if (!record) {
      return sendError(res, "APPLICATION_NOT_FOUND", "Application not found or unauthorized.", 404);
    }
    const events = globalApplicationStore.getEvents(applicationId, userId);
    return sendSuccess(res, { ...record, events });
  } catch (error: any) {
    return sendError(res, "APPLICATION_FETCH_FAILED", "Failed to fetch application details.", 500, error.message);
  }
});

app.patch("/api/applications/:applicationId", async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { userId, outcome, outcomeDate, userNotes, confidence, evidenceSource } = req.body;
    if (!userId) {
      return sendError(res, "UNAUTHORIZED", "userId is required for updating application.", 401);
    }
    const updated = globalApplicationStore.updateApplication({
      applicationId,
      userId,
      outcome,
      outcomeDate,
      userNotes,
      confidence,
      evidenceSource
    });
    return sendSuccess(res, updated);
  } catch (error: any) {
    return sendError(res, "APPLICATION_UPDATE_FAILED", error.message || "Failed to update application.", 500);
  }
});

app.post("/api/applications/:applicationId/events", async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { userId, newOutcome, eventDate, notes, confidence, evidenceSource } = req.body;
    if (!userId || !newOutcome) {
      return sendError(res, "INVALID_INPUT", "userId and newOutcome are required.", 400);
    }
    const updated = globalApplicationStore.updateApplication({
      applicationId,
      userId,
      outcome: newOutcome,
      outcomeDate: eventDate,
      userNotes: notes,
      confidence,
      evidenceSource
    });
    const events = globalApplicationStore.getEvents(applicationId, userId);
    return sendSuccess(res, { application: updated, events });
  } catch (error: any) {
    return sendError(res, "EVENT_CREATION_FAILED", error.message || "Failed to add timeline event.", 500);
  }
});

app.get("/api/outcome-intelligence", async (_req, res) => {
  try {
    const analytics = globalOutcomeIntelligenceEngine.getGlobalAnalytics();
    return sendSuccess(res, analytics);
  } catch (error: any) {
    return sendError(res, "OUTCOME_INTELLIGENCE_FAILED", "Failed to calculate global outcome analytics.", 500, error.message);
  }
});

app.get("/api/outcome-intelligence/personal", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return sendError(res, "INVALID_INPUT", "userId query parameter is required.", 400);
    }
    const analytics = globalOutcomeIntelligenceEngine.getPersonalAnalytics(userId);
    return sendSuccess(res, analytics);
  } catch (error: any) {
    return sendError(res, "PERSONAL_OUTCOME_FAILED", "Failed to calculate personal outcome analytics.", 500, error.message);
  }
});

app.get("/api/outcome-intelligence/company/:companyName", async (req, res) => {
  try {
    const { companyName } = req.params;
    const analytics = globalOutcomeIntelligenceEngine.getCompanyAnalytics(companyName);
    return sendSuccess(res, analytics);
  } catch (error: any) {
    return sendError(res, "COMPANY_OUTCOME_FAILED", "Failed to calculate company outcome analytics.", 500, error.message);
  }
});

app.get("/api/outcome-intelligence/role/:roleTitle", async (req, res) => {
  try {
    const { roleTitle } = req.params;
    const analytics = globalOutcomeIntelligenceEngine.getRoleAnalytics(roleTitle);
    return sendSuccess(res, analytics);
  } catch (error: any) {
    return sendError(res, "ROLE_OUTCOME_FAILED", "Failed to calculate role outcome analytics.", 500, error.message);
  }
});

// Process-level crash guards to prevent server termination on unhandled errors
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception in server process:", err?.stack || err?.message || err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled promise rejection in server process at:", promise, "reason:", reason);
});

// Explicit 404 for unhandled API routes so they return JSON instead of falling through to HTML
app.all("/api/*", (_req, res) => {
  return sendError(res, "NOT_FOUND", "API endpoint not found.", 404);
});

// Global error handler — must be registered after all routes and middleware
function registerGlobalErrorHandler(expressApp: express.Express) {
  expressApp.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled server error:", err?.stack || err?.message || err);
    if (!res.headersSent) {
      sendError(res, "INTERNAL_SERVER_ERROR", "An unexpected server error occurred. Please try again.", 500, err?.message || String(err));
    }
  });
}

// Setup Vite middleware / static files based on environment (skip if on Vercel serverless or testing)
if (!process.env.VERCEL && !process.env.SKIP_SERVER_LISTEN) {
  async function setupApp() {
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
      const http = await import("http");

      const httpServer = http.createServer(app);

      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: { server: httpServer },
        },
        appType: "spa",
      });

      app.use(vite.middlewares);
      registerGlobalErrorHandler(app);

      httpServer.listen(PORT, "0.0.0.0", () => {
        console.log(`Resumix server running on http://0.0.0.0:${PORT}`);
      });
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
      registerGlobalErrorHandler(app);

      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Resumix server running on http://0.0.0.0:${PORT}`);
      });
    }
  }

  setupApp();
} else {
  registerGlobalErrorHandler(app);
}

export default app;
