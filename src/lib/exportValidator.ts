import { ParsedResume, TailoredResumeVersion } from "../types";

// ============================================================================
// RESUMIX STAGE 5: EXPORT VALIDATION GATE & CONTENT INTEGRITY CHECKER
// ============================================================================

export interface ExportValidationResult {
  isValid: boolean;
  canExport: boolean;
  errors: string[];
  warnings: string[];
}

export interface ExportIntegrityReport {
  isIntegrityPreserved: boolean;
  isIntact: boolean;
  isNamePreserved: boolean;
  isContactPreserved: boolean;
  omittedSkills: string[];
  omittedCompanies: string[];
  omittedProjects: string[];
  missingFacts: string[];
  discrepancyCount: number;
  summary: string;
}

/**
 * Validates that a resume version has passed all factual gates and is ready
 * for export to PDF, DOCX, or Print.
 */
export function validateExportReadiness(
  versionOrOptions?: Partial<TailoredResumeVersion> | {
    status?: string;
    tailoredContent?: string;
    parsedResume?: ParsedResume;
    isValid?: boolean;
    finalityStatus?: string;
  } | null
): ExportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!versionOrOptions) {
    errors.push("No resume version available for export.");
    return { isValid: false, canExport: false, errors, warnings };
  }

  const content = versionOrOptions.tailoredContent || "";
  const trimmed = content.trim();

  // 1. Content check
  if (!trimmed || trimmed.length === 0) {
    errors.push("Resume content is empty or contains only whitespace.");
  } else if (trimmed.length < 50) {
    errors.push("Resume content is too short for valid export.");
  }

  // 2. Status check (Must be FINAL_OPTIMIZED or verified valid)
  const status = (versionOrOptions as any).status || versionOrOptions.finalityStatus;
  if (status && status !== "FINAL_OPTIMIZED" && status !== "LOCKED") {
    errors.push(`Resume is in non-final status (${status}). Only final optimized resumes can be exported.`);
  }

  if (versionOrOptions.isValid === false) {
    errors.push("Resume failed factual validation checks. Unsupported content cannot be exported.");
  }

  if (versionOrOptions.finalityStatus === "VALIDATION_FAILED") {
    errors.push("Resume has a failed validation status.");
  }

  // 3. Template & Placeholder Detection
  if (/\{\{[A-Z0-9_-]+\}\}/i.test(content)) {
    errors.push("Contains un-rendered template placeholders (e.g. {{COMPANY}}).");
  }
  if (/\[Insert\s+[^\]]+\]/i.test(content) || /\[TODO[^\]]*\]/i.test(content)) {
    errors.push("Contains unresolved square bracket placeholders like [Insert Metric].");
  }
  if (/\b(TODO|FIXME|LOREM\s+IPSUM)\b/i.test(content)) {
    errors.push("Contains unfinished draft markers (TODO / FIXME / LOREM IPSUM).");
  }

  // 4. Structural Warnings
  const lowerContent = content.toLowerCase();
  const hasExperience = lowerContent.includes("experience") || lowerContent.includes("work") || lowerContent.includes("employment");
  const hasProjects = lowerContent.includes("project");
  if (!hasExperience && !hasProjects) {
    warnings.push("Resume appears to lack an Experience or Projects section.");
  }

  const hasEmailOrContact = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(content) ||
    lowerContent.includes("linkedin.com") || lowerContent.includes("github.com") || /\d{3}[-.]?\d{3}[-.]?\d{4}/.test(content);
  
  if (!hasEmailOrContact) {
    warnings.push("No contact email or phone number detected in resume header.");
  }

  const parsed = (versionOrOptions as any).parsedResume;
  if (parsed?.name && !lowerContent.includes(parsed.name.toLowerCase())) {
    warnings.push(`Candidate name "${parsed.name}" was not detected in the resume header.`);
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    canExport: isValid,
    errors,
    warnings
  };
}

/**
 * Validates that critical facts from the original parsed resume are preserved
 * in the exported text without truncation, silent section deletion, or corruption.
 */
export function verifyExportContentIntegrity(
  originalParsed?: ParsedResume | null,
  exportedText: string = ""
): ExportIntegrityReport {
  const omittedSkills: string[] = [];
  const omittedCompanies: string[] = [];
  const omittedProjects: string[] = [];
  const missingFacts: string[] = [];
  const exportedLower = (exportedText || "").toLowerCase();

  if (!originalParsed) {
    return {
      isIntegrityPreserved: true,
      isIntact: true,
      isNamePreserved: true,
      isContactPreserved: true,
      omittedSkills: [],
      omittedCompanies: [],
      omittedProjects: [],
      missingFacts: [],
      discrepancyCount: 0,
      summary: "No original parsed profile to compare against. Export content accepted."
    };
  }

  // 1. Candidate Name
  const candidateName = originalParsed.contactInfo?.name || originalParsed.name;
  let isNamePreserved = true;
  if (candidateName && candidateName.trim().length > 1) {
    if (!exportedLower.includes(candidateName.toLowerCase().trim())) {
      isNamePreserved = false;
      missingFacts.push(`Candidate name "${candidateName}" is missing.`);
    }
  }

  // 2. Email & Contact
  const email = originalParsed.contactInfo?.email || originalParsed.email;
  let isContactPreserved = true;
  if (email && email.trim().length > 3) {
    if (!exportedLower.includes(email.toLowerCase().trim())) {
      isContactPreserved = false;
      missingFacts.push(`Contact email "${email}" is missing.`);
    }
  }

  // 3. URLs
  if (originalParsed.contactInfo?.github && !exportedLower.includes(originalParsed.contactInfo.github.toLowerCase())) {
    missingFacts.push(`GitHub URL "${originalParsed.contactInfo.github}" is missing.`);
  }
  if (originalParsed.contactInfo?.linkedin && !exportedLower.includes(originalParsed.contactInfo.linkedin.toLowerCase())) {
    missingFacts.push(`LinkedIn URL "${originalParsed.contactInfo.linkedin}" is missing.`);
  }

  // 4. Skills
  for (const s of originalParsed.skills || []) {
    if (s && s.length > 1) {
      // Clean word boundaries or inclusion check
      const cleanSkill = s.toLowerCase().trim();
      if (!exportedLower.includes(cleanSkill)) {
        omittedSkills.push(s);
        missingFacts.push(`Skill "${s}" omitted.`);
      }
    }
  }

  // 5. Companies
  for (const exp of originalParsed.experience || []) {
    if (exp && exp.company && exp.company.length > 2) {
      const cleanCompany = exp.company.toLowerCase().trim();
      if (!exportedLower.includes(cleanCompany)) {
        omittedCompanies.push(exp.company);
        missingFacts.push(`Company "${exp.company}" omitted.`);
      }
    }
  }

  // 6. Projects
  for (const proj of originalParsed.projects || []) {
    const title = typeof proj === "string" ? proj : (proj as any)?.title;
    if (title && title.length > 2) {
      const cleanTitle = title.toLowerCase().trim();
      if (!exportedLower.includes(cleanTitle)) {
        omittedProjects.push(title);
        missingFacts.push(`Project "${title}" omitted.`);
      }
    }
  }

  const discrepancyCount = missingFacts.length;
  const isIntegrityPreserved = discrepancyCount === 0;

  const summary = isIntegrityPreserved
    ? "All verified candidate facts, companies, and skills are 100% preserved."
    : `Detected ${discrepancyCount} fact discrepancy(s): ${missingFacts.join("; ")}`;

  return {
    isIntegrityPreserved,
    isIntact: isIntegrityPreserved,
    isNamePreserved,
    isContactPreserved,
    omittedSkills,
    omittedCompanies,
    omittedProjects,
    missingFacts,
    discrepancyCount,
    summary
  };
}
