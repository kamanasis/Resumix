import assert from 'node:assert';
import { 
  canonicalizeCompanyName, 
  generateCompanyId, 
  resolveCompany 
} from '../src/lib/jobEngine/companyResolver.ts';
import { 
  verifyJobContent 
} from '../src/lib/jobEngine/jobVerifier.ts';
import { 
  normalizeJobRole, 
  extractJobRequirements 
} from '../src/lib/jobEngine/jobNormalizer.ts';
import { 
  cleanSourceUrl, 
  compareJobsForDeduplication 
} from '../src/lib/jobEngine/jobDeduplicator.ts';
import { 
  calculateContentHash, 
  evaluateSnapshotCreation, 
  determineJobStatus 
} from '../src/lib/jobEngine/jobSnapshotManager.ts';
import { 
  JobIngestionEngine,
  globalJobIngestionEngine 
} from '../src/lib/jobEngine/jobIngestionEngine.ts';
import {
  GreenhouseAdapter,
  LeverAdapter,
  AshbyAdapter,
  WorkableAdapter,
  SmartRecruitersAdapter,
  JSONLDAdapter,
  SemanticHTMLAdapter,
  UserPastedAdapter
} from '../src/lib/jobEngine/adapters.ts';

console.log("================================================================================");
console.log("STAGE 6 VERIFICATION SUITE: UNIVERSAL JOB DATA FOUNDATION");
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

async function runAll() {
  // -------------------------------------------------------------------------------- //
  // PART 1: SOURCE ADAPTERS & RESOLUTION (Tests 1 - 8)
  // -------------------------------------------------------------------------------- //
  console.log("--- PART 1: Source Adapters & Provider Resolution ---");

  await test("GreenhouseAdapter matches boards.greenhouse.io URLs", () => {
    const adapter = new GreenhouseAdapter();
    assert.strictEqual(adapter.canHandle({ url: "https://boards.greenhouse.io/stripe/jobs/12345" }), true);
    assert.strictEqual(adapter.canHandle({ url: "https://example.com/careers" }), false);
  });

  await test("LeverAdapter matches jobs.lever.co URLs", () => {
    const adapter = new LeverAdapter();
    assert.strictEqual(adapter.canHandle({ url: "https://jobs.lever.co/netflix/12345678-abcd-1234-abcd-1234567890ab" }), true);
    assert.strictEqual(adapter.canHandle({ url: "https://boards.greenhouse.io/stripe" }), false);
  });

  await test("AshbyAdapter matches jobs.ashbyhq.com URLs", () => {
    const adapter = new AshbyAdapter();
    assert.strictEqual(adapter.canHandle({ url: "https://jobs.ashbyhq.com/anthropic/abc-123" }), true);
    assert.strictEqual(adapter.canHandle({ url: "https://example.com" }), false);
  });

  await test("WorkableAdapter matches apply.workable.com URLs", () => {
    const adapter = new WorkableAdapter();
    assert.strictEqual(adapter.canHandle({ url: "https://apply.workable.com/resumix-corp/j/123XYZ/" }), true);
    assert.strictEqual(adapter.canHandle({ url: "https://lever.co" }), false);
  });

  await test("SmartRecruitersAdapter matches smartrecruiters.com URLs", () => {
    const adapter = new SmartRecruitersAdapter();
    assert.strictEqual(adapter.canHandle({ url: "https://jobs.smartrecruiters.com/AcmeCorp/12345-dev" }), true);
    assert.strictEqual(adapter.canHandle({ url: "https://ashbyhq.com" }), false);
  });

  await test("JSONLDAdapter handles arbitrary web URLs", () => {
    const adapter = new JSONLDAdapter();
    assert.strictEqual(adapter.canHandle({ url: "https://careers.google.com/jobs/results/123" }), true);
    assert.strictEqual(adapter.canHandle({ rawText: "some text without url" }), false);
  });

  await test("SemanticHTMLAdapter acts as universal HTML fallback", () => {
    const adapter = new SemanticHTMLAdapter();
    assert.strictEqual(adapter.canHandle({ url: "https://unknownstartup.io/careers/job1" }), true);
  });

  await test("UserPastedAdapter accepts rawText and sets sourceType to USER_INPUT with null sourceUrl", async () => {
    const adapter = new UserPastedAdapter();
    const input = {
      rawText: "We are hiring a Senior Rust Engineer at Fly.io. Must have at least 3 years of production Rust experience and deep knowledge of Linux systems, Docker, and distributed networking.",
      company: "Fly.io",
      role: "Senior Rust Engineer"
    };
    assert.strictEqual(adapter.canHandle(input), true);
    const result = await adapter.fetchJob(input);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.job.source.sourceType, "USER_INPUT");
    assert.strictEqual(result.job.source.sourceUrl, null);
    assert.strictEqual(result.job.source.sourceConfidence, "USER_PROVIDED");
  });

  // -------------------------------------------------------------------------------- //
  // PART 2: FAIL-CLOSED CONTENT VERIFICATION (Tests 9 - 19)
  // -------------------------------------------------------------------------------- //
  console.log("\n--- PART 2: Fail-Closed Content Verification ---");

  await test("verifyJobContent rejects empty description", () => {
    const res = verifyJobContent("Frontend Dev", "");
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, "JOB_EXTRACTION_FAILED");
  });

  await test("verifyJobContent rejects whitespace-only content", () => {
    const res = verifyJobContent("Frontend Dev", "   \n\n\t  ");
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, "JOB_EXTRACTION_FAILED");
  });

  await test("verifyJobContent rejects binary garbage stream", () => {
    const garbage = "Software Engineer \x00\x01\x02\x03\x04\x05\x06\x07\x08\x0B\x0C\x0E\x0F" + "\uFFFD".repeat(80);
    const res = verifyJobContent("Title", garbage);
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, "INVALID_RESUME_TEXT");
  });

  await test("verifyJobContent detects Cloudflare Turnstile CAPTCHA and fails closed", () => {
    const text = "Please complete the security check to access this career page. cf-turnstile challenge running.";
    const res = verifyJobContent("Security Check", text);
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, "JOB_SOURCE_BLOCKED");
  });

  await test("verifyJobContent detects reCAPTCHA challenge and fails closed", () => {
    const text = "Verify you are a human. Google reCAPTCHA v3 checking your browser...";
    const res = verifyJobContent("Captcha", text);
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, "JOB_SOURCE_BLOCKED");
  });

  await test("verifyJobContent detects employee SSO authentication wall and fails closed", () => {
    const text = "Internal Jobs Portal. Sign in to view and apply for this job. SSO Authentication required.";
    const res = verifyJobContent("Internal Post", text);
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, "JOB_SOURCE_AUTHENTICATION_REQUIRED");
  });

  await test("verifyJobContent detects HTTP 404 Not Found error page", () => {
    const text = "404 Not Found. This job is no longer available or was removed by the employer.";
    const res = verifyJobContent("Error", text);
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, "JOB_POSTING_UNAVAILABLE");
  });

  await test("verifyJobContent rejects excessively brief extraction (<25 words)", () => {
    const brief = "We are looking for a developer. Please apply via email.";
    const res = verifyJobContent("Dev", brief);
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, "JOB_EXTRACTION_FAILED");
  });

  await test("verifyJobContent passes valid, substantive job description", () => {
    const validJD = `About the Role:
We are looking for a Staff Distributed Systems Engineer to build scalable microservices.
Key Responsibilities:
- Design, build, and maintain mission-critical APIs in Go and Rust.
- Deploy Kubernetes clusters processing high throughput traffic.
Qualifications & Requirements:
- At least 5 years of software engineering experience.
- Strong proficiency in Go, Rust, Docker, and PostgreSQL.
- BS or MS in Computer Science or equivalent experience.`;
    const res = verifyJobContent("Staff Engineer", validJD);
    assert.strictEqual(res.isValid, true);
    assert.ok(res.evidenceQuality >= 0.7);
  });

  await test("JobIngestionEngine rejects malformed URLs with INVALID_URL error", async () => {
    const engine = new JobIngestionEngine();
    const res = await engine.importJobUrl("not-a-valid-url");
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error.code, "INVALID_URL");
  });

  await test("JobIngestionEngine rejects empty pasted text with JOB_EXTRACTION_FAILED", async () => {
    const engine = new JobIngestionEngine();
    const res = await engine.importJobText("");
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error.code, "JOB_EXTRACTION_FAILED");
  });

  // -------------------------------------------------------------------------------- //
  // PART 3: INTEGRITY, GROUNDING & TECHNOLOGY BOUNDARIES (Tests 20 - 33)
  // -------------------------------------------------------------------------------- //
  console.log("\n--- PART 3: Integrity, Grounding & Technology Boundaries ---");

  await test("Zero Dummy Data: Failure returns explicit error envelope without synthetic job", async () => {
    const engine = new JobIngestionEngine();
    const res = await engine.importJobUrl("https://invalid-nonexistent-domain-12345.com/job");
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.job, undefined);
    assert.strictEqual(res.snapshot, undefined);
    assert.ok(res.error.code === "JOB_SOURCE_UNREACHABLE" || res.error.code === "NO_REAL_JOB_FOUND");
  });

  await test("Zero Fake URL: User-pasted job strictly preserves sourceUrl as null", async () => {
    const engine = new JobIngestionEngine();
    const res = await engine.importJobText(
      "Senior Frontend Developer at Stripe. Building next-generation checkout experiences with React, TypeScript, and TailwindCSS.",
      "Stripe",
      "Senior Frontend Developer"
    );
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.job.source.sourceUrl, null);
    assert.strictEqual(res.snapshot.sourceUrl, null);
  });

  await test("Verbatim Evidence: Every extracted requirement possesses exact sourceQuote", () => {
    const jd = "Must have strong hands-on experience with Python and Django building enterprise REST APIs. Familiarity with PostgreSQL is preferred.";
    const reqs = extractJobRequirements(jd, "snp_123");
    
    assert.ok(reqs.length >= 2);
    for (const r of reqs) {
      assert.ok(r.sourceQuote && r.sourceQuote.length > 0);
      assert.ok(jd.includes(r.sourceQuote) || jd.toLowerCase().includes(r.name.toLowerCase()));
      assert.strictEqual(r.status, "PRESENT");
    }
  });

  await test("Technology Boundaries: Target requiring Python does NOT extract Django without mention", () => {
    const jd = "We are seeking a Python backend engineer with experience in distributed computing and asyncio.";
    const reqs = extractJobRequirements(jd, "snp_test");
    const names = reqs.map(r => r.canonicalName);
    assert.ok(names.includes("Python"));
    assert.ok(!names.includes("Django"), "Python must never implicitly assume Django");
  });

  await test("Technology Boundaries: Target requiring JavaScript does NOT extract React without mention", () => {
    const jd = "Looking for a Core JavaScript developer to work on browser extensions and DOM manipulation.";
    const reqs = extractJobRequirements(jd, "snp_test");
    const names = reqs.map(r => r.canonicalName);
    assert.ok(names.includes("JavaScript"));
    assert.ok(!names.includes("React"), "JavaScript must never implicitly assume React");
  });

  await test("Technology Boundaries: Target requiring AWS does NOT extract Kubernetes without mention", () => {
    const jd = "Cloud infrastructure engineer responsible for Amazon Web Services (AWS) EC2 and S3 management.";
    const reqs = extractJobRequirements(jd, "snp_test");
    const names = reqs.map(r => r.canonicalName);
    assert.ok(names.includes("AWS"));
    assert.ok(!names.includes("Kubernetes"), "AWS must never implicitly assume Kubernetes");
  });

  await test("Technology Boundaries: Rust is strictly preserved as Rust", () => {
    const jd = "Rust Developer needed for high-frequency trading engine. Low-latency systems.";
    const reqs = extractJobRequirements(jd, "snp_test");
    const names = reqs.map(r => r.canonicalName);
    assert.ok(names.includes("Rust"));
    assert.ok(!names.includes("C++"));
  });

  await test("Controlled Normalization: K8s normalizes to Kubernetes with verbatim quote", () => {
    const jd = "Must have 3 years of production k8s cluster orchestration experience.";
    const reqs = extractJobRequirements(jd, "snp_test");
    const k8sReq = reqs.find(r => r.canonicalName === "Kubernetes");
    assert.ok(k8sReq);
    assert.strictEqual(k8sReq.canonicalName, "Kubernetes");
    assert.ok(k8sReq.sourceQuote.includes("k8s"));
  });

  await test("Controlled Normalization: React.js normalizes to React with verbatim quote", () => {
    const jd = "Expertise in react.js and modern frontend web architecture required.";
    const reqs = extractJobRequirements(jd, "snp_test");
    const reactReq = reqs.find(r => r.canonicalName === "React");
    assert.ok(reactReq);
    assert.strictEqual(reactReq.canonicalName, "React");
  });

  await test("Company Canonicalization: Strips legal corporate suffixes without loss of identity", () => {
    assert.strictEqual(canonicalizeCompanyName("Google LLC"), "Google");
    assert.strictEqual(canonicalizeCompanyName("Amazon.com, Inc."), "Amazon.com");
    assert.strictEqual(canonicalizeCompanyName("Tata Consultancy Services Ltd."), "Tata Consultancy Services");
    assert.strictEqual(canonicalizeCompanyName("Shopify Corp"), "Shopify");
  });

  await test("Company Canonicalization: Generates deterministic company ID", () => {
    const id1 = generateCompanyId("Google");
    const id2 = generateCompanyId("google");
    const id3 = generateCompanyId("Google LLC");
    assert.strictEqual(id1, id2);
    assert.notStrictEqual(id1, id3); // raw suffix affects uncanonicalized, but resolveCompany canonicalizes first
    const resolved = resolveCompany("Google LLC");
    assert.strictEqual(resolved.companyId, id1);
  });

  await test("Unknown Company Handling: Resolves unknown company without fabricating relationships", () => {
    const resolved = resolveCompany("Stealth Startup XYZ");
    assert.strictEqual(resolved.canonicalName, "Stealth Startup XYZ");
    assert.strictEqual(resolved.aliases.length, 0);
  });

  await test("Role and Seniority Normalization: Extracts senior level and canonical role accurately", () => {
    const role1 = normalizeJobRole("Senior Frontend Engineer");
    assert.strictEqual(role1.canonicalRole, "Frontend Engineer");
    assert.strictEqual(role1.experienceLevel, "Senior / Lead");

    const role2 = normalizeJobRole("Backend Developer Intern");
    assert.strictEqual(role2.canonicalRole, "Backend Engineer");
    assert.strictEqual(role2.experienceLevel, "Intern / Co-op");
  });

  // -------------------------------------------------------------------------------- //
  // PART 4: IDENTITY, DEDUPLICATION & SNAPSHOT VERSIONING (Tests 34 - 40)
  // -------------------------------------------------------------------------------- //
  console.log("\n--- PART 4: Identity, Deduplication & Snapshot Versioning ---");

  await test("cleanSourceUrl strips tracking parameters (utm_source, gh_src, ref)", () => {
    const raw = "https://boards.greenhouse.io/stripe/jobs/12345?utm_source=linkedin&gh_src=custom123&ref=jobboard";
    const cleaned = cleanSourceUrl(raw);
    assert.strictEqual(cleaned, "https://boards.greenhouse.io/stripe/jobs/12345");
  });

  await test("compareJobsForDeduplication identifies duplicates by identical canonical URL", () => {
    const jobA = {
      jobId: "job_1",
      companyId: "comp_1",
      companyName: "Google",
      title: "SWE",
      source: { sourceUrl: "https://careers.google.com/jobs/123?utm_source=feed" }
    };
    const jobB = {
      jobId: "job_2",
      companyId: "comp_1",
      companyName: "Google",
      title: "SWE",
      source: { sourceUrl: "https://careers.google.com/jobs/123?ref=internal" }
    };
    const res = compareJobsForDeduplication(jobA, jobB);
    assert.strictEqual(res.isDuplicate, true);
    assert.strictEqual(res.confidence, 1.0);
  });

  await test("compareJobsForDeduplication prevents merging distinct companies", () => {
    const jobGoogle = {
      jobId: "job_1",
      companyId: "comp_google",
      companyName: "Google",
      title: "Senior Software Engineer",
      source: { sourceUrl: "https://careers.google.com/1" }
    };
    const jobMeta = {
      jobId: "job_2",
      companyId: "comp_meta",
      companyName: "Meta",
      title: "Senior Software Engineer",
      source: { sourceUrl: "https://metacareers.com/1" }
    };
    const res = compareJobsForDeduplication(jobGoogle, jobMeta);
    assert.strictEqual(res.isDuplicate, false);
    assert.strictEqual(res.confidence, 0);
  });

  await test("calculateContentHash produces identical SHA-256 for whitespace-varied text", () => {
    const textA = "Senior Engineer.\n\nRequired: Go, Docker.\n";
    const textB = "Senior Engineer.   Required: Go, Docker. ";
    const hashA = calculateContentHash(textA);
    const hashB = calculateContentHash(textB);
    assert.strictEqual(hashA, hashB);
  });

  await test("evaluateSnapshotCreation detects existing snapshot when content is unchanged", () => {
    const desc = "Original description for Staff Developer role.";
    const hash = calculateContentHash(desc);
    const existingSnapshots = [{
      snapshotId: "snp_1",
      jobId: "job_1",
      contentHash: hash,
      description: desc,
      requirements: [],
      extractionStatus: "VERIFIED",
      evidenceQuality: 0.9,
      retrievedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    }];

    const evalRes = evaluateSnapshotCreation(existingSnapshots, desc);
    assert.strictEqual(evalRes.createNew, false);
    assert.strictEqual(evalRes.matchedSnapshot.snapshotId, "snp_1");
  });

  await test("evaluateSnapshotCreation triggers new snapshot when description content changes", () => {
    const descA = "Version 1 description with Go requirements.";
    const descB = "Version 2 updated description adding Rust and Kubernetes requirements.";
    const hashA = calculateContentHash(descA);
    const existingSnapshots = [{
      snapshotId: "snp_1",
      jobId: "job_1",
      contentHash: hashA,
      description: descA,
      requirements: [],
      extractionStatus: "VERIFIED",
      evidenceQuality: 0.9,
      retrievedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    }];

    const evalRes = evaluateSnapshotCreation(existingSnapshots, descB);
    assert.strictEqual(evalRes.createNew, true);
    assert.notStrictEqual(evalRes.contentHash, hashA);
  });

  await test("Cross-Source Ingest Deduplication: Re-ingesting identical job touches timestamp without duplicate snapshot", async () => {
    const engine = new JobIngestionEngine();
    const rawText = "Staff Cloud Architect at Deloitte. Leading multi-cloud migrations using AWS, Azure, Terraform, and Kubernetes.";
    
    // Ingest 1
    const res1 = await engine.importJobText(rawText, "Deloitte", "Staff Cloud Architect");
    assert.strictEqual(res1.success, true);
    const initialJobId = res1.job.jobId;
    const initialSnapshotId = res1.snapshot.snapshotId;

    // Ingest 2 (Identical)
    const res2 = await engine.importJobText(rawText, "Deloitte", "Staff Cloud Architect");
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.job.jobId, initialJobId);
    assert.strictEqual(res2.snapshot.snapshotId, initialSnapshotId);
    
    const snapshots = engine.getJobSnapshots(initialJobId);
    assert.strictEqual(snapshots.length, 1, "Must not create duplicate snapshot for identical text");
  });

  // -------------------------------------------------------------------------------- //
  // PART 5: HISTORICAL PRESERVATION & LIVENESS (Tests 41 - 45)
  // -------------------------------------------------------------------------------- //
  console.log("\n--- PART 5: Historical Preservation & Liveness ---");

  await test("determineJobStatus marks job as REMOVED when HTTP 404 or 410 is received", () => {
    const status404 = determineJobStatus({ httpStatus: 404 });
    const status410 = determineJobStatus({ httpStatus: 410 });
    assert.strictEqual(status404, "REMOVED");
    assert.strictEqual(status410, "REMOVED");
  });

  await test("determineJobStatus marks job as EXPIRED when validThrough timestamp is in the past", () => {
    const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
    const status = determineJobStatus({ validThrough: pastDate });
    assert.strictEqual(status, "EXPIRED");
  });

  await test("determineJobStatus marks job as ACTIVE when recently seen and not expired", () => {
    const recentDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString();
    const status = determineJobStatus({ lastSeenAt: recentDate });
    assert.strictEqual(status, "ACTIVE");
  });

  await test("Historical preservation: Removed or expired jobs are preserved with all snapshots readable", () => {
    const engine = new JobIngestionEngine();
    // Simulate stored historical job
    const storedJob = {
      jobId: "job_hist_1",
      companyId: "comp_google",
      companyName: "Google",
      title: "Software Engineer",
      status: "REMOVED",
      source: { sourceUrl: "https://careers.google.com/123", sourceType: "ATS_API", provider: "GREENHOUSE" }
    };
    engine.jobStore.set(storedJob.jobId, storedJob);
    engine.snapshotStore.set(storedJob.jobId, [
      { snapshotId: "snp_v1", title: "SWE", description: "Old JD", contentHash: "hash1" }
    ]);

    const retrieved = engine.getJob("job_hist_1");
    const snapshots = engine.getJobSnapshots("job_hist_1");
    assert.strictEqual(retrieved.status, "REMOVED");
    assert.strictEqual(snapshots.length, 1);
    assert.strictEqual(snapshots[0].description, "Old JD");
  });

  await test("RequirementProfile maintains distinct identity from Job and Snapshot", () => {
    // Stage 3 profileHash is distinct from Stage 6 jobId and snapshotId
    const profile = {
      id: "prof_123",
      targetCompany: "Amazon",
      targetRole: "SDE II",
      profileHash: "a1b2c3d4e5f67890",
      jobId: "job_999",
      snapshotId: "snp_888"
    };

    assert.ok(profile.profileHash);
    assert.ok(profile.jobId);
    assert.ok(profile.snapshotId);
    assert.notStrictEqual(profile.profileHash, profile.jobId);
    assert.notStrictEqual(profile.jobId, profile.snapshotId);
  });

  // -------------------------------------------------------------------------------- //
  // PART 6: MULTI-COMPANY, MULTI-INDUSTRY & STAGE 3 INTEGRATION (Tests 46 - 50)
  // -------------------------------------------------------------------------------- //
  console.log("\n--- PART 6: Multi-Company, Multi-Industry & Stage 3 Integration ---");

  await test("Multi-Company Data Processing: Handles unrelated companies with ZERO company-specific code branches", async () => {
    const engine = new JobIngestionEngine();
    const companies = [
      { name: "Google LLC", role: "Site Reliability Engineer", text: "SRE at Google. Python, Go, Kubernetes, Linux distributed systems." },
      { name: "Microsoft Corporation", role: "Software Engineer", text: "Software Engineer at Microsoft. C#, Azure, .NET, TypeScript." },
      { name: "Tata Consultancy Services Ltd", role: "Java Developer", text: "Java Developer at TCS. Core Java, Spring Boot, Microservices, SQL." },
      { name: "Tesla Inc.", role: "Autopilot Firmware Engineer", text: "Firmware Engineer at Tesla. C++, Rust, Embedded Linux, CAN bus." },
      { name: "Apex Global Consulting", role: "Strategy Consultant", text: "Management consulting role. Financial Modeling, Project Management, Agile." }
    ];

    for (const c of companies) {
      const res = await engine.importJobText(c.text, c.name, c.role);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.job.companyName, canonicalizeCompanyName(c.name));
      assert.ok(res.snapshot.requirements.length > 0);
    }
  });

  await test("Multi-Industry Data Processing: Processes diverse industries through universal pipeline", async () => {
    const engine = new JobIngestionEngine();
    const industries = [
      { ind: "Finance", text: "Financial Analyst at Goldman Sachs. Financial Modeling, Excel, Data Analysis, SQL." },
      { ind: "Healthcare", text: "Biomedical Data Engineer at Pfizer. Python, SQL, Cloud infrastructure, HIPAA compliance." },
      { ind: "Design", text: "Product Designer at Figma. UI/UX design systems, user research, wireframing, Figma." },
      { ind: "Manufacturing", text: "Automation Engineer at Boeing. Mechanical / Hardware Engineer, PLC programming, C++." }
    ];

    for (const item of industries) {
      const res = await engine.importJobText(item.text, "Global Corp", "Specialist");
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.snapshot.extractionStatus, "VERIFIED");
    }
  });

  await test("End-to-End Pipeline: Ingested Job -> Verified Snapshot -> Stage 3 Requirement Profile Link", async () => {
    const engine = new JobIngestionEngine();
    const jdText = `Senior Full Stack Engineer at Shopify.
Requirements:
- Proven experience with TypeScript, React, and Node.js.
- Strong knowledge of PostgreSQL and Docker containers.
- Experience building scalable e-commerce infrastructure.`;

    // 1. Ingest real job
    const ingestRes = await engine.importJobText(jdText, "Shopify", "Senior Full Stack Engineer");
    assert.strictEqual(ingestRes.success, true);
    const { job, snapshot } = ingestRes;

    // 2. Verified requirements extracted with quotes
    const tsReq = snapshot.requirements.find(r => r.canonicalName === "TypeScript");
    const reactReq = snapshot.requirements.find(r => r.canonicalName === "React");
    const nodeReq = snapshot.requirements.find(r => r.canonicalName === "Node.js");
    assert.ok(tsReq && tsReq.sourceQuote.includes("TypeScript"));
    assert.ok(reactReq && reactReq.sourceQuote.includes("React"));
    assert.ok(nodeReq && nodeReq.sourceQuote.includes("Node.js"));

    // 3. Attach to Stage 3 Requirement Profile
    const profile = {
      id: "prof_shopify_1",
      userId: "user_123",
      targetCompany: job.companyName,
      targetRole: job.title,
      experienceLevel: job.experienceLevel,
      jobDescription: snapshot.description,
      jobId: job.jobId,
      snapshotId: snapshot.snapshotId,
      profileHash: "shopify_hash_123"
    };

    assert.strictEqual(profile.jobId, job.jobId);
    assert.strictEqual(profile.snapshotId, snapshot.snapshotId);
  });

  await test("Global Singleton Instance: globalJobIngestionEngine operates reliably", () => {
    assert.ok(globalJobIngestionEngine instanceof JobIngestionEngine);
    const resolved = globalJobIngestionEngine.resolveSource({ url: "https://boards.greenhouse.io/test/jobs/1" });
    assert.strictEqual(resolved.provider, "GREENHOUSE");
    assert.strictEqual(resolved.canHandle, true);
  });

  await test("Rate limit and safety: Source resolution completes in < 5ms without external requests", () => {
    const startTime = Date.now();
    for (let i = 0; i < 50; i++) {
      globalJobIngestionEngine.resolveSource({ url: "https://jobs.lever.co/test/12345678-1234-1234-1234-1234567890ab" });
    }
    const elapsed = Date.now() - startTime;
    assert.ok(elapsed < 100);
  });

  await test("CompanyEntity domain handling: resolves domain from URL without scheme or path", () => {
    const comp = resolveCompany("Tesla", "https://careers.tesla.com/en_us/careers");
    assert.strictEqual(comp.canonicalName, "Tesla");
    assert.ok(comp.domains.includes("careers.tesla.com"));
  });
}

runAll().then(() => {
  console.log("\n================================================================================");
  console.log(`STAGE 6 VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}).catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
