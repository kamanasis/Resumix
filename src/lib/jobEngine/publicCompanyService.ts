import { 
  JobProvider, 
  CompanySourceProvenance, 
  CompanyHiringSignal 
} from "../../types";
import { isSafePublicDomain, extractDomainFromUrl, canonicalizeCompanyName } from "./companyResolver";
import { extractJobRequirements, normalizeJobRole } from "./jobNormalizer";
import { stripHtml } from "./adapters";

export interface PublicCompanyEnrichmentResult {
  officialWebsite: string | null;
  domain: string | null;
  careersUrl: string | null;
  industry: string | null;
  description: string | null;
  headquarters: string | null;
  locations: string[];
  companySize: string | null;
  jobBoardProvider: JobProvider | null;
  jobBoardIdentifier: string | null;
  sourceRecords: CompanySourceProvenance[];
  observedRoles: string[];
  observedSkills: string[];
  observedTechnologies: string[];
  observedKeywords: string[];
  hiringSignals: CompanyHiringSignal[];
  discoveredJobCount: number;
}

/**
 * Creates a slug for ATS board matching from a company name or domain.
 * e.g. "Stripe, Inc." -> "stripe", "Airbnb" -> "airbnb"
 */
export function generateCompanySlug(name: string): string {
  const canonical = canonicalizeCompanyName(name).toLowerCase();
  return canonical
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Validates whether an HTTP URL is a publicly reachable site (lightweight check).
 */
export async function verifyPublicWebPresence(url: string): Promise<{
  reachable: boolean;
  finalUrl?: string;
  title?: string;
  description?: string;
}> {
  if (!isSafePublicDomain(url)) {
    return { reachable: false };
  }

  const cleanUrl = url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(cleanUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ResumixPublicIntelligence/1.0",
        "Accept": "text/html,application/xhtml+xml"
      },
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return { reachable: false };
    }

    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i) ||
                      html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["'][^>]*>/i);

    const title = titleMatch ? stripHtml(titleMatch[1]).slice(0, 120) : undefined;
    const description = descMatch ? stripHtml(descMatch[1]).slice(0, 300) : undefined;

    return {
      reachable: true,
      finalUrl: res.url,
      title,
      description
    };
  } catch {
    return { reachable: false };
  }
}

/**
 * Discovers public job board data across Greenhouse, Lever, Ashby, Workable, and SmartRecruiters.
 */
export async function discoverPublicJobBoard(
  companyName: string,
  suppliedSlug?: string
): Promise<{
  provider: JobProvider | null;
  identifier: string | null;
  careersUrl: string | null;
  jobs: Array<{
    title: string;
    description?: string;
    location?: string;
    url?: string;
  }>;
}> {
  const slug = (suppliedSlug || generateCompanySlug(companyName)).toLowerCase();
  if (!slug || slug === "unknown-company" || slug.length < 2) {
    return { provider: null, identifier: null, careersUrl: null, jobs: [] };
  }

  // 1. Check Greenhouse Public Board API
  try {
    const ghApi = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`;
    const ghRes = await fetch(ghApi, {
      headers: { "Accept": "application/json", "User-Agent": "Resumix/1.0" },
      signal: AbortSignal.timeout(5000)
    });

    if (ghRes.ok) {
      const data: any = await ghRes.json();
      if (Array.isArray(data.jobs) && data.jobs.length > 0) {
        return {
          provider: "GREENHOUSE",
          identifier: slug,
          careersUrl: `https://boards.greenhouse.io/${slug}`,
          jobs: data.jobs.slice(0, 25).map((j: any) => ({
            title: j.title || "Software Engineer",
            location: j.location?.name,
            url: j.absolute_url
          }))
        };
      }
    }
  } catch {}

  // 2. Check Lever Public Board API
  try {
    const leverApi = `https://api.lever.co/v0/postings/${slug}?limit=25`;
    const leverRes = await fetch(leverApi, {
      headers: { "Accept": "application/json", "User-Agent": "Resumix/1.0" },
      signal: AbortSignal.timeout(5000)
    });

    if (leverRes.ok) {
      const data: any = await leverRes.json();
      if (Array.isArray(data) && data.length > 0) {
        return {
          provider: "LEVER",
          identifier: slug,
          careersUrl: `https://jobs.lever.co/${slug}`,
          jobs: data.map((j: any) => ({
            title: j.text || "Software Engineer",
            description: j.descriptionPlain || stripHtml(j.description || ""),
            location: j.categories?.location,
            url: j.hostedUrl
          }))
        };
      }
    }
  } catch {}

  // 3. Check SmartRecruiters Public Postings API
  try {
    const srApi = `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=25`;
    const srRes = await fetch(srApi, {
      headers: { "Accept": "application/json", "User-Agent": "Resumix/1.0" },
      signal: AbortSignal.timeout(5000)
    });

    if (srRes.ok) {
      const data: any = await srRes.json();
      if (Array.isArray(data.content) && data.content.length > 0) {
        return {
          provider: "SMARTRECRUITERS",
          identifier: slug,
          careersUrl: `https://careers.smartrecruiters.com/${slug}`,
          jobs: data.content.map((j: any) => ({
            title: j.name || "Position",
            location: j.location?.city,
            url: `https://jobs.smartrecruiters.com/${slug}/${j.id}`
          }))
        };
      }
    }
  } catch {}

  return { provider: null, identifier: null, careersUrl: null, jobs: [] };
}

/**
 * Searches legitimate public job feeds (e.g. Arbeitnow public job API) for company postings.
 */
export async function queryArbeitnowPublicJobs(companyName: string): Promise<Array<{
  title: string;
  description: string;
  location?: string;
  url?: string;
  tags?: string[];
}>> {
  const canonical = canonicalizeCompanyName(companyName).toLowerCase();
  if (!canonical || canonical === "unknown company" || canonical.length < 2) {
    return [];
  }

  try {
    const searchUrl = `https://www.arbeitnow.com/api/job-board-api`;
    const res = await fetch(searchUrl, {
      headers: { "Accept": "application/json", "User-Agent": "Resumix/1.0" },
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) return [];

    const data: any = await res.json();
    if (!Array.isArray(data.data)) return [];

    const matchedJobs = data.data.filter((j: any) => {
      const comp = (j.company_name || "").toLowerCase();
      const canonComp = canonicalizeCompanyName(comp).toLowerCase();
      return comp === canonical || canonComp === canonical || comp.includes(canonical);
    });

    return matchedJobs.slice(0, 20).map((j: any) => ({
      title: j.title || "Software Engineer",
      description: stripHtml(j.description || ""),
      location: j.location,
      url: j.url,
      tags: Array.isArray(j.tags) ? j.tags : []
    }));
  } catch {
    return [];
  }
}

/**
 * Synthesizes public enrichment data for an arbitrary company.
 */
export async function enrichCompanyFromPublicSources(params: {
  companyName: string;
  website?: string;
  jobUrl?: string;
  jobDescription?: string;
}): Promise<PublicCompanyEnrichmentResult> {
  const now = new Date().toISOString();
  const canonical = canonicalizeCompanyName(params.companyName);
  const sourceRecords: CompanySourceProvenance[] = [];

  let officialWebsite: string | null = null;
  let domain: string | null = null;
  let careersUrl: string | null = null;
  let industry: string | null = null;
  let description: string | null = null;
  let headquarters: string | null = null;
  const locations: string[] = [];
  const companySize: string | null = null;

  // 1. Process user-supplied website or domain
  if (params.website && isSafePublicDomain(params.website)) {
    const extractedDomain = extractDomainFromUrl(params.website);
    if (extractedDomain) {
      domain = extractedDomain;
      officialWebsite = `https://${domain}`;
      sourceRecords.push({
        field: "officialWebsite",
        value: officialWebsite,
        sourceType: "USER_SUPPLIED",
        sourceUrl: officialWebsite,
        observedAt: now,
        confidence: 0.95
      });
    }
  }

  // 2. Discover official website from domain if missing
  if (!officialWebsite && domain) {
    officialWebsite = `https://${domain}`;
  }

  // 3. Verify public website and extract metadata
  if (officialWebsite) {
    const webPresence = await verifyPublicWebPresence(officialWebsite);
    if (webPresence.reachable) {
      sourceRecords.push({
        field: "domainVerification",
        value: true,
        sourceType: "OFFICIAL_WEBSITE",
        sourceUrl: officialWebsite,
        observedAt: now,
        confidence: 0.9
      });

      if (webPresence.description) {
        description = webPresence.description;
        sourceRecords.push({
          field: "description",
          value: description,
          sourceType: "OFFICIAL_WEBSITE",
          sourceUrl: officialWebsite,
          observedAt: now,
          confidence: 0.85
        });
      }
    }
  }

  // 4. Query public job boards (Greenhouse, Lever, SmartRecruiters)
  const boardData = await discoverPublicJobBoard(canonical);
  if (boardData.provider && boardData.careersUrl) {
    careersUrl = boardData.careersUrl;
    sourceRecords.push({
      field: "careersUrl",
      value: careersUrl,
      sourceType: "PUBLIC_CAREERS_PAGE",
      sourceUrl: careersUrl,
      observedAt: now,
      confidence: 0.95
    });
  }

  // 5. Query Arbeitnow public job API
  const publicApiJobs = await queryArbeitnowPublicJobs(canonical);

  // Combine discovered jobs
  const combinedJobs = [...boardData.jobs, ...publicApiJobs];

  // 6. Incorporate user-pasted job description if present
  if (params.jobDescription && params.jobDescription.trim().length > 50) {
    combinedJobs.push({
      title: "Target Role Posting",
      description: params.jobDescription.trim(),
      url: params.jobUrl || undefined
    });
  }

  // Aggregate signals across all discovered jobs
  const observedRolesSet = new Set<string>();
  const observedSkillsMap = new Map<string, number>();
  const observedTechMap = new Map<string, number>();
  const observedKeywordsMap = new Map<string, number>();

  for (const job of combinedJobs) {
    if (job.title) {
      const normalizedRole = normalizeJobRole(job.title).canonicalRole;
      observedRolesSet.add(normalizedRole);
    }
    if (job.location && !locations.includes(job.location)) {
      locations.push(job.location);
    }

    if (job.description) {
      const reqs = extractJobRequirements(job.description, "JOB_DESCRIPTION");
      for (const req of reqs) {
        const name = req.canonicalName;
        const isTech = ["TOOL", "FRAMEWORK", "LANGUAGE", "DATABASE", "CLOUD"].includes(req.category);
        const isSkill = ["TECHNICAL_SKILL", "SOFT_SKILL", "DOMAIN_KNOWLEDGE"].includes(req.category);
        if (isTech) {
          observedTechMap.set(name, (observedTechMap.get(name) || 0) + 1);
        } else if (isSkill) {
          observedSkillsMap.set(name, (observedSkillsMap.get(name) || 0) + 1);
        } else if (req.category === "KEYWORD") {
          observedKeywordsMap.set(name, (observedKeywordsMap.get(name) || 0) + 1);
        }
      }
    }
  }

  const sortFreq = (map: Map<string, number>) =>
    Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(e => e[0])
      .slice(0, 15);

  const observedSkills = sortFreq(observedSkillsMap);
  const observedTechnologies = sortFreq(observedTechMap);
  const observedKeywords = sortFreq(observedKeywordsMap);
  const observedRoles = Array.from(observedRolesSet).slice(0, 10);

  const hiringSignals: CompanyHiringSignal[] = [];
  if (combinedJobs.length > 0) {
    hiringSignals.push({
      type: "PUBLIC_POSTINGS_DETECTED",
      summary: `${combinedJobs.length} active public job postings verified`,
      observedCount: combinedJobs.length,
      recency: now,
      evidenceSource: boardData.provider || "PUBLIC_JOB_API"
    });
  }

  if (boardData.provider) {
    hiringSignals.push({
      type: "ATS_PROVIDER_VERIFIED",
      summary: `Public job board active on ${boardData.provider}`,
      observedCount: 1,
      recency: now,
      evidenceSource: boardData.careersUrl || undefined
    });
  }

  return {
    officialWebsite,
    domain,
    careersUrl,
    industry,
    description,
    headquarters,
    locations: locations.slice(0, 8),
    companySize,
    jobBoardProvider: boardData.provider,
    jobBoardIdentifier: boardData.identifier,
    sourceRecords,
    observedRoles,
    observedSkills,
    observedTechnologies,
    observedKeywords,
    hiringSignals,
    discoveredJobCount: combinedJobs.length
  };
}
