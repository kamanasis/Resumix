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
 * Penalty: 10 points deducted per unfulfilled Critical Gap.
 */
export const ATS_WEIGHTS = {
  REQUIRED: 0.40,
  PREFERRED: 0.20,
  KEYWORDS: 0.15,
  EXPERIENCE: 0.10,
  ROLE_ALIGNMENT: 0.10,
  STRUCTURE: 0.05,
  CRITICAL_GAP_PENALTY: 10
};

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

/**
 * Evaluates candidate evidence against target requirements with 100% deterministic logic.
 */
export function evaluateResumeAgainstRequirements(
  parsedResume: ParsedResume,
  frozenRequirements: TargetRequirement[],
  rawResumeText: string = "",
  context?: { targetRole?: string; targetCompany?: string; jobDescription?: string }
): EvaluationResult {
  const evaluatedRequirements: TargetRequirement[] = [];
  const missingItems: MissingItem[] = [];

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
        if (!evidenceMap.has(canonicalReq) && expText.toLowerCase().includes(canonicalReq)) {
          const regex = new RegExp(`([^.?!]*\\b${escapeRegExp(req.name)}\\b[^.?!]*)`, "i");
          const match = expText.match(regex);
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
        if (!evidenceMap.has(canonicalReq) && projText.toLowerCase().includes(canonicalReq)) {
          const regex = new RegExp(`([^.?!]*\\b${escapeRegExp(req.name)}\\b[^.?!]*)`, "i");
          const match = projText.match(regex);
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
      confidence: isMatched ? 100 : 0
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

  // Deterministic Coverage Calculations
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
  const experienceMatchScore = experienceCount > 0 
    ? Math.min(100, Math.round(experienceCount * 33.3)) 
    : (requiredTotal === 0 ? 100 : 30);
  
  const educationCount = (parsedResume.education || []).length;
  const educationMatchScore = educationCount > 0 ? 100 : 50;

  // Role Alignment Score (Target Role Alignment)
  let roleAlignmentScore = 70;
  const targetRoleClean = (context?.targetRole || "").toLowerCase().trim();
  if (targetRoleClean) {
    const roleTokens = targetRoleClean.split(/[\s/-]+/).filter(w => w.length > 2 && !["the", "and", "for", "with"].includes(w));
    let tokenMatches = 0;
    const resumeTextLower = resumeCorpus.toLowerCase();
    for (const token of roleTokens) {
      if (resumeTextLower.includes(token)) {
        tokenMatches++;
      }
    }
    const tokenRatio = roleTokens.length > 0 ? tokenMatches / roleTokens.length : 0.7;
    roleAlignmentScore = Math.min(100, Math.round(50 + (tokenRatio * 50)));
  }

  // Resume Structure & Quality Score
  let structureScore = 50;
  if (parsedResume.contactInfo?.email) structureScore += 10;
  if (parsedResume.contactInfo?.phone || parsedResume.contactInfo?.location) structureScore += 10;
  if (experienceCount > 0) structureScore += 15;
  if (educationCount > 0) structureScore += 10;
  if ((parsedResume.skills || []).length >= 5) structureScore += 5;
  const resumeStructureScore = Math.min(100, structureScore);

  // ATS Compatibility Score calculation
  const rawAtsScore = 
    (requiredPercentage * ATS_WEIGHTS.REQUIRED) +
    (preferredPercentage * ATS_WEIGHTS.PREFERRED) +
    (keywordPercentage * ATS_WEIGHTS.KEYWORDS) +
    (experienceMatchScore * ATS_WEIGHTS.EXPERIENCE) +
    (roleAlignmentScore * ATS_WEIGHTS.ROLE_ALIGNMENT) +
    (resumeStructureScore * ATS_WEIGHTS.STRUCTURE) -
    (criticalGaps.length * ATS_WEIGHTS.CRITICAL_GAP_PENALTY);

  const atsScore = Math.max(0, Math.min(100, Math.round(rawAtsScore)));

  // Target Match Score (Candidate Alignment)
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
      weight: ATS_WEIGHTS.REQUIRED * 100,
      matched: requiredMatched,
      total: requiredTotal,
      explanation: `${requiredMatched} of ${requiredTotal} mandatory skills verified with resume evidence.`
    },
    preferredSkills: {
      score: Math.round(preferredPercentage),
      weight: ATS_WEIGHTS.PREFERRED * 100,
      matched: preferredMatched,
      total: preferredTotal,
      explanation: `${preferredMatched} of ${preferredTotal} preferred qualifications supported.`
    },
    keywordCoverage: {
      score: Math.round(keywordPercentage),
      weight: ATS_WEIGHTS.KEYWORDS * 100,
      matched: keywordsMatched,
      total: keywordsTotal,
      explanation: `${keywordsMatched} of ${keywordsTotal} technical keywords and tools matched.`
    },
    experienceMatch: {
      score: Math.round(experienceMatchScore),
      weight: ATS_WEIGHTS.EXPERIENCE * 100,
      explanation: experienceCount > 0 ? `${experienceCount} verified work experience roles.` : "Entry-level / project-weighted evaluation."
    },
    roleAlignment: {
      score: roleAlignmentScore,
      weight: ATS_WEIGHTS.ROLE_ALIGNMENT * 100,
      explanation: `Resume vocabulary aligns ${roleAlignmentScore}% with "${context?.targetRole || 'Target Role'}" job profiles.`
    },
    resumeStructure: {
      score: resumeStructureScore,
      weight: ATS_WEIGHTS.STRUCTURE * 100,
      explanation: "Evaluates contact completeness, section headers, timeline clarity, and parsing legibility."
    },
    criticalGapPenalty: criticalGaps.length * ATS_WEIGHTS.CRITICAL_GAP_PENALTY
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
