import { RoleIntelligence, NormalizedRoleEntity } from "../../types";
import { normalizeRole } from "../jobEngine/roleResolver";
import { buildUniversalRoleIntelligence, PublicRoleEnrichmentParams } from "../jobEngine/publicRoleService";

export interface RoleCacheEntry {
  intelligence: RoleIntelligence;
  cachedAt: number;
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class RoleIntelligenceStore {
  private memoryCache = new Map<string, RoleCacheEntry>();
  private firestoreDb: any = null;

  constructor() {
    this.initFirestore();
  }

  private async initFirestore() {
    try {
      const { db } = await import("../firebase");
      this.firestoreDb = db;
    } catch {
      this.firestoreDb = null;
    }
  }

  /**
   * Resolves a raw role title into canonical entity, role family, specialization, and seniority.
   */
  public resolve(rawRole: string): NormalizedRoleEntity {
    return normalizeRole(rawRole);
  }

  /**
   * Retrieves role intelligence, utilizing in-memory and Firestore caches when fresh.
   */
  public async getIntelligence(params: {
    roleTitle: string;
    companyName?: string;
    jobDescription?: string;
    candidateSkills?: string[];
    refresh?: boolean;
  }): Promise<RoleIntelligence> {
    const resolved = this.resolve(params.roleTitle);
    const roleId = resolved.roleId;
    const now = Date.now();

    // 1. Check in-memory cache
    if (!params.refresh && this.memoryCache.has(roleId)) {
      const entry = this.memoryCache.get(roleId)!;
      if (now - entry.cachedAt < CACHE_TTL_MS) {
        // If candidateSkills are provided, dynamically enrich market gaps for this specific candidate
        if (params.candidateSkills && params.candidateSkills.length > 0) {
          return this.attachCandidateMarketGaps(entry.intelligence, params.candidateSkills);
        }
        return entry.intelligence;
      }
    }

    // 2. Check Firestore cache
    if (!params.refresh && this.firestoreDb) {
      try {
        const { doc, getDoc } = await import("firebase/firestore");
        const docRef = doc(this.firestoreDb, "roleIntelligence", roleId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as RoleIntelligence;
          const updatedAt = new Date(data.lastUpdatedAt || 0).getTime();
          if (now - updatedAt < CACHE_TTL_MS) {
            this.memoryCache.set(roleId, { intelligence: data, cachedAt: updatedAt });
            if (params.candidateSkills && params.candidateSkills.length > 0) {
              return this.attachCandidateMarketGaps(data, params.candidateSkills);
            }
            return data;
          }
        }
      } catch {
        // Fall through to public enrichment
      }
    }

    // 3. Build fresh universal role intelligence from public sources
    const intelligence = await buildUniversalRoleIntelligence({
      roleTitle: params.roleTitle,
      companyName: params.companyName,
      jobDescription: params.jobDescription,
      candidateSkills: params.candidateSkills
    });

    // 4. Save to in-memory cache
    this.memoryCache.set(roleId, { intelligence, cachedAt: now });

    // 5. Persist to Firestore asynchronously (fail-open for network/credentials issues)
    if (this.firestoreDb) {
      try {
        const { doc, setDoc } = await import("firebase/firestore");
        const docRef = doc(this.firestoreDb, "roleIntelligence", roleId);
        setDoc(docRef, intelligence, { merge: true }).catch(() => {});
      } catch {
        // Non-blocking
      }
    }

    return intelligence;
  }

  /**
   * Attaches candidate-specific market gap analysis to an already cached profile without mutating cache.
   */
  private attachCandidateMarketGaps(
    cached: RoleIntelligence,
    candidateSkills: string[]
  ): RoleIntelligence {
    const candidateSkillSet = new Set(candidateSkills.map(s => s.toLowerCase().trim()));
    const allSkills = [
      ...cached.requiredSkillPatterns.map(r => ({ name: r.canonicalName, category: r.category, total: r.occurrences })),
      ...cached.preferredSkillPatterns.map(r => ({ name: r.canonicalName, category: r.category, total: r.occurrences }))
    ];

    const dedupeMap = new Map<string, { name: string; category: any; total: number }>();
    for (const s of allSkills) {
      const lower = s.name.toLowerCase();
      if (!dedupeMap.has(lower)) dedupeMap.set(lower, s);
    }

    const marketGaps = Array.from(dedupeMap.values()).map(s => {
      const isVerified = candidateSkillSet.has(s.name.toLowerCase()) ||
        Array.from(candidateSkillSet).some(c => c.includes(s.name.toLowerCase()));

      const pct = cached.observationCount > 0 ? Math.round((s.total / cached.observationCount) * 100) : 0;
      const classification: "COMMON" | "EMERGING" | "OCCASIONAL" =
        pct >= 50 ? "COMMON" : pct >= 25 ? "EMERGING" : "OCCASIONAL";

      return {
        skill: s.name,
        category: s.category,
        marketFrequency: pct,
        marketClassification: classification,
        candidateEvidenceStatus: isVerified ? ("VERIFIED" as const) : ("NO_EVIDENCE" as const),
        recommendation: isVerified
          ? `Verified in resume: Your resume demonstrates verified evidence for ${s.name}.`
          : `No verified evidence: Consider developing or documenting ${s.name} experience if you genuinely have it.`
      };
    });

    marketGaps.sort((a, b) => b.marketFrequency - a.marketFrequency);

    return {
      ...cached,
      marketGaps
    };
  }

  /**
   * Clears in-memory cache (primarily for tests and resets).
   */
  public clearCache() {
    this.memoryCache.clear();
  }
}

export const globalRoleIntelligenceStore = new RoleIntelligenceStore();
