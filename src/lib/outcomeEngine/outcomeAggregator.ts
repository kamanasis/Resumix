import { 
  ApplicationRecord, 
  EvidenceStrength, 
  OutcomeSummaryAnalytics, 
  OutcomeCorrelation 
} from "../../types";

// ============================================================================
// DETERMINISTIC OUTCOME AGGREGATOR & ANALYTICS ENGINE
// ============================================================================
// Aggregates verified application records into empirical progression rates.
// Guarantees strictly bounded percentages (0% to 100%), safe zero-division,
// visible sample-size reporting, and configurable evidence tiers.
// STRICT PROHIBITION: Never claim causal predictive rules or invent probabilities.
// ============================================================================

export interface EvidenceThresholds {
  insufficientLimit: number; // default: 9
  limitedLimit: number;      // default: 29
  moderateLimit: number;     // default: 99
}

export const DEFAULT_EVIDENCE_THRESHOLDS: EvidenceThresholds = {
  insufficientLimit: 9,
  limitedLimit: 29,
  moderateLimit: 99
};

/**
 * Maps sample size to evidence confidence level.
 */
export function determineOutcomeEvidenceLevel(
  sampleSize: number,
  thresholds: EvidenceThresholds = DEFAULT_EVIDENCE_THRESHOLDS
): EvidenceStrength {
  if (sampleSize <= thresholds.insufficientLimit) return "INSUFFICIENT_DATA";
  if (sampleSize <= thresholds.limitedLimit) return "LIMITED_EVIDENCE";
  if (sampleSize <= thresholds.moderateLimit) return "MODERATE_EVIDENCE";
  return "STRONG_EVIDENCE";
}

/**
 * Calculates deterministic progression rates across eligible applications.
 */
export function aggregateOutcomeAnalytics(params: {
  eligibleRecords: ApplicationRecord[];
  totalRecordsCount: number;
  withdrawnCount?: number;
  datasetVersion?: string;
  thresholds?: EvidenceThresholds;
}): OutcomeSummaryAnalytics {
  const { 
    eligibleRecords, 
    totalRecordsCount, 
    withdrawnCount = 0, 
    datasetVersion = "outcomes_v1",
    thresholds = DEFAULT_EVIDENCE_THRESHOLDS
  } = params;

  const sampleSize = eligibleRecords.length;
  const evidenceLevel = determineOutcomeEvidenceLevel(sampleSize, thresholds);

  let recruiterScreenCount = 0;
  let interviewCount = 0;
  let offerCount = 0;
  let hiredCount = 0;
  let rejectedCount = 0;
  let unknownCount = 0;

  for (const record of eligibleRecords) {
    switch (record.outcome) {
      case "RECRUITER_SCREEN":
        recruiterScreenCount += 1;
        break;
      case "INTERVIEW":
      case "TECHNICAL_INTERVIEW":
      case "FINAL_ROUND":
        interviewCount += 1;
        recruiterScreenCount += 1; // Prior milestone in hiring progression
        break;
      case "OFFER":
        offerCount += 1;
        interviewCount += 1;
        recruiterScreenCount += 1;
        break;
      case "HIRED":
        hiredCount += 1;
        offerCount += 1;
        interviewCount += 1;
        recruiterScreenCount += 1;
        break;
      case "REJECTED":
        rejectedCount += 1;
        break;
      case "UNKNOWN":
        unknownCount += 1;
        break;
    }
  }

  const calcRate = (count: number, denom: number) => {
    if (denom <= 0) return 0;
    const rate = Math.round((count / denom) * 1000) / 10;
    return Math.min(100, Math.max(0, rate));
  };

  const recruiterScreenRate = calcRate(recruiterScreenCount, sampleSize);
  const interviewRate = calcRate(interviewCount, sampleSize);
  const offerRate = calcRate(offerCount, sampleSize);
  const hiredRate = calcRate(hiredCount, sampleSize);
  const rejectedRate = calcRate(rejectedCount, sampleSize);

  // Calculate descriptive non-causal correlations if sample size supports it
  const correlations = calculateObservedCorrelations(eligibleRecords);

  return {
    datasetVersion,
    sampleSize,
    eligibleCount: sampleSize,
    evidenceLevel,
    applicationCount: totalRecordsCount,
    recruiterScreenCount,
    recruiterScreenRate,
    interviewCount,
    interviewRate,
    offerCount,
    offerRate,
    hiredCount,
    hiredRate,
    rejectedCount,
    rejectedRate,
    withdrawnCount,
    unknownCount,
    correlations,
    disclaimer: "Observed Application Outcome Data: These metrics reflect empirical historical records from verified applications. They represent observed outcome distributions and do NOT guarantee hiring, interview, or screening results for any individual candidate."
  };
}

/**
 * Calculates empirical associations between candidate scores and interview outcomes.
 * Strictly non-causal.
 */
export function calculateObservedCorrelations(records: ApplicationRecord[]): OutcomeCorrelation[] {
  if (records.length < 10) {
    return [];
  }

  const correlations: OutcomeCorrelation[] = [];

  // Target Match Score correlation (> 75 vs < 60)
  const highMatch = records.filter(r => (r.scoreSnapshot?.targetMatchScore ?? 0) >= 75);
  const lowMatch = records.filter(r => (r.scoreSnapshot?.targetMatchScore ?? 0) < 60);

  if (highMatch.length >= 3 && lowMatch.length >= 3) {
    const isInterview = (r: ApplicationRecord) => 
      ["INTERVIEW", "TECHNICAL_INTERVIEW", "FINAL_ROUND", "OFFER", "HIRED"].includes(r.outcome);

    const highInterviews = highMatch.filter(isInterview).length;
    const lowInterviews = lowMatch.filter(isInterview).length;

    const highRate = Math.round((highInterviews / highMatch.length) * 1000) / 10;
    const lowRate = Math.round((lowInterviews / lowMatch.length) * 1000) / 10;

    correlations.push({
      metric: "Target Match Score",
      threshold: 75,
      highGroupRate: highRate,
      lowGroupRate: lowRate,
      description: `Applications with Target Match >= 75% observed a ${highRate}% interview progression rate, compared to ${lowRate}% for applications below 60% (descriptive correlation, non-causal).`
    });
  }

  return correlations;
}
