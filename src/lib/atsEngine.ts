import {
  TargetRequirement,
  areTechnologiesEquivalent,
  normalizeTechnologyName,
  RequirementImportance
} from "./requirementEngine";
import { MissingItem, ParsedResume } from "../types";

// ============================================================================
// RESUMIX STAGE 3: DETERMINISTIC ATS & TARGET MATCH SCORING ENGINE
// ============================================================================

export interface ScoreBreakdown {
  requiredMatched: number;
  requiredTotal: number;
  requiredPercentage: number;
  preferredMatched: number;
  preferredTotal: number;
  preferredPercentage: number;
  keywordsMatched: number;
  keywordsTotal: number;
  keywordPercentage: number;
  experienceMatchScore: number;
  educationMatchScore: number;
  criticalGapsCount: number;
}

export interface CategorizedGaps {
  criticalGaps: MissingItem[];
  requiredGaps: MissingItem[];
  preferredGaps: MissingItem[];
  optionalImprovements: MissingItem[];
  matchedRequirements: TargetRequirement[];
  unverifiedRequirements: TargetRequirement[];
}

export type CompletionState =
  | "ANALYSIS_PENDING"
  | "CRITICAL_GAPS_REMAIN"
  | "READY_TO_APPLY";

export interface EvaluationResult {
  atsScore: number;
  targetMatchScore: number;
  evaluatedRequirements: TargetRequirement[];
  missingItems: MissingItem[];
  categorizedGaps: CategorizedGaps;
  scoreBreakdown: ScoreBreakdown;
  completionState: CompletionState;
  isReadyToApply: boolean;
  categoryScores: {
    atsCompatibility: number;
    requiredSkills: number;
    preferredSkills: number;
    experienceMatch: number;
    projects: number;
    achievements: number;
    grammar: number;
    formatting: number;
    companyMatch: number;
    softSkills: number;
    leadership: number;
  };
}

/**
 * Weights for the Deterministic ATS Scoring Formula:
 * - Required Requirements Coverage: 40%
 * - Preferred Requirements Coverage: 20%
 * - ATS Keyword Coverage: 20%
 * - Experience Depth/Alignment: 10%
 * - Education & Certifications: 10%
 * Penalty: 10 points deducted per unfulfilled Critical Gap.
 */
export const ATS_WEIGHTS = {
  REQUIRED: 0.40,
  PREFERRED: 0.20,
  KEYWORDS: 0.20,
  EXPERIENCE: 0.10,
  EDUCATION: 0.10,
  CRITICAL_GAP_PENALTY: 10
};

/**
 * Evaluates candidate evidence against a frozen set of target requirements
 * with 100% deterministic application logic.
 */
export function evaluateResumeAgainstRequirements(
  parsedResume: ParsedResume,
  frozenRequirements: TargetRequirement[],
  rawResumeText: string = ""
): EvaluationResult {
  const evaluatedRequirements: TargetRequirement[] = [];
  const missingItems: MissingItem[] = [];

  // Normalize parsed candidate skills for lookup
  const candidateSkills = (parsedResume.skills || []).map(s => ({
    raw: s,
    canonical: normalizeTechnologyName(s)
  }));

  const candidateTools = (parsedResume.tools || []).map(t => ({
    raw: t,
    canonical: normalizeTechnologyName(t)
  }));

  const candidateFrameworks = (parsedResume.frameworks || []).map(f => ({
    raw: f,
    canonical: normalizeTechnologyName(f)
  }));

  const allCandidateTech = [...candidateSkills, ...candidateTools, ...candidateFrameworks];

  // Evidence map from parsed resume evidence items
  const evidenceMap = new Map<string, string>();
  if (Array.isArray(parsedResume.skillEvidence)) {
    for (const ev of parsedResume.skillEvidence) {
      if (ev.skill && ev.evidence) {
        evidenceMap.set(normalizeTechnologyName(ev.skill).toLowerCase(), ev.evidence);
      }
    }
  }

  // Also build searchable resume corpus text for fallback verified quotes
  const resumeCorpus = rawResumeText || [
    parsedResume.summary || "",
    ...(parsedResume.skills || []),
    ...(parsedResume.experience || []).map(e => `${e.role} ${e.company} ${e.description}`),
    ...(parsedResume.projects || []).map(p => `${p.title} ${p.description}`),
    ...(parsedResume.achievements || []),
    ...(parsedResume.certifications || [])
  ].join(" ");

  // Evaluate each target requirement against candidate evidence
  for (const req of frozenRequirements) {
    const canonicalReq = req.canonicalName.toLowerCase();
    
    // 1. Direct tech / skill matching using normalization layer
    let isMatched = false;
    let evidenceQuote: string | undefined = undefined;

    // Check evidence map first
    if (evidenceMap.has(canonicalReq)) {
      isMatched = true;
      evidenceQuote = evidenceMap.get(canonicalReq);
    } else {
      // Check candidate tech entities
      const match = allCandidateTech.find(c => areTechnologiesEquivalent(c.canonical, req.canonicalName));
      if (match) {
        isMatched = true;
        // Search corpus for direct quote containing skill
        const regex = new RegExp(`([^.?!]*\\b${escapeRegExp(match.raw)}\\b[^.?!]*)`, "i");
        const found = resumeCorpus.match(regex);
        evidenceQuote = found ? found[0].trim() : `Verified mention: "${match.raw}" in resume skills.`;
      }
    }

    // Check education/certifications if category matches
    if (!isMatched && (req.category === "EDUCATION" || req.category === "CERTIFICATION")) {
      const allDegreeText = [
        ...(parsedResume.education || []).map(e => `${e.degree} ${e.institution}`),
        ...(parsedResume.certifications || [])
      ].join(" ").toLowerCase();

      if (allDegreeText.includes(canonicalReq)) {
        isMatched = true;
        evidenceQuote = `Verified credential: "${req.name}" found in resume.`;
      }
    }

    // Determine status
    let status: TargetRequirement["status"] = "MISSING";
    if (isMatched) {
      status = "PRESENT";
    }

    const evaluatedReq: TargetRequirement = {
      ...req,
      status,
      evidenceQuote,
      confidence: isMatched ? 100 : 0
    };

    evaluatedRequirements.push(evaluatedReq);

    // If missing, construct deterministic MissingItem
    if (status === "MISSING") {
      const isCritical = req.importance === "REQUIRED";
      const isRecommended = req.importance === "PREFERRED";

      missingItems.push({
        id: req.requirementId,
        type: mapCategoryToMissingType(req.category),
        title: req.name,
        importance: isCritical ? "Critical" : isRecommended ? "Recommended" : "Optional",
        reason: `${req.name} is ${req.importance.toLowerCase()} for this target role, but was not found in your parsed resume.`,
        suggestedAddition: `Only add ${req.name} to your resume if you have genuine experience or projects demonstrating it.`,
        atsImpact: isCritical ? "High" : isRecommended ? "Medium" : "Low",
        recruiterImpact: isCritical ? "High" : isRecommended ? "Medium" : "Low",
        confidenceScore: 100
      });
    }
  }

  // --------------------------------------------------------------------------
  // Categorize Gaps & Matched Items
  // --------------------------------------------------------------------------
  const criticalGaps = missingItems.filter(i => i.importance === "Critical");
  const requiredGaps = missingItems.filter(i => i.importance === "Critical");
  const preferredGaps = missingItems.filter(i => i.importance === "Recommended");
  const optionalImprovements = missingItems.filter(i => i.importance === "Optional");
  const matchedRequirements = evaluatedRequirements.filter(r => r.status === "PRESENT");
  const unverifiedRequirements = evaluatedRequirements.filter(r => r.status === "UNVERIFIED");

  // --------------------------------------------------------------------------
  // Deterministic Score Calculations
  // --------------------------------------------------------------------------
  const requiredItems = evaluatedRequirements.filter(r => r.importance === "REQUIRED");
  const preferredItems = evaluatedRequirements.filter(r => r.importance === "PREFERRED");
  const keywordItems = evaluatedRequirements.filter(r => r.category === "KEYWORD" || r.category === "TECHNICAL_SKILL");

  const requiredTotal = requiredItems.length;
  const requiredMatched = requiredItems.filter(r => r.status === "PRESENT").length;
  const requiredPercentage = requiredTotal > 0 ? (requiredMatched / requiredTotal) * 100 : 100;

  const preferredTotal = preferredItems.length;
  const preferredMatched = preferredItems.filter(r => r.status === "PRESENT").length;
  const preferredPercentage = preferredTotal > 0 ? (preferredMatched / preferredTotal) * 100 : 100;

  const keywordsTotal = keywordItems.length;
  const keywordsMatched = keywordItems.filter(r => r.status === "PRESENT").length;
  const keywordPercentage = keywordsTotal > 0 ? (keywordsMatched / keywordsTotal) * 100 : 100;

  // Experience & Education Alignment
  const experienceCount = (parsedResume.experience || []).length;
  const experienceMatchScore = experienceCount > 0 ? Math.min(100, experienceCount * 35) : (requiredTotal === 0 ? 100 : 30);
  
  const educationCount = (parsedResume.education || []).length;
  const educationMatchScore = educationCount > 0 ? 100 : 50;

  // 1. Calculate ATS Score (Structural & Requirement Coverage)
  const rawAtsScore = 
    (requiredPercentage * ATS_WEIGHTS.REQUIRED) +
    (preferredPercentage * ATS_WEIGHTS.PREFERRED) +
    (keywordPercentage * ATS_WEIGHTS.KEYWORDS) +
    (experienceMatchScore * ATS_WEIGHTS.EXPERIENCE) +
    (educationMatchScore * ATS_WEIGHTS.EDUCATION) -
    (criticalGaps.length * ATS_WEIGHTS.CRITICAL_GAP_PENALTY);

  const atsScore = Math.max(0, Math.min(100, Math.round(rawAtsScore)));

  // 2. Calculate Target Match Score (Candidate Alignment)
  const rawTargetMatch = 
    (requiredPercentage * 0.50) +
    (preferredPercentage * 0.25) +
    (experienceMatchScore * 0.15) +
    (educationMatchScore * 0.10);

  const targetMatchScore = Math.max(0, Math.min(100, Math.round(rawTargetMatch)));

  // Score breakdown structure
  const scoreBreakdown: ScoreBreakdown = {
    requiredMatched,
    requiredTotal,
    requiredPercentage: Math.round(requiredPercentage),
    preferredMatched,
    preferredTotal,
    preferredPercentage: Math.round(preferredPercentage),
    keywordsMatched,
    keywordsTotal,
    keywordPercentage: Math.round(keywordPercentage),
    experienceMatchScore: Math.round(experienceMatchScore),
    educationMatchScore: Math.round(educationMatchScore),
    criticalGapsCount: criticalGaps.length
  };

  // Completion State
  let completionState: CompletionState = "CRITICAL_GAPS_REMAIN";
  if (criticalGaps.length === 0) {
    completionState = "READY_TO_APPLY";
  }
  const isReadyToApply = criticalGaps.length === 0;

  // Category Scores for UI Scorecards
  const categoryScores = {
    atsCompatibility: atsScore,
    requiredSkills: Math.round(requiredPercentage),
    preferredSkills: Math.round(preferredPercentage),
    experienceMatch: Math.round(experienceMatchScore),
    projects: (parsedResume.projects || []).length > 0 ? 90 : 40,
    achievements: (parsedResume.achievements || []).length > 0 ? 85 : 50,
    grammar: 95,
    formatting: 95,
    companyMatch: targetMatchScore,
    softSkills: (parsedResume.softSkills || []).length > 0 ? 90 : 60,
    leadership: (parsedResume.responsibilities || []).length > 0 ? 85 : 50
  };

  return {
    atsScore,
    targetMatchScore,
    evaluatedRequirements,
    missingItems,
    categorizedGaps: {
      criticalGaps,
      requiredGaps,
      preferredGaps,
      optionalImprovements,
      matchedRequirements,
      unverifiedRequirements
    },
    scoreBreakdown,
    completionState,
    isReadyToApply,
    categoryScores
  };
}

function mapCategoryToMissingType(category: string): MissingItem["type"] {
  switch (category) {
    case "TECHNICAL_SKILL":
    case "LANGUAGE":
    case "DATABASE":
    case "FRAMEWORK":
      return "Skill";
    case "TOOL":
      return "Technology";
    case "EXPERIENCE":
      return "Experience";
    case "EDUCATION":
      return "Achievement";
    case "CERTIFICATION":
      return "Certification";
    case "RESPONSIBILITY":
      return "Responsibility";
    case "KEYWORD":
    default:
      return "ATS Keyword";
  }
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
