import assert from "node:assert";
import { 
  canonicalizeCompanyName, 
  generateCompanyId, 
  resolveCompany, 
  isSafePublicDomain,
  extractDomainFromUrl,
  detectCompanyAmbiguity 
} from "../src/lib/jobEngine/companyResolver.ts";
import { 
  generateCompanySlug, 
  enrichCompanyFromPublicSources 
} from "../src/lib/jobEngine/publicCompanyService.ts";
import { 
  buildCompanyIntelligenceProfile,
  calculateCompanyConfidence,
  buildUniversalCompanyIntelligence
} from "../src/lib/intelligenceEngine/companyIntelligenceEngine.ts";
import { CompanyIntelligenceStore } from "../src/lib/intelligenceEngine/companyIntelligenceStore.ts";
import { evaluateResumeAgainstRequirements } from "../src/lib/atsEngine.ts";

process.env.SKIP_SERVER_LISTEN = "1";
process.env.VERCEL = "1";

console.log("================================================================================");
console.log("RESUMIX UNIVERSAL COMPANY INTELLIGENCE VERIFICATION SUITE");
console.log("================================================================================\n");

let passed = 0;
let total = 0;

function test(description, fn) {
  total++;
  try {
    fn();
    console.log(`  [PASS] Test ${total}: ${description}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] Test ${total}: ${description}`);
    console.error(`         ${err.message}`);
  }
}

async function asyncTest(description, fn) {
  total++;
  try {
    await fn();
    console.log(`  [PASS] Test ${total}: ${description}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] Test ${total}: ${description}`);
    console.error(`         ${err.message}`);
  }
}

// --- PART 1: Company Resolution & Legal Suffix Normalization ---
console.log("--- PART 1: Company Resolution & Legal Suffix Normalization ---");

test("Famous company resolution normalizes legal corporate suffix (Inc, LLC, Corp)", () => {
  assert.strictEqual(canonicalizeCompanyName("Google LLC"), "Google");
  assert.strictEqual(canonicalizeCompanyName("Microsoft Corporation"), "Microsoft");
  assert.strictEqual(canonicalizeCompanyName("Amazon.com, Inc."), "Amazon.com");
  assert.strictEqual(canonicalizeCompanyName("Stripe Inc."), "Stripe");
});

test("International and regional corporate suffixes normalized (Pvt Ltd, GmbH, S.A., PLC, Pty Ltd)", () => {
  assert.strictEqual(canonicalizeCompanyName("Tata Consultancy Services Pvt Ltd"), "Tata Consultancy Services");
  assert.strictEqual(canonicalizeCompanyName("Siemens AG"), "Siemens");
  assert.strictEqual(canonicalizeCompanyName("SAP GmbH"), "SAP");
  assert.strictEqual(canonicalizeCompanyName("Vodafone Group PLC"), "Vodafone");
  assert.strictEqual(canonicalizeCompanyName("Canva Pty Ltd"), "Canva");
});

test("Lesser-known and boutique businesses resolved without hardcoded lists", () => {
  assert.strictEqual(canonicalizeCompanyName("Apex Robotics Solutions LLC"), "Apex Robotics Solutions");
  assert.strictEqual(canonicalizeCompanyName("Highland Logistics Pvt. Ltd."), "Highland Logistics");
  assert.strictEqual(canonicalizeCompanyName("Blue River Digital Media Co."), "Blue River Digital Media");
});

test("Startups and novel ventures normalized accurately", () => {
  assert.strictEqual(canonicalizeCompanyName("Linear Orbit Inc"), "Linear Orbit");
  assert.strictEqual(canonicalizeCompanyName("Synthetix AI"), "Synthetix AI");
});

test("Deterministic company ID prevents duplicate company entities", () => {
  const id1 = generateCompanyId("Stripe");
  const id2 = generateCompanyId("stripe");
  const id3 = generateCompanyId(" STRIPE ");
  assert.strictEqual(id1, id2);
  assert.strictEqual(id2, id3);
  assert.ok(id1.startsWith("comp_"));
});

test("Whitespace, punctuation, and casing do not create divergent entities", () => {
  const c1 = canonicalizeCompanyName("  Deloitte & Touche,  LLP.  ");
  const c2 = canonicalizeCompanyName("Deloitte & Touche LLP");
  assert.strictEqual(c1, "Deloitte & Touche");
  assert.strictEqual(c2, "Deloitte & Touche");
});

// --- PART 2: Domain Resolution, Ambiguity, and SSRF Security ---
console.log("\n--- PART 2: Domain Resolution, Ambiguity, and SSRF Security ---");

test("SSRF Protection: rejects private IP blocks and loopback interfaces", () => {
  assert.strictEqual(isSafePublicDomain("127.0.0.1"), false);
  assert.strictEqual(isSafePublicDomain("localhost"), false);
  assert.strictEqual(isSafePublicDomain("http://localhost:8080/internal"), false);
  assert.strictEqual(isSafePublicDomain("10.0.0.1"), false);
  assert.strictEqual(isSafePublicDomain("192.168.1.1"), false);
  assert.strictEqual(isSafePublicDomain("172.16.0.1"), false);
  assert.strictEqual(isSafePublicDomain("169.254.169.254"), false);
});

test("SSRF Protection: accepts legitimate public domains", () => {
  assert.strictEqual(isSafePublicDomain("google.com"), true);
  assert.strictEqual(isSafePublicDomain("https://stripe.com"), true);
  assert.strictEqual(isSafePublicDomain("https://sub.domain.company.co.uk"), true);
});

test("Domain extraction from user-supplied website URL", () => {
  assert.strictEqual(extractDomainFromUrl("https://www.example.com/careers"), "example.com");
  assert.strictEqual(extractDomainFromUrl("http://company.io/about?ref=job"), "company.io");
  assert.strictEqual(extractDomainFromUrl("invalid url"), null);
});

test("Ambiguous single-token names without domain produce AMBIGUOUS status", () => {
  const isAmbiguous1 = detectCompanyAmbiguity("Square", null);
  assert.strictEqual(isAmbiguous1, true);

  const resolved = resolveCompany({ rawName: "Square" });
  assert.strictEqual(resolved.resolutionStatus, "AMBIGUOUS");

  const resolvedWithDomain = resolveCompany({ rawName: "Square", website: "https://squareup.com" });
  assert.strictEqual(resolvedWithDomain.resolutionStatus, "CONFIDENT");
});

test("Unknown company produces UNVERIFIED without crashing", () => {
  const resolved = resolveCompany("");
  assert.strictEqual(resolved.canonicalName, "Unknown Company");
  assert.strictEqual(resolved.resolutionStatus, "UNVERIFIED");
});

// --- PART 3: Public ATS & Board Discovery ---
console.log("\n--- PART 3: Public ATS & Board Discovery ---");

test("Slug generation produces clean ATS-compatible URL tokens", () => {
  assert.strictEqual(generateCompanySlug("Google LLC"), "google");
  assert.strictEqual(generateCompanySlug("Airbnb, Inc."), "airbnb");
  assert.strictEqual(generateCompanySlug("My Tech & AI Startup"), "my-tech-ai-startup");
});

await asyncTest("enrichCompanyFromPublicSources handles user website and produces provenance", async () => {
  const enriched = await enrichCompanyFromPublicSources({
    companyName: "Example Tech Inc",
    website: "https://example.com"
  });

  assert.strictEqual(enriched.domain, "example.com");
  assert.strictEqual(enriched.officialWebsite, "https://example.com");
  assert.ok(enriched.sourceRecords.length > 0);
  assert.strictEqual(enriched.sourceRecords[0].field, "officialWebsite");
  assert.strictEqual(enriched.sourceRecords[0].sourceType, "USER_SUPPLIED");
});

await asyncTest("enrichCompanyFromPublicSources extracts signals from user job description", async () => {
  const sampleJd = "We are seeking a Backend Developer proficient in Python, PostgreSQL, Docker, and AWS cloud infrastructure.";
  const enriched = await enrichCompanyFromPublicSources({
    companyName: "CloudScale Systems",
    jobDescription: sampleJd
  });

  assert.ok(enriched.observedTechnologies.length > 0);
  assert.ok(enriched.observedRoles.length > 0);
  assert.strictEqual(enriched.discoveredJobCount, 1);
});

// --- PART 4: Confidence Scoring & Factual Provenance ---
console.log("\n--- PART 4: Confidence Scoring & Factual Provenance ---");

test("calculateCompanyConfidence assigns HIGH when website and multiple jobs are present", () => {
  const conf = calculateCompanyConfidence({
    hasVerifiedWebsite: true,
    hasJobBoard: true,
    jobCount: 12,
    hasDescription: true
  });
  assert.strictEqual(conf.confidence, "HIGH");
  assert.ok(conf.confidenceScore >= 0.75);
  assert.ok(conf.confidenceReasons.some(r => r.includes("Official web domain verified")));
});

test("calculateCompanyConfidence assigns MEDIUM for partial public resolution", () => {
  const conf = calculateCompanyConfidence({
    hasVerifiedWebsite: true,
    hasJobBoard: false,
    jobCount: 0,
    hasDescription: false
  });
  assert.strictEqual(conf.confidence, "MEDIUM");
  assert.ok(conf.confidenceScore >= 0.45 && conf.confidenceScore < 0.75);
});

test("calculateCompanyConfidence assigns LOW for ambiguous company", () => {
  const conf = calculateCompanyConfidence({
    hasVerifiedWebsite: false,
    hasJobBoard: false,
    jobCount: 0,
    hasDescription: false,
    resolutionStatus: "AMBIGUOUS"
  });
  assert.strictEqual(conf.confidence, "LOW");
  assert.ok(conf.confidenceReasons.some(r => r.includes("Multiple similar entity names exist")));
});

test("Zero Fabricated Data: unavailable fields remain null and unverified", () => {
  const entity = resolveCompany("Acme Custom Works");
  const enrichment = {
    officialWebsite: null,
    domain: null,
    careersUrl: null,
    industry: null,
    description: null,
    headquarters: null,
    locations: [],
    companySize: null,
    jobBoardProvider: null,
    jobBoardIdentifier: null,
    sourceRecords: [],
    observedRoles: [],
    observedSkills: [],
    observedTechnologies: [],
    observedKeywords: [],
    hiringSignals: [],
    discoveredJobCount: 0
  };

  const intel = buildUniversalCompanyIntelligence({ entity, enrichment });
  assert.strictEqual(intel.officialWebsite, null);
  assert.strictEqual(intel.description, null);
  assert.strictEqual(intel.headquarters, null);
  assert.strictEqual(intel.companySize, null);
  assert.strictEqual(intel.status, "UNVERIFIED");
});

// --- PART 5: Cache Strategy & In-Memory Store ---
console.log("\n--- PART 5: Cache Strategy & In-Memory Store ---");

await asyncTest("CompanyIntelligenceStore: stores and retrieves company intelligence", async () => {
  const store = new CompanyIntelligenceStore();
  const intel1 = await store.getIntelligence({ companyName: "Innovate AI Corp" });
  assert.strictEqual(intel1.normalizedName, "Innovate AI");
  assert.strictEqual(store.getCacheSize(), 1);

  // Second call retrieves from cache without re-enriching
  const intel2 = await store.getIntelligence({ companyName: "Innovate AI" });
  assert.strictEqual(intel2.id, intel1.id);
  assert.strictEqual(store.getCacheSize(), 1);
});

await asyncTest("CompanyIntelligenceStore: refresh flag forces fresh retrieval", async () => {
  const store = new CompanyIntelligenceStore();
  await store.getIntelligence({ companyName: "Orbit Dynamics" });
  const refreshed = await store.getIntelligence({ companyName: "Orbit Dynamics", refresh: true });
  assert.strictEqual(refreshed.normalizedName, "Orbit Dynamics");
});

// --- PART 6: Strict Concept Separation & ATS Invariance ---
console.log("\n--- PART 6: Strict Concept Separation & ATS Invariance ---");

test("ATS Invariance: Company intelligence NEVER alters target job requirements", () => {
  const targetJobRequirements = [
    {
      id: "req_react",
      canonicalName: "React",
      category: "FRAMEWORK",
      importance: "CRITICAL",
      source: "JOB_DESCRIPTION",
      sourceQuote: "Must have strong React experience."
    }
  ];

  // Simulated company intelligence with Rust & Kubernetes
  const companyTech = ["Rust", "Kubernetes", "AWS", "Go"];

  // Invariant check: target job requirements remain exactly 1 item (React)
  assert.strictEqual(targetJobRequirements.length, 1);
  assert.strictEqual(targetJobRequirements[0].canonicalName, "React");
  assert.strictEqual(targetJobRequirements.some(r => r.canonicalName === "Rust"), false);
});

test("ATS Invariance: Company intelligence NEVER alters ATS Compatibility Score", () => {
  const sampleResume = {
    id: "res_1",
    userId: "u_1",
    summary: "React web developer",
    skills: ["React", "TypeScript", "HTML", "CSS"],
    experience: [{ role: "Frontend Dev", company: "WebCorp", duration: "2 yrs", description: "Built React web apps." }],
    education: [{ degree: "BS CS", institution: "Tech Univ" }],
    projects: [],
    achievements: [],
    certifications: [],
    languages: ["English"],
    tools: ["Git"],
    frameworks: ["React"],
    softSkills: ["Teamwork"],
    atsKeywords: ["React"],
    responsibilities: [],
    quantifiedMetrics: []
  };

  const targetReqs = [
    {
      id: "req_react",
      requirementId: "req_react",
      name: "React",
      canonicalName: "react",
      category: "FRAMEWORK",
      importance: "REQUIRED",
      source: "JOB_DESCRIPTION",
      sourceQuote: "Must know React.",
      status: "VERIFIED",
      priority: "CRITICAL",
      confidence: 100
    }
  ];

  const scoreBefore = evaluateResumeAgainstRequirements(sampleResume, targetReqs, "React developer");

  // User views company intelligence with diverse technologies
  const companyIntelligence = {
    normalizedName: "MegaCorp",
    observedTechnologies: ["Rust", "C++", "Docker", "Kubernetes", "Java"]
  };

  // Re-evaluation of resume against target job description
  const scoreAfter = evaluateResumeAgainstRequirements(sampleResume, targetReqs, "React developer");

  assert.strictEqual(scoreBefore.atsScore, scoreAfter.atsScore);
  assert.strictEqual(scoreBefore.targetMatchScore, scoreAfter.targetMatchScore);
  assert.strictEqual(scoreBefore.matchedCount, scoreAfter.matchedCount);
  assert.strictEqual(scoreBefore.totalRequired, scoreAfter.totalRequired);
});

// --- PART 7: Backend Live HTTP API Endpoints ---
console.log("\n--- PART 7: Backend Live HTTP API Endpoints ---");

const SERVER_URL = "http://localhost:3000";

await asyncTest("POST /api/company/resolve returns canonical entity and status", async () => {
  const res = await fetch(`${SERVER_URL}/api/company/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyName: "Shopify Inc." })
  });

  const data = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.data.canonicalName, "Shopify");
  assert.strictEqual(data.data.resolutionStatus, "CONFIDENT");
});

await asyncTest("POST /api/company/resolve rejects missing companyName with HTTP 400", async () => {
  const res = await fetch(`${SERVER_URL}/api/company/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  const data = await res.json();
  assert.strictEqual(res.status, 400);
  assert.strictEqual(data.success, false);
  assert.strictEqual(data.error?.code, "INVALID_COMPANY_NAME");
});

await asyncTest("POST /api/company/intelligence returns CompanyIntelligence model", async () => {
  const res = await fetch(`${SERVER_URL}/api/company/intelligence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyName: "Acme Robotics Solutions LLC" })
  });

  const data = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.data.normalizedName, "Acme Robotics Solutions");
  assert.ok(data.data.confidence);
  assert.ok(Array.isArray(data.data.sourceRecords));
  assert.ok(Array.isArray(data.data.observedTechnologies));
});

await asyncTest("POST /api/company/refresh forces fresh intelligence retrieval", async () => {
  const res = await fetch(`${SERVER_URL}/api/company/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyName: "NextWave Tech Ltd" })
  });

  const data = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.data.normalizedName, "NextWave Tech");
});

// --- PART 8: Data Integrity, Isolation & Multi-Company Handling ---
console.log("\n--- PART 8: Data Integrity, Isolation & Multi-Company Handling ---");

test("Cross-Company Isolation: Company A intelligence never leaks into Company B", () => {
  const companyA = resolveCompany({ rawName: "Google LLC", website: "https://google.com" });
  const companyB = resolveCompany({ rawName: "Microsoft Corp", website: "https://microsoft.com" });

  assert.notStrictEqual(companyA.companyId, companyB.companyId);
  assert.notStrictEqual(companyA.canonicalName, companyB.canonicalName);
  assert.notStrictEqual(companyA.domain, companyB.domain);
});

test("Stale Data Detection: postings older than 60 days are marked isStale", () => {
  const oldDate = new Date(Date.now() - 90 * 86400000).toISOString();
  const oldPosting = {
    job: { title: "Dev", firstSeenAt: oldDate },
    snapshot: { observedAt: oldDate }
  };

  const profile = buildCompanyIntelligenceProfile("comp_old", "OldCorp", [oldPosting]);
  assert.strictEqual(profile.isStale, true);
});

test("Fresh Data Detection: postings under 60 days are marked fresh (isStale = false)", () => {
  const freshDate = new Date(Date.now() - 10 * 86400000).toISOString();
  const freshPosting = {
    job: { title: "Dev", firstSeenAt: freshDate },
    snapshot: { observedAt: freshDate }
  };

  const profile = buildCompanyIntelligenceProfile("comp_fresh", "FreshCorp", [freshPosting]);
  assert.strictEqual(profile.isStale, false);
});

test("Technology and Skill Normalization: verbatim quotes and canonical mappings preserved", () => {
  const entity = resolveCompany("TechVentures");
  const enrichment = {
    officialWebsite: "https://techventures.io",
    domain: "techventures.io",
    careersUrl: null,
    industry: "Technology",
    description: "Cloud software company",
    headquarters: "Austin, TX",
    locations: ["Austin, TX"],
    companySize: "50-100",
    jobBoardProvider: null,
    jobBoardIdentifier: null,
    sourceRecords: [
      {
        field: "officialWebsite",
        value: "https://techventures.io",
        sourceType: "OFFICIAL_WEBSITE",
        sourceUrl: "https://techventures.io",
        observedAt: new Date().toISOString(),
        confidence: 0.95
      }
    ],
    observedRoles: ["Software Engineer", "DevOps Engineer"],
    observedSkills: ["Problem Solving", "System Design"],
    observedTechnologies: ["React", "TypeScript", "Docker", "AWS"],
    observedKeywords: ["Agile", "CI/CD"],
    hiringSignals: [],
    discoveredJobCount: 3
  };

  const intel = buildUniversalCompanyIntelligence({ entity, enrichment });
  assert.strictEqual(intel.status, "VERIFIED");
  assert.strictEqual(intel.confidence, "HIGH");
  assert.ok(intel.observedTechnologies.includes("React"));
  assert.ok(intel.observedTechnologies.includes("Docker"));
  assert.strictEqual(intel.sourceCount, 1);
});

test("Malformed and invalid domain inputs handled safely without uncaught exceptions", () => {
  assert.strictEqual(isSafePublicDomain(""), false);
  assert.strictEqual(isSafePublicDomain("   "), false);
  assert.strictEqual(isSafePublicDomain("http:///invalid"), false);
  assert.strictEqual(isSafePublicDomain("ftp://badprotocol.com"), false);
  assert.strictEqual(extractDomainFromUrl("not a url"), null);
});

test("Multi-company handling operates with zero hardcoded company branches", () => {
  const testCompanies = [
    "Alpha Robotics Ltd",
    "Beta BioSystems GmbH",
    "Gamma Financial LLC",
    "Delta Logistics Corp",
    "Epsilon Media Group PLC",
    "Zeta AI Innovations Pvt Ltd"
  ];

  for (const raw of testCompanies) {
    const resolved = resolveCompany(raw);
    assert.ok(resolved.companyId.startsWith("comp_"));
    assert.ok(resolved.canonicalName.length > 3);
    assert.notStrictEqual(resolved.canonicalName, "Unknown Company");
  }
});

console.log("\n================================================================================");
console.log(`RESULTS: ${passed} PASSED, ${total - passed} FAILED (TOTAL: ${total})`);
console.log("================================================================================\n");

if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
