import assert from 'node:assert';
import {
  captureScoreSnapshot,
  verifySnapshotIntegrity
} from '../src/lib/outcomeEngine/scoreSnapshotManager.ts';
import {
  filterEligibleApplications
} from '../src/lib/outcomeEngine/outcomeFilter.ts';
import {
  aggregateOutcomeAnalytics,
  determineOutcomeEvidenceLevel,
  calculateObservedCorrelations,
  DEFAULT_EVIDENCE_THRESHOLDS
} from '../src/lib/outcomeEngine/outcomeAggregator.ts';
import {
  ApplicationStore,
  globalApplicationStore
} from '../src/lib/outcomeEngine/applicationStore.ts';
import {
  OutcomeIntelligenceEngine,
  globalOutcomeIntelligenceEngine
} from '../src/lib/outcomeEngine/outcomeIntelligenceEngine.ts';
import fs from 'node:fs';
import path from 'node:path';

console.log("================================================================================");
console.log("OUTCOME INTELLIGENCE & APPLICATION LEARNING SYSTEM VERIFICATION SUITE");
console.log("================================================================================\n");

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] Test ${passed + failed + 1}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] Test ${passed + failed + 1}: ${name}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

// Helper to construct synthetic application records with distinct identities by default
function makeMockApp(overrides = {}) {
  const rand = Math.random().toString(36).substring(2, 9);
  const appliedAt = overrides.appliedAt || new Date().toISOString();
  const snapshot = overrides.scoreSnapshot || captureScoreSnapshot({
    gapReport: {
      atsScore: overrides.atsScore ?? 82,
      targetMatchScore: overrides.targetMatchScore ?? 85,
      scoreBreakdown: {
        requiredMatched: overrides.requiredMatched ?? 8,
        requiredTotal: overrides.requiredTotal ?? 10,
        preferredMatched: overrides.preferredMatched ?? 3,
        preferredTotal: overrides.preferredTotal ?? 5,
        criticalGapsCount: overrides.criticalGapsCount ?? 2
      }
    },
    profile: {
      profileHash: overrides.requirementProfileHash ?? `hash_profile_${rand}`
    },
    datasetVersion: overrides.intelligenceDatasetVersion ?? 'v1.0.0'
  });

  return {
    applicationId: overrides.applicationId || overrides.id || `app_${rand}`,
    userId: overrides.userId || `user_${rand}`,
    jobId: overrides.jobId !== undefined ? overrides.jobId : `job_${rand}`,
    companyName: overrides.companyName || 'Google',
    roleTitle: overrides.roleTitle || 'Software Engineer',
    source: overrides.source || 'CAREER_PORTAL',
    resumeId: overrides.resumeId !== undefined ? overrides.resumeId : `res_${rand}`,
    tailoredResumeId: overrides.tailoredResumeId,
    appliedAt,
    outcome: overrides.outcome !== undefined ? overrides.outcome : (overrides.currentStatus || 'APPLIED'),
    outcomeDate: overrides.outcomeDate || appliedAt,
    userNotes: overrides.userNotes !== undefined ? overrides.userNotes : (overrides.notes || ''),
    outcomeConfidence: overrides.outcomeConfidence || 'USER_REPORTED',
    outcomeEvidenceSource: overrides.outcomeEvidenceSource || 'USER_ENTERED',
    scoreSnapshot: snapshot,
    resumeVersionName: overrides.resumeVersionName || 'Current Resume',
    isTailored: Boolean(overrides.isTailored),
    createdAt: appliedAt,
    updatedAt: appliedAt
  };
}

async function runAll() {
  // ============================================================================
  // CATEGORY 1: IMMUTABLE SCORE SNAPSHOTTING & INTEGRITY (Tests 1-5)
  // ============================================================================
  console.log("--- Category 1: Immutable Score Snapshotting & Integrity ---");

  await test("Score Snapshot: captures all required ATS and target match metrics", () => {
    const snap = captureScoreSnapshot({
      gapReport: {
        atsScore: 88,
        targetMatchScore: 92,
        scoreBreakdown: {
          requiredMatched: 9,
          requiredTotal: 10,
          preferredMatched: 4,
          preferredTotal: 5,
          criticalGapsCount: 1
        }
      },
      profile: {
        profileHash: "hash_req_999"
      },
      datasetVersion: "intel_v2"
    });

    assert.strictEqual(snap.atsScore, 88);
    assert.strictEqual(snap.targetMatchScore, 92);
    assert.strictEqual(snap.requiredMatched, 9);
    assert.strictEqual(snap.requiredTotal, 10);
    assert.strictEqual(snap.preferredMatched, 4);
    assert.strictEqual(snap.preferredTotal, 5);
    assert.strictEqual(snap.criticalGapsCount, 1);
    assert.strictEqual(snap.requirementProfileHash, "hash_req_999");
    assert.strictEqual(snap.intelligenceDatasetVersion, "intel_v2");
    assert.ok(snap.capturedAt, "Must record capture timestamp");
  });

  await test("Score Snapshot: verifySnapshotIntegrity passes for valid snapshot", () => {
    const snap = captureScoreSnapshot({
      gapReport: {
        atsScore: 75,
        targetMatchScore: 80,
        scoreBreakdown: {
          requiredMatched: 7,
          requiredTotal: 10,
          preferredMatched: 2,
          preferredTotal: 4,
          criticalGapsCount: 3
        }
      },
      profile: {
        profileHash: "hash_req_777"
      },
      datasetVersion: "intel_v1"
    });

    assert.strictEqual(verifySnapshotIntegrity(snap), true);
  });

  await test("Score Snapshot: verifySnapshotIntegrity detects invalid ATS score bounds", () => {
    const snap = captureScoreSnapshot({
      gapReport: {
        atsScore: 75,
        targetMatchScore: 80
      }
    });

    // Tamper with score to out-of-range value
    const tampered = { ...snap, atsScore: 120 };
    assert.strictEqual(verifySnapshotIntegrity(tampered), false);

    const negative = { ...snap, atsScore: -5 };
    assert.strictEqual(verifySnapshotIntegrity(negative), false);
  });

  await test("Score Snapshot: verifySnapshotIntegrity detects missing requirementProfileHash", () => {
    const snap = captureScoreSnapshot({
      gapReport: {
        atsScore: 80,
        targetMatchScore: 85
      }
    });

    const tampered = { ...snap, requirementProfileHash: "" };
    assert.strictEqual(verifySnapshotIntegrity(tampered), false);
  });

  await test("Score Snapshot: verifySnapshotIntegrity detects missing capturedAt", () => {
    const snap = captureScoreSnapshot({
      gapReport: {
        atsScore: 90,
        targetMatchScore: 90
      }
    });

    const tampered = { ...snap, capturedAt: "" };
    assert.strictEqual(verifySnapshotIntegrity(tampered), false);
  });

  // ============================================================================
  // CATEGORY 2: APPLICATION LIFECYCLE & TIMELINE TRACKING (Tests 6-12)
  // ============================================================================
  console.log("\n--- Category 2: Application Lifecycle & Timeline Tracking ---");

  await test("ApplicationStore: registers a new valid application record", () => {
    const store = new ApplicationStore();
    const app = makeMockApp({ applicationId: "app_test_1", userId: "u1" });
    const created = store.createApplication(app);

    assert.strictEqual(created.applicationId, "app_test_1");
    assert.strictEqual(created.outcome, "APPLIED");
    const events = store.getEvents("app_test_1");
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].newOutcome, "APPLIED");
  });

  await test("ApplicationStore: fails closed if duplicate application on same day", () => {
    const store = new ApplicationStore();
    const today = new Date().toISOString();
    const app1 = makeMockApp({ applicationId: "app_dup_a", userId: "u1", jobId: "j1", resumeId: "r1", appliedAt: today });
    const app2 = makeMockApp({ applicationId: "app_dup_b", userId: "u1", jobId: "j1", resumeId: "r1", appliedAt: today });

    store.createApplication(app1);
    assert.throws(() => {
      store.createApplication(app2);
    }, /DUPLICATE_APPLICATION/);
  });

  await test("ApplicationStore: updating status appends event to chronological timeline", () => {
    const store = new ApplicationStore();
    const app = makeMockApp({ applicationId: "app_timeline_1", userId: "u1", outcome: "APPLIED" });
    store.createApplication(app);

    const updated = store.updateApplication({
      applicationId: "app_timeline_1",
      userId: "u1",
      outcome: "RECRUITER_SCREEN",
      userNotes: "Phone call scheduled with recruiter",
      confidence: "USER_REPORTED"
    });

    assert.strictEqual(updated.outcome, "RECRUITER_SCREEN");
    const events = store.getEvents("app_timeline_1", "u1");
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[1].newOutcome, "RECRUITER_SCREEN");
    assert.strictEqual(events[1].notes, "Phone call scheduled with recruiter");
  });

  await test("ApplicationStore: chronological sequence preserves earlier events", () => {
    const store = new ApplicationStore();
    const app = makeMockApp({ applicationId: "app_seq_1", userId: "u1", appliedAt: "2026-01-01T00:00:00.000Z" });
    store.createApplication(app);

    store.updateApplication({ applicationId: "app_seq_1", userId: "u1", outcome: "INTERVIEW", outcomeDate: "2026-02-01T00:00:00.000Z" });
    store.updateApplication({ applicationId: "app_seq_1", userId: "u1", outcome: "TECHNICAL_INTERVIEW", outcomeDate: "2026-02-10T00:00:00.000Z" });
    store.updateApplication({ applicationId: "app_seq_1", userId: "u1", outcome: "OFFER", outcomeDate: "2026-02-20T00:00:00.000Z" });

    const final = store.getApplication("app_seq_1", "u1");
    assert.ok(final);
    assert.strictEqual(final.outcome, "OFFER");

    const events = store.getEvents("app_seq_1", "u1");
    assert.strictEqual(events.length, 4);
    assert.strictEqual(events[0].newOutcome, "APPLIED");
    assert.strictEqual(events[1].newOutcome, "INTERVIEW");
    assert.strictEqual(events[2].newOutcome, "TECHNICAL_INTERVIEW");
    assert.strictEqual(events[3].newOutcome, "OFFER");
  });

  await test("ApplicationStore: throws if updating non-existent application", () => {
    const store = new ApplicationStore();
    assert.throws(() => {
      store.updateApplication({
        applicationId: "non_existent",
        userId: "u1",
        outcome: "OFFER"
      });
    }, /APPLICATION_NOT_FOUND/);
  });

  await test("ApplicationStore: updates userNotes without altering score snapshot", () => {
    const store = new ApplicationStore();
    const app = makeMockApp({ applicationId: "app_meta_1", userId: "u1", userNotes: "Initial note" });
    store.createApplication(app);

    const updated = store.updateApplication({
      applicationId: "app_meta_1",
      userId: "u1",
      userNotes: "Followed up via LinkedIn"
    });

    assert.strictEqual(updated.userNotes, "Followed up via LinkedIn");
    assert.strictEqual(updated.scoreSnapshot.atsScore, app.scoreSnapshot.atsScore);
    assert.strictEqual(verifySnapshotIntegrity(updated.scoreSnapshot), true);
  });

  await test("ApplicationStore: records tailoredResumeId when tailored resume used", () => {
    const store = new ApplicationStore();
    const app = makeMockApp({
      applicationId: "app_tailored_1",
      userId: "u1",
      tailoredResumeId: "tailor_draft_xyz999",
      isTailored: true
    });
    const created = store.createApplication(app);

    assert.strictEqual(created.tailoredResumeId, "tailor_draft_xyz999");
    assert.strictEqual(created.isTailored, true);
  });

  // ============================================================================
  // CATEGORY 3: DEDUPLICATION & IDENTITY (Tests 13-15)
  // ============================================================================
  console.log("\n--- Category 3: Deduplication & Identity ---");

  await test("Deduplication: different dates allow legitimate re-application to same job", () => {
    const store = new ApplicationStore();
    const date1 = "2026-01-15T10:00:00.000Z";
    const date2 = "2026-07-20T10:00:00.000Z";

    const app1 = makeMockApp({ applicationId: "app_reapp_1", userId: "u1", jobId: "j1", resumeId: "r1", appliedAt: date1 });
    const app2 = makeMockApp({ applicationId: "app_reapp_2", userId: "u1", jobId: "j1", resumeId: "r1", appliedAt: date2 });

    store.createApplication(app1);
    store.createApplication(app2);

    const all = store.getApplicationsByUser("u1");
    assert.strictEqual(all.length, 2);
  });

  await test("Deduplication: different jobs for same user on same date are distinct", () => {
    const store = new ApplicationStore();
    const today = new Date().toISOString();
    const app1 = makeMockApp({ applicationId: "app_multi_1", userId: "u1", jobId: "j_amazon", resumeId: "r1", appliedAt: today });
    const app2 = makeMockApp({ applicationId: "app_multi_2", userId: "u1", jobId: "j_google", resumeId: "r1", appliedAt: today });

    store.createApplication(app1);
    store.createApplication(app2);

    const all = store.getApplicationsByUser("u1");
    assert.strictEqual(all.length, 2);
  });

  await test("Deduplication: different users applying to same job on same date are distinct", () => {
    const store = new ApplicationStore();
    const today = new Date().toISOString();
    const app1 = makeMockApp({ applicationId: "app_u1", userId: "user_a", jobId: "j_common", resumeId: "r1", appliedAt: today });
    const app2 = makeMockApp({ applicationId: "app_u2", userId: "user_b", jobId: "j_common", resumeId: "r2", appliedAt: today });

    store.createApplication(app1);
    store.createApplication(app2);

    assert.strictEqual(store.getApplicationsByUser("user_a").length, 1);
    assert.strictEqual(store.getApplicationsByUser("user_b").length, 1);
  });

  // ============================================================================
  // CATEGORY 4: OUTCOME FILTERING & QUALITY CONTROL (Tests 16-20)
  // ============================================================================
  console.log("\n--- Category 4: Outcome Filtering & Quality Control ---");

  await test("OutcomeFilter: filters out applications with missing jobId or resumeId", () => {
    const valid = makeMockApp({ applicationId: "v1" });
    const badJob = makeMockApp({ applicationId: "b1", jobId: "" });
    const badResume = makeMockApp({ applicationId: "b2", resumeId: "" });

    const result = filterEligibleApplications([valid, badJob, badResume]);
    assert.strictEqual(result.eligible.length, 1);
    assert.strictEqual(result.eligible[0].applicationId, "v1");
    assert.strictEqual(result.excluded.length, 2);
  });

  await test("OutcomeFilter: filters out applications with missing outcome", () => {
    const valid = makeMockApp({ applicationId: "v1" });
    const noOutcome = makeMockApp({ applicationId: "no1", outcome: "" });

    const result = filterEligibleApplications([valid, noOutcome]);
    assert.strictEqual(result.eligible.length, 1);
    assert.strictEqual(result.excluded.length, 1);
    assert.strictEqual(result.excluded[0].reason, "EXCLUDED_MISSING_OUTCOME");
  });

  await test("OutcomeFilter: segregates WITHDRAWN applications cleanly", () => {
    const active1 = makeMockApp({ applicationId: "a1", outcome: "APPLIED" });
    const active2 = makeMockApp({ applicationId: "a2", outcome: "INTERVIEW" });
    const withdrawn = makeMockApp({ applicationId: "w1", outcome: "WITHDRAWN" });

    const result = filterEligibleApplications([active1, active2, withdrawn]);
    assert.strictEqual(result.eligible.length, 2);
    assert.strictEqual(result.withdrawn.length, 1);
    assert.strictEqual(result.withdrawn[0].applicationId, "w1");
  });

  await test("OutcomeFilter: deduplicates duplicate records in batch filtering", () => {
    const today = "2026-09-08T00:00:00.000Z";
    const app1 = makeMockApp({ applicationId: "dup1", userId: "u1", jobId: "j1", resumeId: "r1", appliedAt: today });
    const app2 = makeMockApp({ applicationId: "dup2", userId: "u1", jobId: "j1", resumeId: "r1", appliedAt: today });

    const result = filterEligibleApplications([app1, app2]);
    assert.strictEqual(result.eligible.length, 1);
    assert.strictEqual(result.deduplicatedCount, 1);
  });

  await test("OutcomeFilter: separates UNKNOWN outcome from verified progression", () => {
    const appUnknown = makeMockApp({ applicationId: "u_unknown", outcome: "UNKNOWN" });
    const result = filterEligibleApplications([appUnknown]);

    assert.strictEqual(result.eligible.length, 0);
    assert.strictEqual(result.excluded.length, 1);
    assert.strictEqual(result.excluded[0].reason, "EXCLUDED_UNKNOWN_OUTCOME");
  });

  // ============================================================================
  // CATEGORY 5: AGGREGATION & PROGRESSION RATES (Tests 21-26)
  // ============================================================================
  console.log("\n--- Category 5: Aggregation & Progression Rates ---");

  await test("Progression: zero division safety when 0 applications exist", () => {
    const summary = aggregateOutcomeAnalytics({
      eligibleRecords: [],
      totalRecordsCount: 0
    });

    assert.strictEqual(summary.sampleSize, 0);
    assert.strictEqual(summary.recruiterScreenRate, 0);
    assert.strictEqual(summary.interviewRate, 0);
    assert.strictEqual(summary.offerRate, 0);
    assert.strictEqual(summary.hiredRate, 0);
    assert.strictEqual(summary.rejectedRate, 0);
    assert.strictEqual(summary.evidenceLevel, "INSUFFICIENT_DATA");
  });

  await test("Progression: accurately computes sequential progression percentages", () => {
    // 10 total eligible:
    // 2 APPLIED (no further progress)
    // 2 REJECTED
    // 2 RECRUITER_SCREEN
    // 2 INTERVIEW (which implies recruiter screen reached)
    // 1 OFFER (implies recruiter screen + interview)
    // 1 HIRED (implies recruiter screen + interview + offer)
    const apps = [
      makeMockApp({ outcome: "APPLIED" }),
      makeMockApp({ outcome: "APPLIED" }),
      makeMockApp({ outcome: "REJECTED" }),
      makeMockApp({ outcome: "REJECTED" }),
      makeMockApp({ outcome: "RECRUITER_SCREEN" }),
      makeMockApp({ outcome: "RECRUITER_SCREEN" }),
      makeMockApp({ outcome: "INTERVIEW" }),
      makeMockApp({ outcome: "TECHNICAL_INTERVIEW" }),
      makeMockApp({ outcome: "OFFER" }),
      makeMockApp({ outcome: "HIRED" })
    ];

    const summary = aggregateOutcomeAnalytics({
      eligibleRecords: apps,
      totalRecordsCount: 10
    });

    assert.strictEqual(summary.sampleSize, 10);
    // Recruiter screen reached by: 2 RS + 1 INT + 1 TECH + 1 OFFER + 1 HIRED = 6 / 10 = 60%
    assert.strictEqual(summary.recruiterScreenRate, 60);
    // Interview reached by: 1 INT + 1 TECH + 1 OFFER + 1 HIRED = 4 / 10 = 40%
    assert.strictEqual(summary.interviewRate, 40);
    // Offer reached by: 1 OFFER + 1 HIRED = 2 / 10 = 20%
    assert.strictEqual(summary.offerRate, 20);
    // Hired = 1 / 10 = 10%
    assert.strictEqual(summary.hiredRate, 10);
    // Rejected = 2 / 10 = 20%
    assert.strictEqual(summary.rejectedRate, 20);
  });

  await test("Progression: rates strictly bounded in [0, 100]", () => {
    const apps = Array.from({ length: 5 }, () => makeMockApp({ outcome: "OFFER" }));
    const summary = aggregateOutcomeAnalytics({
      eligibleRecords: apps,
      totalRecordsCount: 5
    });

    assert.ok(summary.recruiterScreenRate >= 0 && summary.recruiterScreenRate <= 100);
    assert.ok(summary.interviewRate >= 0 && summary.interviewRate <= 100);
    assert.ok(summary.offerRate >= 0 && summary.offerRate <= 100);
    assert.ok(summary.hiredRate >= 0 && summary.hiredRate <= 100);
    assert.ok(summary.rejectedRate >= 0 && summary.rejectedRate <= 100);
  });

  await test("Evidence Tiers: correct classification based on sample size thresholds", () => {
    assert.strictEqual(determineOutcomeEvidenceLevel(0), "INSUFFICIENT_DATA");
    assert.strictEqual(determineOutcomeEvidenceLevel(9), "INSUFFICIENT_DATA");
    assert.strictEqual(determineOutcomeEvidenceLevel(10), "LIMITED_EVIDENCE");
    assert.strictEqual(determineOutcomeEvidenceLevel(29), "LIMITED_EVIDENCE");
    assert.strictEqual(determineOutcomeEvidenceLevel(30), "MODERATE_EVIDENCE");
    assert.strictEqual(determineOutcomeEvidenceLevel(99), "MODERATE_EVIDENCE");
    assert.strictEqual(determineOutcomeEvidenceLevel(100), "STRONG_EVIDENCE");
    assert.strictEqual(determineOutcomeEvidenceLevel(500), "STRONG_EVIDENCE");
  });

  await test("Progression: WITHDRAWN count is tracked without distorting eligible denominator", () => {
    const apps = [
      makeMockApp({ outcome: "INTERVIEW" })
    ];

    const summary = aggregateOutcomeAnalytics({
      eligibleRecords: apps,
      totalRecordsCount: 2,
      withdrawnCount: 1
    });

    assert.strictEqual(summary.sampleSize, 1);
    assert.strictEqual(summary.applicationCount, 2);
    assert.strictEqual(summary.withdrawnCount, 1);
    assert.strictEqual(summary.interviewRate, 100);
    assert.strictEqual(summary.rejectedRate, 0);
  });

  await test("Progression: includes required observed outcome disclaimer", () => {
    const summary = aggregateOutcomeAnalytics({
      eligibleRecords: [],
      totalRecordsCount: 0
    });

    assert.ok(summary.disclaimer.includes("Observed Application Outcome Data"));
    assert.ok(summary.disclaimer.includes("do NOT guarantee"));
  });

  // ============================================================================
  // CATEGORY 6: NON-CAUSAL SCORE CORRELATIONS (Tests 27-30)
  // ============================================================================
  console.log("\n--- Category 6: Non-Causal Score Correlations ---");

  await test("Correlation: computes correlation between score brackets and progression", () => {
    // 10 apps with target match score >= 75
    const highApps = Array.from({ length: 10 }, (_, i) =>
      makeMockApp({
        targetMatchScore: 85,
        outcome: i < 8 ? "INTERVIEW" : "REJECTED"
      })
    );
    // 10 apps with target match score < 60
    const lowApps = Array.from({ length: 10 }, (_, i) =>
      makeMockApp({
        targetMatchScore: 50,
        outcome: i < 2 ? "INTERVIEW" : "REJECTED"
      })
    );

    const correlations = calculateObservedCorrelations([...highApps, ...lowApps]);
    assert.ok(correlations.length > 0);

    const matchCorr = correlations[0];
    assert.strictEqual(matchCorr.metric, "Target Match Score");
    assert.strictEqual(matchCorr.threshold, 75);
    assert.ok(matchCorr.highGroupRate > matchCorr.lowGroupRate);
    assert.strictEqual(matchCorr.highGroupRate, 80);
    assert.strictEqual(matchCorr.lowGroupRate, 20);
  });

  await test("Correlation: contains mandatory non-causal disclaimer text", () => {
    const highApps = Array.from({ length: 10 }, () =>
      makeMockApp({ targetMatchScore: 85, outcome: "INTERVIEW" })
    );
    const lowApps = Array.from({ length: 10 }, () =>
      makeMockApp({ targetMatchScore: 50, outcome: "REJECTED" })
    );

    const correlations = calculateObservedCorrelations([...highApps, ...lowApps]);
    for (const corr of correlations) {
      assert.ok(
        corr.description.includes("non-causal") || corr.description.includes("descriptive correlation"),
        "Disclaimers must state correlation is non-causal"
      );
    }
  });

  await test("Anti-Hallucination: zero predictive claims of personal hiring probability", () => {
    const apps = Array.from({ length: 10 }, () => makeMockApp({ outcome: "OFFER" }));
    const summary = aggregateOutcomeAnalytics({
      eligibleRecords: apps,
      totalRecordsCount: 10
    });
    const jsonStr = JSON.stringify(summary).toLowerCase();

    assert.ok(!jsonStr.includes("chance of getting hired"));
    assert.ok(!jsonStr.includes("probability of offer"));
    assert.ok(!jsonStr.includes("guaranteed to"));
    assert.ok(!jsonStr.includes("predicted candidate outcome"));
  });

  await test("Correlation: returns empty array when sample size is under 10", () => {
    const apps = [
      makeMockApp({ targetMatchScore: 85, outcome: "INTERVIEW" }),
      makeMockApp({ targetMatchScore: 50, outcome: "REJECTED" })
    ];

    const correlations = calculateObservedCorrelations(apps);
    assert.strictEqual(correlations.length, 0);
  });

  // ============================================================================
  // CATEGORY 7: QUADRIPARTITE SEPARATION & OUTCOME INTEGRITY (Tests 31-34)
  // ============================================================================
  console.log("\n--- Category 7: Quadripartite Separation & Outcome Integrity ---");

  await test("Outcome Integrity: REJECTED outcome never alters ParsedResume or UserSkills", () => {
    const store = new ApplicationStore();
    const mockResume = {
      id: "res_immutable_user",
      skills: [{ name: "Kubernetes", category: "DevOps", verified: true }]
    };

    const app = makeMockApp({
      applicationId: "app_rej_test",
      resumeId: mockResume.id,
      outcome: "APPLIED"
    });
    store.createApplication(app);

    // Update to REJECTED
    store.updateApplication({
      applicationId: "app_rej_test",
      userId: app.userId,
      outcome: "REJECTED",
      userNotes: "Application was not selected"
    });

    // Verify candidate resume remains completely intact
    assert.strictEqual(mockResume.skills.length, 1);
    assert.strictEqual(mockResume.skills[0].name, "Kubernetes");
    assert.strictEqual(mockResume.skills[0].verified, true);
  });

  await test("Outcome Integrity: REJECTED outcome never alters Job RequirementProfile", () => {
    const mockRequirementProfile = {
      id: "req_profile_immutable",
      requirements: [{ name: "Python", importance: "REQUIRED" }]
    };

    const store = new ApplicationStore();
    const app = makeMockApp({ applicationId: "app_rej_req_test", outcome: "APPLIED" });
    store.createApplication(app);
    store.updateApplication({
      applicationId: "app_rej_req_test",
      userId: app.userId,
      outcome: "REJECTED"
    });

    // Profile remains unchanged
    assert.strictEqual(mockRequirementProfile.requirements.length, 1);
    assert.strictEqual(mockRequirementProfile.requirements[0].name, "Python");
  });

  await test("Outcome Integrity: Single OFFER outcome does not prove candidate skill causality", () => {
    const app = makeMockApp({
      outcome: "OFFER"
    });

    const summary = aggregateOutcomeAnalytics({
      eligibleRecords: [app],
      totalRecordsCount: 1
    });

    // Single observation is INSUFFICIENT_DATA
    assert.strictEqual(summary.evidenceLevel, "INSUFFICIENT_DATA");
    assert.strictEqual(summary.sampleSize, 1);
  });

  await test("Concept Separation: User Fact vs Job Requirement vs Market Pattern vs Outcome", () => {
    // 1. User Fact (Stage 2 verified)
    const userFact = { skill: "TypeScript", sourceResumeVerified: true };
    // 2. Job Requirement (Stage 3/6 posting requirement)
    const jobReq = { name: "TypeScript", importance: "REQUIRED" };
    // 3. Market Pattern (Stage 7 frequency)
    const marketPattern = { skill: "TypeScript", frequency: 0.85 };
    // 4. Outcome (Stage 8 application result)
    const outcome = { status: "INTERVIEW", atsScore: 88 };

    assert.strictEqual(typeof userFact.sourceResumeVerified, "boolean");
    assert.strictEqual(jobReq.importance, "REQUIRED");
    assert.strictEqual(marketPattern.frequency, 0.85);
    assert.strictEqual(outcome.status, "INTERVIEW");
  });

  // ============================================================================
  // CATEGORY 8: CROSS-COMPANY & ROLE ISOLATION (Tests 35-38)
  // ============================================================================
  console.log("\n--- Category 8: Cross-Company & Role Isolation ---");

  await test("Company Isolation: Google applications never affect Microsoft outcome analytics", () => {
    const engine = new OutcomeIntelligenceEngine(new ApplicationStore());
    
    // Add 10 Google applications (all interview)
    for (let i = 0; i < 10; i++) {
      engine.store.createApplication(
        makeMockApp({
          applicationId: `goog_${i}`,
          userId: `u_goog_${i}`,
          companyName: "Google",
          roleTitle: "Software Engineer",
          outcome: "INTERVIEW"
        })
      );
    }

    // Add 10 Microsoft applications (all rejected)
    for (let i = 0; i < 10; i++) {
      engine.store.createApplication(
        makeMockApp({
          applicationId: `msft_${i}`,
          userId: `u_msft_${i}`,
          companyName: "Microsoft",
          roleTitle: "Software Engineer",
          outcome: "REJECTED"
        })
      );
    }

    const googleAnalytics = engine.getCompanyAnalytics("Google");
    const msftAnalytics = engine.getCompanyAnalytics("Microsoft");

    assert.strictEqual(googleAnalytics.sampleSize, 10);
    assert.strictEqual(googleAnalytics.interviewRate, 100);
    assert.strictEqual(googleAnalytics.rejectedRate, 0);

    assert.strictEqual(msftAnalytics.sampleSize, 10);
    assert.strictEqual(msftAnalytics.interviewRate, 0);
    assert.strictEqual(msftAnalytics.rejectedRate, 100);
  });

  await test("Role Isolation: Software Engineer outcomes do not pollute Product Manager analytics", () => {
    const engine = new OutcomeIntelligenceEngine(new ApplicationStore());

    for (let i = 0; i < 5; i++) {
      engine.store.createApplication(
        makeMockApp({
          applicationId: `swe_${i}`,
          userId: `u_swe_${i}`,
          roleTitle: "Software Engineer",
          outcome: "OFFER"
        })
      );
    }

    for (let i = 0; i < 5; i++) {
      engine.store.createApplication(
        makeMockApp({
          applicationId: `pm_${i}`,
          userId: `u_pm_${i}`,
          roleTitle: "Product Manager",
          outcome: "REJECTED"
        })
      );
    }

    const sweAnalytics = engine.getRoleAnalytics("Software Engineer");
    const pmAnalytics = engine.getRoleAnalytics("Product Manager");

    assert.strictEqual(sweAnalytics.sampleSize, 5);
    assert.strictEqual(sweAnalytics.offerRate, 100);

    assert.strictEqual(pmAnalytics.sampleSize, 5);
    assert.strictEqual(pmAnalytics.rejectedRate, 100);
  });

  await test("Company Resolver: normalizes various company spellings to canonical profile", () => {
    const engine = new OutcomeIntelligenceEngine(new ApplicationStore());

    engine.store.createApplication(
      makeMockApp({ applicationId: "c1", userId: "u_c1", companyName: "Amazon, Inc.", outcome: "INTERVIEW" })
    );
    engine.store.createApplication(
      makeMockApp({ applicationId: "c2", userId: "u_c2", companyName: "amazon", outcome: "OFFER" })
    );

    const amazonAnalytics = engine.getCompanyAnalytics("Amazon");
    assert.strictEqual(amazonAnalytics.sampleSize, 2);
  });

  await test("Role Normalization: matches canonical role family", () => {
    const engine = new OutcomeIntelligenceEngine(new ApplicationStore());

    engine.store.createApplication(
      makeMockApp({ applicationId: "r_1", userId: "u_r1", roleTitle: "Frontend Developer", outcome: "INTERVIEW" })
    );
    engine.store.createApplication(
      makeMockApp({ applicationId: "r_2", userId: "u_r2", roleTitle: "Frontend Engineer", outcome: "OFFER" })
    );

    const roleAnalytics = engine.getRoleAnalytics("Frontend Developer");
    assert.strictEqual(roleAnalytics.sampleSize, 2);
  });

  // ============================================================================
  // CATEGORY 9: USER PRIVACY & MULTI-TENANCY (Tests 39-41)
  // ============================================================================
  console.log("\n--- Category 9: User Privacy & Multi-Tenancy ---");

  await test("Multi-Tenancy: getPersonalAnalytics strictly isolates records for user A vs user B", () => {
    const engine = new OutcomeIntelligenceEngine(new ApplicationStore());

    engine.store.createApplication(
      makeMockApp({ applicationId: "ua_1", userId: "alice", outcome: "OFFER" })
    );
    engine.store.createApplication(
      makeMockApp({ applicationId: "ub_1", userId: "bob", outcome: "REJECTED" })
    );

    const aliceAnalytics = engine.getPersonalAnalytics("alice");
    const bobAnalytics = engine.getPersonalAnalytics("bob");

    assert.strictEqual(aliceAnalytics.sampleSize, 1);
    assert.strictEqual(aliceAnalytics.offerRate, 100);

    assert.strictEqual(bobAnalytics.sampleSize, 1);
    assert.strictEqual(bobAnalytics.rejectedRate, 100);
  });

  await test("Global Aggregation: does not expose user IDs or personal application notes", () => {
    const engine = new OutcomeIntelligenceEngine(new ApplicationStore());

    engine.store.createApplication(
      makeMockApp({
        applicationId: "priv_1",
        userId: "confidential_candidate_999",
        userNotes: "Confidential interview details with recruiter Jane"
      })
    );

    const globalAnalytics = engine.getGlobalAnalytics();
    const jsonStr = JSON.stringify(globalAnalytics);

    assert.ok(!jsonStr.includes("confidential_candidate_999"));
    assert.ok(!jsonStr.includes("Confidential interview details"));
  });

  await test("Resume Comparison: compares outcomes between two resume versions for same user", () => {
    const engine = new OutcomeIntelligenceEngine(new ApplicationStore());

    // 4 apps for base resume (2 interviews)
    for (let i = 0; i < 4; i++) {
      engine.store.createApplication(
        makeMockApp({
          applicationId: `res_base_app_${i}`,
          userId: "charlie",
          jobId: `job_base_${i}`,
          resumeId: "resume_v1",
          outcome: i < 2 ? "INTERVIEW" : "REJECTED"
        })
      );
    }

    // 4 apps for tailored resume (3 interviews)
    for (let i = 0; i < 4; i++) {
      engine.store.createApplication(
        makeMockApp({
          applicationId: `res_tailor_app_${i}`,
          userId: "charlie",
          jobId: `job_tailor_${i}`,
          resumeId: "resume_v2",
          tailoredResumeId: "resume_v2",
          outcome: i < 3 ? "INTERVIEW" : "REJECTED"
        })
      );
    }

    const comparison = engine.compareResumeVersions({
      userId: "charlie",
      resumeIdA: "resume_v1",
      resumeIdB: "resume_v2"
    });

    assert.strictEqual(comparison.versionA.resumeId, "resume_v1");
    assert.strictEqual(comparison.versionA.applicationsCount, 4);
    assert.strictEqual(comparison.versionA.interviewRate, 50);

    assert.strictEqual(comparison.versionB.resumeId, "resume_v2");
    assert.strictEqual(comparison.versionB.applicationsCount, 4);
    assert.strictEqual(comparison.versionB.interviewRate, 75);
    assert.ok(comparison.disclaimer.includes("Descriptive Resume Version Comparison"));
  });

  // ============================================================================
  // CATEGORY 10: DETERMINISTIC DATASET VERSIONING & SINGLETON (Tests 42-44)
  // ============================================================================
  console.log("\n--- Category 10: Deterministic Dataset Versioning & Singleton ---");

  await test("Dataset Version: generates deterministic version string for application set", () => {
    const engine = new OutcomeIntelligenceEngine(new ApplicationStore());
    const app1 = makeMockApp({ applicationId: "ver_app_1", jobId: "j_v1", resumeId: "r_v1" });
    const app2 = makeMockApp({ applicationId: "ver_app_2", jobId: "j_v2", resumeId: "r_v2" });

    const ver1 = engine.generateOutcomeDatasetVersion([app1, app2]);
    const ver2 = engine.generateOutcomeDatasetVersion([app1, app2]);

    assert.strictEqual(ver1.versionId, ver2.versionId);
    assert.strictEqual(ver1.eligibleApplicationCount, 2);
    assert.ok(ver1.versionId.startsWith("outcomes_v2_"));
  });

  await test("Dataset Version: changes when application count or set differs", () => {
    const engine = new OutcomeIntelligenceEngine(new ApplicationStore());
    const app1 = makeMockApp({ applicationId: "ver_app_1", jobId: "j_v1", resumeId: "r_v1" });
    const app2 = makeMockApp({ applicationId: "ver_app_2", jobId: "j_v2", resumeId: "r_v2" });
    const app3 = makeMockApp({ applicationId: "ver_app_3", jobId: "j_v3", resumeId: "r_v3" });

    const verA = engine.generateOutcomeDatasetVersion([app1, app2]);
    const verB = engine.generateOutcomeDatasetVersion([app1, app2, app3]);

    assert.notStrictEqual(verA.versionId, verB.versionId);
  });

  await test("Global Singletons: globalApplicationStore and globalOutcomeIntelligenceEngine ready", () => {
    assert.ok(globalApplicationStore instanceof ApplicationStore);
    assert.ok(globalOutcomeIntelligenceEngine instanceof OutcomeIntelligenceEngine);
  });

  // ============================================================================
  // CATEGORY 11: CLEAN UI & NO VISIBLE STAGE LABELS (Test 45)
  // ============================================================================
  console.log("\n--- Category 11: Clean UI & No Visible Stage Labels ---");

  await test("Clean UI: zero visible Stage 1-8 development labels in all UI components", () => {
    const componentsDir = path.resolve('src', 'components');
    const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));

    const stageRegex = /Stage\s*[1-8]/i;
    const violations = [];

    for (const file of files) {
      const filePath = path.join(componentsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        if (stageRegex.test(line)) {
          violations.push(`${file}:${index + 1} -> ${line.trim()}`);
        }
      });
    }

    assert.strictEqual(
      violations.length,
      0,
      `Found forbidden internal Stage terminology in components:\n${violations.join('\n')}`
    );
  });
}

runAll().then(() => {
  console.log("\n================================================================================");
  console.log(`OUTCOME INTELLIGENCE VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exitCode = 1;
  }
}).catch(err => {
  console.error("Fatal test error:", err);
  process.exitCode = 1;
});
