import express from "express";
import path from "path";
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

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = 3000;

// Set up larger limit for resume texts and files
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Standard API Response Envelope Helpers
function sendSuccess(res: express.Response, data: any, status = 200) {
  return res.status(status).json({ success: true, data });
}

function sendError(res: express.Response, code: string, message: string, status = 500, details?: any) {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {})
    }
  });
}

// Lazy init for Google Gen AI to prevent crash if key is missing on startup
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

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

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
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

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
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
    return sendError(res, "AI_SERVICE_ERROR", "Failed to generate fresher career guide and resume.", 500, error.message || String(error));
  }
});

// V2 & V3 Deterministic Pipeline - Phase 1: Requirement Engine
app.post("/api/generate-requirement-profile", async (req, res) => {
  try {
    const { targetCompany, targetRole, jobDescription, experienceLevel } = req.body;
    if (!targetCompany || !targetRole) {
      return sendError(res, "MISSING_REQUIRED_FIELDS", "Missing required fields: targetCompany and targetRole are required.", 400);
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

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
      config: { responseMimeType: "application/json", responseSchema: schema }
    });

    const responseText = response.text;
    if (!responseText) {
      return sendError(res, "EMPTY_AI_RESPONSE", "Empty response from requirement engine.", 502);
    }

    const result = JSON.parse(responseText);

    if (!validateRequirementProfile(result)) {
      return sendError(res, "INVALID_AI_OUTPUT", "Generated requirement profile failed validation.", 502);
    }

    // Stage 3: Deterministic Profile Hashing & Structured Model Building
    const profileHash = computeProfileHash(targetCompany, targetRole, experienceLevel || "", jobDescription);
    result.profileHash = profileHash;
    result.isFrozen = true;

    const structuredReqs: TargetRequirement[] = [];

    // Helper to build structured requirements
    const addCategoryReqs = (
      names: string[],
      category: TargetRequirement["category"],
      importance: TargetRequirement["importance"]
    ) => {
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
    return sendError(res, "REQUIREMENT_ENGINE_ERROR", "Failed to generate requirement profile.", 500, error.message || String(error));
  }
});

// V2 Deterministic Pipeline - Phase 2: Resume Parser (Stage 2 Hardened)
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

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + resumeText }] }],
      config: { responseMimeType: "application/json", responseSchema: schema }
    });

    const responseText = response.text;
    if (!responseText) {
      return sendError(res, "EMPTY_AI_RESPONSE", "Empty response from resume parser.", 502);
    }

    const result = JSON.parse(responseText);

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
    return sendError(res, "RESUME_PARSER_ERROR", "Failed to parse resume.", 500, error.message || String(error));
  }
});

// V2 & V3 Deterministic Pipeline - Phase 3 & 4: Deterministic Gap Analysis & ATS Engine
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
      rawResumeText || ""
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
      isReadyToApply: evaluation.isReadyToApply
    };

    if (!validateGapAnalysis(result)) {
      return sendError(res, "INVALID_OUTPUT_STRUCTURE", "Gap analysis result failed validation checks.", 502);
    }

    return sendSuccess(res, result);
  } catch (error: any) {
    console.error("Error in /api/gap-analysis:", error);
    return sendError(res, "GAP_ANALYSIS_ERROR", "Failed gap analysis.", 500, error.message || String(error));
  }
});

// V2 Deterministic Pipeline - Phase 5: Single Item Tailoring
app.post("/api/tailor-gap", async (req, res) => {
  try {
    const { resumeText, frozenProfile, missingItem } = req.body;
    if (!resumeText || !frozenProfile || !missingItem) {
      return sendError(res, "MISSING_REQUIRED_DATA", "Missing resumeText, frozenProfile, or missingItem.", 400);
    }

    const ai = getAI();
    const systemPrompt = `You are a truthful Resume Tailoring Engine.
Suggest an improvement or phrasing recommendation for ONE missing checklist item.

CRITICAL RULES:
1. DO NOT INVENT FAKE EMPLOYMENT OR METRICS.
2. If the user does not have this skill, frame the suggestion truthfully (e.g. as a project, coursework, or pending credential), or state that evidence is needed.
3. Keep suggestions concise and actionable.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        section: { type: Type.STRING, description: "e.g., Skills, Experience, Project, Summary" },
        suggestedSentence: { type: Type.STRING, description: "A truthful, ATS-friendly bullet or project addition recommendation." },
        evidenceStatus: { type: Type.STRING, description: "e.g., 'Requires your confirmation before adding' or 'Supported by existing text'" },
        reason: { type: Type.STRING },
        atsImpact: { type: Type.STRING },
        confidence: { type: Type.INTEGER }
      },
      required: ["section", "suggestedSentence", "evidenceStatus", "reason", "atsImpact", "confidence"]
    };

    const prompt = `Resume Context:\n${String(resumeText).substring(0, 1500)}\n\nMissing Item:\n${JSON.stringify(missingItem)}\n\nFrozen Profile:\n${JSON.stringify(frozenProfile).substring(0, 500)}`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + prompt }] }],
      config: { 
        responseMimeType: "application/json", 
        responseSchema: schema,
        temperature: 0.1,
        maxOutputTokens: 300
      }
    });

    const responseText = response.text;
    if (!responseText) {
      return sendError(res, "EMPTY_AI_RESPONSE", "Empty response received from tailoring engine.", 502);
    }

    const result = JSON.parse(responseText);

    if (!validateTailorGap(result)) {
      return sendError(res, "INVALID_AI_OUTPUT", "Tailor suggestion failed validation.", 502);
    }

    return sendSuccess(res, result);
  } catch (error: any) {
    console.error("Error in /api/tailor-gap:", error);
    return sendError(res, "TAILOR_GAP_ERROR", "Failed to tailor gap.", 500, error.message || String(error));
  }
});

// V2 Deterministic Pipeline - Phase 5 & 14: Batch Tailoring & Explanation Engine
app.post("/api/tailor-resume-batch", async (req, res) => {
  try {
    const { resumeText, frozenProfile, selectedItems } = req.body;
    if (!resumeText || !frozenProfile || !selectedItems) {
      return sendError(res, "MISSING_REQUIRED_DATA", "Missing resumeText, frozenProfile, or selectedItems.", 400);
    }

    if (!Array.isArray(selectedItems) || selectedItems.length === 0) {
      return sendError(res, "INVALID_SELECTED_ITEMS", "selectedItems must be a non-empty array.", 400);
    }

    const ai = getAI();
    const systemPrompt = `You are a strict, truthful Resume Optimization Engine.

TASK:
Optimize the current resume by addressing ONLY the selected missing checklist items.

CRITICAL RULES:
1. NO FABRICATED EXPERIENCE: Do not invent past jobs, fake companies, or fake metrics.
2. DO NOT INVENT ADDITIONAL REQUIREMENTS: Stick to the selected items and frozen profile.
3. TRUTHFUL INTEGRATION: If adding missing skills/projects, integrate them cleanly without claiming unverified work history.
4. EXPLAIN EVERY CHANGE: State what was changed and why.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        tailoredContent: { type: Type.STRING, description: "Complete, professionally optimized resume in Markdown format." },
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
      required: ["tailoredContent", "explanations"]
    };

    const prompt = `Resume Context:\n${resumeText}\n\nSelected Items to Address:\n${JSON.stringify(selectedItems)}\n\nFrozen Profile:\n${JSON.stringify(frozenProfile)}`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + prompt }] }],
      config: { 
        responseMimeType: "application/json", 
        responseSchema: schema,
        temperature: 0.2
      }
    });

    const responseText = response.text;
    if (!responseText) {
      return sendError(res, "EMPTY_AI_RESPONSE", "Empty response received from batch tailoring.", 502);
    }

    const result = JSON.parse(responseText);

    if (!validateTailorBatch(result)) {
      return sendError(res, "INVALID_AI_OUTPUT", "Batch tailoring output failed validation.", 502);
    }

    return sendSuccess(res, result);
  } catch (error: any) {
    console.error("Error in /api/tailor-resume-batch:", error);
    return sendError(res, "BATCH_TAILOR_ERROR", "Failed to perform batch tailoring.", 500, error.message || String(error));
  }
});

// Setup Vite middleware / static files based on environment (skip if on Vercel serverless)
if (!process.env.VERCEL) {
  async function setupApp() {
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Resumix server running on http://0.0.0.0:${PORT}`);
    });
  }

  setupApp();
}

export default app;
