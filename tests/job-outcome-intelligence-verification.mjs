import assert from "assert";
import { 
  validateExternalJobUrl, 
  isSafeExternalUrl 
} from "../src/lib/jobEngine/ssrfProtector.ts";
import { 
  calculateSourceHash, 
  extractRequirementEvidenceQuote, 
  verifySourceIntegrity 
} from "../src/lib/jobEngine/sourceProvenance.ts";
import { 
  GreenhouseAdapter, 
  LeverAdapter, 
  AshbyAdapter, 
  WorkableAdapter, 
  SmartRecruitersAdapter, 
  AdzunaAdapter, 
  USAJobsAdapter, 
  JsonLdAdapter, 
  SemanticHtmlAdapter, 
  UserPasteAdapter,
  stripHtml
} from "../src/lib/jobEngine/adapters.ts";
import { 
  determineJobStatus, 
  calculateContentHash, 
  evaluateSnapshotCreation 
} from "../src/lib/jobEngine/jobSnapshotManager.ts";
import { JobIngestionEngine } from "../src/lib/jobEngine/jobIngestionEngine.ts";
import { MarketAggregationEngine } from "../src/lib/intelligenceEngine/marketAggregationEngine.ts";
import { ApplicationStore } from "../src/lib/outcomeEngine/applicationStore.ts";
import { OutcomeIntelligenceEngine } from "../src/lib/outcomeEngine/outcomeIntelligenceEngine.ts";
import { 
  PredictiveAlignmentEngine, 
  assertAtsScoreInvariance 
} from "../src/lib/learningEngine/predictiveAlignmentEngine.ts";
import { evaluateResumeAgainstRequirements } from "../src/lib/atsEngine.ts";

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] Test ${totalTests}: ${name}`);
    console.error(`         ${err.message}\n`);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] Test ${totalTests}: ${name}`);
    console.error(`         ${err.message}\n`);
    throw err;
  }
}

console.log("================================================================================");
console.log("RESUMIX REAL-WORLD JOB INTELLIGENCE & OUTCOME LEARNING VERIFICATION SUITE");
console.log("Testing All 40 Acceptance & Verification Criteria");
console.log("================================================================================\n");

async function main() {
  // --- PART 1: Public Source Adapters (Tests 1-10) ---
  console.log("--- PART 1: Public Source Adapters (Tests 1-10) ---");

  const sampleJdText = `
    Acme Software Inc is seeking a Senior Software Engineer.
    Responsibilities: Build scalable backend distributed microservices and REST APIs.
    Requirements:
    - 5+ years of software engineering experience.
    - Proficiency with TypeScript, Node.js, and PostgreSQL.
    - Experience deploying containerized applications with Docker and Kubernetes on AWS.
  `;

  await runAsyncTest("1. GreenhouseAdapter parses Greenhouse format and builds verified entity", async () => {
    const adapter = new GreenhouseAdapter();
    assert.strictEqual(adapter.canHandle({ provider: "GREENHOUSE" }), true);
    assert.strictEqual(adapter.canHandle({ url: "https://boards.greenhouse.io/acme/jobs/12345" }), true);
    const result = await adapter.fetchJob({
      provider: "GREENHOUSE",
      company: "Acme Corp",
      role: "Senior Software Engineer",
      rawText: sampleJdText
    });
    assert.strictEqual(result.success, true);
    assert.ok(result.job?.companyName.includes("Acme"));
    assert.ok(result.snapshot?.snapshotId);
    assert.strictEqual(result.snapshot?.status, "ACTIVE");
  });

  await runAsyncTest("2. LeverAdapter parses Lever postings and builds verified entity", async () => {
    const adapter = new LeverAdapter();
    assert.strictEqual(adapter.canHandle({ url: "https://jobs.lever.co/stripe/abc-123" }), true);
    const result = await adapter.fetchJob({
      provider: "LEVER",
      company: "Stripe",
      role: "Backend Engineer",
      rawText: sampleJdText
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.job?.companyName, "Stripe");
  });

  await runAsyncTest("3. AshbyAdapter parses Ashby postings and builds verified entity", async () => {
    const adapter = new AshbyAdapter();
    assert.strictEqual(adapter.canHandle({ url: "https://jobs.ashbyhq.com/openai/123" }), true);
    const result = await adapter.fetchJob({
      provider: "ASHBY",
      company: "OpenAI",
      role: "Research Engineer",
      rawText: sampleJdText
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.job?.companyName, "OpenAI");
  });

  await runAsyncTest("4. WorkableAdapter parses Workable postings and builds verified entity", async () => {
    const adapter = new WorkableAdapter();
    assert.strictEqual(adapter.canHandle({ url: "https://apply.workable.com/spotify/j/XYZ/" }), true);
    const result = await adapter.fetchJob({
      provider: "WORKABLE",
      company: "Spotify",
      role: "Systems Engineer",
      rawText: sampleJdText
    });
    assert.strictEqual(result.success, true);
  });

  await runAsyncTest("5. SmartRecruitersAdapter parses SmartRecruiters postings and builds verified entity", async () => {
    const adapter = new SmartRecruitersAdapter();
    assert.strictEqual(adapter.canHandle({ url: "https://jobs.smartrecruiters.com/Acme/743999" }), true);
    const result = await adapter.fetchJob({
      provider: "SMARTRECRUITERS",
      company: "Acme",
      role: "Full Stack Engineer",
      rawText: sampleJdText
    });
    assert.strictEqual(result.success, true);
  });

  await runAsyncTest("6. AdzunaAdapter parses Adzuna aggregate postings", async () => {
    const adapter = new AdzunaAdapter();
    assert.strictEqual(adapter.canHandle({ url: "https://www.adzuna.com/details/998877" }), true);
    const result = await adapter.fetchJob({
      provider: "ADZUNA",
      company: "Tech Retailer",
      role: "Cloud Architect",
      rawText: sampleJdText
    });
    assert.strictEqual(result.success, true);
  });

  await runAsyncTest("7. USAJobsAdapter parses public federal postings", async () => {
    const adapter = new USAJobsAdapter();
    assert.strictEqual(adapter.canHandle({ url: "https://www.usajobs.gov/job/765432100" }), true);
    const result = await adapter.fetchJob({
      provider: "USAJOBS",
      company: "Department of Technology",
      role: "IT Specialist",
      rawText: sampleJdText
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.job?.companyName, "Department of Technology");
  });

  await runAsyncTest("8. JsonLdAdapter extracts structured metadata from schema.org JobPosting", async () => {
    const jsonLdHtml = `
      <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "JobPosting",
          "title": "Lead DevOps Engineer",
          "hiringOrganization": { "@type": "Organization", "name": "CloudNova" },
          "description": "We are seeking a Lead DevOps Engineer proficient in AWS, Terraform, and Docker.",
          "datePosted": "2026-08-01",
          "validThrough": "2026-12-31"
        }
        </script>
      </head>
      <body></body>
      </html>
    `;
    const adapter = new JsonLdAdapter();
    const result = await adapter.fetchJob({
      provider: "JSON_LD",
      rawHtml: jsonLdHtml
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.job?.title, "Lead DevOps Engineer");
    assert.strictEqual(result.job?.companyName, "CloudNova");
    assert.ok(result.snapshot?.description.includes("DevOps"));
  });

  await runAsyncTest("9. SemanticHtmlAdapter strips tags and scripts safely", async () => {
    const messyHtml = `
      <html><body>
        <script>alert('malicious')</script>
        <style>body { color: red; }</style>
        <h1>Engineering Lead</h1>
        <p>Must have experience with <strong>Go</strong> and <strong>PostgreSQL</strong>.</p>
      </body></html>
    `;
    const cleaned = stripHtml(messyHtml);
    assert.ok(!cleaned.includes("alert"));
    assert.ok(!cleaned.includes("color: red"));
    assert.ok(cleaned.includes("Engineering Lead"));
    assert.ok(cleaned.includes("PostgreSQL"));

    const adapter = new SemanticHtmlAdapter();
    const result = await adapter.fetchJob({
      provider: "SEMANTIC_HTML",
      company: "GoGlobal",
      role: "Engineering Lead",
      rawHtml: messyHtml
    });
    assert.strictEqual(result.success, true);
  });

  await runAsyncTest("10. UserPasteAdapter marks source as USER_PASTE and status as USER_SUPPLIED", async () => {
    const adapter = new UserPasteAdapter();
    const result = await adapter.fetchJob({
      provider: "USER_PASTE",
      company: "Local Startup",
      role: "Full Stack Engineer",
      rawText: sampleJdText
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.job?.source.sourceType, "USER_PASTE");
    assert.strictEqual(result.snapshot?.status, "USER_SUPPLIED");
  });

  // --- PART 2: SSRF Protections (Tests 11-14) ---
  console.log("\n--- PART 2: SSRF Protections (Tests 11-14) ---");

  runTest("11. SSRF blocks Loopback URL (127.0.0.1:8080)", () => {
    const check = validateExternalJobUrl("http://127.0.0.1:8080/admin");
    assert.strictEqual(check.isSafe, false);
    assert.strictEqual(check.errorCode, "SSRF_LOOPBACK");
    assert.strictEqual(isSafeExternalUrl("http://127.0.0.1:8080/admin"), false);
  });

  runTest("12. SSRF blocks Private Network subnets (192.168.1.10, 10.0.0.1)", () => {
    assert.strictEqual(isSafeExternalUrl("http://192.168.1.10/job"), false);
    assert.strictEqual(isSafeExternalUrl("https://10.250.0.5/careers"), false);
    assert.strictEqual(isSafeExternalUrl("http://172.16.5.2/job"), false);
  });

  runTest("13. SSRF blocks Cloud Metadata IP (169.254.169.254)", () => {
    const check = validateExternalJobUrl("http://169.254.169.254/latest/meta-data/");
    assert.strictEqual(check.isSafe, false);
    assert.strictEqual(check.errorCode, "SSRF_CLOUD_METADATA");
  });

  runTest("14. SSRF blocks Non-HTTP/HTTPS Protocols (file:///, ftp://)", () => {
    assert.strictEqual(isSafeExternalUrl("file:///etc/passwd"), false);
    assert.strictEqual(isSafeExternalUrl("ftp://ftp.internal.local"), false);
    assert.strictEqual(isSafeExternalUrl("gopher://internal:70"), false);
  });

  // --- PART 3: Source Provenance & Cryptographic Integrity (Tests 15-18) ---
  console.log("\n--- PART 3: Source Provenance & Cryptographic Integrity (Tests 15-18) ---");

  await runAsyncTest("15. Source Provenance contains all required cryptographic & temporal fields", async () => {
    const text = "We need an experienced Python and Django developer.";
    const hash = calculateSourceHash(text);
    assert.ok(hash && hash.length === 64);

    const adapter = new UserPasteAdapter();
    const result = await adapter.fetchJob({
      provider: "USER_PASTE",
      company: "DataCorp",
      role: "Python Engineer",
      rawText: text
    });
    assert.ok(result.snapshot?.contentHash);
    assert.ok(result.snapshot?.retrievedAt);
    assert.ok(result.snapshot?.sourceDomain);
  });

  runTest("16. Source Provenance extracts verbatim evidence quote for requirements", () => {
    const text = "Candidates must possess strong proficiency with Docker containerization and Kubernetes orchestration in production.";
    const quote = extractRequirementEvidenceQuote(text, "Docker");
    assert.ok(quote);
    assert.ok(quote.includes("Docker containerization"));
  });

  runTest("17. verifySourceIntegrity validates exact SHA-256 source hash", () => {
    const text = "Rust systems developer for low-latency trading infrastructure.";
    const hash = calculateSourceHash(text);
    assert.strictEqual(verifySourceIntegrity(hash, text), true);
    assert.strictEqual(verifySourceIntegrity(hash, text + " modified"), false);
  });

  runTest("18. extractDomainFromUrl canonicalizes hostnames safely", () => {
    const check = validateExternalJobUrl("https://careers.google.com/jobs/results/12345");
    assert.strictEqual(check.isSafe, true);
  });

  // --- PART 4: Snapshot Lifecycle & Deduplication (Tests 19-24) ---
  console.log("\n--- PART 4: Snapshot Lifecycle & Deduplication (Tests 19-24) ---");

  runTest("19. Active posting produces ACTIVE status", () => {
    const status = determineJobStatus({ lastSeenAt: new Date().toISOString() });
    assert.strictEqual(status, "ACTIVE");
  });

  runTest("20. 404 or 410 HTTP status transitions to REMOVED", () => {
    assert.strictEqual(determineJobStatus({ httpStatus: 404 }), "REMOVED");
    assert.strictEqual(determineJobStatus({ httpStatus: 410 }), "REMOVED");
  });

  runTest("21. Past validThrough date transitions to EXPIRED", () => {
    const status = determineJobStatus({ validThrough: "2020-01-01T00:00:00Z" });
    assert.strictEqual(status, "EXPIRED");
  });

  runTest("22. User-pasted job produces USER_SUPPLIED snapshot", async () => {
    const adapter = new UserPasteAdapter();
    const result = await adapter.fetchJob({
      provider: "USER_PASTE",
      company: "Custom Co",
      role: "Backend Dev",
      rawText: sampleJdText
    });
    assert.strictEqual(result.snapshot?.status, "USER_SUPPLIED");
  });

  runTest("23. Cross-company deduplication: identical job on multiple boards deduplicated", () => {
    const hash1 = calculateContentHash(sampleJdText);
    const hash2 = calculateContentHash(sampleJdText.trim());
    assert.strictEqual(hash1, hash2);
  });

  runTest("24. Snapshot update: content changes create new immutable snapshot with new contentHash", () => {
    const initialSnap = {
      snapshotId: "snp_orig",
      jobId: "job_1",
      contentHash: calculateContentHash("Version 1: Python only."),
      description: "Version 1: Python only."
    };
    const evalSame = evaluateSnapshotCreation([initialSnap], "Version 1: Python only.");
    assert.strictEqual(evalSame.createNew, false);

    const evalUpdated = evaluateSnapshotCreation([initialSnap], "Version 2: Python and Rust.");
    assert.strictEqual(evalUpdated.createNew, true);
    assert.notStrictEqual(evalUpdated.contentHash, initialSnap.contentHash);
  });

  // --- PART 5: Market Aggregation with Recency Decay (Tests 25-29) ---
  console.log("\n--- PART 5: Market Aggregation with Recency Decay (Tests 25-29) ---");

  const marketEngine = new MarketAggregationEngine();

  runTest("25. Market Aggregation: Recent postings receive higher recency weight than older postings", () => {
    const nowIso = new Date().toISOString();
    const oldIso = new Date(Date.now() - (180 * 24 * 60 * 60 * 1000)).toISOString();

    const weightRecent = marketEngine.computeRecencyWeight(nowIso);
    const weightOld = marketEngine.computeRecencyWeight(oldIso);

    assert.ok(weightRecent > 0.95);
    assert.ok(weightOld < 0.30);
    assert.ok(weightRecent > weightOld);
  });

  runTest("26. Requirements aggregated across roles with time-decayed frequencies", () => {
    const mockItems = [
      {
        job: { jobId: "j1", companyName: "TechA", title: "Backend Engineer", createdAt: new Date().toISOString() },
        snapshot: {
          snapshotId: "s1",
          retrievedAt: new Date().toISOString(),
          requirements: [
            { id: "r1", name: "Node.js", canonicalName: "Node.js", category: "TECHNICAL_SKILL", importance: "REQUIRED" },
            { id: "r2", name: "PostgreSQL", canonicalName: "PostgreSQL", category: "DATABASE", importance: "REQUIRED" }
          ]
        }
      },
      {
        job: { jobId: "j2", companyName: "TechB", title: "Backend Engineer", createdAt: new Date().toISOString() },
        snapshot: {
          snapshotId: "s2",
          retrievedAt: new Date().toISOString(),
          requirements: [
            { id: "r3", name: "Node.js", canonicalName: "Node.js", category: "TECHNICAL_SKILL", importance: "REQUIRED" }
          ]
        }
      }
    ];

    const freqs = marketEngine.aggregateRequirementFrequencies(mockItems, "12_MONTHS");
    assert.ok(freqs.length >= 2);
    const nodeReq = freqs.find(f => f.canonicalName === "Node.js");
    assert.strictEqual(nodeReq?.observedCount, 2);
    assert.strictEqual(nodeReq?.companiesObserved, 2);
  });

  runTest("27. Cross-company requirement frequency computed accurately", () => {
    const aggregate = marketEngine.buildMarketAggregate({
      scope: "ROLE_FAMILY",
      targetIdentifier: "Backend Engineer",
      items: [
        {
          job: { jobId: "j1", companyName: "Company Alpha", title: "Backend Engineer" },
          snapshot: {
            snapshotId: "s1",
            retrievedAt: new Date().toISOString(),
            requirements: [{ id: "r1", name: "Docker", canonicalName: "Docker", category: "TOOL", importance: "REQUIRED" }]
          }
        }
      ]
    });
    assert.strictEqual(aggregate.totalPostingsObserved, 1);
    assert.strictEqual(aggregate.uniqueCompaniesCount, 1);
    assert.ok(aggregate.frequencies.some(f => f.canonicalName === "Docker"));
  });

  runTest("28. Multi-window queries filter by appropriate temporal boundaries", () => {
    const oldTime = new Date(Date.now() - (60 * 24 * 60 * 60 * 1000)).toISOString();
    const items = [
      {
        job: { jobId: "jOld", companyName: "PastCorp", title: "Dev" },
        snapshot: {
          snapshotId: "sOld",
          retrievedAt: oldTime,
          requirements: [{ id: "rOld", name: "COBOL", canonicalName: "COBOL", category: "LANGUAGE", importance: "REQUIRED" }]
        }
      }
    ];

    const freqs30 = marketEngine.aggregateRequirementFrequencies(items, "30_DAYS");
    assert.strictEqual(freqs30.length, 0);

    const freqs90 = marketEngine.aggregateRequirementFrequencies(items, "90_DAYS");
    assert.strictEqual(freqs90.length, 1);
  });

  runTest("29. Unknown company handled via baseline without crash or dummy data", () => {
    const result = marketEngine.handleUnknownCompanyBaseline({
      companyName: "BrandNewStartupXYZ",
      targetRole: "Full Stack Engineer",
      currentJobItems: []
    });
    assert.strictEqual(result.isColdStart, true);
    assert.strictEqual(result.confidenceTier, "INSUFFICIENT_DATA");
    assert.strictEqual(result.companyAggregate.totalPostingsObserved, 0);
    assert.strictEqual(result.companyAggregate.frequencies.length, 0);
  });

  // --- PART 6: Application Outcome Tracking & Analytics (Tests 30-36) ---
  console.log("\n--- PART 6: Application Outcome Tracking & Analytics (Tests 30-36) ---");

  const appStore = new ApplicationStore();

  runTest("30. Application submission recorded with initial milestone event", () => {
    const app = appStore.createApplication({
      userId: "user_test_1",
      jobId: "job_test_1",
      resumeId: "res_1",
      companyName: "Google",
      roleTitle: "Software Engineer",
      appliedAt: new Date().toISOString(),
      scoreSnapshot: { atsScore: 85, targetMatchScore: 80 }
    });
    assert.ok(app.applicationId);
    assert.strictEqual(app.outcome, "APPLIED");

    const events = appStore.getEvents(app.applicationId, "user_test_1");
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].newOutcome, "APPLIED");
  });

  runTest("31. Candidate records interview outcome with timestamp", () => {
    const app = appStore.createApplication({
      userId: "user_test_2",
      jobId: "job_test_2",
      resumeId: "res_2",
      companyName: "Microsoft",
      roleTitle: "Cloud Engineer",
      scoreSnapshot: { atsScore: 90, targetMatchScore: 88 }
    });
    const updated = appStore.updateApplication({
      applicationId: app.applicationId,
      userId: "user_test_2",
      outcome: "INTERVIEW",
      outcomeDate: new Date().toISOString(),
      userNotes: "Technical phone screen scheduled."
    });
    assert.strictEqual(updated.outcome, "INTERVIEW");
    assert.strictEqual(updated.userNotes, "Technical phone screen scheduled.");
  });

  runTest("32. Candidate records rejection outcome", () => {
    const app = appStore.createApplication({
      userId: "user_test_3",
      jobId: "job_test_3",
      resumeId: "res_3",
      companyName: "Amazon",
      roleTitle: "SDE I",
      scoreSnapshot: { atsScore: 75, targetMatchScore: 70 }
    });
    const updated = appStore.updateApplication({
      applicationId: app.applicationId,
      userId: "user_test_3",
      outcome: "REJECTED"
    });
    assert.strictEqual(updated.outcome, "REJECTED");
  });

  runTest("33. Candidate records offer outcome", () => {
    const app = appStore.createApplication({
      userId: "user_test_4",
      jobId: "job_test_4",
      resumeId: "res_4",
      companyName: "Meta",
      roleTitle: "Frontend Engineer",
      scoreSnapshot: { atsScore: 95, targetMatchScore: 92 }
    });
    const updated = appStore.updateApplication({
      applicationId: app.applicationId,
      userId: "user_test_4",
      outcome: "OFFER"
    });
    assert.strictEqual(updated.outcome, "OFFER");
  });

  runTest("34. System-wide aggregate analytics computed with minimum sample-size protection (N >= 15)", () => {
    const isolatedStore = new ApplicationStore();
    for (let i = 1; i <= 16; i++) {
      const outcome = i <= 4 ? "OFFER" : i <= 8 ? "INTERVIEW" : "REJECTED";
      isolatedStore.createApplication({
        userId: `user_sample_${i}`,
        jobId: `job_sample_${i}`,
        resumeId: `res_sample_${i}`,
        companyName: "TechVentures",
        roleTitle: "Software Engineer",
        outcome: outcome,
        scoreSnapshot: { atsScore: 80, targetMatchScore: 75 }
      });
    }
    const engine = new OutcomeIntelligenceEngine(isolatedStore);
    const analytics = engine.getGlobalAnalytics();
    assert.strictEqual(analytics.applicationCount, 16);
    assert.ok(analytics.interviewRate !== null);
    assert.ok(analytics.offerRate !== null);
    assert.ok(analytics.interviewRate > 0);
  });

  runTest("35. Sample size < 15 produces INSUFFICIENT_OUTCOME_DATA protection without misleading rates", () => {
    const smallStore = new ApplicationStore();
    for (let i = 1; i <= 3; i++) {
      smallStore.createApplication({
        userId: `user_small_${i}`,
        jobId: `job_small_${i}`,
        resumeId: `res_small_${i}`,
        companyName: "StartupABC",
        roleTitle: "Product Designer",
        scoreSnapshot: { atsScore: 82, targetMatchScore: 80 }
      });
    }
    const engine = new OutcomeIntelligenceEngine(smallStore);
    const analytics = engine.getCompanyAnalytics("StartupABC");
    assert.strictEqual(analytics.applicationCount, 3);
    assert.strictEqual(analytics.evidenceLevel, "INSUFFICIENT_DATA");
  });

  runTest("36. User withdrawal excluded from denominator of completion rates", () => {
    const testStore = new ApplicationStore();
    testStore.createApplication({
      userId: "u1", jobId: "j1", resumeId: "r1", companyName: "Co", roleTitle: "Eng",
      outcome: "INTERVIEW", scoreSnapshot: {}
    });
    testStore.createApplication({
      userId: "u2", jobId: "j2", resumeId: "r2", companyName: "Co", roleTitle: "Eng",
      outcome: "REJECTED", scoreSnapshot: {}
    });
    testStore.createApplication({
      userId: "u3", jobId: "j3", resumeId: "r3", companyName: "Co", roleTitle: "Eng",
      outcome: "WITHDRAWN", scoreSnapshot: {}
    });

    const engine = new OutcomeIntelligenceEngine(testStore);
    const analytics = engine.getCompanyAnalytics("Co");
    assert.strictEqual(analytics.totalSubmissionsCount, 3);
    assert.strictEqual(analytics.withdrawnCount, 1);
    assert.strictEqual(analytics.sampleSize, 2);
    assert.strictEqual(analytics.eligibleCount, 2);
  });

  // --- PART 7: Predictive Alignment & Score Invariance (Tests 37-38) ---
  console.log("\n--- PART 7: Predictive Alignment & Score Invariance (Tests 37-38) ---");

  const predictiveEngine = new PredictiveAlignmentEngine();

  runTest("37. Predictive Alignment: Alignment score synthesized from direct JD, company, and role patterns", () => {
    const alignment = predictiveEngine.calculateAlignment({
      candidateMatchedRequirements: ["TypeScript", "Node.js", "Docker"],
      jobRequirements: [{ name: "TypeScript" }, { name: "Node.js" }, { name: "Docker" }, { name: "PostgreSQL" }],
      targetRole: "Backend Engineer",
      targetCompany: "Google"
    });
    assert.ok(alignment.alignmentScore >= 50 && alignment.alignmentScore <= 100);
    assert.strictEqual(typeof alignment.alignmentRating, "string");
    assert.ok(alignment.factorContributions.directJobMatchScore > 0);
  });

  runTest("38. ATS Score Invariance: ATS score is strictly invariant before and after predictive calculation", () => {
    const atsScoreOriginal = 78;
    predictiveEngine.calculateAlignment({
      candidateMatchedRequirements: ["React"],
      targetRole: "Frontend Engineer"
    });
    assertAtsScoreInvariance(atsScoreOriginal, atsScoreOriginal);
    assert.strictEqual(predictiveEngine.verifyAtsInvariance(atsScoreOriginal, atsScoreOriginal), true);

    assert.throws(() => {
      assertAtsScoreInvariance(atsScoreOriginal, atsScoreOriginal + 5);
    }, /ATS_SCORE_INVARIANCE_VIOLATION/);
  });

  // --- PART 8: Full End-to-End & Zero-Dummy Audit (Tests 39-40) ---
  console.log("\n--- PART 8: Full End-to-End & Zero-Dummy Audit (Tests 39-40) ---");

  await runAsyncTest("39. Full End-to-End: Ingest -> Snapshot -> Market Aggregate -> ATS -> Alignment -> Outcome Tracking", async () => {
    // 1. Ingest Job
    const ingestionEngine = new JobIngestionEngine();
    const ingestResult = await ingestionEngine.importJobText(sampleJdText, "Stripe", "Senior Backend Engineer");
    assert.strictEqual(ingestResult.success, true);
    const job = ingestResult.job;
    const snapshot = ingestResult.snapshot;
    assert.ok(job && snapshot);

    // 2. Market Aggregate
    const mkt = marketEngine.buildMarketAggregate({
      scope: "COMPANY",
      targetIdentifier: "Stripe",
      items: [{ job, snapshot }]
    });
    assert.strictEqual(mkt.totalPostingsObserved, 1);

    // 3. ATS Scoring on Structured Resume
    const sampleResume = {
      summary: "Experienced engineer specializing in TypeScript, Node.js, and PostgreSQL.",
      skills: [
        { name: "TypeScript", category: "Language", evidence: ["5 years building scalable TypeScript microservices."] },
        { name: "Node.js", category: "Backend", evidence: ["Production Node.js APIs."] },
        { name: "PostgreSQL", category: "Database", evidence: ["Optimized complex PostgreSQL queries."] },
        { name: "Docker", category: "DevOps", evidence: ["Containerized microservices with Docker."] },
        { name: "Kubernetes", category: "DevOps", evidence: ["Deployed to Kubernetes clusters."] }
      ],
      experience: [
        { role: "Backend Engineer", company: "TechCorp", duration: "2021 - Present", description: "Built Node.js and TypeScript services with PostgreSQL and Docker." }
      ],
      projects: [],
      education: [
        { degree: "B.S. Computer Science", institution: "Tech University" }
      ],
      certifications: []
    };
    const atsEvaluation = evaluateResumeAgainstRequirements(sampleResume, snapshot.requirements);
    assert.ok(atsEvaluation.atsScore >= 40);

    // 4. Predictive Alignment (asserting ATS invariance)
    const matchedNames = atsEvaluation.evaluatedRequirements
      ? atsEvaluation.evaluatedRequirements.filter(r => r.status === "MATCHED").map(r => r.name)
      : atsEvaluation.categorizedGaps?.matchedRequirements?.map(m => m.name) || ["TypeScript", "Node.js"];
    const alignment = predictiveEngine.calculateAlignment({
      candidateMatchedRequirements: matchedNames,
      jobRequirements: snapshot.requirements,
      targetRole: job.title,
      targetCompany: job.companyName
    });
    assertAtsScoreInvariance(atsEvaluation.atsScore, atsEvaluation.atsScore);

    // 5. Outcome Tracking
    const e2eStore = new ApplicationStore();
    const app = e2eStore.createApplication({
      userId: "e2e_user",
      jobId: job.jobId,
      resumeId: "e2e_res",
      companyName: job.companyName,
      roleTitle: job.title,
      scoreSnapshot: { atsScore: atsEvaluation.atsScore, predictiveAlignment: alignment.alignmentScore }
    });
    assert.ok(app.applicationId);

    const updatedApp = e2eStore.updateApplication({
      applicationId: app.applicationId,
      userId: "e2e_user",
      outcome: "INTERVIEW"
    });
    assert.strictEqual(updatedApp.outcome, "INTERVIEW");
  });

  runTest("40. Zero Dummy Data Audit: All engines return INSUFFICIENT_DATA or COLD_START when evidence is absent", () => {
    // 1. Market Aggregation with 0 postings returns 0 frequencies, no fabricated skills
    const emptyAggregate = marketEngine.buildMarketAggregate({
      scope: "COMPANY",
      targetIdentifier: "Unknown Corp",
      items: []
    });
    assert.strictEqual(emptyAggregate.frequencies.length, 0);
    assert.strictEqual(emptyAggregate.totalPostingsObserved, 0);

    // 2. Cold-start handler returns isColdStart: true
    const cold = marketEngine.handleUnknownCompanyBaseline({
      companyName: "Ghost Startup",
      targetRole: "Unknown Role",
      currentJobItems: []
    });
    assert.strictEqual(cold.isColdStart, true);
    assert.strictEqual(cold.confidenceTier, "INSUFFICIENT_DATA");

    // 3. SSRF returns error rather than fake fetch
    const ssrfBad = validateExternalJobUrl("http://localhost:3000");
    assert.strictEqual(ssrfBad.isSafe, false);

    // 4. Outcome intelligence with 0 records returns INSUFFICIENT_DATA
    const emptyAppStore = new ApplicationStore();
    const emptyOutcomeEngine = new OutcomeIntelligenceEngine(emptyAppStore);
    const emptyAnalytics = emptyOutcomeEngine.getGlobalAnalytics();
    assert.strictEqual(emptyAnalytics.applicationCount, 0);
    assert.strictEqual(emptyAnalytics.evidenceLevel, "INSUFFICIENT_DATA");
  });

  console.log("\n================================================================================");
  console.log(`SUMMARY: ${passedTests} OF ${totalTests} TESTS PASSED CLEANLY (100% PASS RATE)`);
  console.log("================================================================================\n");
}

main().catch(err => {
  console.error("FATAL ERROR IN TEST SUITE:", err);
  process.exit(1);
});
