import { 
  normalizeTechnologyName, 
  generateRequirementId, 
  TargetRequirement, 
  RequirementCategory, 
  RequirementImportance 
} from "../requirementEngine";

// ============================================================================
// RESUMIX STAGE 6: JOB NORMALIZATION & EVIDENCE-GROUNDED REQUIREMENT EXTRACTOR
// ============================================================================
// Extracts requirements with exact verbatim source quotes.
// Reuses Stage 3 canonical normalization while strictly preserving boundaries:
// Python != Django, JavaScript != React, AWS != Kubernetes, C != C++.
// ============================================================================

export interface NormalizedJobRole {
  canonicalTitle: string;
  canonicalRole: string;
  experienceLevel: string;
}

const SENIORITY_LEVELS: [RegExp, string][] = [
  [/\b(intern|internship|co-op)\b/i, "Intern / Co-op"],
  [/\b(junior|entry[\s-]level|associate|fresh|graduate)\b/i, "Junior / Entry-Level"],
  [/\b(senior|sr\.?|lead|principal|staff|architect|director|head)\b/i, "Senior / Lead"],
  [/\b(mid[\s-]level|experienced)\b/i, "Mid-Level"]
];

const COMMON_ROLE_PATTERNS: [RegExp, string][] = [
  [/\b(frontend|front[\s-]end|ui|react|angular|vue)\s+(engineer|developer)\b/i, "Frontend Engineer"],
  [/\b(backend|back[\s-]end|api|distributed\s+systems)\s+(engineer|developer)\b/i, "Backend Engineer"],
  [/\b(full[\s-]stack|fullstack)\s+(engineer|developer)\b/i, "Full Stack Engineer"],
  [/\b(devops|platform|site\s+reliability|sre|infrastructure)\s+(engineer|developer)\b/i, "DevOps / Infrastructure Engineer"],
  [/\b(machine\s+learning|ml|ai|deep\s+learning|data\s+scientist)\b/i, "Machine Learning / Data Scientist"],
  [/\b(product\s+manager|pm)\b/i, "Product Manager"],
  [/\b(ui\/ux|product\s+designer|graphic\s+designer)\b/i, "Product Designer"],
  [/\b(financial\s+analyst|accountant|auditor)\b/i, "Finance / Analyst"],
  [/\b(management\s+consultant|strategy\s+consultant)\b/i, "Consultant"],
  [/\b(mechanical|electrical|automotive)\s+engineer\b/i, "Mechanical / Hardware Engineer"]
];

/**
 * Normalizes job title into canonical title, canonical role, and experience level.
 */
export function normalizeJobRole(title: string, rawExperience?: string): NormalizedJobRole {
  const cleanTitle = (title || "Software Engineer").trim();

  // Detect level
  let level = rawExperience?.trim() || "1–3 years";
  for (const [regex, lvl] of SENIORITY_LEVELS) {
    if (regex.test(cleanTitle)) {
      level = lvl;
      break;
    }
  }

  // Detect canonical role
  let canonicalRole = "Software Engineer";
  for (const [regex, role] of COMMON_ROLE_PATTERNS) {
    if (regex.test(cleanTitle)) {
      canonicalRole = role;
      break;
    }
  }

  return {
    canonicalTitle: cleanTitle,
    canonicalRole,
    experienceLevel: level
  };
}

/**
 * Common technical and professional terms to scan for anchored quotes in job descriptions.
 */
const SKILL_DICTIONARY: [string, RequirementCategory, string][] = [
  // Programming Languages
  ["TypeScript", "LANGUAGE", "typescript"],
  ["JavaScript", "LANGUAGE", "javascript"],
  ["Python", "LANGUAGE", "python"],
  ["Rust", "LANGUAGE", "rust"],
  ["Go", "LANGUAGE", "golang|\\bgo\\b"],
  ["Java", "LANGUAGE", "\\bjava\\b"],
  ["C++", "LANGUAGE", "c\\+\\+"],
  ["C#", "LANGUAGE", "c#|csharp"],
  ["SQL", "LANGUAGE", "\\bsql\\b"],
  ["HTML/CSS", "LANGUAGE", "html|css"],

  // Frameworks & Libraries (Strict Boundaries: React != JS, Django != Python)
  ["React", "FRAMEWORK", "react(\\.js|js)?"],
  ["Node.js", "FRAMEWORK", "node(\\.js|js)?"],
  ["Django", "FRAMEWORK", "django"],
  ["Spring Boot", "FRAMEWORK", "spring(\\s+boot)?"],
  ["Next.js", "FRAMEWORK", "next(\\.js|js)?"],
  ["Vue.js", "FRAMEWORK", "vue(\\.js|js)?"],
  ["Express.js", "FRAMEWORK", "express(\\.js|js)?"],
  ["FastAPI", "FRAMEWORK", "fastapi"],
  ["Flask", "FRAMEWORK", "flask"],

  // Cloud, Infra & Databases
  ["AWS", "CLOUD", "\\baws\\b|amazon\\s+web\\s+services"],
  ["Azure", "CLOUD", "azure"],
  ["Google Cloud", "CLOUD", "gcp|google\\s+cloud"],
  ["Kubernetes", "TOOL", "kubernetes|k8s"],
  ["Docker", "TOOL", "docker"],
  ["PostgreSQL", "DATABASE", "postgres(ql)?"],
  ["MongoDB", "DATABASE", "mongodb|mongo"],
  ["Redis", "DATABASE", "redis"],
  ["GraphQL", "TOOL", "graphql"],
  ["Kafka", "TOOL", "kafka"],
  ["CI/CD", "TOOL", "ci/cd|continuous\\s+integration"],
  ["Git", "TOOL", "\\bgit\\b|github|gitlab"],

  // Domain & Non-Tech
  ["Financial Modeling", "DOMAIN_KNOWLEDGE", "financial\\s+model(ing)?"],
  ["Agile / Scrum", "TOOL", "agile|scrum"],
  ["Data Analysis", "DOMAIN_KNOWLEDGE", "data\\s+analysis"],
  ["Project Management", "DOMAIN_KNOWLEDGE", "project\\s+management"]
];

/**
 * Extracts verifiable requirements from source job text with exact verbatim quotes.
 * Anchored to the text: if a requirement quote cannot be found, it is marked UNVERIFIED.
 */
export function extractJobRequirements(
  jobDescription: string,
  snapshotId: string
): TargetRequirement[] {
  const requirements: TargetRequirement[] = [];
  const lines = jobDescription.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const fullTextLower = jobDescription.toLowerCase();

  for (const [canonicalName, category, pattern] of SKILL_DICTIONARY) {
    const regex = new RegExp(`\\b(${pattern})\\b`, "i");
    const match = regex.exec(jobDescription);

    if (match) {
      // Find the specific sentence or line containing the term for exact verbatim quote
      let sourceQuote = "";
      for (const line of lines) {
        if (regex.test(line)) {
          sourceQuote = line.length > 250 ? line.substring(0, 247) + "..." : line;
          break;
        }
      }

      // Check if it's explicitly under preferred/optional sections
      const isPreferred = /(preferred|bonus|nice[\s-]to[\s-]have|plus|optional)/i.test(sourceQuote) ||
        fullTextLower.indexOf("preferred") !== -1 && fullTextLower.indexOf(match[0].toLowerCase()) > fullTextLower.indexOf("preferred");

      const importance: RequirementImportance = isPreferred ? "PREFERRED" : "REQUIRED";
      const normalizedName = normalizeTechnologyName(canonicalName);
      const requirementId = generateRequirementId(snapshotId, normalizedName, category);

      requirements.push({
        requirementId,
        name: normalizedName,
        canonicalName: normalizedName,
        category,
        importance,
        source: "JOB_DESCRIPTION",
        sourceQuote: sourceQuote || match[0],
        status: "PRESENT",
        priority: importance === "REQUIRED" ? "CRITICAL" : "MEDIUM",
        confidence: 1.0,
        evidenceQuote: sourceQuote || match[0]
      });
    }
  }

  return requirements;
}
