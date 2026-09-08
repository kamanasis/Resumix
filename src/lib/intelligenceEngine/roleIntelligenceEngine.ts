import crypto from "crypto";
import { 
  RoleIntelligenceProfile, 
  ExperiencePattern, 
  LocationPattern, 
  RequirementFrequency 
} from "../../types";
import { 
  JobWithSnapshot, 
  calculateRequirementFrequencies, 
  calculateEvidenceStrength 
} from "./frequencyEngine";
import { calculateSkillCoOccurrences } from "./coOccurrenceEngine";

// ============================================================================
// RESUMIX STAGE 7: ROLE INTELLIGENCE ENGINE
// ============================================================================
// Produces role-specific intelligence profiles based strictly on real job data.
// Separates distinct roles (e.g. Software Engineer ≠ Product Designer ≠ Data Scientist)
// and breaks down distributions by seniority level and physical/remote location.
// ============================================================================

export interface ExtendedRoleIntelligenceProfile extends RoleIntelligenceProfile {
  roleTitle?: string;
  totalPostingsAnalyzed?: number;
  topRequirements?: RequirementFrequency[];
  experiencePatterns?: ExperiencePattern[];
  locationPatterns?: LocationPattern[];
  disclaimer?: string;
}

/**
 * Generates an empirical RoleIntelligenceProfile from verified job postings.
 * Supports both positional (roleTitle, jobs) and object-based call signatures.
 */
export function buildRoleIntelligenceProfile(
  arg1: string | { canonicalRole: string; targetCompany?: string; items: any[]; datasetVersion?: string },
  arg2?: any[]
): ExtendedRoleIntelligenceProfile {
  let canonicalRole = "Software Engineer";
  let targetCompany: string | undefined;
  let items: any[] = [];
  let datasetVersion: string = "v1-default";

  if (typeof arg1 === "string") {
    canonicalRole = arg1;
    items = Array.isArray(arg2) ? arg2 : [];
    // Compute deterministic version from items
    const hash = crypto.createHash("sha256").update(JSON.stringify(items.map(i => i.id || i.jobId || "j"))).digest("hex").substring(0, 8);
    datasetVersion = `v1-${items.length}-${hash}`;
  } else if (arg1 && typeof arg1 === "object") {
    canonicalRole = arg1.canonicalRole;
    targetCompany = arg1.targetCompany;
    items = arg1.items || [];
    datasetVersion = arg1.datasetVersion || `v1-${items.length}`;
  }

  const sampleSize = items.length;
  const requirementDistribution = calculateRequirementFrequencies(items);
  const requiredSkills = requirementDistribution.filter(r => r.requiredOccurrences > 0);
  const preferredSkills = requirementDistribution.filter(r => r.preferredOccurrences > 0);
  const coOccurrences = calculateSkillCoOccurrences(items, 1, 10);
  const evidenceStrength = calculateEvidenceStrength(sampleSize);
  const experiencePatterns = calculateExperiencePatterns(items);
  const locationPatterns = calculateLocationPatterns(items);

  // Deterministic profileId
  const idPayload = `${(targetCompany || "ALL").toLowerCase()}|${canonicalRole.toLowerCase()}|${datasetVersion}`;
  const profileId = "role_intel_" + crypto.createHash("sha256").update(idPayload, "utf8").digest("hex").substring(0, 12);

  return {
    profileId,
    canonicalRole,
    roleTitle: canonicalRole,
    targetCompany,
    sampleSize,
    totalPostingsAnalyzed: sampleSize,
    requirementDistribution,
    topRequirements: requirementDistribution,
    requiredSkills,
    preferredSkills,
    coOccurrences: coOccurrences as any,
    evidenceStrength,
    experiencePatterns,
    locationPatterns,
    datasetVersion,
    disclaimer: "These percentages describe observed job-posting patterns from verified postings. They are NOT hiring, interview, or rejection decisions.",
    generatedAt: new Date().toISOString()
  };
}

/**
 * Calculates experience-level distributions across a set of jobs.
 */
export function calculateExperiencePatterns(items: any[]): ExperiencePattern[] {
  const total = items.length;
  if (total === 0) return [];

  const map = new Map<string, any[]>();
  for (const item of items) {
    const job = item.job || item;
    const level = job.experienceLevel || "Mid-Level";
    if (!map.has(level)) map.set(level, []);
    map.get(level)!.push(item);
  }

  const results: ExperiencePattern[] = [];
  for (const [level, group] of map.entries()) {
    const freqs = calculateRequirementFrequencies(group);
    const topRequirements = freqs.slice(0, 5).map(f => f.canonicalName);
    const percentage = Math.round((group.length / total) * 1000) / 10; // 0 to 100

    results.push({
      level,
      jobCount: group.length,
      percentage,
      topRequirements
    });
  }

  results.sort((a, b) => b.jobCount - a.jobCount);
  return results;
}

/**
 * Calculates location patterns across a set of jobs.
 */
export function calculateLocationPatterns(items: any[]): LocationPattern[] {
  const total = items.length;
  if (total === 0) return [];

  const map = new Map<string, { group: any[]; isRemote: boolean; rawName: string }>();
  for (const item of items) {
    const job = item.job || item;
    let locStr = "Remote";
    let isRemote = false;

    if (typeof job.location === "object" && job.location !== null) {
      locStr = job.location.raw || (job.location.isRemote ? "Remote" : "Onsite");
      isRemote = Boolean(job.location.isRemote);
    } else if (typeof job.location === "string") {
      locStr = job.location;
      isRemote = job.location.toLowerCase().includes("remote");
    }

    const key = `${locStr}|||${isRemote}`;
    if (!map.has(key)) map.set(key, { group: [], isRemote, rawName: locStr });
    map.get(key)!.group.push(item);
  }

  const results: LocationPattern[] = [];
  for (const { group, isRemote, rawName } of map.values()) {
    const freqs = calculateRequirementFrequencies(group);
    const topRequirements = freqs.slice(0, 5).map(f => f.canonicalName);
    const percentage = Math.round((group.length / total) * 1000) / 10;

    results.push({
      location: rawName,
      jobCount: group.length,
      count: group.length,
      percentage,
      topRequirements,
      isRemote
    });
  }

  results.sort((a, b) => b.jobCount - a.jobCount);
  return results;
}
