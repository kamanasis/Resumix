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
