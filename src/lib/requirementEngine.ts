import crypto from "crypto";

// ============================================================================
// RESUMIX STAGE 3: REQUIREMENT ENGINE & NORMALIZATION LAYER
// ============================================================================

export type RequirementCategory =
  | "TECHNICAL_SKILL"
  | "SOFT_SKILL"
  | "TOOL"
  | "FRAMEWORK"
  | "LANGUAGE"
  | "DATABASE"
  | "CLOUD"
  | "CERTIFICATION"
  | "EDUCATION"
  | "EXPERIENCE"
  | "RESPONSIBILITY"
  | "DOMAIN_KNOWLEDGE"
  | "KEYWORD"
  | "OTHER";

export type RequirementImportance = "REQUIRED" | "PREFERRED" | "OPTIONAL";

export type RequirementSource =
  | "JOB_DESCRIPTION"
  | "COMPANY_VERIFIED"
  | "TARGET_ROLE"
  | "ROLE_LEVEL"
  | "AI_INFERENCE";

export type RequirementStatus =
  | "PRESENT"
  | "PARTIAL"
  | "MISSING"
  | "UNVERIFIED"
  | "NOT_APPLICABLE";

export type RequirementPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface TargetRequirement {
  requirementId: string;
  name: string;
  canonicalName: string;
  category: RequirementCategory;
  importance: RequirementImportance;
  source: RequirementSource;
  sourceQuote?: string;
  status: RequirementStatus;
  priority: RequirementPriority;
  confidence: number;
  evidenceQuote?: string;
  reason?: string;
}

// ----------------------------------------------------------------------------
// Controlled Canonical Normalization Dictionary
// ----------------------------------------------------------------------------
// Maps common syntactic variants/aliases to canonical technology names.
// STRICT RULE: Distinct technologies (e.g. Python vs Django, JS vs React)
// MUST NEVER be mapped to each other.
const ALIAS_MAP: Record<string, string> = {
  // Languages & Core Runtimes
  "react.js": "React",
  "reactjs": "React",
  "react": "React",
  "node": "Node.js",
  "node.js": "Node.js",
  "nodejs": "Node.js",
  "vue.js": "Vue.js",
  "vuejs": "Vue.js",
  "vue": "Vue.js",
  "next.js": "Next.js",
  "nextjs": "Next.js",
  "next": "Next.js",
  "js": "JavaScript",
  "javascript": "JavaScript",
  "ts": "TypeScript",
  "typescript": "TypeScript",
  "py": "Python",
  "python": "Python",
  "golang": "Go",
  "go": "Go",
  "rust-lang": "Rust",
  "rust": "Rust",
  "c++": "C++",
  "cpp": "C++",
  "c#": "C#",
  "csharp": "C#",

  // Frameworks & Libraries
  "drf": "Django REST Framework",
  "django rest framework": "Django REST Framework",
  "django": "Django",
  "spring-boot": "Spring Boot",
  "springboot": "Spring Boot",
  "spring boot": "Spring Boot",
  "express": "Express.js",
  "express.js": "Express.js",
  "expressjs": "Express.js",
  "fastapi": "FastAPI",
  "fast-api": "FastAPI",
  "tokio": "Tokio",

  // Databases
  "postgres": "PostgreSQL",
  "postgresql": "PostgreSQL",
  "mongo": "MongoDB",
  "mongodb": "MongoDB",
  "ms sql": "Microsoft SQL Server",
  "mssql": "Microsoft SQL Server",
  "sql server": "Microsoft SQL Server",
  "redis": "Redis",

  // Cloud & DevOps
  "k8s": "Kubernetes",
  "kubernetes": "Kubernetes",
  "docker": "Docker",
  "tf": "Terraform",
  "terraform": "Terraform",
  "gcp": "Google Cloud Platform",
  "google cloud": "Google Cloud Platform",
  "google cloud platform": "Google Cloud Platform",
  "aws": "AWS",
  "amazon web services": "AWS",
  "azure": "Microsoft Azure",
  "ms azure": "Microsoft Azure",
  "aws lambda": "AWS Lambda",
  "lambda": "AWS Lambda"
};

// Explicit Pairs that are known to be distinct and must never match implicitly
const DISTINCT_TECH_PAIRS: [string, string][] = [
  ["python", "django"],
  ["javascript", "react"],
  ["javascript", "node.js"],
  ["typescript", "angular"],
  ["cloud", "aws"],
  ["cloud", "gcp"],
  ["cloud", "azure"],
  ["aws", "kubernetes"],
  ["programming", "rust"],
  ["database", "postgresql"],
  ["backend", "spring boot"]
];

/**
 * Normalizes a raw skill/requirement name to its canonical form if a direct alias exists.
 */
export function normalizeTechnologyName(name: string): string {
  if (!name || typeof name !== "string") return "";
  const cleaned = name.trim();
  const lower = cleaned.toLowerCase();
  
  if (ALIAS_MAP[lower]) {
    return ALIAS_MAP[lower];
  }
  
  // Return cleaned title/cased string
  return cleaned;
}

/**
 * Checks whether two technology strings represent the same canonical technology.
 */
export function areTechnologiesEquivalent(techA: string, techB: string): boolean {
  if (!techA || !techB) return false;
  const canonicalA = normalizeTechnologyName(techA).toLowerCase();
  const canonicalB = normalizeTechnologyName(techB).toLowerCase();
  
  if (canonicalA === canonicalB) return true;

  // Check if they are in the forbidden distinct pairs list
  for (const [forbiddenA, forbiddenB] of DISTINCT_TECH_PAIRS) {
    if (
      (canonicalA === forbiddenA && canonicalB === forbiddenB) ||
      (canonicalA === forbiddenB && canonicalB === forbiddenA)
    ) {
      return false;
    }
  }

  return false;
}

/**
 * Checks whether two technology terms are distinct and cannot be substituted.
 */
export function isDistinctTechnology(techA: string, techB: string): boolean {
  return !areTechnologiesEquivalent(techA, techB);
}

/**
 * Generates a deterministic SHA-256 hash for a target requirement profile.
 * Guarantees that identical inputs always produce the exact same profile hash.
 */
export function computeProfileHash(
  company: string,
  role: string,
  experienceLevel: string,
  jobDescription?: string
): string {
  const normalizedCompany = (company || "").trim().toLowerCase();
  const normalizedRole = (role || "").trim().toLowerCase();
  const normalizedExp = (experienceLevel || "").trim().toLowerCase();
  const normalizedJD = (jobDescription || "").trim().replace(/\s+/g, " ");

  const payload = `${normalizedCompany}|${normalizedRole}|${normalizedExp}|${normalizedJD}`;
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex").substring(0, 16);
}

/**
 * Generates a deterministic ID for a specific requirement based on its canonical name and category.
 */
export function generateRequirementId(profileHash: string, canonicalName: string, category: string): string {
  const normName = canonicalName.trim().toLowerCase();
  const normCat = category.trim().toLowerCase();
  const payload = `${profileHash}:${normCat}:${normName}`;
  return "req_" + crypto.createHash("sha256").update(payload, "utf8").digest("hex").substring(0, 12);
}

/**
 * Deduplicates a list of raw requirements by resolving to canonical names
 * and retaining the highest priority source and importance.
 */
export function deduplicateRequirements(requirements: TargetRequirement[]): TargetRequirement[] {
  const map = new Map<string, TargetRequirement>();

  const importanceRank: Record<RequirementImportance, number> = {
    REQUIRED: 3,
    PREFERRED: 2,
    OPTIONAL: 1
  };

  const sourceRank: Record<RequirementSource, number> = {
    JOB_DESCRIPTION: 5,
    COMPANY_VERIFIED: 4,
    TARGET_ROLE: 3,
    ROLE_LEVEL: 2,
    AI_INFERENCE: 1
  };

  for (const req of requirements) {
    const key = `${req.category}:${req.canonicalName.toLowerCase()}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, req);
    } else {
      // Merge by picking higher importance and source
      const mergedImportance =
        importanceRank[req.importance] > importanceRank[existing.importance]
          ? req.importance
          : existing.importance;

      const mergedSource =
        sourceRank[req.source] > sourceRank[existing.source]
          ? req.source
          : existing.source;

      const mergedPriority =
        mergedImportance === "REQUIRED" ? "CRITICAL" : existing.priority;

      map.set(key, {
        ...existing,
        importance: mergedImportance,
        source: mergedSource,
        priority: mergedPriority,
        sourceQuote: existing.sourceQuote || req.sourceQuote
      });
    }
  }

  return Array.from(map.values());
}
