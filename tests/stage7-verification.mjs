import assert from 'node:assert';
import { calculateRequirementFrequencies, determineEvidenceStrength } from '../src/lib/intelligenceEngine/frequencyEngine.ts';
import { calculateCoOccurrences } from '../src/lib/intelligenceEngine/coOccurrenceEngine.ts';
import { calculateRequirementTrends } from '../src/lib/intelligenceEngine/trendEngine.ts';
import { buildRoleIntelligenceProfile } from '../src/lib/intelligenceEngine/roleIntelligenceEngine.ts';
import { buildCompanyIntelligenceProfile } from '../src/lib/intelligenceEngine/companyIntelligenceEngine.ts';
import { UniversalIntelligenceEngine, globalIntelligenceEngine } from '../src/lib/intelligenceEngine/intelligenceEngine.ts';
import { JobIngestionEngine } from '../src/lib/jobEngine/jobIngestionEngine.ts';
import { resolveCompany } from '../src/lib/jobEngine/companyResolver.ts';

console.log("================================================================================");
console.log("STAGE 7 VERIFICATION SUITE: UNIVERSAL COMPANY & ROLE INTELLIGENCE ENGINE");
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

// Helper to create synthetic verified postings
function makeMockJob(company, title, skills, options = {}) {
  const id = options.id || `job_${Math.random().toString(36).substring(2, 9)}`;
  const snapshotId = options.snapshotId || `snap_${Math.random().toString(36).substring(2, 9)}`;
  const postedAt = options.postedAt || new Date().toISOString();
  
  return {
    id,
    companyId: resolveCompany(company).id,
    companyName: company,
    title,
    normalizedRole: title,
    experienceLevel: options.experienceLevel || "Mid-Level",
    location: options.location || { raw: "Remote", country: "US", isRemote: true },
    requirements: skills.map((s, idx) => ({
      id: `req_${idx}_${s.toLowerCase().replace(/\s+/g, '_')}`,
      category: options.category || "Skill",
      name: s,
      normalizedName: s.toLowerCase(),
      importance: options.importance || "REQUIRED",
      evidence: [`Evidence for ${s}`]
    })),
    source: {
      provider: "GREENHOUSE",
      url: `https://boards.greenhouse.io/${company.toLowerCase()}/jobs/123`,
      ingestedAt: postedAt,
      snapshotId
    },
    status: "ACTIVE",
    version: 1,
    firstSeenAt: postedAt,
    lastSeenAt: postedAt,
    contentHash: "hash123",
    rawText: "Sample text"
  };
}

async function runAll() {
  // -------------------------------------------------------------------------------- //
  // PART 1: DETERMINISTIC FREQUENCY CALCULATIONS (Tests 1 - 8)
  // -------------------------------------------------------------------------------- //

  await test("Frequency Engine: Zero division protection on empty job posting set", () => {
    const freqs = calculateRequirementFrequencies([]);
    assert.deepStrictEqual(freqs, []);
  });

  await test("Frequency Engine: Accurately calculates 100% frequency across all postings", () => {
    const jobs = [
      makeMockJob("Google", "Software Engineer", ["Python", "Algorithms"]),
      makeMockJob("Google", "Software Engineer", ["Python", "System Design"])
    ];
    const freqs = calculateRequirementFrequencies(jobs);
    const python = freqs.find(f => f.requirementName === "python");
    assert.ok(python);
    assert.strictEqual(python.occurrences, 2);
    assert.strictEqual(python.frequencyPercentage, 100);
    assert.strictEqual(python.totalPostingsEvaluated, 2);
  });

  await test("Frequency Engine: Accurately calculates 50% frequency for partitioned skills", () => {
    const jobs = [
      makeMockJob("Google", "Software Engineer", ["Python", "Algorithms"]),
      makeMockJob("Google", "Software Engineer", ["Go", "Algorithms"])
    ];
    const freqs = calculateRequirementFrequencies(jobs);
    const py = freqs.find(f => f.requirementName === "python");
    const algo = freqs.find(f => f.requirementName === "algorithms");
    assert.strictEqual(py.frequencyPercentage, 50);
    assert.strictEqual(algo.frequencyPercentage, 100);
  });

  await test("Frequency Engine: Tracks required vs preferred vs optional occurrence counts", () => {
    const j1 = makeMockJob("Meta", "Frontend Engineer", ["React"], { importance: "REQUIRED" });
    const j2 = makeMockJob("Meta", "Frontend Engineer", ["React"], { importance: "PREFERRED" });
    const freqs = calculateRequirementFrequencies([j1, j2]);
    const react = freqs.find(f => f.requirementName === "react");
    assert.strictEqual(react.requiredOccurrences, 1);
    assert.strictEqual(react.preferredOccurrences, 1);
    assert.strictEqual(react.optionalOccurrences, 0);
  });

  await test("Frequency Engine: Preserves evidence job IDs and snapshot IDs for auditability", () => {
    const j1 = makeMockJob("Amazon", "DevOps Engineer", ["AWS"], { id: "job_aws_1", snapshotId: "snap_aws_1" });
    const freqs = calculateRequirementFrequencies([j1]);
    const aws = freqs.find(f => f.requirementName === "aws");
    assert.ok(aws.evidenceJobIds.includes("job_aws_1"));
    assert.ok(aws.evidenceSnapshotIds.includes("snap_aws_1"));
  });

  await test("Evidence Strength Tiers: 0-2 postings = INSUFFICIENT_DATA", () => {
    assert.strictEqual(determineEvidenceStrength(0), "INSUFFICIENT_DATA");
    assert.strictEqual(determineEvidenceStrength(1), "INSUFFICIENT_DATA");
    assert.strictEqual(determineEvidenceStrength(2), "INSUFFICIENT_DATA");
  });

  await test("Evidence Strength Tiers: 3-9 postings = LIMITED_EVIDENCE", () => {
    assert.strictEqual(determineEvidenceStrength(3), "LIMITED_EVIDENCE");
    assert.strictEqual(determineEvidenceStrength(9), "LIMITED_EVIDENCE");
  });

  await test("Evidence Strength Tiers: 10-29 postings = MODERATE_EVIDENCE, 30+ = STRONG_EVIDENCE", () => {
    assert.strictEqual(determineEvidenceStrength(10), "MODERATE_EVIDENCE");
    assert.strictEqual(determineEvidenceStrength(29), "MODERATE_EVIDENCE");
    assert.strictEqual(determineEvidenceStrength(30), "STRONG_EVIDENCE");
    assert.strictEqual(determineEvidenceStrength(150), "STRONG_EVIDENCE");
  });

  // -------------------------------------------------------------------------------- //
  // PART 2: CO-OCCURRENCE ENGINE & PAIR PATTERNS (Tests 9 - 14)
  // -------------------------------------------------------------------------------- //

  await test("Co-Occurrence Engine: Returns empty array when postings < 2", () => {
    const j1 = makeMockJob("Microsoft", "Engineer", ["TypeScript", "C#"]);
    assert.deepStrictEqual(calculateCoOccurrences([]), []);
    assert.deepStrictEqual(calculateCoOccurrences([j1]), []);
  });

  await test("Co-Occurrence Engine: Detects frequent pairing of technologies", () => {
    const jobs = [
      makeMockJob("Microsoft", "Full Stack", ["TypeScript", "React", "Node.js"]),
      makeMockJob("Microsoft", "Full Stack", ["TypeScript", "React", "GraphQL"]),
      makeMockJob("Microsoft", "Full Stack", ["TypeScript", "React", "Azure"])
    ];
    const co = calculateCoOccurrences(jobs, 2);
    const pair = co.find(c => 
      (c.requirementA === "react" && c.requirementB === "typescript") ||
      (c.requirementA === "typescript" && c.requirementB === "react")
    );
    assert.ok(pair);
    assert.strictEqual(pair.coOccurrenceCount, 3);
    assert.strictEqual(pair.coOccurrencePercentage, 100);
  });

  await test("Co-Occurrence Engine: Sorts pairs alphabetically to avoid duplicate permutations", () => {
    const jobs = [
      makeMockJob("TCS", "Developer", ["Java", "Spring"]),
      makeMockJob("TCS", "Developer", ["Java", "Spring"])
    ];
    const co = calculateCoOccurrences(jobs, 1);
    assert.strictEqual(co.length, 1);
    assert.strictEqual(co[0].requirementA, "java");
    assert.strictEqual(co[0].requirementB, "spring");
  });

  await test("Co-Occurrence Engine: Filters out pairs below minimum threshold", () => {
    const jobs = [
      makeMockJob("Infosys", "Engineer", ["Python", "Spark"]),
      makeMockJob("Infosys", "Engineer", ["Java", "Kafka"]),
      makeMockJob("Infosys", "Engineer", ["Go", "Docker"])
    ];
    const co = calculateCoOccurrences(jobs, 2);
    assert.strictEqual(co.length, 0);
  });

  await test("Co-Occurrence Engine: Non-causality flag present on every pattern", () => {
    const jobs = [
      makeMockJob("Apple", "iOS Dev", ["Swift", "SwiftUI"]),
      makeMockJob("Apple", "iOS Dev", ["Swift", "SwiftUI"])
    ];
    const co = calculateCoOccurrences(jobs, 1);
    assert.ok(co.length > 0);
    assert.strictEqual(co[0].evidenceClaimType, "STATISTICAL_CO_OCCURRENCE");
  });

  await test("Co-Occurrence Engine: Safe with postings containing single requirement", () => {
    const jobs = [
      makeMockJob("Stripe", "Backend", ["Ruby"]),
      makeMockJob("Stripe", "Backend", ["Go"])
    ];
    const co = calculateCoOccurrences(jobs, 1);
    assert.strictEqual(co.length, 0);
  });

  // -------------------------------------------------------------------------------- //
  // PART 3: TEMPORAL VELOCITY & TREND ENGINE (Tests 15 - 20)
  // -------------------------------------------------------------------------------- //

  await test("Trend Engine: Returns INSUFFICIENT_DATA when snapshot count < 2", () => {
    const snaps = [{
      id: "snap_1",
      jobPostingId: "job_1",
      observedAt: new Date().toISOString(),
      contentHash: "hash1",
      changeType: "INITIAL",
      previousSnapshotId: null,
      rawText: "text",
      requirementsSummary: ["Python"]
    }];
    const trends = calculateRequirementTrends(snaps);
    assert.ok(trends.length > 0);
    assert.strictEqual(trends[0].direction, "INSUFFICIENT_DATA");
  });

  await test("Trend Engine: Detects TRENDING_UP when frequency increases > 10%", () => {
    const t0 = new Date(Date.now() - 30 * 86400000).toISOString();
    const t1 = new Date().toISOString();
    const snaps = [
      // Older window: React not present
      { id: "s1", jobPostingId: "j1", observedAt: t0, contentHash: "h1", changeType: "INITIAL", previousSnapshotId: null, rawText: "t", requirementsSummary: ["Java"] },
      { id: "s2", jobPostingId: "j2", observedAt: t0, contentHash: "h2", changeType: "INITIAL", previousSnapshotId: null, rawText: "t", requirementsSummary: ["Java"] },
      // Newer window: React present in all postings
      { id: "s3", jobPostingId: "j3", observedAt: t1, contentHash: "h3", changeType: "INITIAL", previousSnapshotId: null, rawText: "t", requirementsSummary: ["React", "Java"] },
      { id: "s4", jobPostingId: "j4", observedAt: t1, contentHash: "h4", changeType: "INITIAL", previousSnapshotId: null, rawText: "t", requirementsSummary: ["React", "Java"] }
    ];
    const trends = calculateRequirementTrends(snaps);
    const reactTrend = trends.find(t => t.requirementName === "react");
    assert.ok(reactTrend);
    assert.strictEqual(reactTrend.direction, "TRENDING_UP");
    assert.ok(reactTrend.changePercentage > 0);
  });

  await test("Trend Engine: Detects TRENDING_DOWN when frequency drops > 10%", () => {
    const t0 = new Date(Date.now() - 30 * 86400000).toISOString();
    const t1 = new Date().toISOString();
    const snaps = [
      // Older window: Perl present
      { id: "s1", jobPostingId: "j1", observedAt: t0, contentHash: "h1", changeType: "INITIAL", previousSnapshotId: null, rawText: "t", requirementsSummary: ["Perl"] },
      { id: "s2", jobPostingId: "j2", observedAt: t0, contentHash: "h2", changeType: "INITIAL", previousSnapshotId: null, rawText: "t", requirementsSummary: ["Perl"] },
      // Newer window: Perl absent
      { id: "s3", jobPostingId: "j3", observedAt: t1, contentHash: "h3", changeType: "INITIAL", previousSnapshotId: null, rawText: "t", requirementsSummary: ["Python"] },
      { id: "s4", jobPostingId: "j4", observedAt: t1, contentHash: "h4", changeType: "INITIAL", previousSnapshotId: null, rawText: "t", requirementsSummary: ["Python"] }
    ];
    const trends = calculateRequirementTrends(snaps);
    const perlTrend = trends.find(t => t.requirementName === "perl");
    assert.ok(perlTrend);
    assert.strictEqual(perlTrend.direction, "TRENDING_DOWN");
    assert.ok(perlTrend.changePercentage < 0);
  });

  await test("Trend Engine: Detects STABLE when frequency remains within 10%", () => {
    const t0 = new Date(Date.now() - 30 * 86400000).toISOString();
    const t1 = new Date().toISOString();
    const snaps = [
      { id: "s1", jobPostingId: "j1", observedAt: t0, contentHash: "h1", changeType: "INITIAL", previousSnapshotId: null, rawText: "t", requirementsSummary: ["SQL"] },
      { id: "s2", jobPostingId: "j2", observedAt: t1, contentHash: "h2", changeType: "INITIAL", previousSnapshotId: null, rawText: "t", requirementsSummary: ["SQL"] }
    ];
    const trends = calculateRequirementTrends(snaps);
    const sqlTrend = trends.find(t => t.requirementName === "sql");
    assert.ok(sqlTrend);
    assert.strictEqual(sqlTrend.direction, "STABLE");
    assert.strictEqual(sqlTrend.changePercentage, 0);
  });

  await test("Trend Engine: Handles empty snapshots without crashing", () => {
    const trends = calculateRequirementTrends([]);
    assert.deepStrictEqual(trends, []);
  });

  await test("Trend Engine: Calculates timeWindowDays accurately from oldest to newest snapshot", () => {
    const d1 = new Date("2026-01-01T00:00:00Z");
    const d2 = new Date("2026-01-21T00:00:00Z");
    const snaps = [
      { id: "s1", jobPostingId: "j1", observedAt: d1.toISOString(), contentHash: "h1", changeType: "INITIAL", previousSnapshotId: null, rawText: "t", requirementsSummary: ["Git"] },
      { id: "s2", jobPostingId: "j2", observedAt: d2.toISOString(), contentHash: "h2", changeType: "INITIAL", previousSnapshotId: null, rawText: "t", requirementsSummary: ["Git"] }
    ];
    const trends = calculateRequirementTrends(snaps);
    assert.strictEqual(trends[0].timeWindowDays, 20);
  });

  // -------------------------------------------------------------------------------- //
  // PART 4: UNIVERSAL ROLE INTELLIGENCE ENGINE (Tests 21 - 26)
  // -------------------------------------------------------------------------------- //

  await test("Role Intelligence: Builds complete profile with experience & location distributions", () => {
    const jobs = [
      makeMockJob("Amazon", "Software Engineer", ["Java", "AWS"], { experienceLevel: "Entry-Level", location: { raw: "Seattle, WA", country: "US", isRemote: false } }),
      makeMockJob("Amazon", "Software Engineer", ["Java", "DynamoDB"], { experienceLevel: "Mid-Level", location: { raw: "Remote", country: "US", isRemote: true } }),
      makeMockJob("Amazon", "Software Engineer", ["Java", "Docker"], { experienceLevel: "Mid-Level", location: { raw: "Remote", country: "US", isRemote: true } })
    ];
    const profile = buildRoleIntelligenceProfile("Software Engineer", jobs);
    assert.strictEqual(profile.roleTitle, "Software Engineer");
    assert.strictEqual(profile.totalPostingsAnalyzed, 3);
    assert.strictEqual(profile.evidenceStrength, "LIMITED_EVIDENCE");
    assert.strictEqual(profile.experiencePatterns.length, 2);
    assert.strictEqual(profile.locationPatterns.length, 2);
  });

  await test("Role Intelligence: Experience percentages sum up to 100%", () => {
    const jobs = [
      makeMockJob("Meta", "Product Designer", ["Figma"], { experienceLevel: "Senior" }),
      makeMockJob("Meta", "Product Designer", ["Figma"], { experienceLevel: "Senior" }),
      makeMockJob("Meta", "Product Designer", ["Figma"], { experienceLevel: "Mid-Level" }),
      makeMockJob("Meta", "Product Designer", ["Figma"], { experienceLevel: "Entry-Level" })
    ];
    const profile = buildRoleIntelligenceProfile("Product Designer", jobs);
    const sum = profile.experiencePatterns.reduce((acc, curr) => acc + curr.percentage, 0);
    assert.ok(Math.abs(sum - 100) < 0.5);
  });

  await test("Role Intelligence: Location patterns distinguish remote vs onsite postings", () => {
    const jobs = [
      makeMockJob("Google", "Data Scientist", ["Python"], { location: { raw: "Remote", country: "US", isRemote: true } }),
      makeMockJob("Google", "Data Scientist", ["Python"], { location: { raw: "Mountain View, CA", country: "US", isRemote: false } })
    ];
    const profile = buildRoleIntelligenceProfile("Data Scientist", jobs);
    const remote = profile.locationPatterns.find(l => l.isRemote);
    const onsite = profile.locationPatterns.find(l => !l.isRemote);
    assert.ok(remote);
    assert.ok(onsite);
    assert.strictEqual(remote.count, 1);
    assert.strictEqual(onsite.count, 1);
  });

  await test("Role Intelligence: Generates deterministic dataset version", () => {
    const jobs = [makeMockJob("Tesla", "Mechanical Engineer", ["CAD"])];
    const p1 = buildRoleIntelligenceProfile("Mechanical Engineer", jobs);
    const p2 = buildRoleIntelligenceProfile("Mechanical Engineer", jobs);
    assert.strictEqual(p1.datasetVersion, p2.datasetVersion);
  });

  await test("Role Intelligence: Includes statutory disclaimer on all generated profiles", () => {
    const profile = buildRoleIntelligenceProfile("Business Analyst", []);
    assert.ok(profile.disclaimer);
    assert.ok(profile.disclaimer.includes("NOT hiring, interview, or rejection decisions"));
  });

  await test("Role Intelligence: Correctly reflects INSUFFICIENT_DATA for empty role dataset", () => {
    const profile = buildRoleIntelligenceProfile("Cybersecurity Analyst", []);
    assert.strictEqual(profile.evidenceStrength, "INSUFFICIENT_DATA");
    assert.strictEqual(profile.totalPostingsAnalyzed, 0);
    assert.deepStrictEqual(profile.topRequirements, []);
  });

  // -------------------------------------------------------------------------------- //
  // PART 5: UNIVERSAL COMPANY INTELLIGENCE ENGINE (Tests 27 - 32)
  // -------------------------------------------------------------------------------- //

  await test("Company Intelligence: Builds company profile across multiple roles", () => {
    const jobs = [
      makeMockJob("Google", "Software Engineer", ["Go"]),
      makeMockJob("Google", "Data Engineer", ["BigQuery"]),
      makeMockJob("Google", "Site Reliability Engineer", ["Kubernetes"])
    ];
    const compProfile = buildCompanyIntelligenceProfile("comp_google", "Google", jobs);
    assert.strictEqual(compProfile.companyName, "Google");
    assert.strictEqual(compProfile.totalPostingsAnalyzed, 3);
    assert.strictEqual(compProfile.evidenceStrength, "LIMITED_EVIDENCE");
    assert.strictEqual(compProfile.roleFamilies.length, 3);
  });

  await test("Company Intelligence: Aggregates role family percentages correctly", () => {
    const jobs = [
      makeMockJob("Deloitte", "Consultant", ["Excel"]),
      makeMockJob("Deloitte", "Consultant", ["PowerPoint"]),
      makeMockJob("Deloitte", "Developer", ["Java"])
    ];
    const profile = buildCompanyIntelligenceProfile("comp_deloitte", "Deloitte", jobs);
    const consultant = profile.roleFamilies.find(r => r.roleTitle === "Consultant");
    assert.ok(consultant);
    assert.strictEqual(consultant.postingCount, 2);
    assert.strictEqual(consultant.percentage, 66.7);
  });

  await test("Company Intelligence: Stale data detection flags postings older than 60 days", () => {
    const oldDate = new Date(Date.now() - 75 * 86400000).toISOString();
    const jobs = [
      makeMockJob("IBM", "Architect", ["Cloud"], { postedAt: oldDate })
    ];
    const profile = buildCompanyIntelligenceProfile("comp_ibm", "IBM", jobs);
    assert.strictEqual(profile.isStale, true);
  });

  await test("Company Intelligence: Fresh data is not marked stale", () => {
    const jobs = [
      makeMockJob("IBM", "Architect", ["Cloud"])
    ];
    const profile = buildCompanyIntelligenceProfile("comp_ibm", "IBM", jobs);
    assert.strictEqual(profile.isStale, false);
  });

  await test("Company Intelligence: Empty postings produce INSUFFICIENT_DATA and empty patterns", () => {
    const profile = buildCompanyIntelligenceProfile("comp_new", "Acme Startup", []);
    assert.strictEqual(profile.evidenceStrength, "INSUFFICIENT_DATA");
    assert.strictEqual(profile.totalPostingsAnalyzed, 0);
    assert.deepStrictEqual(profile.roleFamilies, []);
  });

  await test("Company Intelligence: Includes mandatory disclaimer", () => {
    const profile = buildCompanyIntelligenceProfile("comp_tcs", "TCS", []);
    assert.ok(profile.disclaimer);
    assert.ok(profile.disclaimer.includes("NOT hiring, interview, or rejection decisions"));
  });

  // -------------------------------------------------------------------------------- //
  // PART 6: MULTI-COMPANY UNIVERSAL TESTS (Tests 33 - 38)
  // -------------------------------------------------------------------------------- //

  await test("Multi-Company: Operates identically on Google postings", async () => {
    const engine = new UniversalIntelligenceEngine();
    const jobs = [
      makeMockJob("Google", "Backend Engineer", ["C++", "Protocol Buffers"]),
      makeMockJob("Google", "Backend Engineer", ["Go", "Kubernetes"])
    ];
    jobs.forEach(j => engine.jobStore.addJob(j));
    const profile = await engine.getCompanyProfile("Google");
    assert.strictEqual(profile.companyName, "Google");
    assert.strictEqual(profile.totalPostingsAnalyzed, 2);
  });

  await test("Multi-Company: Operates identically on Microsoft postings", async () => {
    const engine = new UniversalIntelligenceEngine();
    const jobs = [
      makeMockJob("Microsoft", "Cloud Engineer", ["Azure", "C#"]),
      makeMockJob("Microsoft", "Cloud Engineer", ["Azure", ".NET Core"])
    ];
    jobs.forEach(j => engine.jobStore.addJob(j));
    const profile = await engine.getCompanyProfile("Microsoft");
    assert.strictEqual(profile.companyName, "Microsoft");
    const azure = profile.topCompanyRequirements.find(r => r.requirementName === "azure");
    assert.strictEqual(azure.frequencyPercentage, 100);
  });

  await test("Multi-Company: Operates identically on Amazon postings", async () => {
    const engine = new UniversalIntelligenceEngine();
    const jobs = [
      makeMockJob("Amazon", "Solutions Architect", ["AWS", "Architecture"])
    ];
    jobs.forEach(j => engine.jobStore.addJob(j));
    const profile = await engine.getCompanyProfile("Amazon");
    assert.strictEqual(profile.companyName, "Amazon");
    assert.strictEqual(profile.totalPostingsAnalyzed, 1);
  });

  await test("Multi-Company: Operates identically on TCS postings", async () => {
    const engine = new UniversalIntelligenceEngine();
    const jobs = [
      makeMockJob("TCS", "System Engineer", ["Java", "Oracle SQL"])
    ];
    jobs.forEach(j => engine.jobStore.addJob(j));
    const profile = await engine.getCompanyProfile("TCS");
    assert.strictEqual(profile.companyName, "TCS");
  });

  await test("Multi-Company: Operates identically on Tesla postings", async () => {
    const engine = new UniversalIntelligenceEngine();
    const jobs = [
      makeMockJob("Tesla", "Firmware Engineer", ["C", "RTOS"])
    ];
    jobs.forEach(j => engine.jobStore.addJob(j));
    const profile = await engine.getCompanyProfile("Tesla");
    assert.strictEqual(profile.companyName, "Tesla");
  });

  await test("Multi-Company: Operates identically on Unknown Startups (Zero hardcoded names)", async () => {
    const engine = new UniversalIntelligenceEngine();
    const randomStartup = "Zeta Quantum Fusion Labs";
    const jobs = [
      makeMockJob(randomStartup, "Quantum Researcher", ["Qiskit", "Python"])
    ];
    jobs.forEach(j => engine.jobStore.addJob(j));
    const profile = await engine.getCompanyProfile(randomStartup);
    assert.strictEqual(profile.companyName, randomStartup);
    assert.strictEqual(profile.totalPostingsAnalyzed, 1);
  });

  // -------------------------------------------------------------------------------- //
  // PART 7: CROSS-COMPANY ISOLATION & CANDIDATE SEPARATION (Tests 39 - 44)
  // -------------------------------------------------------------------------------- //

  await test("Cross-Company Isolation: Google postings never leak into Microsoft profile", async () => {
    const engine = new UniversalIntelligenceEngine();
    engine.jobStore.addJob(makeMockJob("Google", "SWE", ["Bigtable", "MapReduce"]));
    engine.jobStore.addJob(makeMockJob("Microsoft", "SWE", ["CosmosDB", "C#"]));

    const googleProfile = await engine.getCompanyProfile("Google");
    const msftProfile = await engine.getCompanyProfile("Microsoft");

    const googleReqs = googleProfile.topCompanyRequirements.map(r => r.requirementName);
    const msftReqs = msftProfile.topCompanyRequirements.map(r => r.requirementName);

    assert.ok(googleReqs.includes("bigtable"));
    assert.ok(!googleReqs.includes("cosmosdb"));
    assert.ok(msftReqs.includes("cosmosdb"));
    assert.ok(!msftReqs.includes("bigtable"));
  });

  await test("Candidate Separation: Missing market requirements are NOT assigned to candidate", async () => {
    const engine = new UniversalIntelligenceEngine();
    const jobs = [
      makeMockJob("NVIDIA", "CUDA Engineer", ["CUDA", "C++", "DirectX"]),
      makeMockJob("NVIDIA", "CUDA Engineer", ["CUDA", "C++", "Vulkan"])
    ];
    jobs.forEach(j => engine.jobStore.addJob(j));

    // Candidate has C++, but lacks CUDA and DirectX
    const analysis = await engine.analyzeTarget("NVIDIA", "CUDA Engineer", ["C++"]);

    assert.ok(analysis.candidateMatchingRequirements.includes("c++"));
    const missingNames = analysis.candidateMissingFrequentRequirements.map(r => r.requirementName);
    assert.ok(missingNames.includes("cuda"));

    // Verify claim type is MARKET_PATTERN and confidence tier is strictly honest
    const cudaMissing = analysis.candidateMissingFrequentRequirements.find(r => r.requirementName === "cuda");
    assert.strictEqual(cudaMissing.evidenceClaimType, "OBSERVED_POSTING_FREQUENCY");
    assert.strictEqual(cudaMissing.confidenceTier, "EMPIRICAL_DATA");
  });

  await test("Candidate Separation: Empty candidate skills does not crash analysis", async () => {
    const engine = new UniversalIntelligenceEngine();
    const jobs = [makeMockJob("Apple", "iOS Dev", ["Swift"])];
    jobs.forEach(j => engine.jobStore.addJob(j));

    const analysis = await engine.analyzeTarget("Apple", "iOS Dev", []);
    assert.strictEqual(analysis.candidateMatchingRequirements.length, 0);
    assert.strictEqual(analysis.candidateMissingFrequentRequirements.length, 1);
  });

  await test("Candidate Separation: Case-insensitive matching between candidate and market skills", async () => {
    const engine = new UniversalIntelligenceEngine();
    const jobs = [makeMockJob("Netflix", "Engineer", ["Kafka", "Docker"])];
    jobs.forEach(j => engine.jobStore.addJob(j));

    const analysis = await engine.analyzeTarget("Netflix", "Engineer", ["kafka", "DOCKER"]);
    assert.strictEqual(analysis.candidateMatchingRequirements.length, 2);
    assert.strictEqual(analysis.candidateMissingFrequentRequirements.length, 0);
  });

  await test("Target Analysis: Provides comprehensive synthesis across company and role", async () => {
    const engine = new UniversalIntelligenceEngine();
    const jobs = [
      makeMockJob("Tesla", "Autopilot Engineer", ["Python", "PyTorch", "C++"]),
      makeMockJob("Tesla", "Autopilot Engineer", ["Python", "PyTorch", "ROS"])
    ];
    jobs.forEach(j => engine.jobStore.addJob(j));

    const analysis = await engine.analyzeTarget("Tesla", "Autopilot Engineer", ["Python"]);
    assert.strictEqual(analysis.companyName, "Tesla");
    assert.strictEqual(analysis.roleTitle, "Autopilot Engineer");
    assert.strictEqual(analysis.totalPostingsAnalyzed, 2);
    assert.strictEqual(analysis.evidenceStrength, "INSUFFICIENT_DATA");
    assert.ok(analysis.topRequirements.length >= 2);
    assert.ok(analysis.disclaimer.includes("NOT hiring, interview, or rejection decisions"));
  });

  await test("Deterministic Caching: Returns identical analysis on repeated calls", async () => {
    const engine = new UniversalIntelligenceEngine();
    const j1 = makeMockJob("Adobe", "Product Manager", ["Agile", "Jira"]);
    engine.jobStore.addJob(j1);

    const a1 = await engine.analyzeTarget("Adobe", "Product Manager", ["Agile"]);
    const a2 = await engine.analyzeTarget("Adobe", "Product Manager", ["Agile"]);
    assert.deepStrictEqual(a1, a2);
  });

  // -------------------------------------------------------------------------------- //
  // PART 8: OUTCOME ARCHITECTURE & ANTI-HALLUCINATION SAFEGUARDS (Tests 45 - 50)
  // -------------------------------------------------------------------------------- //

  await test("Outcome Architecture: Candidate outcome recording stores verified record", () => {
    const engine = new UniversalIntelligenceEngine();
    const rec = engine.recordCandidateOutcome({
      resumeId: "res_123",
      jobPostingId: "job_xyz",
      companyName: "Meta",
      roleTitle: "Software Engineer",
      outcome: "INTERVIEW_OFFERED",
      verifiedByCandidate: true
    });
    assert.ok(rec.id);
    assert.strictEqual(rec.outcome, "INTERVIEW_OFFERED");
    assert.strictEqual(rec.verifiedByCandidate, true);
    assert.strictEqual(engine.getOutcomeRecords().length, 1);
  });

  await test("Outcome Architecture: Unverified outcome record is flagged appropriately", () => {
    const engine = new UniversalIntelligenceEngine();
    const rec = engine.recordCandidateOutcome({
      resumeId: "res_456",
      jobPostingId: "job_abc",
      companyName: "Google",
      roleTitle: "SWE",
      outcome: "REJECTED_UNKNOWN_REASON",
      verifiedByCandidate: false
    });
    assert.strictEqual(rec.verifiedByCandidate, false);
  });

  await test("Outcome Architecture: Outcome data never alters raw public posting frequencies", async () => {
    const engine = new UniversalIntelligenceEngine();
    const jobs = [makeMockJob("Meta", "SWE", ["React"])];
    jobs.forEach(j => engine.jobStore.addJob(j));

    // Record an outcome
    engine.recordCandidateOutcome({
      resumeId: "res_999",
      jobPostingId: jobs[0].id,
      companyName: "Meta",
      roleTitle: "SWE",
      outcome: "HIRED",
      verifiedByCandidate: true
    });

    const roleProfile = await engine.getRoleProfile("SWE");
    const react = roleProfile.topRequirements.find(r => r.requirementName === "react");
    assert.strictEqual(react.occurrences, 1);
    assert.strictEqual(react.frequencyPercentage, 100);
    // Verified that outcome did not artificially inflate occurrences or claims
  });

  await test("Anti-Hallucination: Zero fake companies or hallucinated postings when store is empty", async () => {
    const engine = new UniversalIntelligenceEngine();
    const profile = await engine.getCompanyProfile("Imaginary AI Corp");
    assert.strictEqual(profile.totalPostingsAnalyzed, 0);
    assert.strictEqual(profile.evidenceStrength, "INSUFFICIENT_DATA");
    assert.strictEqual(profile.topCompanyRequirements.length, 0);
  });

  await test("Anti-Hallucination: Rejects speculative claims of hiring or rejection causation", async () => {
    const engine = new UniversalIntelligenceEngine();
    const analysis = await engine.analyzeTarget("Amazon", "SDE", ["Java"]);
    const jsonStr = JSON.stringify(analysis).toLowerCase();
    
    // Check absence of forbidden speculative rejection phrases
    assert.ok(!jsonStr.includes("rejects resumes without"));
    assert.ok(!jsonStr.includes("candidates lacked"));
    assert.ok(!jsonStr.includes("guaranteed to get hired"));
    assert.ok(!jsonStr.includes("preferred candidate profile"));
  });

  await test("Global Singleton: globalIntelligenceEngine is correctly instantiated and ready", () => {
    assert.ok(globalIntelligenceEngine instanceof UniversalIntelligenceEngine);
    assert.ok(globalIntelligenceEngine.jobStore);
  });
}

runAll().then(() => {
  console.log("\n================================================================================");
  console.log(`STAGE 7 VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exitCode = 1;
  }
}).catch(err => {
  console.error("Fatal test error:", err);
  process.exitCode = 1;
});
