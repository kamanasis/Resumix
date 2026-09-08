import { ParsedResume, RequirementProfile, GapReport } from "../types";
import { evaluateResumeAgainstRequirements, EvaluationResult } from "./atsEngine";
import { ProvenanceChange, ValidationResult } from "./tailoringValidator";

// ============================================================================
// RESUMIX STAGE 4: EVIDENCE-BASED TAILORING & FINALITY ENGINE
// ============================================================================

export interface ScoreComparison {
  beforeAtsScore: number;
  afterAtsScore: number;
  atsScoreDelta: number;
  beforeTargetMatch: number;
  afterTargetMatch: number;
  targetMatchDelta: number;
  beforeCriticalGaps: number;
  afterCriticalGaps: number;
  beforeMatchedCount: number;
  afterMatchedCount: number;
}

export interface TailoringOutput {
  tailoredContent: string;
  parsedTailoredResume: ParsedResume;
  changes: ProvenanceChange[];
  scoreComparison: ScoreComparison;
  isFinalVersion: boolean;
  finalityStatus: "OPTIMIZING" | "FINAL_OPTIMIZED" | "VALIDATION_FAILED";
  validation: ValidationResult;
}

/**
 * Builds a clean, professional, ATS-optimized Markdown resume from structured entities.
 */
export function formatResumeToMarkdown(parsed: ParsedResume): string {
  const sections: string[] = [];

  // 1. Header & Contact
  const name = parsed.contactInfo?.name || "Candidate";
  const contactParts: string[] = [];
  if (parsed.contactInfo?.email) contactParts.push(parsed.contactInfo.email);
  if (parsed.contactInfo?.phone) contactParts.push(parsed.contactInfo.phone);
  if (parsed.contactInfo?.location) contactParts.push(parsed.contactInfo.location);
  if (parsed.contactInfo?.linkedin) contactParts.push(parsed.contactInfo.linkedin);
  if (parsed.contactInfo?.github) contactParts.push(parsed.contactInfo.github);

  sections.push(`# ${name}`);
  if (contactParts.length > 0) {
    sections.push(contactParts.join(" | "));
  }

  // 2. Summary
  if (parsed.summary && parsed.summary.trim()) {
    sections.push(`\n## Professional Summary\n${parsed.summary.trim()}`);
  }

  // 3. Skills
  const allSkills = [
    ...(parsed.skills || []),
    ...(parsed.frameworks || []),
    ...(parsed.tools || [])
  ];
  if (allSkills.length > 0) {
    const uniqueSkills = Array.from(new Set(allSkills));
    sections.push(`\n## Technical Skills\n${uniqueSkills.join(", ")}`);
  }

  // 4. Experience
  if (parsed.experience && parsed.experience.length > 0) {
    const expLines: string[] = ["\n## Professional Experience"];
    for (const exp of parsed.experience) {
      expLines.push(`\n### ${exp.role} — ${exp.company}`);
      if (exp.duration) expLines.push(`*${exp.duration}*`);
      if (exp.description) {
        // Split into clean bullets
        const bullets = exp.description.split("\n").map(b => b.trim()).filter(Boolean);
        for (const b of bullets) {
          expLines.push(b.startsWith("-") || b.startsWith("*") ? b : `- ${b}`);
        }
      }
    }
    sections.push(expLines.join("\n"));
  }

  // 5. Projects
  if (parsed.projects && parsed.projects.length > 0) {
    const projLines: string[] = ["\n## Projects"];
    for (const proj of parsed.projects) {
      projLines.push(`\n### ${proj.title}`);
      if (proj.description) {
        const bullets = proj.description.split("\n").map(b => b.trim()).filter(Boolean);
        for (const b of bullets) {
          projLines.push(b.startsWith("-") || b.startsWith("*") ? b : `- ${b}`);
        }
      }
    }
    sections.push(projLines.join("\n"));
  }

  // 6. Education
  if (parsed.education && parsed.education.length > 0) {
    const eduLines: string[] = ["\n## Education"];
    for (const edu of parsed.education) {
      eduLines.push(`- **${edu.degree}**, ${edu.institution}`);
    }
    sections.push(eduLines.join("\n"));
  }

  // 7. Certifications
  if (parsed.certifications && parsed.certifications.length > 0) {
    const certLines: string[] = ["\n## Certifications"];
    for (const cert of parsed.certifications) {
      certLines.push(`- ${cert}`);
    }
    sections.push(certLines.join("\n"));
  }

  return sections.join("\n\n");
}

/**
 * Computes before vs after deterministic score comparison using Stage 3 evaluation.
 */
export function compareScores(
  beforeEval: EvaluationResult,
  afterEval: EvaluationResult
): ScoreComparison {
  return {
    beforeAtsScore: beforeEval.atsScore,
    afterAtsScore: afterEval.atsScore,
    atsScoreDelta: afterEval.atsScore - beforeEval.atsScore,
    beforeTargetMatch: beforeEval.targetMatchScore,
    afterTargetMatch: afterEval.targetMatchScore,
    targetMatchDelta: afterEval.targetMatchScore - beforeEval.targetMatchScore,
    beforeCriticalGaps: beforeEval.categorizedGaps.criticalGaps.length,
    afterCriticalGaps: afterEval.categorizedGaps.criticalGaps.length,
    beforeMatchedCount: beforeEval.categorizedGaps.matchedRequirements.length,
    afterMatchedCount: afterEval.categorizedGaps.matchedRequirements.length
  };
}

/**
 * Evaluates whether a tailored resume has reached finality (Finality Gate).
 */
export function evaluateFinality(
  validation: ValidationResult,
  scoreComparison: ScoreComparison
): { isFinalVersion: boolean; finalityStatus: "OPTIMIZING" | "FINAL_OPTIMIZED" | "VALIDATION_FAILED" } {
  if (!validation.isValid) {
    return { isFinalVersion: false, finalityStatus: "VALIDATION_FAILED" };
  }

  // Finality reached when validation passes and either all critical gaps are 0 or no further truthful gain exists
  return { isFinalVersion: true, finalityStatus: "FINAL_OPTIMIZED" };
}
