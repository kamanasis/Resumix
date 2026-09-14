import { 
  LearningAggregate, 
  RecommendationConfidenceTier, 
  RecommendationPriority, 
  LearningModelStatus,
  CompanyIntelligence,
  RoleIntelligence,
  GapReport,
  ParsedResume
} from "../../types";
import { globalLearningEventStore } from "./learningEventStore";
import { globalFeatureExtractor } from "./featureExtractor";

const HALF_LIFE_DAYS = 30;
const DECAY_CONSTANT = Math.log(2) / HALF_LIFE_DAYS; // ~0.0231

export interface ScoreComponents {
  evidenceScore: number;     // 0-100
  roleWeight: number;        // 0-100
  companyWeight: number;     // 0-100
  behaviorScore: number;     // 0-100
  recencyScore: number;      // 0-100
  finalScore: number;        // 0-100
  confidenceTier: RecommendationConfidenceTier;
  confidenceScore: number;   // 0.0 - 1.0
  reason: string;
}

export class AdaptiveLearningModel {
  public modelVersion = "1.0.0";
  public featureVersion = "1.0.0";

  /**
   * Calculates time-decay weight for an observation timestamp.
   * Returns a factor between 0.1 and 1.0.
   */
  public calculateRecencyDecay(isoTimestamp?: string): number {
    if (!isoTimestamp) return 0.5;
    const timeMs = new Date(isoTimestamp).getTime();
    if (isNaN(timeMs)) return 0.5;

    const ageDays = Math.max(0, (Date.now() - timeMs) / (1000 * 60 * 60 * 24));
    const factor = Math.exp(-DECAY_CONSTANT * ageDays);
    return Math.max(0.1, Math.min(1.0, Number(factor.toFixed(3))));
  }

  /**
   * Evaluates the confidence tier based on sample size, corroborating evidence, and model maturity.
   */
  public evaluateConfidence(params: {
    observationCount: number;
    hasJobEvidence: boolean;
    hasCompanyEvidence: boolean;
    hasRoleEvidence: boolean;
  }): { tier: RecommendationConfidenceTier; score: number } {
    const count = params.observationCount;
    let score = 0.2; // Baseline prior

    if (params.hasJobEvidence) score += 0.35;
    if (params.hasRoleEvidence) score += 0.20;
    if (params.hasCompanyEvidence) score += 0.15;
    
    // Scale by behavioral sample count
    if (count >= 20) {
      score += 0.30;
    } else if (count >= 5) {
      score += 0.20;
    } else if (count >= 1) {
      score += 0.08;
    }

    score = Math.min(1.0, Math.max(0.0, Number(score.toFixed(2))));

    let tier: RecommendationConfidenceTier = "LOW";
    if (count < 2 && !params.hasJobEvidence && !params.hasRoleEvidence) {
      tier = "INSUFFICIENT_DATA";
    } else if (score >= 0.75 && (count >= 4 || params.hasJobEvidence)) {
      tier = "HIGH";
    } else if (score >= 0.45) {
      tier = "MEDIUM";
    }

    return { tier, score };
  }

  /**
   * Computes an explainable multi-factor recommendation score for a specific skill or requirement.
   */
  public computeRequirementScore(params: {
    skillName: string;
    isJobRequired: boolean;
    isJobPreferred: boolean;
    companyIntel?: CompanyIntelligence | null;
    roleIntel?: RoleIntelligence | null;
    gapReport?: GapReport | null;
    userId?: string;
  }): ScoreComponents {
    const normSkill = params.skillName.toLowerCase().trim();

    // 1. Evidence Score (from target job posting directly)
    let evidenceScore = 20;
    if (params.isJobRequired) {
      evidenceScore = 95;
    } else if (params.isJobPreferred) {
      evidenceScore = 75;
    }

    // 2. Role Weight (from role intelligence market frequency)
    let roleWeight = 30;
    let roleObserved = false;
    if (params.roleIntel) {
      const matchPattern = params.roleIntel.requiredSkillPatterns?.find(
        p => p.canonicalName.toLowerCase() === normSkill || p.requirementName.toLowerCase() === normSkill
      );
      if (matchPattern) {
        roleWeight = Math.min(100, Math.max(30, matchPattern.frequencyPercentage));
        roleObserved = true;
      } else {
        const prefPattern = params.roleIntel.preferredSkillPatterns?.find(
          p => p.canonicalName.toLowerCase() === normSkill || p.requirementName.toLowerCase() === normSkill
        );
        if (prefPattern) {
          roleWeight = Math.min(90, Math.max(25, prefPattern.frequencyPercentage));
          roleObserved = true;
        } else if (params.roleIntel.commonTechnologies?.some(t => t.toLowerCase() === normSkill)) {
          roleWeight = 60;
          roleObserved = true;
        }
      }
    }

    // 3. Company Weight (from company intelligence observed tech)
    let companyWeight = 25;
    let companyObserved = false;
    if (params.companyIntel) {
      if (params.companyIntel.observedTechnologies?.some(t => t.toLowerCase() === normSkill)) {
        companyWeight = 85;
        companyObserved = true;
      }
    }

    // 4. Behavioral Score & Recency Score (from aggregate learning store)
    let behaviorScore = 50; // Neutral prior
    let recencyScore = 50;
    let observationCount = 0;

    const roleFamily = params.roleIntel?.roleFamily;
    if (roleFamily) {
      const scopeKey = `role_skill:${roleFamily.toLowerCase().trim()}:${normSkill}`;
      const agg = globalLearningEventStore.getAggregate(scopeKey);
      if (agg && agg.totalObservations > 0) {
        observationCount = agg.totalObservations;
        // Map aggregate weighted score (-1 to +1) to 0-100
        behaviorScore = Math.round(((agg.weightedScore + 1) / 2) * 100);
        const recencyFactor = this.calculateRecencyDecay(agg.lastObservedAt);
        recencyScore = Math.round(recencyFactor * 100);
      }
    }

    // 5. Linear combination with normalized coefficients
    // weights: evidence (0.35), role (0.25), company (0.15), behavior (0.15), recency (0.10)
    const finalScore = Math.round(
      0.35 * evidenceScore +
      0.25 * roleWeight +
      0.15 * companyWeight +
      0.15 * behaviorScore +
      0.10 * recencyScore
    );

    // 6. Confidence evaluation
    const { tier: confidenceTier, score: confidenceScore } = this.evaluateConfidence({
      observationCount,
      hasJobEvidence: params.isJobRequired || params.isJobPreferred,
      hasCompanyEvidence: companyObserved,
      hasRoleEvidence: roleObserved
    });

    // 7. Human-readable explainable rationale
    const reasons: string[] = [];
    if (params.isJobRequired) {
      reasons.push("Explicitly required in the target job description");
    } else if (params.isJobPreferred) {
      reasons.push("Listed as a preferred qualification for this job");
    }

    if (roleObserved) {
      reasons.push(`High market prevalence for ${params.roleIntel?.normalizedRole || "this role"}`);
    }
    if (companyObserved) {
      reasons.push(`Corroborated by verified technology hiring signals at ${params.companyIntel?.normalizedName || "this company"}`);
    }
    if (observationCount >= 3) {
      reasons.push(`Validated by ${observationCount} candidate interaction patterns`);
    } else if (!params.isJobRequired && !roleObserved) {
      reasons.push("Initial baseline signal (cold-start / limited observations)");
    }

    return {
      evidenceScore,
      roleWeight,
      companyWeight,
      behaviorScore,
      recencyScore,
      finalScore: Math.min(100, Math.max(0, finalScore)),
      confidenceTier,
      confidenceScore,
      reason: reasons.join("; ") || "Empirical multi-factor evaluation"
    };
  }

  /**
   * Calibrates learned priority for focus without falsely labeling unverified items as job mandates.
   */
  public calibratePriority(isJobRequired: boolean, finalScore: number): RecommendationPriority {
    if (isJobRequired) {
      return "CRITICAL";
    }
    if (finalScore >= 75) {
      return "HIGH";
    }
    if (finalScore >= 45) {
      return "MEDIUM";
    }
    return "LOW";
  }
}

export const globalAdaptiveModel = new AdaptiveLearningModel();
