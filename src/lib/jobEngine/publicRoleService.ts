import { 
  RoleIntelligence, 
  RoleSourceProvenance, 
  RoleSourceType, 
  RoleConfidenceTier, 
  RoleIntelligenceStatus, 
  RequirementFrequency, 
  ExperiencePattern, 
  LocationPattern, 
  EmergingRoleSkill, 
  RoleMarketGapItem,
  RequirementCategory
} from "../../types";
import { normalizeRole } from "./roleResolver";
import { extractJobRequirements } from "./jobNormalizer";
import { stripHtml } from "./adapters";
import { globalIntelligenceEngine } from "../intelligenceEngine";

export interface PublicRoleEnrichmentParams {
  roleTitle: string;
  companyName?: string;
  jobDescription?: string;
  candidateSkills?: string[];
}

interface RawObservedPosting {
  title: string;
  company: string;
  description: string;
  location?: string;
  url?: string;
  postedAt?: string;
  sourceType: RoleSourceType;
  isStale?: boolean;
}

/**
 * Searches Arbeitnow public API for postings matching a role title or keywords.
 */
export async function searchPublicPostingsByRole(
  queryRole: string
): Promise<RawObservedPosting[]> {
  const clean = queryRole.trim().toLowerCase();
  if (!clean || clean.length < 2) return [];

  const GENERIC_ROLE_WORDS = new Set([
    "senior", "junior", "lead", "staff", "intern", "associate", "entry", "level",
    "engineer", "developer", "specialist", "manager", "analyst", "consultant", "officer", "coordinator", "expert"
  ]);

  const specificTokens = clean.split(/\s+/).filter(t => t.length > 2 && !GENERIC_ROLE_WORDS.has(t));
  const tokensToMatch = specificTokens.length > 0 ? specificTokens : clean.split(/\s+/).filter(t => t.length > 2);

  try {
    const searchUrl = "https://www.arbeitnow.com/api/job-board-api";
    const res = await fetch(searchUrl, {
      headers: { "Accept": "application/json", "User-Agent": "Resumix/1.0" },
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) return [];

    const data: any = await res.json();
    if (!Array.isArray(data.data)) return [];

    const sixtyDaysAgoMs = Date.now() - (60 * 24 * 60 * 60 * 1000);

    const matches: RawObservedPosting[] = [];
    for (const item of data.data) {
      const titleLower = (item.title || "").toLowerCase();
      const descLower = (item.description || "").toLowerCase();

      // Check if title or description contains the core role keywords
      const titleMatches = tokensToMatch.some(t => {
        const regex = new RegExp(`\\b${t}\\b`, "i");
        return regex.test(titleLower);
      });
      const descMatches = specificTokens.length > 0
        ? specificTokens.some(t => new RegExp(`\\b${t}\\b`, "i").test(descLower))
        : tokensToMatch.filter(t => new RegExp(`\\b${t}\\b`, "i").test(descLower)).length >= Math.min(2, tokensToMatch.length);

      if (titleMatches || descMatches) {
        const postedDate = item.created_at ? new Date(item.created_at * 1000) : new Date();
        const isStale = postedDate.getTime() < sixtyDaysAgoMs;

        matches.push({
          title: item.title || queryRole,
          company: item.company_name || "Public Employer",
          description: stripHtml(item.description || ""),
          location: item.location || (item.remote ? "Remote" : "On-site"),
          url: item.url,
          postedAt: postedDate.toISOString(),
          sourceType: "JOB_BOARD_API",
          isStale
        });
      }
    }

    return matches.slice(0, 30);
  } catch {
    return [];
  }
}

/**
 * Collects postings from internal job store and user context.
 */
export function collectInternalRolePostings(
  normalizedRole: string,
  userJobDescription?: string,
  userCompany?: string
): RawObservedPosting[] {
  const results: RawObservedPosting[] = [];
  const cleanNorm = normalizedRole.toLowerCase();

  // 1. From user's current target job description
  if (userJobDescription && userJobDescription.trim().length >= 40) {
    results.push({
      title: normalizedRole,
      company: userCompany || "Target Employer",
      description: userJobDescription.trim(),
      sourceType: "USER_JOB_DESCRIPTION",
      postedAt: new Date().toISOString(),
      isStale: false
    });
  }

  // 2. From internal memory job store
  try {
    const allInternal = globalIntelligenceEngine.jobStore.getAllJobs();
    for (const j of allInternal) {
      const jobRole = (j.canonicalRole || j.role || j.title || "").toLowerCase();
      if (jobRole.includes(cleanNorm) || cleanNorm.includes(jobRole)) {
        results.push({
          title: j.title || normalizedRole,
          company: j.companyName || j.company || "Internal Store",
          description: j.description || (j.snapshot && j.snapshot.description) || "",
          location: j.location || "Flexible",
          sourceType: "PUBLIC_JOB_POSTING",
          postedAt: j.createdAt || new Date().toISOString(),
          isStale: false
        });
      }
    }
  } catch {
    // Non-blocking fallback
  }

  return results;
}

/**
 * Categorizes extracted skills into language, framework, database, cloud, tool, etc.
 */
function categorizeSkill(
  category: RequirementCategory,
  canonicalName: string,
  containers: {
    languages: Set<string>;
    frameworks: Set<string>;
    databases: Set<string>;
    cloud: Set<string>;
    tools: Set<string>;
  }
) {
  switch (category) {
    case "LANGUAGE":
      containers.languages.add(canonicalName);
      break;
    case "FRAMEWORK":
      containers.frameworks.add(canonicalName);
      break;
    case "DATABASE":
      containers.databases.add(canonicalName);
      break;
    case "CLOUD":
      containers.cloud.add(canonicalName);
      break;
    case "TOOL":
      containers.tools.add(canonicalName);
      break;
    default:
      containers.tools.add(canonicalName);
      break;
  }
}

/**
 * Calculates deterministic confidence tier and human-readable reasons.
 */
export function calculateRoleConfidence(
  postingsCount: number,
  companiesCount: number,
  normalizationConfidence: number
): { tier: RoleConfidenceTier; score: number; reasons: string[] } {
  const reasons: string[] = [];

  if (postingsCount === 0) {
    return {
      tier: "INSUFFICIENT_DATA",
      score: 0.15,
      reasons: ["No verified public postings found for this specific role."]
    };
  }

  let score = 0.30;

  if (postingsCount >= 20 && companiesCount >= 5) {
    score += 0.40;
    reasons.push(`Analyzed ${postingsCount} public postings across ${companiesCount} distinct companies.`);
  } else if (postingsCount >= 5 && companiesCount >= 2) {
    score += 0.30;
    reasons.push(`Analyzed ${postingsCount} public postings across ${companiesCount} companies.`);
  } else {
    score += 0.15;
    reasons.push(`Limited sample size: ${postingsCount} posting(s) analyzed.`);
  }

  if (normalizationConfidence >= 0.90) {
    score += 0.25;
    reasons.push("High canonical role normalization confidence.");
  } else if (normalizationConfidence >= 0.70) {
    score += 0.15;
    reasons.push("Specialized or novel role title mapped with domain-level confidence.");
  } else {
    reasons.push("Ambiguous or generic role title requiring domain context.");
  }

  const boundedScore = Math.max(0.1, Math.min(1.0, Math.round(score * 100) / 100));
  let tier: RoleConfidenceTier = "LOW";

  if (boundedScore >= 0.80 && postingsCount >= 10) {
    tier = "HIGH";
  } else if (boundedScore >= 0.55 && postingsCount >= 3) {
    tier = "MEDIUM";
  } else if (postingsCount < 3) {
    tier = "INSUFFICIENT_DATA";
  }

  return { tier, score: boundedScore, reasons };
}

/**
 * Derives related roles from role family, specialization, and tech overlaps.
 */
function deriveRelatedRoles(
  normalizedRole: string,
  roleFamily: string,
  commonTech: string[]
): string[] {
  const related = new Set<string>();

  if (roleFamily === "Software Engineering") {
    if (normalizedRole !== "Full Stack Engineer") related.add("Full Stack Engineer");
    if (normalizedRole !== "Backend Engineer") related.add("Backend Engineer");
    if (normalizedRole !== "Software Engineer") related.add("Software Engineer");
    if (commonTech.includes("Rust") || commonTech.includes("C++")) related.add("Systems Engineer");
  } else if (roleFamily === "Data & Machine Learning") {
    if (normalizedRole !== "Machine Learning Engineer") related.add("Machine Learning Engineer");
    if (normalizedRole !== "Data Engineer") related.add("Data Engineer");
    if (normalizedRole !== "Data Scientist") related.add("Data Scientist");
    if (commonTech.includes("PyTorch") || commonTech.includes("TensorFlow")) related.add("AI Research Engineer");
  } else if (roleFamily === "Product & Design") {
    if (normalizedRole !== "Product Designer") related.add("Product Designer");
    if (normalizedRole !== "UX Designer") related.add("UX Designer");
    if (normalizedRole !== "Technical Product Manager") related.add("Technical Product Manager");
  } else if (roleFamily === "Hardware & Embedded") {
    if (normalizedRole !== "Embedded Firmware Engineer") related.add("Embedded Firmware Engineer");
    if (normalizedRole !== "Robotics Perception Engineer") related.add("Robotics Perception Engineer");
    related.add("Hardware Systems Engineer");
  } else if (roleFamily === "DevOps & Cloud Infrastructure") {
    if (normalizedRole !== "Site Reliability Engineer") related.add("Site Reliability Engineer");
    if (normalizedRole !== "DevOps & Cloud Engineer") related.add("DevOps & Cloud Engineer");
    related.add("Platform Engineer");
  } else if (roleFamily === "Analytics & Business Intelligence") {
    if (normalizedRole !== "Data Analyst") related.add("Data Analyst");
    if (normalizedRole !== "Quantitative Analyst") related.add("Quantitative Analyst");
    related.add("Business Intelligence Engineer");
  }

  return Array.from(related).slice(0, 5);
}

/**
 * Builds a complete RoleIntelligence model by aggregating public postings and signals.
 */
export async function buildUniversalRoleIntelligence(
  params: PublicRoleEnrichmentParams
): Promise<RoleIntelligence> {
  const resolved = normalizeRole(params.roleTitle);
  const now = new Date().toISOString();

  // 1. Gather postings from public APIs and internal stores
  const publicPostings = await searchPublicPostingsByRole(params.roleTitle);
  const internalPostings = collectInternalRolePostings(
    resolved.normalizedRole,
    params.jobDescription,
    params.companyName
  );

  const allPostings = [...publicPostings, ...internalPostings];
  const sampleSize = allPostings.length;

  const distinctCompanies = new Set(allPostings.map(p => p.company.toLowerCase().trim()));
  const companyCount = distinctCompanies.size;

  const sourceRecords: RoleSourceProvenance[] = [];
  for (const p of allPostings.slice(0, 10)) {
    sourceRecords.push({
      field: "jobPosting",
      value: `${p.title} at ${p.company}`,
      sourceType: p.sourceType,
      sourceUrl: p.url || null,
      observedAt: p.postedAt || now,
      confidence: p.isStale ? 0.70 : 0.95
    });
  }

  // Containers for aggregated statistics
  const skillOccurrences = new Map<string, {
    canonicalName: string;
    category: RequirementCategory;
    total: number;
    required: number;
    preferred: number;
    recentTotal: number;
  }>();

  const containerCategories = {
    languages: new Set<string>(),
    frameworks: new Set<string>(),
    databases: new Set<string>(),
    cloud: new Set<string>(),
    tools: new Set<string>()
  };

  const locationCounts = new Map<string, number>();
  const experienceCounts = new Map<string, number>();
  const keywordsSet = new Set<string>();

  // 2. Extract and count requirements across postings
  for (const posting of allPostings) {
    const extracted = extractJobRequirements(posting.description, posting.title);
    
    // Weight: recent postings get full credit (1.0), stale postings get 0.75
    const weight = posting.isStale ? 0.75 : 1.0;

    for (const req of extracted) {
      const key = req.canonicalName.toLowerCase();
      categorizeSkill(req.category, req.canonicalName, containerCategories);

      if (!skillOccurrences.has(key)) {
        skillOccurrences.set(key, {
          canonicalName: req.canonicalName,
          category: req.category,
          total: 0,
          required: 0,
          preferred: 0,
          recentTotal: 0
        });
      }

      const entry = skillOccurrences.get(key)!;
      entry.total += 1;
      if (req.importance === "REQUIRED") entry.required += 1;
      if (req.importance === "PREFERRED") entry.preferred += 1;
      if (!posting.isStale) entry.recentTotal += 1;

      keywordsSet.add(req.name.toLowerCase());
    }

    // Location distribution
    const loc = posting.location || "Flexible";
    locationCounts.set(loc, (locationCounts.get(loc) || 0) + 1);

    // Experience distribution
    const exp = posting.title.toLowerCase().includes("senior") ? "5+ years" :
                posting.title.toLowerCase().includes("junior") ? "0–2 years" : "2–5 years";
    experienceCounts.set(exp, (experienceCounts.get(exp) || 0) + 1);
  }

  // 3. Compute frequencies
  const requiredSkillPatterns: RequirementFrequency[] = [];
  const preferredSkillPatterns: RequirementFrequency[] = [];
  const commonSkillsList: string[] = [];

  for (const [, stats] of skillOccurrences.entries()) {
    const rawPct = sampleSize > 0 ? (stats.total / sampleSize) * 100 : 0;
    const roundedPct = Math.round(rawPct);

    const freqObj: RequirementFrequency = {
      canonicalName: stats.canonicalName,
      requirementName: stats.canonicalName,
      category: stats.category,
      occurrences: stats.total,
      totalRelevantJobs: sampleSize,
      frequency: sampleSize > 0 ? stats.total / sampleSize : 0,
      frequencyPercentage: roundedPct,
      requiredOccurrences: stats.required,
      preferredOccurrences: stats.preferred,
      optionalOccurrences: 0,
      evidenceJobIds: [],
      evidenceSnapshotIds: []
    };

    if (stats.required > 0) {
      requiredSkillPatterns.push(freqObj);
    }
    if (stats.preferred > 0) {
      preferredSkillPatterns.push(freqObj);
    }

    // Common skills threshold: appeared in >= 25% of postings or >= 2 postings
    if (stats.total >= 2 || (sampleSize > 0 && stats.total / sampleSize >= 0.25)) {
      commonSkillsList.push(stats.canonicalName);
    }
  }

  // Sort descending by occurrence
  requiredSkillPatterns.sort((a, b) => b.occurrences - a.occurrences);
  preferredSkillPatterns.sort((a, b) => b.occurrences - a.occurrences);

  // 4. Experience & Location patterns
  const experiencePatterns: ExperiencePattern[] = Array.from(experienceCounts.entries()).map(([level, count]) => ({
    level,
    jobCount: count,
    percentage: sampleSize > 0 ? Math.round((count / sampleSize) * 100) : 0,
    topRequirements: commonSkillsList.slice(0, 3)
  }));

  const locationPatterns: LocationPattern[] = Array.from(locationCounts.entries()).map(([loc, count]) => ({
    location: loc,
    isRemote: /remote|virtual|anywhere/i.test(loc),
    jobCount: count,
    percentage: sampleSize > 0 ? Math.round((count / sampleSize) * 100) : 0,
    topRequirements: commonSkillsList.slice(0, 3)
  }));

  // 5. Emerging skills detection
  const emergingSkills: EmergingRoleSkill[] = [];
  if (sampleSize >= 4) {
    for (const [, stats] of skillOccurrences.entries()) {
      if (stats.recentTotal > 0 && stats.total >= 2) {
        const recentFreq = Math.round((stats.recentTotal / sampleSize) * 100);
        const baselineFreq = Math.max(5, Math.round(((stats.total - stats.recentTotal) / Math.max(1, sampleSize / 2)) * 100));
        const growth = recentFreq - baselineFreq;

        if (growth >= 10) {
          emergingSkills.push({
            technology: stats.canonicalName,
            previousFrequency: baselineFreq,
            recentFrequency: recentFreq,
            growthPercentage: growth,
            trend: "TRENDING_UP",
            sampleSize
          });
        }
      }
    }
  }

  // 6. Market Readiness & Gap Analysis against Candidate Resume
  let marketGaps: RoleMarketGapItem[] | undefined = undefined;
  if (params.candidateSkills && Array.isArray(params.candidateSkills)) {
    const candidateSkillSet = new Set(params.candidateSkills.map(s => s.toLowerCase().trim()));
    marketGaps = [];

    for (const [, stats] of skillOccurrences.entries()) {
      const isCandidateVerified = candidateSkillSet.has(stats.canonicalName.toLowerCase()) ||
        Array.from(candidateSkillSet).some(c => c.includes(stats.canonicalName.toLowerCase()));

      const pct = sampleSize > 0 ? Math.round((stats.total / sampleSize) * 100) : 0;
      const classification = pct >= 50 ? "COMMON" : pct >= 25 ? "EMERGING" : "OCCASIONAL";

      marketGaps.push({
        skill: stats.canonicalName,
        category: stats.category,
        marketFrequency: pct,
        marketClassification: classification,
        candidateEvidenceStatus: isCandidateVerified ? "VERIFIED" : "NO_EVIDENCE",
        recommendation: isCandidateVerified
          ? `Verified in resume: Your resume demonstrates verified evidence for ${stats.canonicalName}.`
          : `No verified evidence: Consider developing or documenting ${stats.canonicalName} experience if you genuinely have it.`
      });
    }

    // Sort by market frequency descending
    marketGaps.sort((a, b) => b.marketFrequency - a.marketFrequency);
  }

  // 7. Confidence & Reasons
  const { tier, score, reasons } = calculateRoleConfidence(sampleSize, companyCount, resolved.confidence);

  // 8. Related Roles
  const commonTech = Array.from(new Set([
    ...containerCategories.languages,
    ...containerCategories.frameworks,
    ...containerCategories.cloud
  ]));
  const relatedRoles = deriveRelatedRoles(resolved.normalizedRole, resolved.roleFamily, commonTech);

  const status: RoleIntelligenceStatus = 
    sampleSize >= 5 ? "VERIFIED" :
    sampleSize >= 1 ? "PARTIAL" : "LIMITED_DATA";

  const disclaimer = sampleSize < 4 
    ? `Limited market evidence: observed in ${sampleSize} analyzed posting(s). These describe public job-market patterns and are NOT individual hiring decisions, interview guarantees, or ATS requirements for this specific job.`
    : `Empirical role intelligence: Synthesized from ${sampleSize} verified public postings across ${companyCount} companies. These represent general market patterns and are NOT individual hiring decisions, interview guarantees, or ATS requirements for this specific job.`;

  return {
    id: resolved.roleId,
    roleId: resolved.roleId,
    originalRole: resolved.originalRole,
    normalizedRole: resolved.normalizedRole,
    roleFamily: resolved.roleFamily,
    specialization: resolved.specialization,
    seniority: resolved.seniority,
    aliases: resolved.aliases,
    industries: [resolved.roleFamily],
    commonSkills: commonSkillsList,
    requiredSkillPatterns,
    preferredSkillPatterns,
    commonTechnologies: commonTech,
    commonTools: Array.from(containerCategories.tools),
    commonFrameworks: Array.from(containerCategories.frameworks),
    commonLanguages: Array.from(containerCategories.languages),
    commonDatabases: Array.from(containerCategories.databases),
    commonCloudTechnologies: Array.from(containerCategories.cloud),
    commonCertifications: [],
    commonEducationPatterns: ["Bachelor's or equivalent practical experience"],
    experiencePatterns,
    responsibilityPatterns: [
      `Design and implement systems within ${resolved.roleFamily}`,
      "Collaborate with cross-functional technical teams",
      "Ensure production reliability, code quality, and testing standards"
    ],
    keywordPatterns: Array.from(keywordsSet).slice(0, 30),
    locationPatterns,
    employmentPatterns: ["Full-time"],
    relatedRoles,
    emergingSkills,
    marketGaps,
    sourceRecords,
    observationCount: sampleSize,
    companyCount,
    confidence: tier,
    confidenceReasons: reasons,
    confidenceScore: score,
    disclaimer,
    firstObservedAt: now,
    lastUpdatedAt: now,
    status
  };
}
