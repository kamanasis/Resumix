import {
  type TargetRequirement,
  areTechnologiesEquivalent,
  normalizeTechnologyName,
  type RequirementImportance
} from "./requirementEngine.ts";
import type { 
  MissingItem, 
  ParsedResume,
  GapClassification,
  PriorityTier,
  ScoreConfidence,
  ApplicationReadiness,
  HighestImpactAction,
  ResumeQualityAudit,
  ScoreBreakdownDetails
} from "../types.ts";

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
  scoreConfidence: ScoreConfidence;
  applicationReadiness: ApplicationReadiness;
  highestImpactActions: HighestImpactAction[];
  resumeQualityAudit: ResumeQualityAudit;
  scoreBreakdownDetails: ScoreBreakdownDetails;
}

/**
 * Deterministic ATS Scoring Formula Weights:
 * - Required Requirements Coverage: 40%
 * - Preferred Requirements Coverage: 20%
 * - ATS Keyword Coverage: 15%
 * - Experience Depth/Alignment: 10%
 * - Target Role Alignment: 10%
 * - Resume Structure Quality: 5%
 */
export const ATS_BASE_WEIGHTS = {
  REQUIRED: 0.40,
  ROLE_ALIGNMENT: 0.20,
  KEYWORDS: 0.15,
  EXPERIENCE: 0.10,
  PREFERRED: 0.10,
  STRUCTURE: 0.05,
  EDUCATION: 0.05
};

export const ATS_WEIGHTS = {
  REQUIRED: 0.40,
  PREFERRED: 0.10,
  KEYWORDS: 0.15,
  EXPERIENCE: 0.10,
  ROLE_ALIGNMENT: 0.20,
  STRUCTURE: 0.05,
  CRITICAL_GAP_PENALTY: 10
};

// Stop words ignored during keyword analysis to prevent keyword stuffing & noise
const STOP_WORDS = new Set([
  "the", "and", "with", "for", "from", "in", "on", "at", "to", "a", "an", "by", "as", "of", "or",
  "is", "are", "be", "will", "our", "your", "we", "you", "their", "this", "that", "etc", "must",
  "have", "has", "had", "do", "does", "did", "using", "used", "such", "including", "per", "across",
  "into", "within", "candidate", "experience", "skills", "ability", "strong", "work", "working",
  "team", "teams", "proven", "track", "record", "good", "proficient", "familiarity", "plus", "ideal",
  "preferred", "required", "qualifications", "requirements", "responsibilities", "role", "position",
  "job", "company", "looking", "seeking", "years", "year", "degree", "field", "related", "should",
  "would", "could", "also", "about", "other", "all", "more", "most", "than", "then", "there", "any"
]);

// Known foundational-to-specialized technology relationships for detecting MISSING_ADDABLE
const RELATED_TECH_MAP: Record<string, string[]> = {
  "react": ["next.js", "redux", "react native", "remix", "zustand", "tailwind css"],
  "javascript": ["typescript", "node.js", "react", "vue.js", "angular", "express.js"],
  "typescript": ["react", "next.js", "node.js", "angular", "vue.js"],
  "python": ["fastapi", "django", "flask", "django rest framework", "pandas", "numpy", "pytorch"],
  "java": ["spring boot", "spring", "hibernate", "microservices"],
  "c#": [".net", "asp.net", "entity framework"],
  "c++": ["c", "embedded systems", "multithreading", "algorithms"],
  "sql": ["postgresql", "mysql", "microsoft sql server", "database optimization"],
  "database": ["postgresql", "mongodb", "redis", "mysql", "sqlite"],
  "aws": ["cloud", "docker", "kubernetes", "terraform", "ci/cd", "google cloud platform"],
  "docker": ["kubernetes", "containerization", "devops", "ci/cd"],
  "git": ["github", "gitlab", "ci/cd", "version control"],
  "rest api": ["graphql", "api design", "microservices", "web services", "postman"]
};

export function evaluateResumeAgainstRequirements(
  parsedResume: ParsedResume,
  frozenRequirements: TargetRequirement[],
  rawResumeText: string = "",
  context?: { targetRole?: string; targetCompany?: string; jobDescription?: string; experienceLevel?: string }
): EvaluationResult {
  const evaluatedRequirements: TargetRequirement[] = [];
  const missingItems: MissingItem[] = [];

  const experienceCount = (parsedResume.experience || []).length;
  const educationCount = (parsedResume.education || []).length;

  // Normalize candidate skills
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
  const candidateCanonicalSet = new Set(allCandidateTech.map(t => t.canonical.toLowerCase()));

  // Evidence map from parsed resume evidence items
  const evidenceMap = new Map<string, { quote: string; location: string }>();
  if (Array.isArray(parsedResume.skillEvidence)) {
    for (const ev of parsedResume.skillEvidence) {
      if (ev.skill && ev.evidence) {
        evidenceMap.set(normalizeTechnologyName(ev.skill).toLowerCase(), {
          quote: ev.evidence,
          location: "Skill Evidence"
        });
      }
    }
  }

  // Check experience entries for direct evidence
  if (Array.isArray(parsedResume.experience)) {
    for (const exp of parsedResume.experience) {
      const expText = `${exp.role || ""} ${exp.company || ""} ${exp.description || ""}`;
      for (const req of frozenRequirements) {
        const canonicalReq = req.canonicalName.toLowerCase();
        const wordRegex = new RegExp(`\\b${escapeRegExp(req.name)}\\b`, "i");
        if (!evidenceMap.has(canonicalReq) && wordRegex.test(expText)) {
          const sentenceRegex = new RegExp(`([^.?!]*\\b${escapeRegExp(req.name)}\\b[^.?!]*)`, "i");
          const match = expText.match(sentenceRegex);
          evidenceMap.set(canonicalReq, {
            quote: match ? match[0].trim() : `Applied ${req.name} as ${exp.role} at ${exp.company}.`,
            location: `Experience → ${exp.role} at ${exp.company}`
          });
        }
      }
    }
  }

  // Check project entries for direct evidence
  if (Array.isArray(parsedResume.projects)) {
    for (const proj of parsedResume.projects) {
      const projText = `${proj.title || ""} ${proj.description || ""}`;
      for (const req of frozenRequirements) {
        const canonicalReq = req.canonicalName.toLowerCase();
        const wordRegex = new RegExp(`\\b${escapeRegExp(req.name)}\\b`, "i");
        if (!evidenceMap.has(canonicalReq) && wordRegex.test(projText)) {
          const sentenceRegex = new RegExp(`([^.?!]*\\b${escapeRegExp(req.name)}\\b[^.?!]*)`, "i");
          const match = projText.match(sentenceRegex);
          evidenceMap.set(canonicalReq, {
            quote: match ? match[0].trim() : `Demonstrated ${req.name} in project "${proj.title}".`,
            location: `Projects → ${proj.title}`
          });
        }
      }
    }
  }

  // Searchable resume corpus text
  const resumeCorpus = rawResumeText || [
    parsedResume.summary || "",
    ...(parsedResume.skills || []),
    ...(parsedResume.experience || []).map(e => `${e.role} ${e.company} ${e.description}`),
    ...(parsedResume.projects || []).map(p => `${p.title} ${p.description}`),
    ...(parsedResume.achievements || []),
    ...(parsedResume.certifications || [])
  ].join(" ");

  // Evaluate each target requirement
  for (const req of frozenRequirements) {
    const canonicalReq = req.canonicalName.toLowerCase();
    
    let isMatched = false;
    let evidenceQuote: string | undefined = undefined;
    let evidenceLocation: string | undefined = undefined;
    let hasDeepEvidence = false;

    // Check pre-indexed evidence
    if (evidenceMap.has(canonicalReq)) {
      isMatched = true;
      const ev = evidenceMap.get(canonicalReq)!;
      evidenceQuote = ev.quote;
      evidenceLocation = ev.location;
      hasDeepEvidence = ev.location.startsWith("Experience") || ev.location.startsWith("Projects") || ev.location === "Skill Evidence";
    } else {
      // Check candidate tech entities
      const match = allCandidateTech.find(c => areTechnologiesEquivalent(c.canonical, req.canonicalName));
      if (match) {
        isMatched = true;
        const regex = new RegExp(`([^.?!]*\\b${escapeRegExp(match.raw)}\\b[^.?!]*)`, "i");
        const found = resumeCorpus.match(regex);
        evidenceQuote = found ? found[0].trim() : `Listed as "${match.raw}" in resume skills.`;
        evidenceLocation = "Technical Skills";
        hasDeepEvidence = false;
      }
    }

    // Check education/certifications
    if (!isMatched && (req.category === "EDUCATION" || req.category === "CERTIFICATION")) {
      const allDegreeText = [
        ...(parsedResume.education || []).map(e => `${e.degree} ${e.institution}`),
        ...(parsedResume.certifications || [])
      ].join(" ").toLowerCase();

      if (allDegreeText.includes(canonicalReq)) {
        isMatched = true;
        evidenceQuote = `Verified credential: "${req.name}" found in resume.`;
        evidenceLocation = "Education & Certifications";
        hasDeepEvidence = true;
      }
    }

    // Classify gap into 4 strict categories
    let gapClassification: GapClassification;
    if (isMatched) {
      gapClassification = hasDeepEvidence ? "VERIFIED" : "PRESENT_BUT_WEAK";
    } else {
      let isAddable = false;
      for (const [baseTech, specializations] of Object.entries(RELATED_TECH_MAP)) {
        if (candidateCanonicalSet.has(baseTech)) {
          if (specializations.some(s => s.toLowerCase() === canonicalReq)) {
            isAddable = true;
            break;
          }
        }
      }
      gapClassification = isAddable ? "MISSING_ADDABLE" : "TRUE_GAP";
    }

    // Determine priority tier
    let priorityTier: PriorityTier;
    if (req.importance === "REQUIRED") {
      priorityTier = (gapClassification === "TRUE_GAP" || gapClassification === "MISSING_ADDABLE")
        ? "CRITICAL"
        : "HIGH_IMPACT";
    } else if (req.importance === "PREFERRED") {
      priorityTier = gapClassification === "TRUE_GAP" ? "HIGH_IMPACT" : "MEDIUM_IMPACT";
    } else {
      priorityTier = "LOW_IMPACT";
    }

    let status: TargetRequirement["status"] = isMatched ? "PRESENT" : "MISSING";

    const evaluatedReq: TargetRequirement = {
      ...req,
      status,
      evidenceQuote,
      confidence: isMatched ? (hasDeepEvidence ? 100 : 65) : 0
    };
    evaluatedRequirements.push(evaluatedReq);

    // Formulate truthful action recommendation
    let recommendedAction: string;
    if (gapClassification === "TRUE_GAP") {
      recommendedAction = `Not currently supported by your resume. If you genuinely possess ${req.name} experience, add a specific project or work example. Do NOT add it if you do not have genuine experience.`;
    } else if (gapClassification === "MISSING_ADDABLE") {
      recommendedAction = `Your resume demonstrates related foundational skills. If you have applied ${req.name} in practical work or coursework, explicitly articulate it with concrete context.`;
    } else if (gapClassification === "PRESENT_BUT_WEAK") {
      recommendedAction = `${req.name} is mentioned in your skills, but lacks contextual proof in your experience or projects. Strengthen this by describing measurable impact and application.`;
    } else {
      recommendedAction = `Strong verified evidence found in your resume. Preserve this alignment.`;
    }

    // If missing or improvable, add to missingItems
    if (status === "MISSING" || gapClassification === "PRESENT_BUT_WEAK") {
      const isCritical = req.importance === "REQUIRED" && status === "MISSING";
      const isRecommended = (req.importance === "PREFERRED" && status === "MISSING") || (req.importance === "REQUIRED" && gapClassification === "PRESENT_BUT_WEAK");

      missingItems.push({
        id: req.requirementId,
        type: mapCategoryToMissingType(req.category),
        title: req.name,
        importance: isCritical ? "Critical" : isRecommended ? "Recommended" : "Optional",
        reason: status === "MISSING" 
          ? `${req.name} is ${req.importance.toLowerCase()} for this role, but was not found in your parsed resume.`
          : `${req.name} is present as a keyword, but lacks substantive project/work evidence.`,
        suggestedAddition: recommendedAction,
        atsImpact: priorityTier === "CRITICAL" ? "High" : priorityTier === "HIGH_IMPACT" ? "Medium" : "Low",
        recruiterImpact: priorityTier === "CRITICAL" ? "High" : priorityTier === "HIGH_IMPACT" ? "Medium" : "Low",
        confidenceScore: 100,
        gapClassification,
        priorityTier,
        evidenceFound: evidenceQuote || "No verified evidence found in resume",
        evidenceLocation: evidenceLocation || undefined,
        recommendedAction,
        whyItMatters: `Target role specifies ${req.name} as a ${req.importance.toLowerCase()} qualification for ATS filtering.`,
        evidenceNeeded: `Verified project, internship, production experience, or academic coursework demonstrating ${req.name}.`
      });
    }
  }

  // Categorize Gaps
  const criticalGaps = missingItems.filter(i => i.priorityTier === "CRITICAL");
  const requiredGaps = missingItems.filter(i => i.importance === "Critical");
  const preferredGaps = missingItems.filter(i => i.importance === "Recommended");
  const optionalImprovements = missingItems.filter(i => i.importance === "Optional");
  const matchedRequirements = evaluatedRequirements.filter(r => r.status === "PRESENT");
  const unverifiedRequirements = evaluatedRequirements.filter(r => r.status === "UNVERIFIED");

  // 1. Evidence-Weighted Skill Matching
  const requiredItems = evaluatedRequirements.filter(r => r.importance === "REQUIRED");
  const preferredItems = evaluatedRequirements.filter(r => r.importance === "PREFERRED");

  const requiredTotal = requiredItems.length;
  const requiredMatched = requiredItems.filter(r => r.status === "PRESENT").length;
  const requiredWeightedCredits = requiredItems.reduce((sum, r) => {
    if (r.status !== "PRESENT") return sum;
    return sum + (r.confidence === 100 ? 1.0 : 0.65);
  }, 0);
  const requiredPercentage = requiredTotal > 0 ? (requiredWeightedCredits / requiredTotal) * 100 : 100;

  const preferredTotal = preferredItems.length;
  const preferredMatched = preferredItems.filter(r => r.status === "PRESENT").length;
  const preferredWeightedCredits = preferredItems.reduce((sum, r) => {
    if (r.status !== "PRESENT") return sum;
    return sum + (r.confidence === 100 ? 1.0 : 0.65);
  }, 0);
  const preferredPercentage = preferredTotal > 0 ? (preferredWeightedCredits / preferredTotal) * 100 : 100;

  // 2. Meaningful Keyword Coverage (Anti-Stuffing, Stop-Word Filtered)
  const meaningfulJobKeywords = new Set<string>();
  for (const req of frozenRequirements) {
    const reqLower = req.name.toLowerCase().trim();
    if (reqLower.length >= 2 && !STOP_WORDS.has(reqLower)) {
      meaningfulJobKeywords.add(reqLower);
    }
    const canonLower = req.canonicalName.toLowerCase().trim();
    if (canonLower.length >= 2 && !STOP_WORDS.has(canonLower)) {
      meaningfulJobKeywords.add(canonLower);
    }
  }
  if (context?.jobDescription) {
    const jdTokens = context.jobDescription
      .toLowerCase()
      .split(/[\s,./;:!?"'()\[\]{}#+]+/)
      .filter(w => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
    for (const t of jdTokens) {
      meaningfulJobKeywords.add(t);
    }
  }

  let keywordsMatched = 0;
  const resumeLower = resumeCorpus.toLowerCase();
  for (const kw of meaningfulJobKeywords) {
    if (kw.includes(" ") || kw.includes("+") || kw.includes("#") || kw.includes(".")) {
      if (resumeLower.includes(kw)) {
        keywordsMatched++;
      }
    } else {
      const regex = new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i");
      if (regex.test(resumeLower)) {
        keywordsMatched++;
      }
    }
  }
  const keywordsTotal = meaningfulJobKeywords.size;
  const keywordPercentage = keywordsTotal > 0 ? (keywordsMatched / keywordsTotal) * 100 : 100;

  // 3. Experience Match (Evaluated Separately; Zero Penalty if Omitted in JD)
  let isExperienceRequired = false;
  let requiredYears = 0;
  const jdText = (context?.jobDescription || "").toLowerCase();
  const expLevelText = (context?.experienceLevel || "").toLowerCase();

  const yearsMatch = jdText.match(/\b(\d+)\+?\s*(?:to\s*(\d+)\s*)?years?\b/i) ||
                     expLevelText.match(/\b(\d+)\+?\s*(?:to\s*(\d+)\s*)?years?\b/i);

  if (yearsMatch) {
    isExperienceRequired = true;
    requiredYears = parseInt(yearsMatch[1], 10);
  } else if (expLevelText.includes("senior") || jdText.includes("senior")) {
    isExperienceRequired = true;
    requiredYears = 5;
  } else if (expLevelText.includes("lead") || jdText.includes("lead") || expLevelText.includes("principal")) {
    isExperienceRequired = true;
    requiredYears = 7;
  } else if (expLevelText.includes("mid") || expLevelText.includes("3-5")) {
    isExperienceRequired = true;
    requiredYears = 3;
  } else if (expLevelText.includes("1-2") || expLevelText.includes("junior")) {
    isExperienceRequired = true;
    requiredYears = 1;
  }

  let candidateYears = 0;
  if (Array.isArray(parsedResume.experience) && parsedResume.experience.length > 0) {
    for (const exp of parsedResume.experience) {
      const dur = String(exp.duration || "").toLowerCase();
      const yearMatches = dur.match(/\b(19\d\d|20\d\d)\b/g);
      if (yearMatches && yearMatches.length >= 2) {
        const y1 = parseInt(yearMatches[0], 10);
        const y2 = parseInt(yearMatches[1], 10);
        candidateYears += Math.max(1, Math.abs(y2 - y1));
      } else if (yearMatches && yearMatches.length === 1 && (dur.includes("present") || dur.includes("current"))) {
        const y1 = parseInt(yearMatches[0], 10);
        candidateYears += Math.max(1, 2026 - y1);
      } else {
        candidateYears += 1.5;
      }
    }
  }

  let experienceMatchScore = 100;
  if (isExperienceRequired && requiredYears > 0) {
    if (candidateYears >= requiredYears) {
      experienceMatchScore = 100;
    } else {
      experienceMatchScore = Math.max(25, Math.round((candidateYears / requiredYears) * 100));
      missingItems.push({
        id: `exp_gap_${requiredYears}`,
        type: "Experience",
        title: `${requiredYears}+ Years Experience Required`,
        importance: requiredYears >= 5 ? "Critical" : "Recommended",
        reason: `Target role specifies ${requiredYears}+ years of relevant experience. Resume demonstrates approximately ${Math.round(candidateYears * 10) / 10} years.`,
        suggestedAddition: `If you have prior professional, contracting, or internship experience, make sure all roles and dates are documented.`,
        atsImpact: requiredYears >= 5 ? "High" : "Medium",
        recruiterImpact: "High",
        confidenceScore: 90,
        gapClassification: candidateYears >= requiredYears * 0.7 ? "MISSING_ADDABLE" : "TRUE_GAP",
        priorityTier: requiredYears >= 5 ? "CRITICAL" : "HIGH_IMPACT",
        evidenceFound: candidateYears > 0 ? `${Math.round(candidateYears * 10) / 10} years verified in experience section.` : "No formal work experience duration found.",
        recommendedAction: `Ensure all relevant past experience is documented. Do not fabricate experience years.`
      });
    }
  }

  // 4. Education Match (Evaluated ONLY when JD explicitly requires it)
  const educationRegex = /\b(bachelor'?s?|b\.?s\.?|master'?s?|m\.?s\.?|ph\.?d\.?|degree in|computer science degree|engineering degree)\b/i;
  const isEducationRequired = Boolean(context?.jobDescription && educationRegex.test(context.jobDescription));
  const candidateHasEducation = Array.isArray(parsedResume.education) && parsedResume.education.length > 0;

  let educationMatchScore = 100;
  if (isEducationRequired) {
    educationMatchScore = candidateHasEducation ? 100 : 40;
    if (!candidateHasEducation) {
      missingItems.push({
        id: "edu_gap_degree",
        type: "Achievement",
        title: "Degree or Equivalent Academic Qualification",
        importance: "Recommended",
        reason: "Job description explicitly lists an academic degree as a requirement.",
        suggestedAddition: "If you hold a degree or completed relevant coursework, ensure your education section lists institution and degree name.",
        atsImpact: "Medium",
        recruiterImpact: "Medium",
        confidenceScore: 90,
        gapClassification: "TRUE_GAP",
        priorityTier: "MEDIUM_IMPACT",
        evidenceFound: "No formal degree parsed in resume education.",
        recommendedAction: "Add genuine degree or coursework credentials if completed."
      });
    }
  }

  // 5. Role Alignment Score (Title & Domain Match)
  let roleAlignmentScore = 75;
  const targetRoleClean = (context?.targetRole || "").toLowerCase().trim();
  if (targetRoleClean) {
    const genericRoleWords = new Set(["senior", "junior", "lead", "staff", "associate", "principal", "intern", "developer", "engineer", "specialist", "analyst", "the", "and", "for", "with", "at", "in"]);
    const domainTokens = targetRoleClean.split(/[\s/-]+/).filter(w => w.length > 2 && !genericRoleWords.has(w));

    const resumeTitles = (parsedResume.experience || []).map(e => (e.role || "").toLowerCase()).join(" ");
    const resumeSummary = (parsedResume.summary || "").toLowerCase();
    const resumeFullRoles = `${resumeTitles} ${resumeSummary}`;

    if (domainTokens.length > 0) {
      let domainMatches = 0;
      for (const dt of domainTokens) {
        if (resumeFullRoles.includes(dt)) {
          domainMatches++;
        }
      }
      const ratio = domainMatches / domainTokens.length;
      roleAlignmentScore = Math.min(100, Math.round(35 + (ratio * 65)));
    } else {
      const hasTechTitle = resumeTitles.includes("engineer") || resumeTitles.includes("developer") || resumeTitles.includes("programmer");
      roleAlignmentScore = hasTechTitle ? 90 : 65;
    }
  }

  // 6. Resume Structure & Quality Score
  let structureScore = 40;
  if (parsedResume.contactInfo?.email) structureScore += 20;
  if (parsedResume.contactInfo?.phone || parsedResume.contactInfo?.location) structureScore += 10;
  if (Array.isArray(parsedResume.experience) && parsedResume.experience.length > 0) structureScore += 15;
  if (Array.isArray(parsedResume.education) && parsedResume.education.length > 0) structureScore += 10;
  if ((parsedResume.skills || []).length >= 5) structureScore += 5;
  const resumeStructureScore = Math.min(100, structureScore);

  // 7. Dynamic Weight Distribution (No Penalties for Omitted Requirements)
  let wRequired = 0.40;
  let wRoleAlignment = 0.20;
  let wKeywords = 0.15;
  let wExperience = isExperienceRequired ? 0.10 : 0.00;
  let wPreferred = 0.10;
  let wStructure = 0.05;
  let wEducation = isEducationRequired ? 0.05 : 0.00;

  const totalDynamicWeight = wRequired + wRoleAlignment + wKeywords + wExperience + wPreferred + wStructure + wEducation;
  wRequired = Math.round((wRequired / totalDynamicWeight) * 100) / 100;
  wRoleAlignment = Math.round((wRoleAlignment / totalDynamicWeight) * 100) / 100;
  wKeywords = Math.round((wKeywords / totalDynamicWeight) * 100) / 100;
  wExperience = Math.round((wExperience / totalDynamicWeight) * 100) / 100;
  wPreferred = Math.round((wPreferred / totalDynamicWeight) * 100) / 100;
  wStructure = Math.round((wStructure / totalDynamicWeight) * 100) / 100;
  wEducation = Math.round((wEducation / totalDynamicWeight) * 100) / 100;

  const sumDynamicWeights = wRequired + wRoleAlignment + wKeywords + wExperience + wPreferred + wStructure + wEducation;
  if (sumDynamicWeights !== 1.0) {
    wRequired = Math.round((wRequired + (1.0 - sumDynamicWeights)) * 100) / 100;
  }

  // 8. Raw ATS Compatibility Score & Realistic Critical Gap Capping
  const rawAtsScore = 
    (requiredPercentage * wRequired) +
    (preferredPercentage * wPreferred) +
    (keywordPercentage * wKeywords) +
    (experienceMatchScore * wExperience) +
    (roleAlignmentScore * wRoleAlignment) +
    (educationMatchScore * wEducation) +
    (resumeStructureScore * wStructure);

  let maxScoreCap = 100;
  if (criticalGaps.length === 1) {
    maxScoreCap = 75;
  } else if (criticalGaps.length === 2) {
    maxScoreCap = 60;
  } else if (criticalGaps.length >= 3) {
    maxScoreCap = 45;
  }

  const atsScore = Math.max(0, Math.min(maxScoreCap, Math.round(rawAtsScore)));

  // 9. Target Match Score (Candidate Profile Alignment)
  const rawTargetMatch = 
    (requiredPercentage * 0.45) +
    (preferredPercentage * 0.25) +
    (roleAlignmentScore * 0.15) +
    (experienceMatchScore * 0.15);

  const targetMatchScore = Math.max(0, Math.min(100, Math.round(rawTargetMatch)));

  // Score Breakdown
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
  const isReadyToApply = criticalGaps.length === 0 && requiredPercentage >= 80;

  // Category Scores for UI
  const categoryScores = {
    atsCompatibility: atsScore,
    requiredSkills: Math.round(requiredPercentage),
    preferredSkills: Math.round(preferredPercentage),
    experienceMatch: Math.round(experienceMatchScore),
    projects: (parsedResume.projects || []).length > 0 ? 90 : 40,
    achievements: (parsedResume.achievements || []).length > 0 ? 85 : 50,
    grammar: 95,
    formatting: resumeStructureScore,
    companyMatch: targetMatchScore,
    softSkills: (parsedResume.softSkills || []).length > 0 ? 90 : 60,
    leadership: (parsedResume.responsibilities || []).length > 0 ? 85 : 50
  };

  // Score Confidence calculation
  const jdLength = (context?.jobDescription || "").trim().length;
  const isJdLimited = jdLength < 150 || !context?.jobDescription;
  let scoreConfidenceLevel: ScoreConfidence["level"] = "HIGH_CONFIDENCE";
  let confidenceReason = "High confidence based on comprehensive requirement extraction and verified resume evidence.";
  let confidenceScore = 95;

  if (isJdLimited) {
    scoreConfidenceLevel = "MEDIUM_CONFIDENCE";
    confidenceScore = 65;
    confidenceReason = "Score confidence is limited because the job description contains limited requirement information.";
  } else if (frozenRequirements.length < 5) {
    scoreConfidenceLevel = "MEDIUM_CONFIDENCE";
    confidenceScore = 70;
    confidenceReason = "Moderate confidence: target role has limited distinct technical requirements.";
  }

  const scoreConfidence: ScoreConfidence = {
    level: scoreConfidenceLevel,
    score: confidenceScore,
    reason: confidenceReason,
    isJdLimited,
    factors: {
      resumeExtractionQuality: resumeCorpus.length > 500 ? "High (Full text & sections parsed)" : "Moderate",
      jobDescriptionCompleteness: isJdLimited ? "Limited (Standard role requirements applied)" : "Complete (Detailed job description parsed)",
      evidenceAvailability: `${matchedRequirements.length} requirements verified with resume evidence`
    }
  };

  // Application Readiness calculation
  let readinessStatus: ApplicationReadiness["status"] = "LOW_MATCH";
  let readinessHeadline = "Significant qualification gaps detected for this role profile.";
  const readinessReasons: ApplicationReadiness["reasons"] = [];

  if (criticalGaps.length === 0 && requiredPercentage >= 85 && atsScore >= 80) {
    readinessStatus = "READY_TO_APPLY";
    readinessHeadline = "Strong alignment with target role specifications.";
    readinessReasons.push({ type: "positive", text: `All ${requiredTotal} mandatory qualifications verified with resume evidence.` });
    readinessReasons.push({ type: "positive", text: `Role alignment is strong (${roleAlignmentScore}%).` });
    if (preferredPercentage >= 60) {
      readinessReasons.push({ type: "positive", text: `Covers ${preferredMatched} of ${preferredTotal} preferred skills.` });
    }
  } else if (criticalGaps.length <= 2 && requiredPercentage >= 65 && atsScore >= 60) {
    readinessStatus = "NEEDS_MINOR_IMPROVEMENTS";
    readinessHeadline = "Solid foundation with a few addressable gaps.";
    readinessReasons.push({ type: "positive", text: `${requiredMatched} of ${requiredTotal} required qualifications supported.` });
    if (criticalGaps.length > 0) {
      readinessReasons.push({ type: "warning", text: `${criticalGaps.length} critical requirement(s) lack verified evidence: ${criticalGaps.map(g => g.title).join(", ")}.` });
    }
    readinessReasons.push({ type: "neutral", text: "Address weak evidence in experience bullets to strengthen match." });
  } else if (requiredPercentage >= 40 && atsScore >= 40) {
    readinessStatus = "NEEDS_SIGNIFICANT_OPTIMIZATION";
    readinessHeadline = "Notable gap between target requirements and current resume evidence.";
    readinessReasons.push({ type: "warning", text: `${criticalGaps.length} mandatory qualifications missing verified evidence.` });
    readinessReasons.push({ type: "warning", text: `Only ${requiredMatched} of ${requiredTotal} required skills detected.` });
    readinessReasons.push({ type: "neutral", text: "Review job description requirements and articulate all genuine matching experience." });
  } else {
    readinessStatus = "LOW_MATCH";
    readinessHeadline = "Substantial qualification gaps detected for this role profile.";
    readinessReasons.push({ type: "warning", text: `Low required skill coverage (${Math.round(requiredPercentage)}%).` });
    readinessReasons.push({ type: "warning", text: `${criticalGaps.length} critical requirements missing from resume.` });
  }

  const applicationReadiness: ApplicationReadiness = {
    status: readinessStatus,
    headline: readinessHeadline,
    reasons: readinessReasons
  };

  // 3–7 Highest-Impact Actions
  const highestImpactActions: HighestImpactAction[] = [];
  let actionRank = 1;

  // 1. Critical gaps with addable foundation
  const addableGaps = missingItems.filter(i => i.gapClassification === "MISSING_ADDABLE" && i.priorityTier === "CRITICAL");
  for (const gap of addableGaps.slice(0, 2)) {
    highestImpactActions.push({
      rank: actionRank++,
      title: `Articulate genuine experience with ${gap.title}`,
      category: "Critical Qualification",
      whyItMatters: `Your resume demonstrates related foundational skills, but ${gap.title} is required for ATS shortlisting.`,
      actionableTip: `If you have applied ${gap.title} in projects or coursework, add an explicit bullet point describing that application.`,
      effort: "Low"
    });
  }

  // 2. Weak evidence present in skills but not experience
  const weakItems = missingItems.filter(i => i.gapClassification === "PRESENT_BUT_WEAK");
  for (const item of weakItems.slice(0, 2)) {
    highestImpactActions.push({
      rank: actionRank++,
      title: `Strengthen evidence for ${item.title} in Experience`,
      category: "Evidence Depth",
      whyItMatters: `${item.title} is listed in skills, but recruiters look for applied context in work history or projects.`,
      actionableTip: `Add a bullet under your most relevant role showing how you used ${item.title} and what outcome was achieved.`,
      effort: "Medium"
    });
  }

  // 3. True gaps in required skills (with strict anti-fabrication guidance)
  const trueGaps = missingItems.filter(i => i.gapClassification === "TRUE_GAP" && i.priorityTier === "CRITICAL");
  for (const gap of trueGaps.slice(0, 2)) {
    if (highestImpactActions.length < 5) {
      highestImpactActions.push({
        rank: actionRank++,
        title: `Verify if you possess ${gap.title} experience`,
        category: "Missing Requirement",
        whyItMatters: `${gap.title} is mandatory for the role. Zero points are awarded without verified evidence.`,
        actionableTip: `Only add ${gap.title} if you have genuine academic or project proof. Do not fabricate this skill.`,
        effort: "High"
      });
    }
  }

  // 4. Keyword alignment
  const missingKeywords = missingItems.filter(i => i.type === "ATS Keyword" && i.priorityTier === "MEDIUM_IMPACT");
  if (missingKeywords.length > 0 && highestImpactActions.length < 6) {
    const kwSample = missingKeywords.slice(0, 3).map(k => k.title).join(", ");
    highestImpactActions.push({
      rank: actionRank++,
      title: `Incorporate industry keywords: ${kwSample}`,
      category: "Keyword Optimization",
      whyItMatters: "ATS parsers look for specific terminology from the job description.",
      actionableTip: "Naturally include these terms in your summary or project descriptions where accurate.",
      effort: "Low"
    });
  }

  // 5. Structure & Metrics check
  if (experienceCount > 0 && highestImpactActions.length < 7) {
    highestImpactActions.push({
      rank: actionRank++,
      title: "Add measurable impact to recent work experience",
      category: "Impact & Quantification",
      whyItMatters: "Resumes with quantifiable outcomes rank significantly higher with human hiring managers.",
      actionableTip: "Include concrete metrics such as latency reductions, users served, or scale delivered.",
      effort: "Medium"
    });
  }

  // Resume Quality Audit
  const qualityChecks: ResumeQualityAudit["checks"] = [
    {
      name: "Contact Information",
      status: parsedResume.contactInfo?.email ? "PASS" : "WARN",
      detail: parsedResume.contactInfo?.email ? "Email address detected and parsed cleanly." : "Missing contact email address in resume header."
    },
    {
      name: "Experience Timeline",
      status: experienceCount >= 1 ? "PASS" : "INFO",
      detail: experienceCount >= 1 ? `${experienceCount} professional experience entries verified.` : "No formal work experience parsed. Project sections will be emphasized."
    },
    {
      name: "Education Credentials",
      status: educationCount >= 1 ? "PASS" : "INFO",
      detail: educationCount >= 1 ? `${educationCount} educational credential(s) verified.` : "No formal education entries detected."
    },
    {
      name: "Technical Skills Hierarchy",
      status: (parsedResume.skills || []).length >= 4 ? "PASS" : "WARN",
      detail: `${(parsedResume.skills || []).length} explicit technical skills identified and indexed.`
    },
    {
      name: "Text Extraction Hygiene",
      status: resumeCorpus.length > 300 ? "PASS" : "WARN",
      detail: "Clean text extraction without suspicious encoding or corrupt characters."
    }
  ];

  const resumeQualityAudit: ResumeQualityAudit = {
    overallScore: resumeStructureScore,
    parsingConfidence: resumeCorpus.length > 500 ? 98 : 80,
    checks: qualityChecks
  };

  // Score Breakdown Details for "Why this score?"
  const scoreBreakdownDetails: ScoreBreakdownDetails = {
    requiredSkills: {
      score: Math.round(requiredPercentage),
      weight: Number(wRequired.toFixed(3)),
      matched: requiredMatched,
      total: requiredTotal,
      explanation: `${requiredMatched} of ${requiredTotal} mandatory skills verified with resume evidence.`
    },
    preferredSkills: {
      score: Math.round(preferredPercentage),
      weight: Number(wPreferred.toFixed(3)),
      matched: preferredMatched,
      total: preferredTotal,
      explanation: `${preferredMatched} of ${preferredTotal} preferred qualifications supported.`
    },
    keywordCoverage: {
      score: Math.round(keywordPercentage),
      weight: Number(wKeywords.toFixed(3)),
      matched: keywordsMatched,
      total: keywordsTotal,
      explanation: `${keywordsMatched} of ${keywordsTotal} meaningful job keywords and concepts covered.`
    },
    experienceMatch: {
      score: Math.round(experienceMatchScore),
      weight: Number(wExperience.toFixed(3)),
      isRequired: isExperienceRequired,
      explanation: isExperienceRequired 
        ? (candidateYears >= requiredYears ? `${Math.round(candidateYears * 10) / 10} years verified (meets ${requiredYears}+ yrs requirement).` : `${Math.round(candidateYears * 10) / 10} years verified (less than ${requiredYears}+ yrs required).`)
        : "No explicit years-of-experience requirement specified in job posting."
    },
    roleAlignment: {
      score: roleAlignmentScore,
      weight: Number(wRoleAlignment.toFixed(3)),
      explanation: `Resume experience and title alignment scores ${roleAlignmentScore}% for "${context?.targetRole || 'Target Role'}" profiles.`
    },
    resumeStructure: {
      score: resumeStructureScore,
      weight: Number(wStructure.toFixed(3)),
      explanation: "Evaluates contact information, standard section headers, chronological timeline, and text parsing readability."
    },
    educationMatch: {
      score: Math.round(educationMatchScore),
      weight: Number(wEducation.toFixed(3)),
      isRequired: isEducationRequired,
      explanation: isEducationRequired 
        ? (candidateHasEducation ? "Verified academic degree/coursework credential found." : "Job description explicitly lists degree requirement; none found in resume.")
        : "Job posting does not mandate a specific degree requirement; zero penalty applied."
    },
    criticalGapPenalty: criticalGaps.length * 10,
    criticalGapCap: maxScoreCap
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
    categoryScores,
    scoreConfidence,
    applicationReadiness,
    highestImpactActions,
    resumeQualityAudit,
    scoreBreakdownDetails
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
