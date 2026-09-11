import { ApplicationScoreSnapshot, GapReport, RequirementProfile } from "../../types";

// ============================================================================
// HISTORICAL SCORE SNAPSHOT MANAGER
// ============================================================================
// Preserves point-in-time scores and requirement profile states at application time.
// Guarantees historical immutability: future resume edits or scoring updates
// must never alter previously captured application score snapshots.
// ============================================================================

/**
 * Captures an immutable ApplicationScoreSnapshot from active gap analysis and profile.
 */
export function captureScoreSnapshot(params: {
  gapReport: Partial<GapReport>;
  profile?: Partial<RequirementProfile> | null;
  datasetVersion?: string;
}): ApplicationScoreSnapshot {
  const { gapReport, profile, datasetVersion } = params;

  const atsScore = Math.max(0, Math.min(100, gapReport.atsScore ?? gapReport.scores?.atsCompatibility ?? 0));
  const targetMatchScore = Math.max(0, Math.min(100, gapReport.targetMatchScore ?? gapReport.scores?.companyMatch ?? 0));

  const breakdown = gapReport.scoreBreakdown;
  const requiredMatched = breakdown?.requiredMatched ?? 0;
  const requiredTotal = breakdown?.requiredTotal ?? 0;
  const preferredMatched = breakdown?.preferredMatched ?? 0;
  const preferredTotal = breakdown?.preferredTotal ?? 0;
  const criticalGapsCount = breakdown?.criticalGapsCount ?? gapReport.missingItems?.filter(i => i.importance === "Critical").length ?? 0;

  const requirementProfileHash = profile?.profileHash || profile?.id || "hash_unspecified";

  return {
    atsScore,
    targetMatchScore,
    requiredMatched,
    requiredTotal,
    preferredMatched,
    preferredTotal,
    criticalGapsCount,
    requirementProfileHash,
    intelligenceDatasetVersion: datasetVersion || (profile as any)?.datasetVersion || "v1-standard",
    capturedAt: new Date().toISOString()
  };
}

/**
 * Validates the structural integrity of a stored score snapshot.
 */
export function verifySnapshotIntegrity(snapshot: ApplicationScoreSnapshot): boolean {
  if (!snapshot || typeof snapshot !== "object") return false;
  if (typeof snapshot.atsScore !== "number" || isNaN(snapshot.atsScore) || snapshot.atsScore < 0 || snapshot.atsScore > 100) return false;
  if (typeof snapshot.targetMatchScore !== "number" || isNaN(snapshot.targetMatchScore) || snapshot.targetMatchScore < 0 || snapshot.targetMatchScore > 100) return false;
  if (typeof snapshot.requiredMatched !== "number" || snapshot.requiredMatched < 0) return false;
  if (typeof snapshot.requiredTotal !== "number" || snapshot.requiredTotal < 0) return false;
  if (!snapshot.requirementProfileHash || typeof snapshot.requirementProfileHash !== "string") return false;
  if (!snapshot.capturedAt || typeof snapshot.capturedAt !== "string") return false;
  return true;
}
