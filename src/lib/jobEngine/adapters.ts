import { 
  JobProvider, 
  JobSourceType, 
  JobConfidence, 
  JobSourceReference, 
  JobSourceInput, 
  JobFetchResult, 
  JobStructuredMetadata 
} from "../../types";
import { resolveCompany } from "./companyResolver";
import { verifyJobContent } from "./jobVerifier";
import { normalizeJobRole, extractJobRequirements } from "./jobNormalizer";
import crypto from "crypto";

// ============================================================================
// RESUMIX STAGE 6: PROVIDER-INDEPENDENT SOURCE ADAPTERS
// ============================================================================
// Generic adapters for Greenhouse, Lever, Ashby, Workable, SmartRecruiters,
// JSON-LD (schema.org/JobPosting), Semantic HTML, and User-Pasted text.
// ============================================================================

export interface JobSourceAdapter {
  provider: JobProvider;
  sourceType: JobSourceType;
  canHandle(input: JobSourceInput): boolean;
  fetchJob(input: JobSourceInput): Promise<JobFetchResult>;
}

/**
 * Helper to strip HTML tags into clean plaintext.
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ----------------------------------------------------------------------------
// 1. Greenhouse Adapter (Public Board API / URLs)
// ----------------------------------------------------------------------------
export class GreenhouseAdapter implements JobSourceAdapter {
  provider: JobProvider = "GREENHOUSE";
  sourceType: JobSourceType = "ATS_API";

  canHandle(input: JobSourceInput): boolean {
    if (!input.url) return false;
    return /boards\.greenhouse\.io|boards-api\.greenhouse\.io/i.test(input.url);
  }

  async fetchJob(input: JobSourceInput): Promise<JobFetchResult> {
    const url = input.url!;
    try {
      // e.g. https://boards.greenhouse.io/{board_token}/jobs/{id}
      const match = url.match(/greenhouse\.io\/(?:embed\/job_board\/)?([a-zA-Z0-9_-]+)\/jobs\/(\d+)/i) ||
                    url.match(/boards-api\.greenhouse\.io\/v1\/boards\/([a-zA-Z0-9_-]+)\/jobs\/(\d+)/i);
      
      let title = "";
      let description = "";
      let companyName = input.company || "";
      let location = "";
      let datePosted = "";

      if (match) {
        const boardToken = match[1];
        const jobId = match[2];
        companyName = companyName || boardToken;
        
        // Fetch public JSON
        const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${jobId}`;
        const resp = await fetch(apiUrl, {
          headers: { "Accept": "application/json", "User-Agent": "Resumix-JobIngest/1.0" },
          signal: AbortSignal.timeout(8000)
        });

        if (!resp.ok) {
          if (resp.status === 404 || resp.status === 410) {
            return {
              success: false,
              error: { code: "JOB_POSTING_UNAVAILABLE", message: `Greenhouse job ${jobId} not found or expired.` }
            };
          }
          return {
            success: false,
            error: { code: "JOB_SOURCE_UNREACHABLE", message: `Greenhouse API returned HTTP ${resp.status}.` }
          };
        }

        const data: any = await resp.json();
        title = data.title || "";
        description = stripHtml(data.content || "");
        location = data.location?.name || "";
        datePosted = data.updated_at || "";
      } else {
        // Direct HTML fetch fallback
        const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!resp.ok) {
          return { success: false, error: { code: "JOB_SOURCE_UNREACHABLE", message: `Failed with status ${resp.status}` } };
        }
        const html = await resp.text();
        description = stripHtml(html);
        title = input.role || "Software Engineer";
      }

      const verification = verifyJobContent(title, description);
      if (!verification.isValid) {
        return { success: false, error: { code: verification.errorCode || "JOB_EXTRACTION_FAILED", message: verification.reason || "Content failed verification." } };
      }

      return buildJobEntity({
        title,
        description,
        companyName,
        sourceUrl: url,
        provider: this.provider,
        sourceType: this.sourceType,
        confidence: "VERIFIED_ATS",
        location,
        datePosted,
        evidenceQuality: verification.evidenceQuality
      });
    } catch (err: any) {
      return { success: false, error: { code: "JOB_SOURCE_UNREACHABLE", message: err.message || "Failed to fetch Greenhouse job." } };
    }
  }
}

// ----------------------------------------------------------------------------
// 2. Lever Adapter (Public Postings API / URLs)
// ----------------------------------------------------------------------------
export class LeverAdapter implements JobSourceAdapter {
  provider: JobProvider = "LEVER";
  sourceType: JobSourceType = "ATS_API";

  canHandle(input: JobSourceInput): boolean {
    if (!input.url) return false;
    return /jobs\.lever\.co|api\.lever\.co/i.test(input.url);
  }

  async fetchJob(input: JobSourceInput): Promise<JobFetchResult> {
    const url = input.url!;
    try {
      // e.g. https://jobs.lever.co/{company}/{postingId}
      const match = url.match(/lever\.co\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]{24,})/i);
      
      let title = "";
      let description = "";
      let companyName = input.company || "";
      let location = "";
      let datePosted = "";

      if (match) {
        const companySlug = match[1];
        const postingId = match[2];
        companyName = companyName || companySlug;

        const apiUrl = `https://api.lever.co/v0/postings/${companySlug}/${postingId}`;
        const resp = await fetch(apiUrl, {
          headers: { "Accept": "application/json", "User-Agent": "Resumix-JobIngest/1.0" },
          signal: AbortSignal.timeout(8000)
        });

        if (!resp.ok) {
          if (resp.status === 404 || resp.status === 410) {
            return { success: false, error: { code: "JOB_POSTING_UNAVAILABLE", message: `Lever posting not found or expired.` } };
          }
          return { success: false, error: { code: "JOB_SOURCE_UNREACHABLE", message: `Lever API returned HTTP ${resp.status}.` } };
        }

        const data: any = await resp.json();
        title = data.text || "";
        const descParts = [data.descriptionPlain || stripHtml(data.description || "")];
        for (const list of data.lists || []) {
          descParts.push(`${list.text}:\n${stripHtml(list.content || "")}`);
        }
        description = descParts.filter(Boolean).join("\n\n");
        location = data.categories?.location || "";
        datePosted = data.createdAt ? new Date(data.createdAt).toISOString() : "";
      } else {
        const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!resp.ok) return { success: false, error: { code: "JOB_SOURCE_UNREACHABLE", message: `HTTP ${resp.status}` } };
        description = stripHtml(await resp.text());
        title = input.role || "Software Engineer";
      }

      const verification = verifyJobContent(title, description);
      if (!verification.isValid) {
        return { success: false, error: { code: verification.errorCode || "JOB_EXTRACTION_FAILED", message: verification.reason || "Content failed verification." } };
      }

      return buildJobEntity({
        title,
        description,
        companyName,
        sourceUrl: url,
        provider: this.provider,
        sourceType: this.sourceType,
        confidence: "VERIFIED_ATS",
        location,
        datePosted,
        evidenceQuality: verification.evidenceQuality
      });
    } catch (err: any) {
      return { success: false, error: { code: "JOB_SOURCE_UNREACHABLE", message: err.message || "Failed to fetch Lever job." } };
    }
  }
}

// ----------------------------------------------------------------------------
// 3. Ashby Adapter
// ----------------------------------------------------------------------------
export class AshbyAdapter implements JobSourceAdapter {
  provider: JobProvider = "ASHBY";
  sourceType: JobSourceType = "ATS_API";

  canHandle(input: JobSourceInput): boolean {
    if (!input.url) return false;
    return /jobs\.ashbyhq\.com|api\.ashbyhq\.com/i.test(input.url);
  }

  async fetchJob(input: JobSourceInput): Promise<JobFetchResult> {
    const url = input.url!;
    try {
      const match = url.match(/ashbyhq\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/i);
      const companySlug = match ? match[1] : (input.company || "Ashby Client");

      const resp = await fetch(url, {
        headers: { "User-Agent": "Resumix-JobIngest/1.0" },
        signal: AbortSignal.timeout(8000)
      });
      if (!resp.ok) {
        return { success: false, error: { code: "JOB_SOURCE_UNREACHABLE", message: `Ashby page returned HTTP ${resp.status}` } };
      }
      const html = await resp.text();
      
      // Attempt JSON-LD or semantic body extraction
      const jsonLdMatch = html.match(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/i);
      let title = input.role || "Software Engineer";
      let description = "";

      if (jsonLdMatch) {
        try {
          const parsed = JSON.parse(jsonLdMatch[1]);
          if (parsed["@type"] === "JobPosting") {
            title = parsed.title || title;
            description = stripHtml(parsed.description || "");
          }
        } catch {}
      }

      if (!description) {
        description = stripHtml(html);
      }

      const verification = verifyJobContent(title, description, html);
      if (!verification.isValid) {
        return { success: false, error: { code: verification.errorCode || "JOB_EXTRACTION_FAILED", message: verification.reason || "Content failed verification." } };
      }

      return buildJobEntity({
        title,
        description,
        companyName: companySlug,
        sourceUrl: url,
        provider: this.provider,
        sourceType: this.sourceType,
        confidence: "VERIFIED_ATS",
        evidenceQuality: verification.evidenceQuality
      });
    } catch (err: any) {
      return { success: false, error: { code: "JOB_SOURCE_UNREACHABLE", message: err.message || "Failed to fetch Ashby job." } };
    }
  }
}

// ----------------------------------------------------------------------------
// 4. Workable Adapter
// ----------------------------------------------------------------------------
export class WorkableAdapter implements JobSourceAdapter {
  provider: JobProvider = "WORKABLE";
  sourceType: JobSourceType = "ATS_API";

  canHandle(input: JobSourceInput): boolean {
    if (!input.url) return false;
    return /apply\.workable\.com|workable\.com/i.test(input.url);
  }

  async fetchJob(input: JobSourceInput): Promise<JobFetchResult> {
    const url = input.url!;
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "Resumix-JobIngest/1.0" },
        signal: AbortSignal.timeout(8000)
      });
      if (!resp.ok) {
        return { success: false, error: { code: "JOB_SOURCE_UNREACHABLE", message: `Workable returned HTTP ${resp.status}` } };
      }
      const html = await resp.text();
      const description = stripHtml(html);
      const title = input.role || "Software Engineer";
      const company = input.company || "Workable Company";

      const verification = verifyJobContent(title, description, html);
      if (!verification.isValid) {
        return { success: false, error: { code: verification.errorCode || "JOB_EXTRACTION_FAILED", message: verification.reason || "Failed verification." } };
      }

      return buildJobEntity({
        title,
        description,
        companyName: company,
        sourceUrl: url,
        provider: this.provider,
        sourceType: this.sourceType,
        confidence: "VERIFIED_ATS",
        evidenceQuality: verification.evidenceQuality
      });
    } catch (err: any) {
      return { success: false, error: { code: "JOB_SOURCE_UNREACHABLE", message: err.message || "Failed to fetch Workable job." } };
    }
  }
}

// ----------------------------------------------------------------------------
// 5. SmartRecruiters Adapter
// ----------------------------------------------------------------------------
export class SmartRecruitersAdapter implements JobSourceAdapter {
  provider: JobProvider = "SMARTRECRUITERS";
  sourceType: JobSourceType = "ATS_API";

  canHandle(input: JobSourceInput): boolean {
    if (!input.url) return false;
    return /smartrecruiters\.com/i.test(input.url);
  }

  async fetchJob(input: JobSourceInput): Promise<JobFetchResult> {
    const url = input.url!;
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "Resumix-JobIngest/1.0" },
        signal: AbortSignal.timeout(8000)
      });
      if (!resp.ok) {
        return { success: false, error: { code: "JOB_SOURCE_UNREACHABLE", message: `SmartRecruiters returned HTTP ${resp.status}` } };
      }
      const html = await resp.text();
      const description = stripHtml(html);
      const title = input.role || "Software Engineer";
      const company = input.company || "SmartRecruiters Client";

      const verification = verifyJobContent(title, description, html);
      if (!verification.isValid) {
        return { success: false, error: { code: verification.errorCode || "JOB_EXTRACTION_FAILED", message: verification.reason || "Failed verification." } };
      }

      return buildJobEntity({
        title,
        description,
        companyName: company,
        sourceUrl: url,
        provider: this.provider,
        sourceType: this.sourceType,
        confidence: "VERIFIED_ATS",
        evidenceQuality: verification.evidenceQuality
      });
    } catch (err: any) {
      return { success: false, error: { code: "JOB_SOURCE_UNREACHABLE", message: err.message || "Failed to fetch SmartRecruiters job." } };
    }
  }
}

// ----------------------------------------------------------------------------
// 6. JSON-LD Adapter (schema.org/JobPosting)
// ----------------------------------------------------------------------------
export class JSONLDAdapter implements JobSourceAdapter {
  provider: JobProvider = "JSON_LD";
  sourceType: JobSourceType = "WEB_JSON_LD";

  canHandle(input: JobSourceInput): boolean {
    return Boolean(input.url);
  }

  async fetchJob(input: JobSourceInput): Promise<JobFetchResult> {
    const url = input.url!;
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "Resumix-JobIngest/1.0", "Accept": "text/html" },
        signal: AbortSignal.timeout(8000)
      });
      if (!resp.ok) {
        return { success: false, error: { code: "JOB_SOURCE_UNREACHABLE", message: `HTTP ${resp.status}` } };
      }
      const html = await resp.text();

      // Look for schema.org/JobPosting in <script type="application/ld+json">
      const regex = /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi;
      let match;
      let jobPosting: any = null;

      while ((match = regex.exec(html)) !== null) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed["@type"] === "JobPosting" || (Array.isArray(parsed["@graph"]) && parsed["@graph"].some((item: any) => item["@type"] === "JobPosting"))) {
            jobPosting = parsed["@type"] === "JobPosting" ? parsed : parsed["@graph"].find((item: any) => item["@type"] === "JobPosting");
            break;
          }
        } catch {}
      }

      if (!jobPosting) {
        return { success: false, error: { code: "NO_REAL_JOB_FOUND", message: "No schema.org/JobPosting JSON-LD found on page." } };
      }

      const title = jobPosting.title || input.role || "Software Engineer";
      const description = stripHtml(jobPosting.description || "");
      const company = jobPosting.hiringOrganization?.name || input.company || "Company";
      const location = jobPosting.jobLocation?.address?.addressLocality || "";
      const employmentType = jobPosting.employmentType || "";
      const datePosted = jobPosting.datePosted || "";
      const validThrough = jobPosting.validThrough || "";

      const verification = verifyJobContent(title, description, html);
      if (!verification.isValid) {
        return { success: false, error: { code: verification.errorCode || "JOB_EXTRACTION_FAILED", message: verification.reason || "Failed verification." } };
      }

      return buildJobEntity({
        title,
        description,
        companyName: company,
        sourceUrl: url,
        provider: this.provider,
        sourceType: this.sourceType,
        confidence: "PUBLIC_PAGE",
        location,
        employmentType,
        datePosted,
        validThrough,
        evidenceQuality: verification.evidenceQuality
      });
    } catch (err: any) {
      return { success: false, error: { code: "JOB_SOURCE_UNREACHABLE", message: err.message || "Failed to fetch JSON-LD." } };
    }
  }
}

// ----------------------------------------------------------------------------
// 7. Semantic HTML Adapter (Generic Web Fallback)
// ----------------------------------------------------------------------------
export class SemanticHTMLAdapter implements JobSourceAdapter {
  provider: JobProvider = "SEMANTIC_HTML";
  sourceType: JobSourceType = "SEMANTIC_HTML";

  canHandle(input: JobSourceInput): boolean {
    return Boolean(input.url);
  }

  async fetchJob(input: JobSourceInput): Promise<JobFetchResult> {
    const url = input.url!;
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "Resumix-JobIngest/1.0", "Accept": "text/html" },
        signal: AbortSignal.timeout(8000)
      });
      if (!resp.ok) {
        return { success: false, error: { code: "JOB_SOURCE_UNREACHABLE", message: `HTTP ${resp.status}` } };
      }
      const html = await resp.text();

      // Extract from main, article, or full text
      const mainMatch = html.match(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/i);
      const rawBody = mainMatch ? mainMatch[2] : html;
      const description = stripHtml(rawBody);
      const title = input.role || "Software Engineer";
      const company = input.company || "Target Company";

      const verification = verifyJobContent(title, description, html);
      if (!verification.isValid) {
        return { success: false, error: { code: verification.errorCode || "JOB_EXTRACTION_FAILED", message: verification.reason || "Failed verification." } };
      }

      return buildJobEntity({
        title,
        description,
        companyName: company,
        sourceUrl: url,
        provider: this.provider,
        sourceType: this.sourceType,
        confidence: "PUBLIC_PAGE",
        evidenceQuality: verification.evidenceQuality
      });
    } catch (err: any) {
      return { success: false, error: { code: "JOB_SOURCE_UNREACHABLE", message: err.message || "Failed to fetch semantic HTML." } };
    }
  }
}

// ----------------------------------------------------------------------------
// 8. User Pasted Adapter
// ----------------------------------------------------------------------------
export class UserPastedAdapter implements JobSourceAdapter {
  provider: JobProvider = "USER_PASTED";
  sourceType: JobSourceType = "USER_INPUT";

  canHandle(input: JobSourceInput): boolean {
    return Boolean(input.rawText && input.rawText.trim().length > 0);
  }

  async fetchJob(input: JobSourceInput): Promise<JobFetchResult> {
    const description = input.rawText!.trim();
    const title = input.role?.trim() || "Target Role";
    const company = input.company?.trim() || "Target Company";

    const verification = verifyJobContent(title, description);
    if (!verification.isValid) {
      return {
        success: false,
        error: { code: verification.errorCode || "JOB_EXTRACTION_FAILED", message: verification.reason || "Failed verification." }
      };
    }

    return buildJobEntity({
      title,
      description,
      companyName: company,
      sourceUrl: null, // Strictly null for user input, never fabricated
      provider: this.provider,
      sourceType: this.sourceType,
      confidence: "USER_PROVIDED",
      evidenceQuality: verification.evidenceQuality
    });
  }
}

// ----------------------------------------------------------------------------
// Shared Builder: Constructs Normalized Job, Company, and Snapshot
// ----------------------------------------------------------------------------
export function buildJobEntity(params: {
  title: string;
  description: string;
  companyName: string;
  sourceUrl: string | null;
  provider: JobProvider;
  sourceType: JobSourceType;
  confidence: JobConfidence;
  location?: string;
  employmentType?: string;
  datePosted?: string;
  validThrough?: string;
  evidenceQuality: number;
}): JobFetchResult {
  const company = resolveCompany(params.companyName);
  const normalizedRole = normalizeJobRole(params.title);

  // Deterministic Job ID based on canonical company, title, and provider/URL
  const jobIdentityPayload = `${company.canonicalName}|${normalizedRole.canonicalRole}|${params.sourceUrl || params.description.substring(0, 100)}`;
  const jobId = "job_" + crypto.createHash("sha256").update(jobIdentityPayload, "utf8").digest("hex").substring(0, 12);

  // Content hash (SHA-256) of normalized text
  const contentHash = crypto.createHash("sha256").update(params.description.trim().replace(/\s+/g, " "), "utf8").digest("hex");
  const snapshotId = "snp_" + contentHash.substring(0, 12);

  const now = new Date().toISOString();

  // Extract anchored requirements
  const requirements = extractJobRequirements(params.description, snapshotId);

  const sourceRef: JobSourceReference = {
    sourceId: `src_${params.provider.toLowerCase()}_${jobId.substring(4)}`,
    provider: params.provider,
    sourceType: params.sourceType,
    sourceUrl: params.sourceUrl,
    sourceDomain: params.sourceUrl ? new URL(params.sourceUrl).hostname : undefined,
    retrievedAt: now,
    sourceConfidence: params.confidence
  };

  const job = {
    jobId,
    companyId: company.companyId,
    companyName: company.canonicalName,
    title: params.title,
    canonicalTitle: normalizedRole.canonicalTitle,
    canonicalRole: normalizedRole.canonicalRole,
    experienceLevel: normalizedRole.experienceLevel,
    location: params.location,
    employmentType: params.employmentType,
    source: sourceRef,
    currentSnapshotId: snapshotId,
    status: "ACTIVE" as const,
    firstSeenAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now
  };

  const structuredMetadata: JobStructuredMetadata = {
    datePosted: params.datePosted,
    validThrough: params.validThrough,
    hiringOrganization: company.canonicalName,
    location: params.location,
    employmentType: params.employmentType,
    skills: requirements.map(r => r.canonicalName)
  };

  const snapshot = {
    snapshotId,
    jobId,
    retrievedAt: now,
    sourceUrl: params.sourceUrl,
    sourceDomain: sourceRef.sourceDomain,
    contentHash,
    title: params.title,
    description: params.description,
    structuredMetadata,
    requirements,
    extractionStatus: "VERIFIED" as const,
    evidenceQuality: params.evidenceQuality,
    createdAt: now
  };

  return {
    success: true,
    job,
    snapshot,
    company
  };
}
