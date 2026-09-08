import crypto from "crypto";
import { 
  CompanyIntelligenceProfile, 
  RoleFamilyPattern, 
  RequirementTrend,
  RequirementFrequency,
  EvidenceStrength
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

// ============================================================================
// RESUMIX STAGE 7: COMPANY INTELLIGENCE ENGINE
// ============================================================================
// Aggregates verified job postings across an entire organization.
// Maps role family patterns, global top requirements, and temporal trends.
// Strictly data-driven: company names are data, not application logic.
// ============================================================================

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
