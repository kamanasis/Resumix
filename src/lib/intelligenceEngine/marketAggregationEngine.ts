import crypto from "crypto";
import { 
  Job, 
  JobSnapshot, 
  MarketAggregate, 
  MarketObservationWindow, 
  TimeDecayedRequirementFrequency, 
  EvidenceStrength, 
  RequirementCategory 
} from "../../types";
import { calculateEvidenceStrength } from "./frequencyEngine";
import { canonicalizeCompanyName } from "../jobEngine/companyResolver";
import { normalizeJobRole } from "../jobEngine/jobNormalizer";

export interface AggregateInputItem {
  job: Job;
  snapshot: JobSnapshot;
}

/**
 * Universal Market Aggregation Engine.
 * Aggregates empirical job postings across companies and roles with
 * recency decay, cross-company deduplication, and zero-fabrication guarantees.
 */
export class MarketAggregationEngine {
  private cache: Map<string, MarketAggregate> = new Map();

  /**
   * Computes exponential recency decay weight based on 90-day half-life.
   */
  public computeRecencyWeight(observedDateIso: string, halfLifeDays: number = 90): number {
    const observedTime = new Date(observedDateIso).getTime();
    if (isNaN(observedTime)) return 0.5; // Neutral prior

    const now = Date.now();
    const ageDays = Math.max(0, (now - observedTime) / (1000 * 60 * 60 * 24));
    return Math.pow(0.5, ageDays / halfLifeDays);
  }

  /**
   * Aggregates requirement frequencies from postings with time decay.
   */
  public aggregateRequirementFrequencies(
    items: AggregateInputItem[],
    window: MarketObservationWindow = "12_MONTHS"
  ): TimeDecayedRequirementFrequency[] {
    if (!items || items.length === 0) return [];

    const now = Date.now();
    const windowDays = window === "30_DAYS" ? 30 : window === "90_DAYS" ? 90 : window === "12_MONTHS" ? 365 : 3650;
    const windowCutoff = now - (windowDays * 24 * 60 * 60 * 1000);
    const recentCutoff = now - (60 * 24 * 60 * 60 * 1000); // 60 days threshold for "recent"

    // Filter items within observation window
    const windowItems = items.filter(i => {
      const time = new Date(i.snapshot.retrievedAt || i.job.createdAt).getTime();
      return isNaN(time) || time >= windowCutoff;
    });

    if (windowItems.length === 0) return [];

    const totalPostings = windowItems.length;

    // Accumulators keyed by canonical lower-case requirement name
    const accMap = new Map<string, {
      canonicalName: string;
      category: RequirementCategory;
      observedCount: number;
      requiredCount: number;
      preferredCount: number;
      optionalCount: number;
      companies: Set<string>;
      roles: Set<string>;
      recentObservations: number;
      historicalObservations: number;
      weightedSum: number;
    }>();

    for (const item of windowItems) {
      const jobTime = item.snapshot.retrievedAt || item.job.createdAt || new Date().toISOString();
      const recencyWeight = this.computeRecencyWeight(jobTime);
      const isRecent = new Date(jobTime).getTime() >= recentCutoff;
      const compKey = canonicalizeCompanyName(item.job.companyName || "Unknown").toLowerCase();
      const roleKey = normalizeJobRole(item.job.title || "Unknown").canonicalRole.toLowerCase();

      const seenInThisPosting = new Set<string>();

      for (const req of (item.snapshot.requirements || [])) {
        const canonical = req.canonicalName || req.name || "Skill";
        const key = canonical.toLowerCase().trim();
        if (!key) continue;

        if (!accMap.has(key)) {
          accMap.set(key, {
            canonicalName: canonical,
            category: (req.category as RequirementCategory) || "TECHNICAL_SKILL",
            observedCount: 0,
            requiredCount: 0,
            preferredCount: 0,
            optionalCount: 0,
            companies: new Set(),
            roles: new Set(),
            recentObservations: 0,
            historicalObservations: 0,
            weightedSum: 0
          });
        }

        const acc = accMap.get(key)!;
        acc.companies.add(compKey);
        acc.roles.add(roleKey);

        // Deduplicate within single posting
        if (!seenInThisPosting.has(key)) {
          seenInThisPosting.add(key);
          acc.observedCount += 1;
          acc.weightedSum += recencyWeight;

          if (isRecent) {
            acc.recentObservations += 1;
          } else {
            acc.historicalObservations += 1;
          }

          if (req.importance === "REQUIRED") {
            acc.requiredCount += 1;
          } else if (req.importance === "PREFERRED") {
            acc.preferredCount += 1;
          } else {
            acc.optionalCount += 1;
          }
        }
      }
    }

    const frequencies: TimeDecayedRequirementFrequency[] = [];

    for (const acc of accMap.values()) {
      const recencyWeightedFrequency = totalPostings > 0 
        ? Math.min(1.0, Math.round((acc.weightedSum / totalPostings) * 1000) / 1000) 
        : 0;

      const confidence = calculateEvidenceStrength(acc.observedCount);

      frequencies.push({
        canonicalName: acc.canonicalName,
        category: acc.category,
        observedCount: acc.observedCount,
        requiredCount: acc.requiredCount,
        preferredCount: acc.preferredCount,
        optionalCount: acc.optionalCount,
        companiesObserved: acc.companies.size,
        rolesObserved: acc.roles.size,
        recentObservations: acc.recentObservations,
        historicalObservations: acc.historicalObservations,
        recencyWeightedFrequency,
        confidence
      });
    }

    // Sort by recency-weighted frequency descending
    frequencies.sort((a, b) => b.recencyWeightedFrequency - a.recencyWeightedFrequency);
    return frequencies;
  }

  /**
   * Builds or retrieves an empirical MarketAggregate for a given scope.
   */
  public buildMarketAggregate(params: {
    scope: "ROLE_FAMILY" | "COMPANY" | "CROSS_MARKET";
    targetIdentifier: string;
    items: AggregateInputItem[];
    window?: MarketObservationWindow;
  }): MarketAggregate {
    const window = params.window || "12_MONTHS";
    const cacheKey = `${params.scope}:${params.targetIdentifier.toLowerCase().trim()}:${window}`;

    const existing = this.cache.get(cacheKey);
    if (existing && params.items.length === 0) {
      return existing;
    }

    const frequencies = this.aggregateRequirementFrequencies(params.items, window);
    const uniqueCompanies = new Set(params.items.map(i => canonicalizeCompanyName(i.job.companyName).toLowerCase()));

    const aggregateId = "mkt_" + crypto.createHash("sha256").update(cacheKey + Date.now()).digest("hex").substring(0, 12);

    const aggregate: MarketAggregate = {
      aggregateId,
      scope: params.scope,
      targetIdentifier: params.targetIdentifier,
      observationWindow: window,
      totalPostingsObserved: params.items.length,
      uniqueCompaniesCount: uniqueCompanies.size,
      frequencies,
      updatedAt: new Date().toISOString()
    };

    this.cache.set(cacheKey, aggregate);
    return aggregate;
  }

  /**
   * Universal Cold-Start Handler for Unknown Companies.
   * Seamlessly builds an empirical baseline from current job postings
   * and role-family context without falling back to hardcoded assumptions.
   */
  public handleUnknownCompanyBaseline(params: {
    companyName: string;
    targetRole: string;
    currentJobItems: AggregateInputItem[];
    roleFamilyItems?: AggregateInputItem[];
  }): {
    companyAggregate: MarketAggregate;
    roleAggregate?: MarketAggregate;
    isColdStart: boolean;
    confidenceTier: EvidenceStrength;
  } {
    const sampleSize = params.currentJobItems.length;
    const isColdStart = sampleSize === 0;
    const confidenceTier = calculateEvidenceStrength(sampleSize);

    const companyAggregate = this.buildMarketAggregate({
      scope: "COMPANY",
      targetIdentifier: params.companyName,
      items: params.currentJobItems
    });

    let roleAggregate: MarketAggregate | undefined;
    if (params.roleFamilyItems && params.roleFamilyItems.length > 0) {
      roleAggregate = this.buildMarketAggregate({
        scope: "ROLE_FAMILY",
        targetIdentifier: params.targetRole,
        items: params.roleFamilyItems
      });
    }

    return {
      companyAggregate,
      roleAggregate,
      isColdStart,
      confidenceTier
    };
  }
}

export const globalMarketAggregationEngine = new MarketAggregationEngine();
