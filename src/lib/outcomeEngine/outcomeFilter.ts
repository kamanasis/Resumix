import { ApplicationRecord } from "../../types";

// ============================================================================
// OUTCOME DATA QUALITY & ELIGIBILITY FILTERS
// ============================================================================
// Deterministically filters application records to ensure high data integrity.
// Excludes incomplete, unverified, withdrawn, or duplicate applications from
// aggregate outcome statistical models while preserving raw records and exclusion reasons.
// ============================================================================

export interface FilterResult {
  eligible: ApplicationRecord[];
  withdrawn: ApplicationRecord[];
  excluded: { record: ApplicationRecord; reason: string }[];
  deduplicatedCount: number;
}

/**
 * Filters applications into eligible, withdrawn, and excluded subsets.
 */
export function filterEligibleApplications(records: ApplicationRecord[]): FilterResult {
  const eligible: ApplicationRecord[] = [];
  const withdrawn: ApplicationRecord[] = [];
  const excluded: { record: ApplicationRecord; reason: string }[] = [];
  const seenIdentities = new Set<string>();
  let deduplicatedCount = 0;

  for (const record of records) {
    // 1. Validate Job ID presence
    if (!record.jobId || typeof record.jobId !== "string" || !record.jobId.trim()) {
      excluded.push({ record, reason: "EXCLUDED_MISSING_JOB_ID" });
      continue;
    }

    // 2. Validate Resume ID presence
    if (!record.resumeId || typeof record.resumeId !== "string" || !record.resumeId.trim()) {
      excluded.push({ record, reason: "EXCLUDED_INVALID_RESUME_REFERENCE" });
      continue;
    }

    // 3. Validate Outcome field presence
    if (!record.outcome || typeof record.outcome !== "string") {
      excluded.push({ record, reason: "EXCLUDED_MISSING_OUTCOME" });
      continue;
    }

    // 4. Check for duplicate application record
    const dateShort = (record.appliedAt || "").substring(0, 10);
    const identityKey = `${record.userId || "anon"}:${record.jobId.trim()}:${record.resumeId.trim()}:${dateShort}`;
    if (seenIdentities.has(identityKey)) {
      excluded.push({ record, reason: "EXCLUDED_DUPLICATE_APPLICATION" });
      deduplicatedCount += 1;
      continue;
    }
    seenIdentities.add(identityKey);

    // 5. Handle Withdrawn applications separately
    if (record.outcome === "WITHDRAWN") {
      withdrawn.push(record);
      continue;
    }

    // 6. Handle Unknown outcomes (tracked separately from verified progression)
    if (record.outcome === "UNKNOWN") {
      excluded.push({ record, reason: "EXCLUDED_UNKNOWN_OUTCOME" });
      continue;
    }

    // Application is verified and eligible for statistical aggregation
    eligible.push(record);
  }

  return {
    eligible,
    withdrawn,
    excluded,
    deduplicatedCount
  };
}
