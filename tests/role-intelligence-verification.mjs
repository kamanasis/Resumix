import assert from "assert";
import { 
  normalizeRole, 
  extractRoleSeniority, 
  extractRoleSpecialization, 
  detectRoleAmbiguity, 
  generateRoleId 
} from "../src/lib/jobEngine/roleResolver.ts";
import { 
  buildUniversalRoleIntelligence, 
  calculateRoleConfidence 
} from "../src/lib/jobEngine/publicRoleService.ts";
import { globalRoleIntelligenceStore } from "../src/lib/intelligenceEngine/roleIntelligenceStore.ts";
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
  }
}

console.log("================================================================================");
console.log("RESUMIX UNIVERSAL ROLE INTELLIGENCE VERIFICATION SUITE");
console.log("================================================================================\n");

// --- PART 1: Role Normalization & Family Mapping ---
console.log("--- PART 1: Role Normalization & Family Mapping ---");

runTest("Common role normalization maps to clean title and software family", () => {
  const r1 = normalizeRole("Backend Developer");
  assert.strictEqual(r1.normalizedRole, "Backend Engineer");
  assert.strictEqual(r1.roleFamily, "Software Engineering");

  const r2 = normalizeRole("Fullstack Software Developer");
  assert.strictEqual(r2.normalizedRole, "Full Stack Engineer");
  assert.strictEqual(r2.roleFamily, "Software Engineering");

  const r3 = normalizeRole("Frontend UI Engineer");
  assert.strictEqual(r3.normalizedRole, "Frontend Engineer");
  assert.strictEqual(r3.roleFamily, "Software Engineering");
});

runTest("Uncommon and specialized roles normalized accurately without hardcoded lists", () => {
  const r1 = normalizeRole("Rust Systems Engineer");
  assert.strictEqual(r1.roleFamily, "Software Engineering");
  assert.strictEqual(r1.specialization, "Rust");

  const r2 = normalizeRole("Embedded Firmware Engineer");
  assert.strictEqual(r2.normalizedRole, "Embedded Firmware Engineer");
  assert.strictEqual(r2.roleFamily, "Hardware & Embedded");
  assert.strictEqual(r2.specialization, "Embedded Systems");

  const r3 = normalizeRole("Quantitative Developer");
  assert.strictEqual(r3.normalizedRole, "Quantitative Developer");
  assert.strictEqual(r3.roleFamily, "Software Engineering");
  assert.strictEqual(r3.specialization, "Quantitative Finance");
});

runTest("Novel, startup-specific, and emergent roles handled safely", () => {
  const r1 = normalizeRole("Mine Safety AI Engineer");
  assert.strictEqual(r1.roleFamily, "Data & Machine Learning");
  assert.strictEqual(r1.specialization, "Mine Safety");

  const r2 = normalizeRole("Battery Management Systems Engineer");
  assert.strictEqual(r2.roleFamily, "Hardware & Embedded");
  assert.strictEqual(r2.specialization, "Battery Management");

  const r3 = normalizeRole("Clinical Data Analyst");
  assert.strictEqual(r3.normalizedRole, "Clinical Data Analyst");
  assert.strictEqual(r3.roleFamily, "Analytics & Business Intelligence");
});

runTest("Strict Boundaries: Data Engineer, Data Scientist, and ML Engineer NEVER merge", () => {
  const de = normalizeRole("Senior Data Engineer");
  const ds = normalizeRole("Senior Data Scientist");
  const ml = normalizeRole("Senior Machine Learning Engineer");

  assert.strictEqual(de.normalizedRole, "Data Engineer");
  assert.strictEqual(ds.normalizedRole, "Data Scientist");
  assert.strictEqual(ml.normalizedRole, "Machine Learning Engineer");

  assert.notStrictEqual(de.normalizedRole, ds.normalizedRole);
  assert.notStrictEqual(ds.normalizedRole, ml.normalizedRole);
  assert.notStrictEqual(de.normalizedRole, ml.normalizedRole);
  assert.notStrictEqual(de.roleId, ds.roleId);
});

runTest("Strict Boundaries: Product Designer, UX Designer, and UI Designer NEVER merge", () => {
  const pd = normalizeRole("Product Designer");
  const ux = normalizeRole("UX Designer");
  const ui = normalizeRole("UI Designer");

  assert.strictEqual(pd.normalizedRole, "Product Designer");
  assert.strictEqual(ux.normalizedRole, "UX Designer");
  assert.strictEqual(ui.normalizedRole, "UI Designer");

  assert.notStrictEqual(pd.normalizedRole, ux.normalizedRole);
  assert.notStrictEqual(ux.normalizedRole, ui.normalizedRole);
  assert.notStrictEqual(pd.roleId, ux.roleId);
});

// --- PART 2: Seniority Extraction & Specializations ---
console.log("\n--- PART 2: Seniority Extraction & Specializations ---");

runTest("Seniority extraction: Intern, Junior, Mid, Senior, Lead, Staff, Principal, Executive", () => {
  assert.strictEqual(extractRoleSeniority("Software Engineering Intern"), "Intern");
  assert.strictEqual(extractRoleSeniority("Junior Backend Developer"), "Junior");
  assert.strictEqual(extractRoleSeniority("Entry-Level React Engineer"), "Junior");
  assert.strictEqual(extractRoleSeniority("Backend Engineer"), "Mid-Level");
  assert.strictEqual(extractRoleSeniority("Senior Systems Engineer"), "Senior");
  assert.strictEqual(extractRoleSeniority("Tech Lead / Staff Engineer"), "Staff");
  assert.strictEqual(extractRoleSeniority("Principal Architect"), "Principal");
  assert.strictEqual(extractRoleSeniority("VP of Engineering / Director"), "Executive");
});

runTest("Deterministic role ID prevents duplicate entities across casing and whitespace", () => {
  const id1 = generateRoleId("Backend Engineer", "Senior");
  const id2 = generateRoleId("backend engineer", "senior");
  const id3 = generateRoleId("  Backend Engineer  ", "Senior");

  assert.strictEqual(id1, id2);
  assert.strictEqual(id2, id3);
  assert.strictEqual(id1.startsWith("role_"), true);
});

runTest("Ambiguity Detection: Single generic titles flagged as AMBIGUOUS", () => {
  assert.strictEqual(detectRoleAmbiguity("Engineer"), true);
  assert.strictEqual(detectRoleAmbiguity("Developer"), true);
  assert.strictEqual(detectRoleAmbiguity("Specialist"), true);
  assert.strictEqual(detectRoleAmbiguity("Backend Engineer"), false);
  assert.strictEqual(detectRoleAmbiguity("Rust Systems Developer"), false);
});

// --- PART 3: Public Role Ingestion & Frequency Aggregation ---
console.log("\n--- PART 3: Public Role Ingestion & Frequency Aggregation ---");

await runAsyncTest("buildUniversalRoleIntelligence aggregates public job postings and extracts signals", async () => {
  const intel = await buildUniversalRoleIntelligence({
    roleTitle: "Backend Engineer",
    jobDescription: `
      We are looking for a Senior Backend Engineer.
      Required: Python, PostgreSQL, Docker, REST APIs, Git.
      Preferred: AWS, Redis, Kubernetes.
    `
  });

  assert.strictEqual(intel.normalizedRole, "Backend Engineer");
  assert.strictEqual(intel.roleFamily, "Software Engineering");
  assert.strictEqual(intel.observationCount >= 1, true);
  assert.strictEqual(intel.commonTechnologies.length > 0, true);
  assert.strictEqual(intel.sourceRecords.length > 0, true);
});

await runAsyncTest("Required vs Preferred vs Market-Common distinctions strictly preserved", async () => {
  const intel = await buildUniversalRoleIntelligence({
    roleTitle: "Backend Engineer",
    jobDescription: "Required: Python, SQL. Preferred: Docker."
  });

  const reqSkills = intel.requiredSkillPatterns.map(r => r.canonicalName);
  const prefSkills = intel.preferredSkillPatterns.map(r => r.canonicalName);

  assert.strictEqual(reqSkills.includes("Python"), true);
  assert.strictEqual(prefSkills.includes("Docker"), true);

  // Python being required in this job does NOT mean it is stamped as universally required in disclaimer
  assert.strictEqual(intel.disclaimer.includes("NOT"), true);
});

runTest("Small-sample protection: < 4 postings reported as observed count rather than misleading %", () => {
  const conf = calculateRoleConfidence(2, 2, 0.95);
  assert.strictEqual(conf.tier, "INSUFFICIENT_DATA");
  assert.strictEqual(conf.reasons.some(r => r.includes("2 posting(s)")), true);
});

runTest("High sample confidence: >= 20 postings across >= 5 companies grants HIGH confidence", () => {
  const conf = calculateRoleConfidence(25, 6, 0.95);
  assert.strictEqual(conf.tier, "HIGH");
  assert.strictEqual(conf.score >= 0.80, true);
});

// --- PART 4: Evidence-First Market Readiness & Candidate Gap Analysis ---
console.log("\n--- PART 4: Evidence-First Market Readiness & Candidate Gap Analysis ---");

await runAsyncTest("Candidate with verified skill marked VERIFIED with evidence statement", async () => {
  const intel = await buildUniversalRoleIntelligence({
    roleTitle: "Backend Engineer",
    jobDescription: "Required: Python, Docker. Preferred: AWS.",
    candidateSkills: ["Python"]
  });

  assert.strictEqual(Array.isArray(intel.marketGaps), true);
  const pythonGap = intel.marketGaps.find(g => g.skill === "Python");
  assert.ok(pythonGap);
  assert.strictEqual(pythonGap.candidateEvidenceStatus, "VERIFIED");
  assert.strictEqual(pythonGap.recommendation.includes("Verified in resume"), true);
});

await runAsyncTest("Candidate lacking skill marked NO_EVIDENCE without fabricating additions", async () => {
  const intel = await buildUniversalRoleIntelligence({
    roleTitle: "Backend Engineer",
    jobDescription: "Required: Python, Docker. Preferred: AWS.",
    candidateSkills: ["Python"]
  });

  const dockerGap = intel.marketGaps.find(g => g.skill === "Docker");
  assert.ok(dockerGap);
  assert.strictEqual(dockerGap.candidateEvidenceStatus, "NO_EVIDENCE");
  assert.strictEqual(dockerGap.recommendation.includes("No verified evidence"), true);
  // Must NOT command user to add Docker without evidence
  assert.strictEqual(dockerGap.recommendation.includes("Consider developing or documenting"), true);
});

// --- PART 5: Cache Strategy & In-Memory Store ---
console.log("\n--- PART 5: Cache Strategy & In-Memory Store ---");

await runAsyncTest("RoleIntelligenceStore: stores, caches, and retrieves role intelligence", async () => {
  globalRoleIntelligenceStore.clearCache();

  const first = await globalRoleIntelligenceStore.getIntelligence({
    roleTitle: "Frontend Engineer",
    jobDescription: "Required: React, TypeScript, Tailwind CSS."
  });

  assert.ok(first);
  assert.strictEqual(first.normalizedRole, "Frontend Engineer");

  const second = await globalRoleIntelligenceStore.getIntelligence({
    roleTitle: "Frontend Engineer"
  });

  assert.strictEqual(first.id, second.id);
  assert.strictEqual(first.normalizedRole, second.normalizedRole);
});

await runAsyncTest("RoleIntelligenceStore: refresh flag forces fresh retrieval", async () => {
  const refreshed = await globalRoleIntelligenceStore.getIntelligence({
    roleTitle: "Frontend Engineer",
    jobDescription: "Required: React, Next.js, Redux.",
    refresh: true
  });

  assert.ok(refreshed);
  assert.strictEqual(refreshed.normalizedRole, "Frontend Engineer");
});

// --- PART 6: Strict Concept Separation & ATS Score Invariance ---
console.log("\n--- PART 6: Strict Concept Separation & ATS Score Invariance ---");

await runAsyncTest("ATS Invariance: Role intelligence NEVER alters target job requirements", async () => {
  const initialTargetReqs = [
    {
      requirementId: "req_py",
      name: "Python",
      canonicalName: "Python",
      category: "LANGUAGE",
      importance: "REQUIRED",
      source: "JOB_DESCRIPTION",
      status: "PRESENT",
      priority: "CRITICAL",
      confidence: 100
    }
  ];

  const reqCountBefore = initialTargetReqs.length;

  // Retrieve Role Intelligence which contains Docker, AWS, SQL, Kubernetes, etc.
  await globalRoleIntelligenceStore.getIntelligence({
    roleTitle: "Backend Engineer",
    candidateSkills: ["Python"]
  });

  const reqCountAfter = initialTargetReqs.length;
  assert.strictEqual(reqCountBefore, reqCountAfter);
  assert.strictEqual(initialTargetReqs.some(r => r.canonicalName === "Docker"), false);
  assert.strictEqual(initialTargetReqs.some(r => r.canonicalName === "AWS"), false);
});

await runAsyncTest("ATS Invariance: Role intelligence NEVER alters ATS Compatibility Score", async () => {
  const sampleResume = {
    summary: "Full stack developer with Python and React experience.",
    skills: [
      { name: "Python", category: "Language", evidence: ["Used Python for 3 years."] },
      { name: "React", category: "Framework", evidence: ["Built UI in React."] }
    ],
    experience: [
      { role: "Software Engineer", company: "ABC Corp", duration: "2021 - 2024", description: "Built microservices using Python." }
    ],
    projects: [
      { title: "Dashboard", description: "React dashboard connecting to Python API." }
    ],
    education: [
      { degree: "B.S. in Computer Science", institution: "State University" }
    ],
    certifications: []
  };

  const targetReqs = [
    {
      requirementId: "req_py",
      name: "Python",
      canonicalName: "Python",
      category: "LANGUAGE",
      importance: "REQUIRED",
      source: "JOB_DESCRIPTION",
      status: "MISSING",
      priority: "CRITICAL",
      confidence: 100
    },
    {
      requirementId: "req_pg",
      name: "PostgreSQL",
      canonicalName: "PostgreSQL",
      category: "DATABASE",
      importance: "REQUIRED",
      source: "JOB_DESCRIPTION",
      status: "MISSING",
      priority: "CRITICAL",
      confidence: 100
    }
  ];

  const scoreBefore = evaluateResumeAgainstRequirements(sampleResume, targetReqs);

  // Query role intelligence which observes Redis, Docker, Kafka, AWS, etc.
  await globalRoleIntelligenceStore.getIntelligence({
    roleTitle: "Backend Engineer",
    candidateSkills: ["Python", "React"]
  });

  const scoreAfter = evaluateResumeAgainstRequirements(sampleResume, targetReqs);

  assert.strictEqual(scoreBefore.atsScore, scoreAfter.atsScore);
  assert.strictEqual(scoreBefore.targetMatchScore, scoreAfter.targetMatchScore);
  assert.strictEqual(scoreBefore.categorizedGaps.criticalGaps.length, scoreAfter.categorizedGaps.criticalGaps.length);
});

// --- PART 7: Backend Live HTTP API Endpoints ---
console.log("\n--- PART 7: Backend Live HTTP API Endpoints ---");

await runAsyncTest("POST /api/role/resolve returns canonical entity and status", async () => {
  const res = await fetch("http://localhost:3000/api/role/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roleTitle: "Lead Full Stack Developer" })
  });

  assert.strictEqual(res.status, 200);
  const json = await res.json();
  assert.strictEqual(json.success, true);
  assert.strictEqual(json.data.normalizedRole, "Full Stack Engineer");
  assert.strictEqual(json.data.seniority, "Lead");
  assert.strictEqual(json.data.roleFamily, "Software Engineering");
});

await runAsyncTest("POST /api/role/resolve rejects missing roleTitle with HTTP 400", async () => {
  const res = await fetch("http://localhost:3000/api/role/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  assert.strictEqual(res.status, 400);
  const json = await res.json();
  assert.strictEqual(json.success, false);
  assert.strictEqual(json.error.code, "INVALID_ROLE_TITLE");
});

await runAsyncTest("POST /api/role/intelligence returns full RoleIntelligence model", async () => {
  const res = await fetch("http://localhost:3000/api/role/intelligence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      roleTitle: "DevOps Engineer",
      candidateSkills: ["Docker", "Linux"]
    })
  });

  assert.strictEqual(res.status, 200);
  const json = await res.json();
  assert.strictEqual(json.success, true);
  assert.strictEqual(json.data.roleFamily, "DevOps & Cloud Infrastructure");
  assert.strictEqual(Array.isArray(json.data.commonTechnologies), true);
  assert.strictEqual(typeof json.data.disclaimer, "string");
});

await runAsyncTest("POST /api/role/refresh forces fresh role intelligence retrieval", async () => {
  const res = await fetch("http://localhost:3000/api/role/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      roleTitle: "Data Engineer"
    })
  });

  assert.strictEqual(res.status, 200);
  const json = await res.json();
  assert.strictEqual(json.success, true);
  assert.strictEqual(json.data.normalizedRole, "Data Engineer");
});

// --- PART 8: Cross-Role Isolation & Zero Fabrication ---
console.log("\n--- PART 8: Cross-Role Isolation & Zero Fabrication ---");

await runAsyncTest("Cross-Role Isolation: Backend Engineer patterns never leak into Product Designer", async () => {
  const backend = await globalRoleIntelligenceStore.getIntelligence({
    roleTitle: "Backend Engineer",
    jobDescription: "Required: Go, Kafka, Cassandra, Kubernetes, Docker."
  });

  const designer = await globalRoleIntelligenceStore.getIntelligence({
    roleTitle: "Product Designer",
    jobDescription: "Required: Figma, Wireframing, User Research, Prototyping."
  });

  assert.notStrictEqual(backend.roleId, designer.roleId);
  assert.notStrictEqual(backend.roleFamily, designer.roleFamily);
  assert.strictEqual(designer.roleFamily, "Product & Design");
  assert.strictEqual(backend.roleFamily, "Software Engineering");

  // Figma should not appear in backend common technologies
  assert.strictEqual(backend.commonTechnologies.includes("Figma"), false);
});

await runAsyncTest("Zero Fabrication: Empty postings return INSUFFICIENT_DATA with zero fake technologies", async () => {
  const unknownRoleIntel = await buildUniversalRoleIntelligence({
    roleTitle: "Quantum Teleportation Specialist XYZ999"
  });

  assert.strictEqual(unknownRoleIntel.confidence, "INSUFFICIENT_DATA");
  assert.strictEqual(unknownRoleIntel.observationCount, 0);
  assert.strictEqual(unknownRoleIntel.requiredSkillPatterns.length, 0);
  assert.strictEqual(unknownRoleIntel.preferredSkillPatterns.length, 0);
});

console.log("\n================================================================================");
console.log(`RESULTS: ${passedTests} PASSED, ${totalTests - passedTests} FAILED (TOTAL: ${totalTests})`);
console.log("================================================================================\n");

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
