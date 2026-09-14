import crypto from "crypto";
import { JobConfidence, JobSourceType, JobStatus } from "../../types";

export interface SourceProvenance {
  sourceType: JobSourceType;
  sourceUrl: string | null;
  sourceDomain: string;
  sourceRetrievedAt: string;
  sourceLastVerifiedAt: string;
  sourceHash: string;
  sourceQuote?: string;
  sourceStatus: JobStatus;
  sourceConfidence: JobConfidence;
}

/**
 * Calculates deterministic SHA-256 source hash from normalized raw text.
 */
export function calculateSourceHash(rawContent: string): string {
  const normalized = (rawContent || "")
    .trim()
    .replace(/\r?\n/g, "\n")
    .replace(/\s+/g, " ");
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Extracts the canonical domain name from a URL safely.
 */
export function extractDomainFromUrl(url?: string | null): string {
  if (!url || typeof url !== "string") return "user-input";
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "external-source";
  }
}

/**
 * Creates an immutable provenance record for an ingested job posting.
 */
export function createSourceProvenance(params: {
  sourceType: JobSourceType;
  sourceUrl?: string | null;
  rawContent: string;
  status?: JobStatus;
  confidence?: JobConfidence;
  retrievedAt?: string;
  sourceQuote?: string;
}): SourceProvenance {
  const sourceUrl = params.sourceUrl ? params.sourceUrl.trim() : null;
  const sourceDomain = extractDomainFromUrl(sourceUrl);
  const sourceHash = calculateSourceHash(params.rawContent);
  const now = new Date().toISOString();
  const sourceRetrievedAt = params.retrievedAt || now;

  let defaultConfidence: JobConfidence = "LOW_CONFIDENCE";
  if (params.sourceType === "ATS_API") {
    defaultConfidence = "VERIFIED_ATS";
  } else if (params.sourceType === "WEB_JSON_LD" || params.sourceType === "AGGREGATOR") {
    defaultConfidence = "PUBLIC_PAGE";
  } else if (params.sourceType === "USER_INPUT") {
    defaultConfidence = "USER_PROVIDED";
  }

  return {
    sourceType: params.sourceType,
    sourceUrl,
    sourceDomain,
    sourceRetrievedAt,
    sourceLastVerifiedAt: now,
    sourceHash,
    sourceQuote: params.sourceQuote ? params.sourceQuote.slice(0, 300) : undefined,
    sourceStatus: params.status || "ACTIVE",
    sourceConfidence: params.confidence || defaultConfidence
  };
}

/**
 * Extracts a verbatim sentence or snippet from raw text proving a skill/requirement is present.
 */
export function extractRequirementEvidenceQuote(rawText: string, requirementName: string): string | undefined {
  if (!rawText || !requirementName) return undefined;

  const escaped = requirementName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match sentence or bullet point containing the requirement
  const regex = new RegExp(`(?:^|[.\\n•\\-*])([^.\\n•\\-*]*?\\b${escaped}\\b[^.\\n•\\-*]*)(?:[.\\n•\\-*]|$)`, "i");
  const match = rawText.match(regex);

  if (match && match[1]) {
    const quote = match[1].trim().replace(/\s+/g, " ");
    if (quote.length >= requirementName.length) {
      return quote.slice(0, 200);
    }
  }

  return undefined;
}

/**
 * Validates that a stored snapshot's source hash matches actual content.
 */
export function verifySourceIntegrity(storedHash: string, rawContent: string): boolean {
  if (!storedHash || !rawContent) return false;
  return storedHash === calculateSourceHash(rawContent);
}
