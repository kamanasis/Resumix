import crypto from "crypto";
import { 
  ApplicationRecord, 
  OutcomeSummaryAnalytics, 
  OutcomeDatasetVersion 
} from "../../types";
import { canonicalizeCompanyName } from "../jobEngine/companyResolver";
import { normalizeJobRole } from "../jobEngine/jobNormalizer";
import { ApplicationStore, globalApplicationStore } from "./applicationStore";
import { filterEligibleApplications } from "./outcomeFilter";
import { aggregateOutcomeAnalytics, EvidenceThresholds, DEFAULT_EVIDENCE_THRESHOLDS } from "./outcomeAggregator";

// ============================================================================
// OUTCOME INTELLIGENCE & LEARNING ENGINE
// ============================================================================
// Central coordinator for application outcome analytics and descriptive intelligence.
// Maintains deterministic dataset versioning, strict tenant privacy,
// cross-company data isolation, and strictly non-causal reporting.
// ============================================================================

export class OutcomeIntelligenceEngine {
  public store: ApplicationStore;

  constructor(store: ApplicationStore = globalApplicationStore) {
    this.store = store;
  }

  /**
   * Generates a deterministic dataset version hash based on eligible records.
   */
  public generateOutcomeDatasetVersion(records: ApplicationRecord[]): OutcomeDatasetVersion {
    const filter = filterEligibleApplications(records);
    const count = filter.eligible.length;

    const companies = new Set(records.map(r => canonicalizeCompanyName(r.companyName).toLowerCase()));
    const roles = new Set(records.map(r => normalizeJobRole(r.roleTitle).canonicalRole.toLowerCase()));

    const dates = records
      .map(r => r.appliedAt)
      .filter(Boolean)
      .sort();

    const start = dates[0] || new Date().toISOString();
    const end = dates[dates.length - 1] || new Date().toISOString();

    const payload = `${count}:${companies.size}:${roles.size}:${start}:${end}`;
    const hash = crypto.createHash("sha256").update(payload, "utf8").digest("hex").substring(0, 8);
    const versionId = `outcomes_v${count}_${hash}`;

    return {
      versionId,
      applicationCount: records.length,
      eligibleApplicationCount: count,
      companyCount: companies.size,
      roleCount: roles.size,
      dateRange: { start, end },
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Computes system-wide aggregate outcome analytics.
   */
  public getGlobalAnalytics(thresholds: EvidenceThresholds = DEFAULT_EVIDENCE_THRESHOLDS): OutcomeSummaryAnalytics {
    const all = this.store.getAllApplications();
    const filter = filterEligibleApplications(all);
    const version = this.generateOutcomeDatasetVersion(all);

    return aggregateOutcomeAnalytics({
      eligibleRecords: filter.eligible,
      totalRecordsCount: all.length,
      withdrawnCount: filter.withdrawn.length,
      datasetVersion: version.versionId,
      thresholds
    });
  }

  /**
   * Computes a candidate's personal application history analytics.
   */
  public getPersonalAnalytics(userId: string): OutcomeSummaryAnalytics {
    const userRecords = this.store.getApplicationsByUser(userId);
    const filter = filterEligibleApplications(userRecords);
    const version = this.generateOutcomeDatasetVersion(userRecords);

    return aggregateOutcomeAnalytics({
      eligibleRecords: filter.eligible,
      totalRecordsCount: userRecords.length,
      withdrawnCount: filter.withdrawn.length,
      datasetVersion: version.versionId
    });
  }

  /**
   * Computes company-specific outcome statistics without cross-company contamination.
   */
  public getCompanyAnalytics(companyName: string): OutcomeSummaryAnalytics {
    const targetCanonical = canonicalizeCompanyName(companyName).toLowerCase();
    const all = this.store.getAllApplications();

    const companyRecords = all.filter(r => 
      canonicalizeCompanyName(r.companyName).toLowerCase() === targetCanonical
    );

    const filter = filterEligibleApplications(companyRecords);
    const version = this.generateOutcomeDatasetVersion(companyRecords);

    return aggregateOutcomeAnalytics({
      eligibleRecords: filter.eligible,
      totalRecordsCount: companyRecords.length,
      withdrawnCount: filter.withdrawn.length,
      datasetVersion: version.versionId
    });
  }

  /**
   * Computes role-family specific outcome statistics.
   */
  public getRoleAnalytics(roleTitle: string): OutcomeSummaryAnalytics {
    const targetCanonicalRole = normalizeJobRole(roleTitle).canonicalRole.toLowerCase();
    const all = this.store.getAllApplications();

    const roleRecords = all.filter(r => {
      const jobCanon = normalizeJobRole(r.roleTitle).canonicalRole.toLowerCase();
      const rawTitle = r.roleTitle.toLowerCase();
      return jobCanon === targetCanonicalRole || rawTitle === targetCanonicalRole;
    });

    const filter = filterEligibleApplications(roleRecords);
    const version = this.generateOutcomeDatasetVersion(roleRecords);

    return aggregateOutcomeAnalytics({
      eligibleRecords: filter.eligible,
      totalRecordsCount: roleRecords.length,
      withdrawnCount: filter.withdrawn.length,
      datasetVersion: version.versionId
    });
  }

  /**
   * Compares outcomes between two resume versions for a single candidate.
   * Strictly descriptive; confounding factors are clearly disclosed.
   */
  public compareResumeVersions(params: {
    userId: string;
    resumeIdA: string;
    resumeIdB: string;
  }): {
    versionA: { resumeId: string; applicationsCount: number; interviewRate: number; offerRate: number };
    versionB: { resumeId: string; applicationsCount: number; interviewRate: number; offerRate: number };
    disclaimer: string;
  } {
    const { userId, resumeIdA, resumeIdB } = params;
    const userRecords = this.store.getApplicationsByUser(userId);

    const recordsA = userRecords.filter(r => r.resumeId === resumeIdA || r.tailoredResumeId === resumeIdA);
    const recordsB = userRecords.filter(r => r.resumeId === resumeIdB || r.tailoredResumeId === resumeIdB);

    const statsA = aggregateOutcomeAnalytics({ eligibleRecords: filterEligibleApplications(recordsA).eligible, totalRecordsCount: recordsA.length });
    const statsB = aggregateOutcomeAnalytics({ eligibleRecords: filterEligibleApplications(recordsB).eligible, totalRecordsCount: recordsB.length });

    return {
      versionA: {
        resumeId: resumeIdA,
        applicationsCount: statsA.applicationCount,
        interviewRate: statsA.interviewRate,
        offerRate: statsA.offerRate
      },
      versionB: {
        resumeId: resumeIdB,
        applicationsCount: statsB.applicationCount,
        interviewRate: statsB.interviewRate,
        offerRate: statsB.offerRate
      },
      disclaimer: "Descriptive Resume Version Comparison: Rate differences reflect observed historical submission outcomes. They do not isolate confounding variables such as company timing, referral status, or job competition."
    };
  }
}

export const globalOutcomeIntelligenceEngine = new OutcomeIntelligenceEngine();
