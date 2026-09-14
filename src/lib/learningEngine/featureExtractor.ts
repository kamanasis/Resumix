import crypto from "crypto";
import { 
  CompanyIntelligence, 
  RoleIntelligence, 
  GapReport, 
  ParsedResume, 
  LearningFeatureVector,
  CompanyLearningFeatures,
  RoleLearningFeatures,
  MatchLearningFeatures,
  BehavioralLearningFeatures,
  RoleSeniority
} from "../../types";
import { globalLearningEventStore } from "./learningEventStore";

/**
 * Extracts structured, normalized features from company, role, resume, and behavior contexts.
 * 100% deterministic and zero-division safe.
 */
export class LearningFeatureExtractor {
  public extractCompanyFeatures(companyIntel?: CompanyIntelligence | null): CompanyLearningFeatures {
    if (!companyIntel) {
      return {
        companyCategory: "UNKNOWN",
        companySizeTier: "UNKNOWN",
        observedTechCount: 0,
        confidenceTier: "UNVERIFIED",
        hiringFrequencyTier: "LOW"
      };
    }

    const techCount = Array.isArray(companyIntel.observedTechnologies) ? companyIntel.observedTechnologies.length : 0;
    const hiringFrequencyTier = techCount >= 15 ? "HIGH" : techCount >= 5 ? "MEDIUM" : "LOW";

    return {
      companyCategory: companyIntel.industry || "General",
      companySizeTier: companyIntel.companySize || "UNKNOWN",
      observedTechCount: techCount,
      confidenceTier: companyIntel.confidence,
      hiringFrequencyTier
    };
  }

  public extractRoleFeatures(roleIntel?: RoleIntelligence | null): RoleLearningFeatures {
    if (!roleIntel) {
      return {
        roleFamily: "General",
        specialization: null,
        seniority: "Mid-Level",
        isTechnical: true,
        marketFrequency: 0,
        isEmerging: false
      };
    }

    const nonTechnicalFamilies = new Set(["Sales", "Marketing", "Human Resources", "Legal"]);
    const isTechnical = !nonTechnicalFamilies.has(roleIntel.roleFamily);
    const isEmerging = Array.isArray(roleIntel.emergingSkills) && roleIntel.emergingSkills.length > 0;

    return {
      roleFamily: roleIntel.roleFamily,
      specialization: roleIntel.specialization || null,
      seniority: roleIntel.seniority || "Mid-Level",
      isTechnical,
      marketFrequency: roleIntel.observationCount || 0,
      isEmerging
    };
  }

  public extractMatchFeatures(gapReport?: GapReport | null, parsedResume?: ParsedResume | null): MatchLearningFeatures {
    if (!gapReport) {
      return {
        requiredCoverage: 0,
        preferredCoverage: 0,
        keywordCoverage: 0,
        criticalGapCount: 0,
        evidenceConfidence: 50
      };
    }

    const reqCov = gapReport.scoreBreakdown?.requiredPercentage ?? 0;
    const prefCov = gapReport.scoreBreakdown?.preferredPercentage ?? 0;
    const kwCov = gapReport.scoreBreakdown?.keywordPercentage ?? 0;
    const critCount = gapReport.scoreBreakdown?.criticalGapsCount ?? (gapReport.atsMissing?.length || 0);
    const conf = typeof gapReport.scoreConfidence === "number" 
      ? gapReport.scoreConfidence 
      : (gapReport.scoreConfidence as any)?.score ?? 70;

    return {
      requiredCoverage: Math.max(0, Math.min(100, reqCov)),
      preferredCoverage: Math.max(0, Math.min(100, prefCov)),
      keywordCoverage: Math.max(0, Math.min(100, kwCov)),
      criticalGapCount: Math.max(0, critCount),
      evidenceConfidence: Math.max(0, Math.min(100, conf))
    };
  }

  public extractBehavioralFeatures(userId?: string, roleFamily?: string, skillName?: string): BehavioralLearningFeatures {
    let acceptanceRate = 50; // Default prior
    let rejectionCount = 0;
    let observationCount = 0;
    let feedbackScore = 0;

    if (roleFamily) {
      const scopeKey = skillName 
        ? `role_skill:${roleFamily.toLowerCase().trim()}:${skillName.toLowerCase().trim()}`
        : `family:${roleFamily.toLowerCase().trim()}`;
      
      const agg = globalLearningEventStore.getAggregate(scopeKey);
      if (agg && agg.totalObservations > 0) {
        observationCount = agg.totalObservations;
        rejectionCount = agg.negativeSignals;
        acceptanceRate = Math.round((agg.positiveSignals / agg.totalObservations) * 100);
        feedbackScore = Math.round(agg.weightedScore * 50); // -50 to +50
      }
    }

    if (userId && userId !== "anonymous") {
      const profile = globalLearningEventStore.getUserLearningProfile(userId);
      if (profile.totalAnalyses > 0) {
        acceptanceRate = Math.round((acceptanceRate + profile.acceptanceRate) / 2);
      }
    }

    return {
      historicalAcceptanceRate: acceptanceRate,
      historicalRejectionCount: rejectionCount,
      observationCount,
      feedbackScore
    };
  }

  public extractFeatureVector(params: {
    companyIntel?: CompanyIntelligence | null;
    roleIntel?: RoleIntelligence | null;
    gapReport?: GapReport | null;
    parsedResume?: ParsedResume | null;
    userId?: string;
    skillName?: string;
  }): LearningFeatureVector {
    const featureId = `feat_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const companyFeatures = this.extractCompanyFeatures(params.companyIntel);
    const roleFeatures = this.extractRoleFeatures(params.roleIntel);
    const matchFeatures = this.extractMatchFeatures(params.gapReport, params.parsedResume);
    const behavioralFeatures = this.extractBehavioralFeatures(
      params.userId,
      params.roleIntel?.roleFamily,
      params.skillName
    );

    return {
      featureId,
      companyFeatures,
      roleFeatures,
      matchFeatures,
      behavioralFeatures,
      extractedAt: new Date().toISOString()
    };
  }
}

export const globalFeatureExtractor = new LearningFeatureExtractor();
