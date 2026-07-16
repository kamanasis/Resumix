import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = 3000;

// Set up larger limit for resume texts and files
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

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

// AI Tailor Resume API Endpoint
app.post("/api/tailor-resume", async (req, res) => {
  try {
    const { resumeText, targetCompany, targetRole, jobDescription, experienceLevel, location } = req.body;

    if (!resumeText || !targetCompany || !targetRole) {
      return res.status(400).json({
        error: "Missing required fields: resumeText, targetCompany, and targetRole are required.",
      });
    }

    const ai = getAI();
    
    // Construct system prompt with detailed company-specific tailoring intelligence guidelines
    const systemPrompt = `You are an expert ATS recruiter, professional career advisor, and high-performance resume optimization engine.

Your task is to analyze the uploaded resume data and tailor it specifically for:
- Target Company: "${targetCompany}"
- Target Job Role: "${targetRole}"
- Experience Level: "${experienceLevel || "1-2 years"}"
- Target Location: "${location || "Remote"}"
${jobDescription ? `- Job Description context provided: "${jobDescription}"` : ""}

You must act as the AI Research Layer. Gather and synthesize company-specific insights, hiring trends, core technologies, and expectations for this company and role, then perform a comparison against the user's resume content.

Your analysis MUST return a structured JSON response matching the following EXACT schema (do not include any conversational text or markdown blocks around the JSON):
{
  "matchingScore": <integer between 0 and 100 representing how well the current resume fits the company's specific job profile and standards>,
  "overview": "<company overview for this role, emphasizing what the company values most (e.g. Google's focus on scalability and engineering rigour, Deloitte's focus on enterprise consultancies and design processes, Amazon's focus on leadership principles)>",
  "hiringTrends": "<current candidate selection trends, core standards, or high-level preferences the company emphasizes for this role>",
  "responsibilities": [
    "<specific responsibility expected of this role at this company>",
    "<another responsibility...>"
  ],
  "requiredTechnologies": [
    "<specific technology, tool, or framework used at this company for this role>",
    "<another technology...>"
  ],
  "softSkills": [
    "<essential soft skill or quality desired in candidates at this company>",
    "<another soft skill...>"
  ],
  "projectExpectations": "<what types of projects, design deliverables, or professional outcomes candidates should feature on their resume for this company>",
  "missingSkills": [
    "<critical skill that is missing or underrepresented in the current resume>",
    "<another missing skill...>"
  ],
  "missingProjects": [
    "<specific project idea or showcase they should add to match the company's expectations>",
    "<another project idea...>"
  ],
  "missingCertifications": [
    "<valuable industry certificate or credential that is missing and would give an edge at this company>",
    "<another certification...>"
  ],
  "weakExperienceAreas": [
    "<area where the user's experience feels weak, unquantified, or misaligned with the company's level requirements>",
    "<another weak area...>"
  ],
  "recommendations": "<highly tailored, company-specific paragraph. E.g., 'Deloitte frequently expects Graphic Designers to demonstrate experience with Adobe Creative Suite, Figma, brand consistency, and digital campaign design. Your resume currently lacks Figma and branding-related work examples.'>",
  "tailoredBullets": [
    {
      "current": "<a weak, generic, or non-quantifiable bullet point from the original resume>",
      "improved": "<an optimized, impact-driven bullet point rewritten specifically for this company using modern action verbs, target keywords, and quantified metrics. E.g., 'Designed 30+ social media campaigns and visual assets using Adobe Illustrator and Photoshop, increasing engagement by 25%.'>"
    }
  ],
  "atsKeywords": [
    "<highly targeted ATS keyword or technical term specific to this company and role>",
    "<another keyword...>"
  ],
  "tailoredContent": "<complete, professionally optimized, fully tailored resume content formatted beautifully in Markdown, incorporating the suggestions, achievements, and keywords. Maintain a high-contrast elegant layout>"
}`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        matchingScore: {
          type: Type.INTEGER,
          description: "An integer between 0 and 100 representing how well the current resume fits the company's specific job profile and standards."
        },
        overview: {
          type: Type.STRING,
          description: "Company overview for this role, emphasizing what the company values most."
        },
        hiringTrends: {
          type: Type.STRING,
          description: "Current candidate selection trends, core standards, or high-level preferences the company emphasizes for this role."
        },
        responsibilities: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Specific responsibilities expected of this role at this company."
        },
        requiredTechnologies: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Specific technologies, tools, or frameworks used at this company for this role."
        },
        softSkills: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Essential soft skills or qualities desired in candidates at this company."
        },
        projectExpectations: {
          type: Type.STRING,
          description: "What types of projects, design deliverables, or professional outcomes candidates should feature on their resume for this company."
        },
        missingSkills: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Critical skills that are missing or underrepresented in the current resume."
        },
        missingProjects: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Specific project ideas or showcases they should add to match the company's expectations."
        },
        missingCertifications: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Valuable industry certificates or credentials that are missing and would give an edge at this company."
        },
        weakExperienceAreas: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Areas where the user's experience feels weak, unquantified, or misaligned with the company's requirements."
        },
        recommendations: {
          type: Type.STRING,
          description: "Highly tailored, company-specific recommendation paragraph."
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
          description: "Highly targeted ATS keywords or technical terms specific to this company and role."
        },
        tailoredContent: {
          type: Type.STRING,
          description: "Complete, professionally optimized, fully tailored resume content formatted beautifully in Markdown."
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

    const prompt = `Here is the user's current resume content:\n${resumeText}\n\nPlease analyze, research, and tailor this resume specifically for the company: ${targetCompany}, role: ${targetRole}, level: ${experienceLevel || "Not Specified"}, location: ${location || "Not Specified"}. Respond with valid JSON adhering strictly to the specified schema.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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
      throw new Error("Empty response received from Gemini API.");
    }

    // Parse output JSON
    const result = JSON.parse(responseText);

    // Provide legacy field backward compatibility so any existing pages continue to function smoothly
    if (!result.suggestedChanges) {
      const bulletImps = (result.tailoredBullets || [])
        .map((b: any) => `* **Original**: "${b.current}"\n  **Improved**: "${b.improved}"`)
        .join("\n\n");

      result.suggestedChanges = `
### Target Role Match Score: ${result.matchingScore || 0}%

### Company-Specific Recommendation
${result.recommendations || "No recommendations provided."}

### Critical Gaps Detected
* **Missing Skills**: ${(result.missingSkills || []).join(", ") || "None"}
* **Missing Projects**: ${(result.missingProjects || []).join(", ") || "None"}
* **Missing Certifications**: ${(result.missingCertifications || []).join(", ") || "None"}

### Tailored Bullet Point Replacements
${bulletImps || "No bullet improvements generated."}
      `.trim();
    }

    res.json(result);
  } catch (error: any) {
    console.error("Error in /api/tailor-resume:", error);
    res.status(500).json({
      error: "Failed to tailor resume content.",
      details: error.message || String(error),
    });
  }
});

// AI Generate Fresher Suggestion & Starter Resume API Endpoint
app.post("/api/generate-fresher-template", async (req, res) => {
  try {
    const { targetCompany, targetRole, fieldsOfInterest, academicProjects, strengths } = req.body;

    if (!targetCompany || !targetRole) {
      return res.status(400).json({
        error: "Missing required fields: targetCompany and targetRole are required.",
      });
    }

    const ai = getAI();

    const systemPrompt = `You are an expert entry-level tech recruiter, university hire specialist, and career advisor.
Your goal is to guide freshers (recent graduates or students with no prior professional resume) on how to build their first resume and get hired at:
- Target Company: "${targetCompany}"
- Target Job Role: "${targetRole}"
${fieldsOfInterest ? `- Fields of Interest/Major: "${fieldsOfInterest}"` : ""}
${academicProjects ? `- Academic Projects/Coursework context: "${academicProjects}"` : ""}
${strengths ? `- Key Strengths: "${strengths}"` : ""}

Provide highly customized advice for this company and entry-level role, plus a fully filled starter resume (Markdown) that they can adopt as a draft and build upon.

Your analysis MUST return a structured JSON response matching this EXACT schema (no conversational text or markdown blocks around the outer JSON):
{
  "overview": "<Company culture regarding junior/fresher hires, what they value most in graduates>",
  "hiringStandards": "<Expected hiring criteria, e.g. GPA emphasis, coding tests, visual portfolios, hackathons or standard interview rounds at this company>",
  "recommendedSkills": [
    "<essential hard or technical skill they should learn to stand out>",
    "<another skill...>"
  ],
  "recommendedCertifications": [
    "<valuable industry certification, free course or credential that adds credibility for freshers>",
    "<another certification...>"
  ],
  "suggestedProjects": [
    {
      "title": "<Showcase project name matching the target company's stack and standards>",
      "description": "<How to build this project step-by-step as a fresher to showcase competence in the company's preferred technologies>",
      "impact": "<A high-impact, quantified bullet point that they can write on their resume once they complete this project (e.g. 'Built responsive web application serving 100+ simulated active users with 99.9% uptime...')>"
    }
  ],
  "interviewTips": [
    "<critical tip on passing the technical screening, behavioral rounds or standard questions at this company>",
    "<another tip...>"
  ],
  "starterResume": "<A fully-written, complete, professionally structured resume in Markdown. It must include: Placeholder Contact Info, custom Objective aligned to target company, Education section, pre-filled Technical Skills (combining interests and company stack), a Project section with the suggested projects written out with realistic entry-level achievements, and Extracurricular/Leadership sections. Pre-format it beautifully so it is directly usable as a starter document.>"
}`;

    const fresherSchema = {
      type: Type.OBJECT,
      properties: {
        overview: {
          type: Type.STRING,
          description: "Company culture regarding junior/fresher hires, what they value most in graduates."
        },
        hiringStandards: {
          type: Type.STRING,
          description: "Expected hiring criteria, e.g. GPA emphasis, coding tests, portfolios, hackathons, or standard interview rounds."
        },
        recommendedSkills: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Essential hard or technical skills they should learn to stand out."
        },
        recommendedCertifications: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Valuable industry certifications, free courses, or credentials that add credibility for freshers."
        },
        suggestedProjects: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Showcase project name matching the target company's stack and standards" },
              description: { type: Type.STRING, description: "How to build this project step-by-step as a fresher to showcase competence" },
              impact: { type: Type.STRING, description: "A high-impact, quantified bullet point that they can write on their resume once they complete this project" }
            },
            required: ["title", "description", "impact"]
          }
        },
        interviewTips: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Critical tips on passing the technical screening, behavioral rounds, or standard questions."
        },
        starterResume: {
          type: Type.STRING,
          description: "A fully-written, complete, professionally structured resume in Markdown."
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

    const prompt = `Please research entry-level hiring at ${targetCompany} for the role of ${targetRole}. Produce a complete roadmap, fresher guidance, and a pristine, custom-tailored starter resume Markdown.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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
      throw new Error("Empty response received from Gemini API.");
    }

    const result = JSON.parse(responseText);
    res.json(result);
  } catch (error: any) {
    console.error("Error in /api/generate-fresher-template:", error);
    res.status(500).json({
      error: "Failed to generate fresher career guide and resume.",
      details: error.message || String(error),
    });
  }
});

// V2 Deterministic Pipeline - Phase 1: Requirement Engine
app.post("/api/generate-requirement-profile", async (req, res) => {
  try {
    const { targetCompany, targetRole, jobDescription, experienceLevel } = req.body;
    if (!targetCompany || !targetRole) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const ai = getAI();
    const systemPrompt = `You are an expert ATS recruitment AI. Generate a structured Requirement Profile for a candidate applying to this company. This profile will be frozen and used as the single source of truth for tailoring a resume. Do not invent requirements outside of industry standards and the provided job description.
    Target Company: "${targetCompany}"
    Target Job Role: "${targetRole}"
    Experience Level: "${experienceLevel || "Not Specified"}"
    ${jobDescription ? `Job Description: "${jobDescription}"` : ""}
    `;

    const schema = {
      type: Type.OBJECT,
      properties: {
        requiredSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
        preferredSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
        softSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
        responsibilities: { type: Type.ARRAY, items: { type: Type.STRING } },
        atsKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        experienceExpectations: { type: Type.STRING },
        educationRequirements: { type: Type.STRING },
        portfolioExpectations: { type: Type.STRING },
        certifications: { type: Type.ARRAY, items: { type: Type.STRING } },
        industryKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        tools: { type: Type.ARRAY, items: { type: Type.STRING } },
        technologies: { type: Type.ARRAY, items: { type: Type.STRING } },
        leadershipExpectations: { type: Type.STRING }
      },
      required: ["requiredSkills", "preferredSkills", "softSkills", "responsibilities", "atsKeywords", "experienceExpectations", "educationRequirements", "portfolioExpectations", "certifications", "industryKeywords", "tools", "technologies", "leadershipExpectations"]
    };

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
      config: { responseMimeType: "application/json", responseSchema: schema }
    });

    res.json(JSON.parse(response.text!));
  } catch (error: any) {
    res.status(500).json({ error: "Failed to generate profile.", details: error.message });
  }
});

// V2 Deterministic Pipeline - Phase 3: Resume Parser
app.post("/api/parse-resume", async (req, res) => {
  try {
    const { resumeText } = req.body;
    if (!resumeText) return res.status(400).json({ error: "Missing resume text." });

    const ai = getAI();
    const systemPrompt = `You are an expert Resume Parser. Convert the following raw text into a structured JSON representation. Extract exactly what is written. DO NOT invent or fabricate any information.`;
    
    const schema = {
      type: Type.OBJECT,
      properties: {
        skills: { type: Type.ARRAY, items: { type: Type.STRING } },
        projects: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { title: {type: Type.STRING}, description: {type: Type.STRING} } } },
        experience: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { role: {type: Type.STRING}, company: {type: Type.STRING}, duration: {type: Type.STRING}, description: {type: Type.STRING} } } },
        achievements: { type: Type.ARRAY, items: { type: Type.STRING } },
        education: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { degree: {type: Type.STRING}, institution: {type: Type.STRING} } } },
        certifications: { type: Type.ARRAY, items: { type: Type.STRING } },
        languages: { type: Type.ARRAY, items: { type: Type.STRING } },
        tools: { type: Type.ARRAY, items: { type: Type.STRING } },
        frameworks: { type: Type.ARRAY, items: { type: Type.STRING } },
        softSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
        atsKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        summary: { type: Type.STRING },
        responsibilities: { type: Type.ARRAY, items: { type: Type.STRING } },
        quantifiedMetrics: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["skills", "projects", "experience", "achievements", "education", "certifications", "languages", "tools", "frameworks", "softSkills", "atsKeywords", "summary", "responsibilities", "quantifiedMetrics"]
    };

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\n" + resumeText }] }],
      config: { responseMimeType: "application/json", responseSchema: schema }
    });

    res.json(JSON.parse(response.text!));
  } catch (error: any) {
    res.status(500).json({ error: "Failed to parse resume.", details: error.message });
  }
});

// V2 Deterministic Pipeline - Phase 4: Gap Analysis
app.post("/api/gap-analysis", async (req, res) => {
  try {
    const { parsedResume, frozenProfile } = req.body;
    if (!parsedResume || !frozenProfile) return res.status(400).json({ error: "Missing data." });

    const ai = getAI();
    const systemPrompt = `You are a strict Gap Analysis Engine. 
Compare the Parsed Resume against the Frozen Requirement Profile.
Return ONLY the missing items. NEVER invent new requirements.
Ensure missingItems does not exceed 10 Critical, 5 Recommended, 3 Optional.
Calculate realistic scores (0-100) based on the match. If the match is high, give high scores.

Parsed Resume: ${JSON.stringify(parsedResume)}
Frozen Requirement Profile: ${JSON.stringify(frozenProfile)}`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        missingItems: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, description: "Skill, ATS Keyword, Project, Achievement, Responsibility, Certification, Technology, Grammar, Formatting, or Experience" },
              title: { type: Type.STRING },
              importance: { type: Type.STRING, description: "Critical, Recommended, or Optional" },
              reason: { type: Type.STRING },
              suggestedAddition: { type: Type.STRING },
              atsImpact: { type: Type.STRING },
              recruiterImpact: { type: Type.STRING, description: "High, Medium, or Low" },
              confidenceScore: { type: Type.INTEGER }
            },
            required: ["type", "title", "importance", "reason", "suggestedAddition", "atsImpact", "recruiterImpact", "confidenceScore"]
          }
        },
        atsPresent: { type: Type.ARRAY, items: { type: Type.STRING } },
        atsMissing: { type: Type.ARRAY, items: { type: Type.STRING } },
        atsWeak: { type: Type.ARRAY, items: { type: Type.STRING } },
        atsOverused: { type: Type.ARRAY, items: { type: Type.STRING } },
        scores: {
          type: Type.OBJECT,
          properties: {
            atsCompatibility: { type: Type.INTEGER },
            requiredSkills: { type: Type.INTEGER },
            preferredSkills: { type: Type.INTEGER },
            experienceMatch: { type: Type.INTEGER },
            projects: { type: Type.INTEGER },
            achievements: { type: Type.INTEGER },
            grammar: { type: Type.INTEGER },
            formatting: { type: Type.INTEGER },
            companyMatch: { type: Type.INTEGER },
            softSkills: { type: Type.INTEGER },
            leadership: { type: Type.INTEGER }
          },
          required: ["atsCompatibility", "requiredSkills", "preferredSkills", "experienceMatch", "projects", "achievements", "grammar", "formatting", "companyMatch", "softSkills", "leadership"]
        },
        overallCompletion: { type: Type.INTEGER },
        isReadyToApply: { type: Type.BOOLEAN }
      },
      required: ["missingItems", "atsPresent", "atsMissing", "atsWeak", "atsOverused", "scores", "overallCompletion", "isReadyToApply"]
    };

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
      config: { responseMimeType: "application/json", responseSchema: schema }
    });

    res.json(JSON.parse(response.text!));
  } catch (error: any) {
    res.status(500).json({ error: "Failed gap analysis.", details: error.message });
  }
});

// V2 Deterministic Pipeline - Phase 5: Tailoring Engine (Optimized for speed)
app.post("/api/tailor-gap", async (req, res) => {
  try {
    const { resumeText, frozenProfile, missingItem } = req.body;
    if (!resumeText || !frozenProfile || !missingItem) return res.status(400).json({ error: "Missing data." });

    const ai = getAI();
    const systemPrompt = `You are a strict Resume Tailoring Engine. Suggest an improvement for ONE missing checklist item. Do not invent requirements. Keep suggestions concise and fast.
    Resume Context (short snippet): ${resumeText.substring(0, 1500)}...
    Missing Item: ${JSON.stringify(missingItem)}
    Frozen Profile: ${JSON.stringify(frozenProfile).substring(0, 500)}`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        section: { type: Type.STRING, description: "e.g., Skills, Experience, Project, Summary" },
        suggestedSentence: { type: Type.STRING, description: "A truthful, ATS-friendly bullet." },
        evidenceStatus: { type: Type.STRING, description: "e.g., 'Needs your confirmation before adding' or 'Already supported'" },
        reason: { type: Type.STRING },
        atsImpact: { type: Type.STRING },
        confidence: { type: Type.INTEGER }
      },
      required: ["section", "suggestedSentence", "evidenceStatus", "reason", "atsImpact", "confidence"]
    };

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
      config: { 
        responseMimeType: "application/json", 
        responseSchema: schema,
        temperature: 0.1,
        // Limiting tokens and parameters to achieve near-instant generation
        maxOutputTokens: 200
      }
    });

    res.json(JSON.parse(response.text!));
  } catch (error: any) {
    res.status(500).json({ error: "Failed to tailor gap.", details: error.message });
  }
});

// V2 Deterministic Pipeline - Phase 5 & 14: Batch Tailoring & Explanation Engine
app.post("/api/tailor-resume-batch", async (req, res) => {
  try {
    const { resumeText, frozenProfile, selectedItems } = req.body;
    if (!resumeText || !frozenProfile || !selectedItems) return res.status(400).json({ error: "Missing data." });

    const ai = getAI();
    const systemPrompt = `You are a strict Resume Tailoring Engine.
Optimize the current resume by addressing ONLY the selected missing checklist items.
Do not invent additional requirements. Do not rewrite sections that are already correct.
Integrate the missing skills, keywords, or projects naturally into the resume text.

Resume Context:
${resumeText}

Selected items to resolve:
${JSON.stringify(selectedItems)}

Frozen Profile:
${JSON.stringify(frozenProfile)}

Please return the fully optimized resume text in Markdown, and explain every change you made.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        tailoredContent: { type: Type.STRING, description: "Complete, professionally optimized resume in Markdown format." },
        explanations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              whatChanged: { type: Type.STRING, description: "e.g., Added TypeScript to skills, or Added Docker project in Experience" },
              why: { type: Type.STRING },
              atsBenefit: { type: Type.STRING, description: "e.g., +4%" },
              recruiterBenefit: { type: Type.STRING, description: "High, Medium, or Low" },
              confidence: { type: Type.INTEGER }
            },
            required: ["whatChanged", "why", "atsBenefit", "recruiterBenefit", "confidence"]
          }
        }
      },
      required: ["tailoredContent", "explanations"]
    };

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
      config: { 
        responseMimeType: "application/json", 
        responseSchema: schema,
        temperature: 0.2
      }
    });

    res.json(JSON.parse(response.text!));
  } catch (error: any) {
    res.status(500).json({ error: "Failed to perform batch tailoring.", details: error.message });
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
      // In Express v4, wildcard is '*'
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
