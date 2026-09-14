import { CompanyIntelligence, CompanyEntity } from "../../types";
import { resolveCompany, CompanyResolutionOptions } from "../jobEngine/companyResolver";
import { enrichCompanyFromPublicSources } from "../jobEngine/publicCompanyService";
import { 
  buildUniversalCompanyIntelligence, 
  buildCompanyIntelligenceProfile 
} from "./companyIntelligenceEngine";
import { globalIntelligenceEngine } from "./intelligenceEngine";

export interface CacheEntry {
  intelligence: CompanyIntelligence;
  cachedAt: number;
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class CompanyIntelligenceStore {
  private memoryCache = new Map<string, CacheEntry>();
  private firestoreDb: any = null;

  constructor() {
    this.initFirestore();
  }

  private async initFirestore() {
    try {
      // Lazy-load client Firestore if available
      const { db } = await import("../firebase");
      this.firestoreDb = db;
    } catch {
      // Graceful fallback to in-memory store in environments without Firebase client initialized
      this.firestoreDb = null;
    }
  }

  /**
   * Resolves a raw company name and returns canonical entity and status.
   */
  public resolve(options: string | CompanyResolutionOptions): CompanyEntity {
    return resolveCompany(options);
  }

  /**
   * Retrieves company intelligence by company name, checking cache first.
   */
  public async getIntelligence(params: {
    companyName: string;
    website?: string;
    jobUrl?: string;
    jobDescription?: string;
    refresh?: boolean;
  }): Promise<CompanyIntelligence> {
    const entity = this.resolve({
      rawName: params.companyName,
      website: params.website,
      jobUrl: params.jobUrl,
      jobDescription: params.jobDescription
    });

    const companyId = entity.companyId;
    const now = Date.now();

    // 1. Check in-memory cache
    if (!params.refresh && this.memoryCache.has(companyId)) {
      const entry = this.memoryCache.get(companyId)!;
      if (now - entry.cachedAt < CACHE_TTL_MS) {
        return entry.intelligence;
      }
    }

    // 2. Check Firestore cache if available
    if (!params.refresh && this.firestoreDb) {
      try {
        const { doc, getDoc } = await import("firebase/firestore");
        const docRef = doc(this.firestoreDb, "companyIntelligence", companyId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as CompanyIntelligence;
          const updatedAt = new Date(data.lastUpdatedAt || 0).getTime();
          if (now - updatedAt < CACHE_TTL_MS) {
            this.memoryCache.set(companyId, { intelligence: data, cachedAt: updatedAt });
            return data;
          }
        }
      } catch {
        // Fall through to public enrichment
      }
    }

    // 3. Perform public enrichment
    const enrichment = await enrichCompanyFromPublicSources({
      companyName: entity.canonicalName,
      website: params.website || entity.officialWebsite,
      jobUrl: params.jobUrl,
      jobDescription: params.jobDescription
    });

    // 4. Retrieve any verified job postings from existing internal stores
    let profile: any = undefined;
    try {
      profile = await globalIntelligenceEngine.getCompanyIntelligence(entity.canonicalName);
    } catch {}

    // 5. Synthesize complete CompanyIntelligence model
    const intelligence = buildUniversalCompanyIntelligence({
      entity,
      enrichment,
      profile
    });

    // 6. Update in-memory cache
    this.memoryCache.set(companyId, { intelligence, cachedAt: now });

    // 7. Persist to Firestore asynchronously (fire-and-forget, never blocks)
    if (this.firestoreDb) {
      this.persistToFirestore(companyId, intelligence).catch(() => {});
    }

    return intelligence;
  }

  private async persistToFirestore(companyId: string, intelligence: CompanyIntelligence): Promise<void> {
    try {
      const { doc, setDoc } = await import("firebase/firestore");
      const docRef = doc(this.firestoreDb, "companyIntelligence", companyId);
      await setDoc(docRef, intelligence, { merge: true });
    } catch {
      // Ignored for non-fatal offline/permission scenarios
    }
  }

  /**
   * For testing and memory management.
   */
  public clearCache(): void {
    this.memoryCache.clear();
  }

  public getCacheSize(): number {
    return this.memoryCache.size;
  }
}

export const globalCompanyIntelligenceStore = new CompanyIntelligenceStore();
