import crypto from "crypto";
import { Job, JobSnapshot, JobStatus, TargetRequirement, JobStructuredMetadata } from "../../types";

// ============================================================================
// RESUMIX STAGE 6: IMMUTABLE JOB SNAPSHOT MANAGER
// ============================================================================
// Job identity (jobId) is strictly separated from job content (snapshotId).
// When job content changes, a new immutable snapshot is created with its
// own SHA-256 contentHash, preserving historical integrity for past candidate analyses.
// ============================================================================

/**
 * Calculates deterministic SHA-256 hash of normalized job description text.
 */
export function calculateContentHash(rawDescription: string): string {
  const normalized = (rawDescription || "")
    .trim()
    .replace(/\r?\n/g, "\n")
    .replace(/\s+/g, " ");
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Determines whether a newly retrieved posting content represents an update
 * requiring a new snapshot or is identical to an existing snapshot.
 */
export function evaluateSnapshotCreation(
  existingSnapshots: JobSnapshot[],
  newDescription: string
): {
  createNew: boolean;
  contentHash: string;
  matchedSnapshot?: JobSnapshot;
} {
  const contentHash = calculateContentHash(newDescription);

  // Check if any existing snapshot has the identical contentHash
  const matchedSnapshot = existingSnapshots.find(s => s.contentHash === contentHash);

  if (matchedSnapshot) {
    return {
      createNew: false,
      contentHash,
      matchedSnapshot
    };
  }

  return {
    createNew: true,
    contentHash
  };
}

/**
 * Determines real-world status of a job posting based on evidence rather than assumptions.
 */
export function determineJobStatus(params: {
  httpStatus?: number;
  validThrough?: string;
  lastSeenAt?: string;
  providerStatus?: string;
}): JobStatus {
  // 1. Explicit 404 or 410 indicates removal
  if (params.httpStatus === 404 || params.httpStatus === 410) {
    return "REMOVED";
  }

  // 2. Explicit expiration date
  if (params.validThrough) {
    const validThroughDate = new Date(params.validThrough);
    if (!isNaN(validThroughDate.getTime()) && validThroughDate.getTime() < Date.now()) {
      return "EXPIRED";
    }
  }

  // 3. Explicit provider closed flag
  if (params.providerStatus && /closed|expired|inactive|archived/i.test(params.providerStatus)) {
    return "EXPIRED";
  }

  // 4. Default to ACTIVE if recently seen or verified
  if (params.lastSeenAt) {
    const lastSeenDate = new Date(params.lastSeenAt);
    if (!isNaN(lastSeenDate.getTime())) {
      const daysSinceSeen = (Date.now() - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceSeen < 60) {
        return "ACTIVE";
      }
    }
  }

  return "UNKNOWN";
}
