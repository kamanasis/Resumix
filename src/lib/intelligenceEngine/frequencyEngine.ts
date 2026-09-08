import { 
  Job, 
  JobSnapshot, 
  RequirementFrequency, 
  EvidenceStrength, 
  RequirementCategory 
} from "../../types";

// ============================================================================
// RESUMIX STAGE 7: DETERMINISTIC REQUIREMENT FREQUENCY ENGINE
// ============================================================================
// Aggregates real-world requirement occurrences across analyzed job snapshots.
// Guarantees strictly bounded frequencies (0.0 to 1.0 / 0% to 100%), safe zero-division,
// and full evidence traceability (evidenceJobIds, evidenceSnapshotIds).
// ============================================================================

export interface JobWithSnapshot {
  job: Job;
  snapshot: JobSnapshot;
}

/**
 * Calculates evidence strength from sample size.
 * Configurable thresholds:
 * 0–2:   INSUFFICIENT_DATA
 * 3–9:   LIMITED_EVIDENCE
 * 10–29: MODERATE_EVIDENCE
 * 30+:   STRONG_EVIDENCE
 */
export function calculateEvidenceStrength(sampleSize: number): EvidenceStrength {
  if (sampleSize <= 2) return "INSUFFICIENT_DATA";
  if (sampleSize <= 9) return "LIMITED_EVIDENCE";
  if (sampleSize <= 29) return "MODERATE_EVIDENCE";
  return "STRONG_EVIDENCE";
}

export const determineEvidenceStrength = calculateEvidenceStrength;

/**
 * Deterministically aggregates requirement frequencies from a set of jobs and snapshots.
 * Supports either JobWithSnapshot[] or Job[] with direct requirements.
 */
export function calculateRequirementFrequencies(
  items: (JobWithSnapshot | any)[]
): RequirementFrequency[] {
  const totalRelevantJobs = items.length;
  if (totalRelevantJobs === 0) {
    return [];
  }

  // Map of canonicalName -> aggregation accumulator
  const accMap = new Map<string, {
    canonicalName: string;
    category: RequirementCategory;
    occurrences: number;
    requiredOccurrences: number;
    preferredOccurrences: number;
    optionalOccurrences: number;
    evidenceJobIds: Set<string>;
    evidenceSnapshotIds: Set<string>;
  }>();

  for (const item of items) {
    const job = item.job || item;
    const snapshot = item.snapshot || item;
    const requirements = snapshot.requirements || job.requirements || [];
    const jobId = job.jobId || job.id || "job_unknown";
    const snapshotId = snapshot.snapshotId || snapshot.source?.snapshotId || job.source?.snapshotId || snapshot.id || "snap_unknown";

    const seenInThisJob = new Set<string>();

    for (const req of requirements) {
      const canonical = req.canonicalName || req.name || "Skill";
      const key = (req.normalizedName || canonical).toLowerCase();
      if (!accMap.has(key)) {
        accMap.set(key, {
          canonicalName: canonical,
          category: req.category || "Skill",
          occurrences: 0,
          requiredOccurrences: 0,
          preferredOccurrences: 0,
          optionalOccurrences: 0,
          evidenceJobIds: new Set(),
          evidenceSnapshotIds: new Set()
        });
      }

      const acc = accMap.get(key)!;
      acc.evidenceJobIds.add(jobId);
      acc.evidenceSnapshotIds.add(snapshotId);

      // Only count occurrence once per job to prevent duplicate mentions inflating frequency
      if (!seenInThisJob.has(key)) {
        seenInThisJob.add(key);
        acc.occurrences += 1;

        if (req.importance === "REQUIRED") {
          acc.requiredOccurrences += 1;
        } else if (req.importance === "PREFERRED") {
          acc.preferredOccurrences += 1;
        } else {
          acc.optionalOccurrences += 1;
        }
      }
    }
  }

  const results: RequirementFrequency[] = [];

  for (const acc of accMap.values()) {
    // Strictly bounded between 0.0 and 1.0 (never NaN, never Infinity)
    const frequency = totalRelevantJobs > 0
      ? Math.min(1.0, Math.max(0.0, Math.round((acc.occurrences / totalRelevantJobs) * 1000) / 1000))
      : 0;
    const frequencyPercentage = Math.round(frequency * 100);

    results.push({
      canonicalName: acc.canonicalName,
      requirementName: acc.canonicalName.toLowerCase(),
      category: acc.category,
      occurrences: acc.occurrences,
      totalRelevantJobs,
      totalPostingsEvaluated: totalRelevantJobs,
      frequency,
      frequencyPercentage,
      requiredOccurrences: acc.requiredOccurrences,
      preferredOccurrences: acc.preferredOccurrences,
      optionalOccurrences: acc.optionalOccurrences,
      evidenceJobIds: Array.from(acc.evidenceJobIds),
      evidenceSnapshotIds: Array.from(acc.evidenceSnapshotIds),
      evidenceClaimType: "OBSERVED_POSTING_FREQUENCY",
      confidenceTier: "EMPIRICAL_DATA"
    });
  }

  // Sort by highest frequency descending, then by required count
  results.sort((a, b) => b.frequency - a.frequency || b.requiredOccurrences - a.requiredOccurrences);

  return results;
}
