import crypto from "crypto";
import { CompanyEntity, JobSourceReference } from "../../types";

// ============================================================================
// RESUMIX STAGE 6: UNIVERSAL COMPANY RESOLVER
// ============================================================================
// Normalizes company names into canonical entities.
// STRICT RULE: Company names are DATA, not application logic.
// Never hardcode company-specific analyzers or invent corporate hierarchies.
// ============================================================================

const LEGAL_SUFFIXES = [
  /\b(inc|incorporated)\b\.?/gi,
  /\b(llc|l\.l\.c\.)\b\.?/gi,
  /\b(ltd|limited)\b\.?/gi,
  /\b(corp|corporation)\b\.?/gi,
  /\b(pvt|private)\s+(ltd|limited)\b\.?/gi,
  /\b(gmbh|co\.|co|company)\b\.?/gi,
  /\b(s\.a\.|sa|s\.l\.|sl|s\.p\.a\.|spa)\b\.?/gi,
  /\b(plc|llp)\b\.?/gi,
  /\b(holdings?|group|enterprises?)\b\.?/gi,
];

/**
 * Normalizes any raw company name into a clean canonical name.
 * e.g. "Google LLC" -> "Google", "Amazon.com, Inc." -> "Amazon.com"
 */
export function canonicalizeCompanyName(rawName?: string): string {
  if (!rawName || typeof rawName !== "string") {
    return "Unknown Company";
  }

  let cleaned = rawName.trim();

  // Strip trailing punctuation
  cleaned = cleaned.replace(/[,;]+$/, "").trim();

  // Strip common corporate suffixes
  for (const regex of LEGAL_SUFFIXES) {
    cleaned = cleaned.replace(regex, "").trim();
  }

  // Clean trailing punctuation again after suffix removal
  cleaned = cleaned.replace(/[,;.\s]+$/, "").trim();

  // Collapse consecutive whitespaces
  cleaned = cleaned.replace(/\s+/g, " ");

  if (cleaned.length === 0) {
    return "Unknown Company";
  }

  return cleaned;
}

/**
 * Generates a deterministic, collision-free company ID based on canonical name.
 */
export function generateCompanyId(canonicalName: string): string {
  const normalized = canonicalName.trim().toLowerCase();
  const hash = crypto.createHash("sha256").update(normalized, "utf8").digest("hex").substring(0, 12);
  return `comp_${hash}`;
}

/**
 * Resolves or creates a normalized CompanyEntity from raw name and optional domain.
 */
export function resolveCompany(
  rawName?: string,
  domain?: string,
  source?: JobSourceReference
): CompanyEntity {
  const canonical = canonicalizeCompanyName(rawName);
  const companyId = generateCompanyId(canonical);

  const aliases: string[] = [];
  if (rawName && rawName.trim() !== canonical) {
    aliases.push(rawName.trim());
  }

  const domains: string[] = [];
  if (domain && domain.trim()) {
    const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    domains.push(cleanDomain);
  }

  const now = new Date().toISOString();

  return {
    companyId,
    canonicalName: canonical,
    rawName: rawName?.trim(),
    aliases,
    domains,
    careerDomains: [],
    detectedSources: source ? [source] : [],
    createdAt: now,
    updatedAt: now
  };
}
