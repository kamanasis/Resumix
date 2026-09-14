import crypto from "crypto";
import { CompanyEntity, JobSourceReference } from "../../types";

const LEGAL_SUFFIXES = [
  /\b(pvt|private)\s+(ltd|limited)\b\.?/gi,
  /\b(pty\s+ltd|pty\s+limited|pty)\b\.?/gi,
  /\b(inc|incorporated)\b\.?/gi,
  /\b(llc|l\.l\.c\.)\b\.?/gi,
  /\b(corp|corporation)\b\.?/gi,
  /\b(ltd|limited)\b\.?/gi,
  /\b(pvt|private)\b\.?/gi,
  /\b(gmbh|co\.|co|company)\b\.?/gi,
  /\b(s\.a\.|sa|s\.l\.|sl|s\.p\.a\.|spa|srl|s\.r\.l\.)\b\.?/gi,
  /\b(plc|llp|lp)\b\.?/gi,
  /\b(ag|a\.g\.|b\.v\.|bv|n\.v\.|nv|oy|o\.y\.)\b\.?/gi,
  /\b(k\.k\.|kabushiki\s+kaisha)\b\.?/gi,
  /\b(holdings?|group|enterprises?)\b\.?/gi,
];

const PRIVATE_IP_OR_HOST_REGEX = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|169\.254\.\d+\.\d+|::1|.*\.local|.*\.internal|.*\.localdomain)$/i;

/**
 * Validates whether a public domain or URL is safe against SSRF attacks.
 */
export function isSafePublicDomain(domainOrUrl?: string): boolean {
  if (!domainOrUrl || typeof domainOrUrl !== "string") return false;
  let hostname = domainOrUrl.trim().toLowerCase();
  
  if (hostname.includes("://")) {
    try {
      const parsed = new URL(hostname);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return false;
      }
      hostname = parsed.hostname;
    } catch {
      return false;
    }
  } else {
    // Strip trailing path/slash if present
    hostname = hostname.split("/")[0].split(":")[0];
  }

  if (!hostname || hostname.length < 3 || !hostname.includes(".")) {
    return false;
  }

  if (PRIVATE_IP_OR_HOST_REGEX.test(hostname)) {
    return false;
  }

  return true;
}

/**
 * Extracts clean domain name from a URL safely.
 */
export function extractDomainFromUrl(url?: string): string | null {
  if (!url || typeof url !== "string") return null;
  try {
    const raw = url.trim().toLowerCase();
    const withScheme = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
    const parsed = new URL(withScheme);
    const host = parsed.hostname.replace(/^www\./, "");
    return isSafePublicDomain(host) ? host : null;
  } catch {
    return null;
  }
}

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

export interface CompanyResolutionOptions {
  rawName?: string;
  domain?: string;
  website?: string;
  jobUrl?: string;
  jobDescription?: string;
  source?: JobSourceReference;
}

/**
 * Checks whether a company name is ambiguous or requires explicit clarification.
 * Examples: single common generic word without domain (e.g. "Next", "Matrix", "Square").
 */
export function detectCompanyAmbiguity(name: string, domain?: string | null): boolean {
  if (domain && domain.trim()) return false;
  const canonical = canonicalizeCompanyName(name).toLowerCase();
  const tokens = canonical.split(/\s+/).filter(Boolean);
  
  // Generic single-token names with length < 4 or highly overloaded words without domain
  const HIGHLY_AMBIGUOUS_SINGLE_TOKENS = new Set([
    "square", "block", "box", "next", "shift", "wave", "matrix", "apex", "summit", "nova", "prime", "alpha"
  ]);

  if (tokens.length === 1 && HIGHLY_AMBIGUOUS_SINGLE_TOKENS.has(tokens[0])) {
    return true;
  }

  return false;
}

/**
 * Resolves or creates a normalized CompanyEntity from raw name and optional domain/website.
 * Supports both legacy positional arguments and options object.
 */
export function resolveCompany(
  rawNameOrOptions?: string | CompanyResolutionOptions,
  legacyDomain?: string,
  legacySource?: JobSourceReference
): CompanyEntity {
  let rawName = "";
  let explicitDomain: string | undefined = undefined;
  let website: string | undefined = undefined;
  let jobUrl: string | undefined = undefined;
  let source: JobSourceReference | undefined = undefined;

  if (typeof rawNameOrOptions === "object" && rawNameOrOptions !== null) {
    rawName = rawNameOrOptions.rawName || "";
    explicitDomain = rawNameOrOptions.domain;
    website = rawNameOrOptions.website;
    jobUrl = rawNameOrOptions.jobUrl;
    source = rawNameOrOptions.source;
  } else {
    rawName = (typeof rawNameOrOptions === "string" ? rawNameOrOptions : "") || "";
    explicitDomain = legacyDomain;
    source = legacySource;
  }

  const canonical = canonicalizeCompanyName(rawName);
  const companyId = generateCompanyId(canonical);

  const aliases: string[] = [];
  if (rawName && rawName.trim() !== canonical) {
    aliases.push(rawName.trim());
  }

  const domains: string[] = [];
  const careerDomains: string[] = [];

  // 1. Explicit domain / website supplied by user
  if (website && isSafePublicDomain(website)) {
    const d = extractDomainFromUrl(website);
    if (d && !domains.includes(d)) domains.push(d);
  }
  if (explicitDomain && isSafePublicDomain(explicitDomain)) {
    const d = extractDomainFromUrl(explicitDomain) || explicitDomain.trim().toLowerCase();
    if (isSafePublicDomain(d) && !domains.includes(d)) domains.push(d);
  }

  // 2. Discover domain from job URL if provided
  if (jobUrl && isSafePublicDomain(jobUrl)) {
    const d = extractDomainFromUrl(jobUrl);
    if (d) {
      if (/greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|arbeitnow\.com/i.test(d)) {
        careerDomains.push(d);
      } else if (!domains.includes(d)) {
        domains.push(d);
      }
    }
  }

  const isAmbiguous = detectCompanyAmbiguity(rawName, domains[0]);
  const resolutionStatus: "CONFIDENT" | "AMBIGUOUS" | "UNVERIFIED" = 
    canonical === "Unknown Company" ? "UNVERIFIED" :
    isAmbiguous ? "AMBIGUOUS" : "CONFIDENT";

  const now = new Date().toISOString();
  const officialWebsite = website || (domains.length > 0 ? `https://${domains[0]}` : undefined);

  return {
    companyId,
    canonicalName: canonical,
    rawName: rawName?.trim(),
    aliases,
    domains,
    careerDomains,
    detectedSources: source ? [source] : [],
    officialWebsite,
    domain: domains[0],
    resolutionStatus,
    createdAt: now,
    updatedAt: now
  };
}
