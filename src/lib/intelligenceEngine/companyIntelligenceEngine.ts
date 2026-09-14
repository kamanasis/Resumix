import crypto from "crypto";
import { 
  CompanyIntelligenceProfile, 
  RoleFamilyPattern, 
  RequirementTrend,
  RequirementFrequency,
  EvidenceStrength,
  CompanyIntelligence,
  CompanyEntity,
  CompanyConfidenceTier,
  CompanyIntelligenceStatus,
  CompanySourceProvenance
} from "../../types";
import { 
  JobWithSnapshot, 
  calculateRequirementFrequencies, 
  calculateEvidenceStrength 
} from "./frequencyEngine";
import { 
  calculateExperiencePatterns, 
  calculateLocationPatterns 
} from "./roleIntelligenceEngine";
import { calculateRequirementTrends } from "./trendEngine";
import { PublicCompanyEnrichmentResult } from "../jobEngine/publicCompanyService";

export interface ExtendedCompanyIntelligenceProfile extends CompanyIntelligenceProfile {
  totalPostingsAnalyzed?: number;
  topCompanyRequirements?: RequirementFrequency[];
  evidenceStrength?: EvidenceStrength;
  isStale?: boolean;
  disclaimer?: string;
}

/**
 * Generates an empirical CompanyIntelligenceProfile from verified job postings.
 * Supports both positional and object argument formats.
 */
export function buildCompanyIntelligenceProfile(
  arg1: string | { companyId: string; companyName: string; items: any[]; datasetVersion?: string },
  arg2?: string,
  arg3?: any[]
): ExtendedCompanyIntelligenceProfile {
  let companyId = "comp_default";
  let companyName = "Company";
  let items: any[] = [];
  let datasetVersion = "v1-default";

  if (typeof arg1 === "string") {
    companyId = arg1;
    companyName = arg2 || "Company";
    items = Array.isArray(arg3) ? arg3 : [];
    const hash = crypto.createHash("sha256").update(JSON.stringify(items.map(i => i.id || i.jobId || "j"))).digest("hex").substring(0, 8);
    datasetVersion = `v1-${items.length}-${hash}`;
  } else if (arg1 && typeof arg1 === "object") {
    companyId = arg1.companyId;
    companyName = arg1.companyName;
    items = arg1.items || [];
    datasetVersion = arg1.datasetVersion || `v1-${items.length}`;
  }

  const sampleSize = items.length;
  const topRequirements = calculateRequirementFrequencies(items);
  const experiencePatterns = calculateExperiencePatterns(items);
  const locationPatterns = calculateLocationPatterns(items);
  const trendData: RequirementTrend[] = calculateRequirementTrends(items);
  const evidenceQuality = calculateEvidenceStrength(sampleSize);

  // Group by canonical roles to form RoleFamilyPatterns
  const roleMap = new Map<string, {
    items: any[];
    titles: Set<string>;
  }>();

  for (const item of items) {
    const job = item.job || item;
    const roleKey = job.canonicalRole || job.normalizedRole || job.title || "Software Engineer";
    if (!roleMap.has(roleKey)) {
      roleMap.set(roleKey, { items: [], titles: new Set() });
    }
    const entry = roleMap.get(roleKey)!;
    entry.items.push(item);
    entry.titles.add(job.title || roleKey);
  }

  const roleFamilies: RoleFamilyPattern[] = [];
  for (const [canonicalRole, entry] of roleMap.entries()) {
    const percentage = sampleSize > 0 ? Math.round((entry.items.length / sampleSize) * 1000) / 10 : 0;
    roleFamilies.push({
      canonicalRole,
      roleTitle: canonicalRole,
      postingCount: entry.items.length,
      jobCount: entry.items.length,
      percentage,
      commonTitles: Array.from(entry.titles).slice(0, 5),
      requirementDistribution: calculateRequirementFrequencies(entry.items).slice(0, 10),
      experienceDistribution: calculateExperiencePatterns(entry.items),
      locationDistribution: calculateLocationPatterns(entry.items)
    });
  }

  roleFamilies.sort((a, b) => b.jobCount - a.jobCount);

  // Determine earliest and latest timestamps, and staleness (> 60 days)
  let start = "";
  let end = "";
  let isStale = false;

  if (items.length > 0) {
    const timestamps = items
      .map(i => {
        const job = i.job || i;
        const snap = i.snapshot || i;
        return snap.observedAt || snap.retrievedAt || job.firstSeenAt || job.postedAt || job.createdAt || "";
      })
      .filter(Boolean)
      .sort();

    if (timestamps.length > 0) {
      start = timestamps[0];
      end = timestamps[timestamps.length - 1];

      const latestTime = new Date(end).getTime();
      if (!isNaN(latestTime)) {
        const ageDays = (Date.now() - latestTime) / 86400000;
        isStale = ageDays > 60;
      }
    }
  }

  // Deterministic profileId
  const idPayload = `${companyId.toLowerCase()}|${datasetVersion}`;
  const profileId = "comp_intel_" + crypto.createHash("sha256").update(idPayload, "utf8").digest("hex").substring(0, 12);

  return {
    profileId,
    companyId,
    companyName,
    sampleSize,
    totalPostingsAnalyzed: sampleSize,
    analyzedJobCount: sampleSize,
    rolesAnalyzed: roleFamilies.length,
    locationsAnalyzed: locationPatterns.length,
    timeRange: start && end ? { start, end } : undefined,
    topRequirements,
    topCompanyRequirements: topRequirements,
    roleFamilies,
    experiencePatterns,
    locationPatterns,
    trendData,
    evidenceQuality,
    evidenceStrength: evidenceQuality,
    datasetVersion,
    isStale,
    disclaimer: "These percentages describe observed job-posting patterns from verified postings. They are NOT hiring, interview, or rejection decisions.",
    generatedAt: new Date().toISOString()
  };
}

/**
 * Evaluates evidence quality and assigns a transparent confidence score.
 */
export function calculateCompanyConfidence(params: {
  hasVerifiedWebsite: boolean;
  hasJobBoard: boolean;
  jobCount: number;
  hasDescription: boolean;
  resolutionStatus?: string;
}): {
  confidence: CompanyConfidenceTier;
  confidenceScore: number;
  confidenceReasons: string[];
} {
  const reasons: string[] = [];
  let score = 0.2;

  if (params.resolutionStatus === "AMBIGUOUS") {
    reasons.push("Multiple similar entity names exist without unambiguous domain confirmation.");
    return {
      confidence: "LOW",
      confidenceScore: 0.3,
      confidenceReasons: reasons
    };
  }

  if (params.hasVerifiedWebsite) {
    score += 0.35;
    reasons.push("Official web domain verified.");
  } else {
    reasons.push("Official web presence could not be independently confirmed.");
  }

  if (params.hasJobBoard) {
    score += 0.25;
    reasons.push("Active public careers / ATS portal detected.");
  }

  if (params.jobCount >= 10) {
    score += 0.25;
    reasons.push(`Strong public sample size: ${params.jobCount} job postings analyzed.`);
  } else if (params.jobCount >= 3) {
    score += 0.15;
    reasons.push(`Moderate public sample size: ${params.jobCount} job postings analyzed.`);
  } else if (params.jobCount > 0) {
    score += 0.08;
    reasons.push(`Initial public sample size: ${params.jobCount} job posting analyzed.`);
  } else {
    reasons.push("Limited publicly available hiring data detected.");
  }

  if (params.hasDescription) {
    score += 0.05;
  }

  score = Math.min(1.0, Math.max(0.1, Math.round(score * 100) / 100));

  let confidence: CompanyConfidenceTier = "LOW";
  if (score >= 0.75) {
    confidence = "HIGH";
  } else if (score >= 0.45) {
    confidence = "MEDIUM";
  } else if (score >= 0.25) {
    confidence = "LOW";
  } else {
    confidence = "UNVERIFIED";
  }

  return {
    confidence,
    confidenceScore: score,
    confidenceReasons: reasons
  };
}

/**
 * Builds the comprehensive universal CompanyIntelligence model with source provenance.
 */
export function buildUniversalCompanyIntelligence(params: {
  entity: CompanyEntity;
  enrichment: PublicCompanyEnrichmentResult;
  profile?: ExtendedCompanyIntelligenceProfile;
}): CompanyIntelligence {
  const { entity, enrichment, profile } = params;
  const now = new Date().toISOString();

  const id = `comp_intel_${entity.companyId.replace(/^comp_/, "")}`;
  const hasVerifiedWebsite = Boolean(enrichment.officialWebsite);
  const hasJobBoard = Boolean(enrichment.jobBoardProvider || enrichment.careersUrl);
  const jobCount = enrichment.discoveredJobCount || profile?.sampleSize || 0;
  const hasDescription = Boolean(enrichment.description);

  const { confidence, confidenceScore, confidenceReasons } = calculateCompanyConfidence({
    hasVerifiedWebsite,
    hasJobBoard,
    jobCount,
    hasDescription,
    resolutionStatus: entity.resolutionStatus
  });

  let status: CompanyIntelligenceStatus = "UNVERIFIED";
  if (entity.resolutionStatus === "AMBIGUOUS") {
    status = "AMBIGUOUS";
  } else if (confidence === "HIGH") {
    status = "VERIFIED";
  } else if (confidence === "MEDIUM" || confidence === "LOW") {
    status = "PARTIAL";
  }

  // Deduplicate and combine source provenance
  const sourceRecords: CompanySourceProvenance[] = [...enrichment.sourceRecords];
  if (entity.detectedSources) {
    for (const s of entity.detectedSources) {
      sourceRecords.push({
        field: "detectedSource",
        value: s.provider,
        sourceType: "JOB_BOARD_API",
        sourceUrl: s.sourceUrl,
        observedAt: s.retrievedAt || now,
        confidence: 0.9
      });
    }
  }

  // Top observed technologies
  const techCategories = new Set(["TOOL", "FRAMEWORK", "LANGUAGE", "DATABASE", "CLOUD"]);
  const skillCategories = new Set(["TECHNICAL_SKILL", "SOFT_SKILL", "DOMAIN_KNOWLEDGE"]);

  const observedTechnologies = enrichment.observedTechnologies.length > 0
    ? enrichment.observedTechnologies
    : profile?.topRequirements?.filter(r => techCategories.has(r.category)).map(r => r.canonicalName).slice(0, 15) || [];

  const observedSkills = enrichment.observedSkills.length > 0
    ? enrichment.observedSkills
    : profile?.topRequirements?.filter(r => skillCategories.has(r.category)).map(r => r.canonicalName).slice(0, 15) || [];

  const observedRoles = enrichment.observedRoles.length > 0
    ? enrichment.observedRoles
    : profile?.roleFamilies?.map(r => r.canonicalRole).slice(0, 10) || [];

  const observedExperiencePatterns = profile?.experiencePatterns || [];

  return {
    id,
    companyId: entity.companyId,
    normalizedName: entity.canonicalName,
    displayName: entity.rawName || entity.canonicalName,
    aliases: entity.aliases || [],
    officialWebsite: enrichment.officialWebsite || entity.officialWebsite || null,
    domain: enrichment.domain || entity.domain || null,
    industry: enrichment.industry || null,
    description: enrichment.description || null,
    headquarters: enrichment.headquarters || null,
    locations: enrichment.locations || [],
    companySize: enrichment.companySize || null,
    careersUrl: enrichment.careersUrl || entity.careersUrl || null,
    jobBoardProvider: enrichment.jobBoardProvider || entity.jobBoardProvider || null,
    jobBoardIdentifier: enrichment.jobBoardIdentifier || null,
    sourceRecords,
    observedRoles,
    observedSkills,
    observedTechnologies,
    observedExperiencePatterns,
    observedEducationPatterns: [],
    observedKeywords: enrichment.observedKeywords || [],
    hiringSignals: enrichment.hiringSignals || [],
    confidence,
    confidenceReasons,
    confidenceScore,
    firstObservedAt: entity.createdAt || now,
    lastUpdatedAt: now,
    sourceCount: sourceRecords.length,
    status,
    profile
  };
}
