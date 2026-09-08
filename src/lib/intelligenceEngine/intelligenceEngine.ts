import crypto from "crypto";
import { 
  CompanyIntelligenceProfile, 
  RoleIntelligenceProfile, 
  RequirementFrequency, 
  EvidenceStrength,
  CandidateOutcomeRecord 
} from "../../types";
import { globalJobIngestionEngine } from "../jobEngine";
import { canonicalizeCompanyName, generateCompanyId } from "../jobEngine/companyResolver";
import { normalizeJobRole } from "../jobEngine/jobNormalizer";
import { JobWithSnapshot } from "./frequencyEngine";
import { buildCompanyIntelligenceProfile, ExtendedCompanyIntelligenceProfile } from "./companyIntelligenceEngine";
import { buildRoleIntelligenceProfile, ExtendedRoleIntelligenceProfile } from "./roleIntelligenceEngine";

// ============================================================================
// RESUMIX STAGE 7: CENTRAL INTELLIGENCE ORCHESTRATION SERVICE
// ============================================================================
// Coordinates verified Stage 6 job data into empirical market and role intelligence.
// Maintains deterministic profile hashing, dataset versioning, and caching.
// ============================================================================

export interface TargetIntelligenceAnalysis {
  companyName: string;
  roleName: string;
  roleTitle?: string;
  canonicalRole: string;
  sampleSize: number;
  totalPostingsAnalyzed: number;
  evidenceStrength: EvidenceStrength;
  datasetVersion: string;
  topRequirements: RequirementFrequency[];
  topObservedRequirements: RequirementFrequency[];
  candidateMatchingSkills: string[];
  candidateMatchingRequirements: string[];
  candidateMissingSkills: string[];
  candidateMissingFrequentRequirements: RequirementFrequency[];
  coOccurrences: any[];
  trends: any[];
  disclaimer: string;
}

export class UniversalIntelligenceEngine {
  private companyCache = new Map<string, ExtendedCompanyIntelligenceProfile>();
  private roleCache = new Map<string, ExtendedRoleIntelligenceProfile>();
  private outcomeRecords: any[] = [];
  private internalJobs = new Map<string, any>();

  /**
   * Embedded job store supporting in-memory fixture additions for tests and local orchestration.
   */
  public jobStore = {
    addJob: (job: any) => {
      const id = job.id || job.jobId || `job_${Math.random().toString(36).substring(2, 9)}`;
      this.internalJobs.set(id, { ...job, id, jobId: id });
      this.clearCache();
    },
    getJob: (id: string) => this.internalJobs.get(id),
    getAllJobs: () => Array.from(this.internalJobs.values()),
    clear: () => {
      this.internalJobs.clear();
      this.clearCache();
    }
  };

  /**
   * Computes a deterministic dataset version based on the count and latest timestamp
   * of relevant job snapshots.
   */
  public generateDatasetVersion(items: (JobWithSnapshot | any)[]): string {
    if (items.length === 0) return "v_empty";
    const jobCount = items.length;
    const latestTimestamp = items
      .map(i => {
        const job = i.job || i;
        const snap = i.snapshot || i;
        return snap.observedAt || snap.retrievedAt || job.firstSeenAt || job.postedAt || job.createdAt || "";
      })
      .filter(Boolean)
      .sort()
      .pop() || "0";

    const payload = `${jobCount}:${latestTimestamp}`;
    return "v_" + crypto.createHash("sha256").update(payload, "utf8").digest("hex").substring(0, 8);
  }

  /**
   * Collects all verified jobs with snapshots for a specific company or role.
   */
  public collectRelevantJobs(criteria: {
    companyName?: string;
    canonicalRole?: string;
    rawRole?: string;
  }): any[] {
    const results: any[] = [];
    
    // Combine jobs from globalJobIngestionEngine and local internalJobs
    const engineJobs: any[] = Array.from(((globalJobIngestionEngine as any).jobStore || new Map()).values());
    const internalJobsList = Array.from(this.internalJobs.values());
    const allStoredJobs = [...engineJobs, ...internalJobsList];

    const targetCanonicalCompany = criteria.companyName
      ? canonicalizeCompanyName(criteria.companyName).toLowerCase().trim()
      : null;

    for (const job of allStoredJobs) {
      if (targetCanonicalCompany) {
        const rawComp = (job.companyName || job.company?.name || "").toLowerCase().trim();
        const canonComp = canonicalizeCompanyName(rawComp).toLowerCase().trim();
        if (rawComp !== targetCanonicalCompany && canonComp !== targetCanonicalCompany) {
          continue;
        }
      }

      if (criteria.canonicalRole || criteria.rawRole) {
        const targetCanon = (criteria.canonicalRole || "").toLowerCase().trim();
        const targetRaw = (criteria.rawRole || "").toLowerCase().trim();

        const rawTitle = (job.title || "").toLowerCase().trim();
        const normRole = (job.normalizedRole || "").toLowerCase().trim();
        const canRole = (job.canonicalRole || "").toLowerCase().trim();
        const resolvedCanon = normalizeJobRole(rawTitle || normRole || canRole).canonicalRole.toLowerCase().trim();

        const matches = 
          (targetCanon && (resolvedCanon === targetCanon || rawTitle === targetCanon || normRole === targetCanon || canRole === targetCanon)) ||
          (targetRaw && (rawTitle === targetRaw || normRole === targetRaw || canRole === targetRaw || resolvedCanon === targetRaw));

        if (!matches) {
          continue;
        }
      }

      // Check for snapshots
      const snapshots = globalJobIngestionEngine.getJobSnapshots
        ? globalJobIngestionEngine.getJobSnapshots(job.jobId || job.id)
        : [];

      if (snapshots.length > 0) {
        const latestSnapshot = snapshots[snapshots.length - 1];
        results.push({ job, snapshot: latestSnapshot });
      } else {
        // Use job directly
        results.push(job);
      }
    }

    return results;
  }

  /**
   * Generates or retrieves cached CompanyIntelligenceProfile.
   */
  public async getCompanyIntelligence(companyName: string): Promise<ExtendedCompanyIntelligenceProfile> {
    const canonical = canonicalizeCompanyName(companyName);
    const companyId = generateCompanyId(canonical);

    const items = this.collectRelevantJobs({ companyName: canonical });
    const datasetVersion = this.generateDatasetVersion(items);
    const cacheKey = `${companyId}:${datasetVersion}`;

    if (this.companyCache.has(cacheKey)) {
      return this.companyCache.get(cacheKey)!;
    }

    const profile = buildCompanyIntelligenceProfile({
      companyId,
      companyName: canonical,
      items,
      datasetVersion
    });

    this.companyCache.set(cacheKey, profile);
    return profile;
  }

  public async getCompanyProfile(companyName: string): Promise<ExtendedCompanyIntelligenceProfile> {
    return this.getCompanyIntelligence(companyName);
  }

  /**
   * Generates or retrieves cached RoleIntelligenceProfile.
   */
  public async getRoleIntelligence(
    roleName: string,
    companyName?: string
  ): Promise<ExtendedRoleIntelligenceProfile> {
    const normalized = normalizeJobRole(roleName);
    const canonicalRole = normalized.canonicalRole;
    const canonicalCompany = companyName ? canonicalizeCompanyName(companyName) : undefined;

    const items = this.collectRelevantJobs({
      companyName: canonicalCompany,
      canonicalRole,
      rawRole: roleName
    });

    const datasetVersion = this.generateDatasetVersion(items);
    const cacheKey = `${canonicalCompany || "ALL"}:${canonicalRole}:${datasetVersion}`;

    if (this.roleCache.has(cacheKey)) {
      return this.roleCache.get(cacheKey)!;
    }

    const profile = buildRoleIntelligenceProfile({
      canonicalRole,
      targetCompany: canonicalCompany,
      items,
      datasetVersion
    });

    this.roleCache.set(cacheKey, profile);
    return profile;
  }

  public async getRoleProfile(roleName: string, companyName?: string): Promise<ExtendedRoleIntelligenceProfile> {
    return this.getRoleIntelligence(roleName, companyName);
  }

  /**
   * Analyzes target intelligence against user resume skills with complete concept separation:
   * USER_FACT (resume) vs JOB_REQUIREMENT (target job) vs MARKET_PATTERN (observed frequencies).
   */
  public async analyzeTargetIntelligence(params: {
    companyName: string;
    roleName?: string;
    roleTitle?: string;
    resumeSkills?: string[];
    candidateSkills?: string[];
  }): Promise<TargetIntelligenceAnalysis> {
    const companyName = params.companyName;
    const roleName = params.roleName || params.roleTitle || "Software Engineer";
    const resumeSkills = params.resumeSkills || params.candidateSkills || [];

    const normalizedRole = normalizeJobRole(roleName);
    const roleProfile = await this.getRoleIntelligence(roleName, companyName);
    const companyProfile = await this.getCompanyIntelligence(companyName);

    const candidateSkillsLower = new Set(resumeSkills.map(s => s.toLowerCase().trim()));

    const matching: string[] = [];
    const missing: string[] = [];

    const allReqs = roleProfile.requirementDistribution || roleProfile.topRequirements || [];

    for (const req of allReqs) {
      const name = (req.canonicalName || req.requirementName || "").toLowerCase();
      if (candidateSkillsLower.has(name)) {
        matching.push(name);
      } else {
        missing.push(name);
      }
    }

    const missingReqObjects = allReqs
      .filter(r => !candidateSkillsLower.has((r.canonicalName || r.requirementName || "").toLowerCase()))
      .slice(0, 10);

    return {
      companyName: canonicalizeCompanyName(companyName),
      roleName,
      roleTitle: roleName,
      canonicalRole: normalizedRole.canonicalRole,
      sampleSize: roleProfile.sampleSize,
      totalPostingsAnalyzed: roleProfile.sampleSize,
      evidenceStrength: roleProfile.evidenceStrength,
      datasetVersion: roleProfile.datasetVersion,
      topRequirements: allReqs.slice(0, 10),
      topObservedRequirements: allReqs.slice(0, 10),
      candidateMatchingSkills: matching,
      candidateMatchingRequirements: matching,
      candidateMissingSkills: missing,
      candidateMissingFrequentRequirements: missingReqObjects,
      coOccurrences: roleProfile.coOccurrences || [],
      trends: companyProfile.trendData || [],
      disclaimer: "Statistical Market Observation: These percentages and co-occurrence patterns describe observed job-posting requirements from verified public data sources. They represent market patterns and are NOT hiring, interview, or rejection decisions made by employers."
    };
  }

  public async analyzeTarget(
    companyName: string,
    roleTitle: string,
    candidateSkills: string[] = []
  ): Promise<TargetIntelligenceAnalysis> {
    return this.analyzeTargetIntelligence({
      companyName,
      roleName: roleTitle,
      resumeSkills: candidateSkills
    });
  }

  /**
   * Records candidate application outcomes truthfully without polluting raw job data.
   */
  public recordCandidateOutcome(record: {
    resumeId: string;
    jobPostingId?: string;
    jobId?: string;
    companyName: string;
    roleTitle: string;
    outcome: any;
    verifiedByCandidate?: boolean;
    verified?: boolean;
  }): any {
    const outcomeId = `outcome_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const outcomeRecord = {
      id: outcomeId,
      outcomeId,
      resumeId: record.resumeId,
      jobPostingId: record.jobPostingId || record.jobId || "job_unknown",
      companyName: record.companyName,
      roleTitle: record.roleTitle,
      outcome: record.outcome,
      verifiedByCandidate: record.verifiedByCandidate !== undefined ? record.verifiedByCandidate : Boolean(record.verified),
      verified: record.verified !== undefined ? record.verified : Boolean(record.verifiedByCandidate),
      recordedAt: new Date().toISOString()
    };

    this.outcomeRecords.push(outcomeRecord);
    return outcomeRecord;
  }

  public getOutcomeRecords(): any[] {
    return [...this.outcomeRecords];
  }

  /**
   * Clears internal memory cache.
   */
  public clearCache(): void {
    this.companyCache.clear();
    this.roleCache.clear();
  }
}

// Global Singleton Instance
export const globalIntelligenceEngine = new UniversalIntelligenceEngine();
