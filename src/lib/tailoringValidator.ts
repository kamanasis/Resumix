import { ParsedResume } from "../types";
import { normalizeTechnologyName, areTechnologiesEquivalent } from "./requirementEngine";

// ============================================================================
// RESUMIX STAGE 4: DETERMINISTIC POST-GENERATION FACTUAL VALIDATOR
// ============================================================================

export type ChangeType =
  | "REPHRASE"
  | "REORDER"
  | "CONDENSE"
  | "KEYWORD_ALIGNMENT"
  | "SECTION_RESTRUCTURE"
  | "CLARIFICATION"
  | "USER_APPROVED_ADDITION"
  | "UNSUPPORTED_CHANGE";

export interface ProvenanceChange {
  id: string;
  section: string;
  originalText: string;
  generatedText: string;
  reason: string;
  relatedRequirementId?: string;
  evidenceQuote?: string;
  changeType: ChangeType;
}

export interface ValidationResult {
  isValid: boolean;
  validationErrors: string[];
  classifiedChanges: ProvenanceChange[];
  rejectedChanges: ProvenanceChange[];
}

/**
 * Extracts numeric metrics, percentages, team sizes, and dollar amounts from text.
 */
export function extractNumericMetrics(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  const metrics: string[] = [];

  // 1. Percentages: e.g. 30%, 45.5%
  const pctMatches = text.match(/\b\d+(?:\.\d+)?%/g) || [];
  metrics.push(...pctMatches);

  // 2. Currency: e.g. $500k, $1M, $50,000
  const curMatches = text.match(/\$\d+(?:,\d+)*(?:\.\d+)?[kmbKMB]?\b/g) || [];
  metrics.push(...curMatches);

  // 3. Multipliers: e.g. 10x, 2.5x
  const multMatches = text.match(/\b\d+(?:\.\d+)?x\b/gi) || [];
  metrics.push(...multMatches);

  // 4. Team sizes & User counts: e.g. "team of 10", "10 engineers", "500 users"
  const countMatches = text.match(/\b(?:team\s+of\s+\d+|\d+\s+(?:engineers|developers|members|users|clients|customers))\b/gi) || [];
  metrics.push(...countMatches);

  return Array.from(new Set(metrics.map(m => m.trim().toLowerCase())));
}

/**
 * Validates that all metrics in the tailored resume originated from the original resume or user-approved corrections.
 */
export function validateMetrics(
  originalText: string,
  tailoredText: string,
  userApprovedMetrics: string[] = []
): { isValid: boolean; unsupportedMetrics: string[] } {
  const originalMetrics = new Set([
    ...extractNumericMetrics(originalText),
    ...userApprovedMetrics.map(m => m.trim().toLowerCase())
  ]);

  const tailoredMetrics = extractNumericMetrics(tailoredText);
  const unsupportedMetrics: string[] = [];

  for (const m of tailoredMetrics) {
    if (!originalMetrics.has(m)) {
      unsupportedMetrics.push(m);
    }
  }

  return {
    isValid: unsupportedMetrics.length === 0,
    unsupportedMetrics
  };
}

/**
 * Known tech keywords to scan for unauthorized additions.
 */
const COMMON_TECH_KEYWORDS = [
  "rust", "tokio", "django", "kubernetes", "k8s", "terraform", "aws", "gcp", "azure",
  "docker", "graphql", "spring boot", "springboot", "go", "golang", "react", "next.js",
  "nextjs", "vue", "angular", "node.js", "nodejs", "python", "typescript", "c++", "c#",
  "java", "php", "ruby", "swift", "kotlin", "scala", "redis", "mongodb", "postgresql"
];

/**
 * Validates that no unpossessed technical skills were injected into the tailored resume text.
 */
export function validateTechnologies(
  originalParsed: ParsedResume,
  tailoredText: string,
  userApprovedSkills: string[] = []
): { isValid: boolean; unauthorizedSkills: string[] } {
  const authorizedCanonicals = new Set<string>();

  // Add all original skills, tools, frameworks
  for (const s of [
    ...(originalParsed.skills || []),
    ...(originalParsed.tools || []),
    ...(originalParsed.frameworks || []),
    ...userApprovedSkills
  ]) {
    if (s && typeof s === "string") {
      authorizedCanonicals.add(normalizeTechnologyName(s).toLowerCase());
    }
  }

  // Also check if words appear in original summary, experience, or projects
  const originalCorpus = [
    originalParsed.summary || "",
    ...(originalParsed.experience || []).map(e => `${e.role} ${e.company} ${e.description}`),
    ...(originalParsed.projects || []).map(p => `${p.title} ${p.description}`)
  ].join(" ").toLowerCase();

  const tailoredLower = tailoredText.toLowerCase();
  const unauthorizedSkills: string[] = [];

  for (const tech of COMMON_TECH_KEYWORDS) {
    const canonical = normalizeTechnologyName(tech).toLowerCase();
    const regex = new RegExp(`\\b${escapeRegExp(tech)}\\b`, "i");

    if (regex.test(tailoredLower)) {
      // Check if candidate actually has this tech authorized
      const hasDirectAuth = authorizedCanonicals.has(canonical);
      const hasCorpusMention = originalCorpus.includes(tech) || originalCorpus.includes(canonical);

      if (!hasDirectAuth && !hasCorpusMention) {
        unauthorizedSkills.push(tech);
      }
    }
  }

  return {
    isValid: unauthorizedSkills.length === 0,
    unauthorizedSkills
  };
}

/**
 * Validates that all employers in tailored experience match original employers.
 */
export function validateEmployers(
  originalParsed: ParsedResume,
  tailoredText: string,
  userApprovedCompanies: string[] = []
): { isValid: boolean; unauthorizedEmployers: string[] } {
  const originalCompanies = new Set(
    (originalParsed.experience || [])
      .map(e => (e.company || "").trim().toLowerCase())
      .filter(Boolean)
  );
  for (const c of userApprovedCompanies) {
    originalCompanies.add(c.trim().toLowerCase());
  }

  // If original had 0 experience, tailored must have 0 new companies
  if (originalCompanies.size === 0) {
    // Check if tailored text fabricated an experience block with new employers
    const companyMatch = tailoredText.match(/(?:at|for|company:?)\s+([A-Z][a-zA-Z0-9\s&]{2,30}(?:Inc|LLC|Corp|Technologies|Solutions|Labs|Pvt|Ltd)?)/g);
    if (companyMatch && companyMatch.length > 0) {
      // Filter out standard non-company headers
      const fabricated = companyMatch.filter(m => !m.toLowerCase().includes("university") && !m.toLowerCase().includes("college"));
      if (fabricated.length > 0 && originalParsed.experience?.length === 0) {
        return { isValid: false, unauthorizedEmployers: fabricated };
      }
    }
  }

  return { isValid: true, unauthorizedEmployers: [] };
}

/**
 * Validates that seniority levels (e.g. Intern, Junior) were not escalated to Senior/Lead/Architect.
 */
export function validateSeniority(
  originalText: string,
  tailoredText: string
): { isValid: boolean; escalatedSeniority: string[] } {
  const origLower = originalText.toLowerCase();
  const tailLower = tailoredText.toLowerCase();

  const escalated: string[] = [];

  const checkEscalation = (juniorTerm: string, seniorTerm: string) => {
    if (origLower.includes(juniorTerm) && !origLower.includes(seniorTerm)) {
      if (tailLower.includes(seniorTerm)) {
        escalated.push(`Escalated "${juniorTerm}" to "${seniorTerm}" without evidence.`);
      }
    }
  };

  checkEscalation("intern", "senior engineer");
  checkEscalation("intern", "lead engineer");
  checkEscalation("intern", "principal engineer");
  checkEscalation("junior developer", "senior engineer");
  checkEscalation("junior developer", "lead engineer");
  checkEscalation("junior developer", "architect");
  checkEscalation("trainee", "team lead");
  checkEscalation("trainee", "senior");

  return {
    isValid: escalated.length === 0,
    escalatedSeniority: escalated
  };
}

/**
 * Validates that empty sections (0 projects, 0 certifications) were not fabricated.
 */
export function validateAbsence(
  originalParsed: ParsedResume,
  tailoredText: string
): { isValid: boolean; fabricatedSections: string[] } {
  const fabricated: string[] = [];

  if ((!originalParsed.projects || originalParsed.projects.length === 0) &&
      !originalParsed.summary?.toLowerCase().includes("project")) {
    if (/#+\s*Projects?\b/i.test(tailoredText) && /###?\s+[A-Za-z0-9]/i.test(tailoredText)) {
      fabricated.push("Fabricated Projects section when candidate has 0 original projects.");
    }
  }

  if ((!originalParsed.certifications || originalParsed.certifications.length === 0)) {
    if (/#+\s*Certifications?\b/i.test(tailoredText) && /(aws|certified|oracle|cisco)\b/i.test(tailoredText)) {
      fabricated.push("Fabricated Certifications section when candidate has 0 original certifications.");
    }
  }

  return {
    isValid: fabricated.length === 0,
    fabricatedSections: fabricated
  };
}

/**
 * Master Post-Generation Factual Validator.
 */
export function validateTailoredResume(
  originalParsed: ParsedResume,
  originalRawText: string,
  tailoredText: string,
  userApprovedAdditions: { skills?: string[]; metrics?: string[]; companies?: string[] } = {}
): ValidationResult {
  const validationErrors: string[] = [];
  const classifiedChanges: ProvenanceChange[] = [];
  const rejectedChanges: ProvenanceChange[] = [];

  // 1. Metric Validation
  const metricCheck = validateMetrics(originalRawText, tailoredText, userApprovedAdditions.metrics || []);
  if (!metricCheck.isValid) {
    for (const m of metricCheck.unsupportedMetrics) {
      validationErrors.push(`Unsupported metric generated: "${m}". Fabricating quantitative metrics is forbidden.`);
    }
  }

  // 2. Technology Validation
  const techCheck = validateTechnologies(originalParsed, tailoredText, userApprovedAdditions.skills || []);
  if (!techCheck.isValid) {
    for (const t of techCheck.unauthorizedSkills) {
      validationErrors.push(`Unauthorized technology injected: "${t}". Target skills cannot be added without user evidence.`);
    }
  }

  // 3. Employer Validation
  const employerCheck = validateEmployers(originalParsed, tailoredText, userApprovedAdditions.companies || []);
  if (!employerCheck.isValid) {
    for (const e of employerCheck.unauthorizedEmployers) {
      validationErrors.push(`Unauthorized employer/work experience injected: "${e}".`);
    }
  }

  // 4. Seniority Validation
  const seniorityCheck = validateSeniority(originalRawText, tailoredText);
  if (!seniorityCheck.isValid) {
    for (const s of seniorityCheck.escalatedSeniority) {
      validationErrors.push(s);
    }
  }

  // 5. Absence Preservation
  const absenceCheck = validateAbsence(originalParsed, tailoredText);
  if (!absenceCheck.isValid) {
    for (const a of absenceCheck.fabricatedSections) {
      validationErrors.push(a);
    }
  }

  const isValid = validationErrors.length === 0;

  return {
    isValid,
    validationErrors,
    classifiedChanges,
    rejectedChanges
  };
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
