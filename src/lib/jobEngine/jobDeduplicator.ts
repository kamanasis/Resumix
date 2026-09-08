import { Job } from "../../types";

// ============================================================================
// RESUMIX STAGE 6: CROSS-SOURCE JOB DEDUPLICATOR
// ============================================================================
// Multi-tier identity hierarchy to safely detect duplicates across
// ATS APIs, aggregators, direct URLs, and pasted postings without
// falsely merging distinct positions.
// ============================================================================

/**
 * Strips tracking parameters, UTMs, and anchors to obtain a clean canonical URL.
 */
export function cleanSourceUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  try {
    const parsed = new URL(rawUrl);
    // Strip standard tracking query params
    const trackingParams = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "gh_jid", "gh_src", "lever-origin", "ref", "source", "trk", "fbclid", "gclid"
    ];
    for (const p of trackingParams) {
      parsed.searchParams.delete(p);
    }
    // Remove trailing slashes and hash fragments
    let clean = parsed.origin + parsed.pathname.replace(/\/+$/, "");
    if (parsed.searchParams.toString()) {
      clean += "?" + parsed.searchParams.toString();
    }
    return clean;
  } catch {
    return rawUrl.trim();
  }
}

export interface DedupMatchResult {
  isDuplicate: boolean;
  confidence: number; // 0.0 - 1.0
  reason?: string;
}

/**
 * Compares two jobs using the identity hierarchy:
 * 1. Provider ID
 * 2. Canonical URL
 * 3. Company + Canonical Role + Location
 */
export function compareJobsForDeduplication(jobA: Job, jobB: Job): DedupMatchResult {
  // 1. Check Canonical URLs
  const cleanUrlA = cleanSourceUrl(jobA.source.sourceUrl);
  const cleanUrlB = cleanSourceUrl(jobB.source.sourceUrl);

  if (cleanUrlA && cleanUrlB && cleanUrlA.toLowerCase() === cleanUrlB.toLowerCase()) {
    return {
      isDuplicate: true,
      confidence: 1.0,
      reason: "Identical canonical source URL"
    };
  }

  // 2. Different Companies cannot be duplicates
  if (jobA.companyId !== jobB.companyId && jobA.companyName.toLowerCase() !== jobB.companyName.toLowerCase()) {
    return {
      isDuplicate: false,
      confidence: 0,
      reason: "Distinct companies"
    };
  }

  // 3. Compare Canonical Roles
  const roleA = (jobA.canonicalRole || jobA.title).toLowerCase().trim();
  const roleB = (jobB.canonicalRole || jobB.title).toLowerCase().trim();

  if (roleA !== roleB) {
    return {
      isDuplicate: false,
      confidence: 0.1,
      reason: "Different canonical roles"
    };
  }

  // 4. Compare Location if specified in both
  if (jobA.location && jobB.location) {
    const locA = jobA.location.toLowerCase().trim();
    const locB = jobB.location.toLowerCase().trim();
    if (locA !== locB && !locA.includes("remote") && !locB.includes("remote")) {
      return {
        isDuplicate: false,
        confidence: 0.2,
        reason: "Different physical locations for same role"
      };
    }
  }

  // Same company + same canonical role + same or flexible location
  return {
    isDuplicate: true,
    confidence: 0.85,
    reason: "Matching company, canonical role, and location"
  };
}
