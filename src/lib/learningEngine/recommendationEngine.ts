import crypto from "crypto";
import { 
  CompanyIntelligence, 
  RoleIntelligence, 
  GapReport, 
  ParsedResume, 
  AdaptiveRecommendation, 
  AdaptiveIntelligenceResponse,
  RequirementProfile
} from "../../types";
import { globalAdaptiveModel } from "./adaptiveLearningModel";
import { globalLearningEventStore } from "./learningEventStore";

export class AdaptiveRecommendationEngine {
  public generateRecommendations(params: {
    userId: string;
    gapReport?: GapReport | null;
    frozenProfile?: RequirementProfile | null;
    parsedResume?: ParsedResume | null;
    companyIntel?: CompanyIntelligence | null;
    roleIntel?: RoleIntelligence | null;
  }): AdaptiveIntelligenceResponse {
    const { userId, gapReport, frozenProfile, parsedResume, companyIntel, roleIntel } = params;

    const meta = globalLearningEventStore.getModelMetadata();
    const userProfile = userId && userId !== "anonymous" ? globalLearningEventStore.getUserLearningProfile(userId) : undefined;

    const recommendations: AdaptiveRecommendation[] = [];
    const prioritizedGaps: AdaptiveIntelligenceResponse["prioritizedGaps"] = [];
    const highValueKeywords: AdaptiveIntelligenceResponse["highValueKeywords"] = [];

    const candidateSkillsLower = new Set(
      (parsedResume?.skills || []).map(s => (typeof s === "string" ? s : (s as any)?.name || (s as any)?.skill || "").toLowerCase().trim())
    );

    // 1. Evaluate Target Requirements & Missing Items
    const structuredReqs = frozenProfile?.structuredRequirements || [];
    const missingItems = gapReport?.missingItems || [];

    for (const item of missingItems) {
      const skillName = item.title;
      if (!skillName) continue;

      const isRequired = item.importance === "Critical" || item.priorityTier === "CRITICAL";
      const isPreferred = item.importance === "Recommended" || item.importance === "Optional";

      const scores = globalAdaptiveModel.computeRequirementScore({
        skillName,
        isJobRequired: isRequired,
        isJobPreferred: isPreferred,
        companyIntel,
        roleIntel,
        gapReport,
        userId
      });

      const learnedPriority = globalAdaptiveModel.calibratePriority(isRequired, scores.finalScore);

      prioritizedGaps.push({
        requirementName: skillName,
        verifiedImportance: isRequired ? "REQUIRED" : isPreferred ? "PREFERRED" : "OPTIONAL",
        learnedPriority,
        confidence: scores.confidenceTier,
        reason: scores.reason
      });

      // Formulate explainable adaptive recommendation
      const recId = `rec_gap_${crypto.createHash("sha256").update(`${userId}_${skillName}`).digest("hex").substring(0, 10)}`;
      const hasResumeEvidence = candidateSkillsLower.has(skillName.toLowerCase().trim());

      recommendations.push({
        id: recId,
        type: "GAP_PRIORITY",
        targetItem: skillName,
        learnedPriority,
        evidenceScore: scores.evidenceScore,
        roleWeight: scores.roleWeight,
        companyWeight: scores.companyWeight,
        behaviorScore: scores.behaviorScore,
        recencyScore: scores.recencyScore,
        finalScore: scores.finalScore,
        confidenceTier: scores.confidenceTier,
        confidenceScore: scores.confidenceScore,
        reason: scores.reason,
        evidence: hasResumeEvidence
          ? `Verified text mentions found in candidate resume. Suggest clarifying practical project depth.`
          : `No verified evidence for "${skillName}" exists in current resume. If possessed, provide verifiable academic, personal, or employment project evidence. Do NOT fabricate.`,
        source: isRequired ? "DETERMINISTIC_ATS" : roleIntel ? "ROLE_INTELLIGENCE" : "ADAPTIVE_LEARNING",
        modelVersion: globalAdaptiveModel.modelVersion,
        status: "ACTIVE"
      });
    }

    // Sort prioritized gaps by final score descending
    prioritizedGaps.sort((a, b) => {
      const priorityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return priorityOrder[b.learnedPriority] - priorityOrder[a.learnedPriority];
    });

    // 2. High-Value Keyword Extraction
    const keywordCandidates = new Map<string, { relevance: number; source: string }>();

    // From Role Market Intelligence
    if (roleIntel) {
      for (const t of roleIntel.commonTechnologies || []) {
        keywordCandidates.set(t, { relevance: 85, source: "Role Market Data" });
      }
      for (const em of roleIntel.emergingSkills || []) {
        keywordCandidates.set(em.technology, { relevance: 92, source: "Emerging Market Trend" });
      }
    }

    // From Company Intelligence
    if (companyIntel) {
      for (const tech of companyIntel.observedTechnologies || []) {
        const existing = keywordCandidates.get(tech);
        if (existing) {
          existing.relevance = Math.min(100, existing.relevance + 10);
          existing.source = "Corroborated by Role & Company";
        } else {
          keywordCandidates.set(tech, { relevance: 80, source: "Company Verified Tech Stack" });
        }
      }
    }

    // From Job Description directly
    if (frozenProfile?.atsKeywords) {
      for (const kw of frozenProfile.atsKeywords) {
        keywordCandidates.set(kw, { relevance: 98, source: "Target Job Description" });
      }
    }

    for (const [kw, details] of keywordCandidates.entries()) {
      highValueKeywords.push({
        keyword: kw,
        relevanceScore: details.relevance,
        source: details.source
      });
    }
    highValueKeywords.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // 3. User Personalization Insights
    let userInsights: AdaptiveIntelligenceResponse["userInsights"] = undefined;
    if (userProfile && userProfile.totalAnalyses > 0) {
      const primaryRoleFamily = userProfile.topRoleFamilies[0]?.family;
      userInsights = {
        primaryTargetRoleFamily: primaryRoleFamily,
        tailoringAcceptanceRate: userProfile.acceptanceRate,
        suggestedFocusArea: primaryRoleFamily 
          ? `Your career targeting concentrates on ${primaryRoleFamily}. Focus on strengthening deep technical project outcomes in this discipline.`
          : undefined
      };
    }

    // 4. Determine overall confidence & learning status
    let overallConfidence: AdaptiveIntelligenceResponse["confidence"] = "LOW";
    if (meta.totalEventsProcessed >= 50 && (roleIntel || companyIntel)) {
      overallConfidence = "HIGH";
    } else if (meta.totalEventsProcessed >= 5 || roleIntel || companyIntel) {
      overallConfidence = "MEDIUM";
    } else {
      overallConfidence = "INSUFFICIENT_DATA";
    }

    return {
      learningStatus: meta.status,
      confidence: overallConfidence,
      recommendations: recommendations.slice(0, 10),
      prioritizedGaps: prioritizedGaps.slice(0, 10),
      highValueKeywords: highValueKeywords.slice(0, 12),
      userInsights,
      modelVersion: globalAdaptiveModel.modelVersion,
      featureVersion: globalAdaptiveModel.featureVersion,
      generatedAt: new Date().toISOString(),
      disclaimer: "Adaptive Intelligence Recommendations: These insights are based on empirical observation patterns, market distributions, and aggregate interaction outcomes. The deterministic evidence engine remains the sole authority for candidate resume truth. Resumix strictly forbids fabricating unpossessed qualifications."
    };
  }
}

export const globalAdaptiveRecommendationEngine = new AdaptiveRecommendationEngine();
