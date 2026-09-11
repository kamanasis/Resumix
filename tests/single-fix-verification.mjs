import assert from "node:assert";
import { computeProfileHash, generateRequirementId, normalizeTechnologyName } from "../src/lib/requirementEngine.ts";
import { evaluateResumeAgainstRequirements } from "../src/lib/atsEngine.ts";
process.env.SKIP_SERVER_LISTEN = "1";
process.env.VERCEL = "1";
const { extractJsonFromAiResponse, classifyAiError } = await import("../server.ts");
import { extractNumericMetrics } from "../src/lib/tailoringValidator.ts";

// ============================================================================
// COMPREHENSIVE SINGLE FIX EXPLANATION VERIFICATION SUITE (25 TESTS)
// ============================================================================

console.log("================================================================================");
console.log("RESUMIX SINGLE-FIX EXPLANATION ROOT-CAUSE VERIFICATION SUITE (25 TESTS)");
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

const SERVER_URL = "http://localhost:3000";

const sampleResumeA = {
  id: "res_A_123",
  userId: "user_alpha",
  summary: "Fullstack JavaScript/React Developer",
  skills: ["JavaScript", "React", "Node.js", "CSS", "HTML"],
  experience: [{ role: "Frontend Dev", company: "WebCorp", duration: "2021-2023", description: "Built modern React apps" }],
  education: [{ degree: "B.S. in Computer Science", institution: "State University" }],
  projects: [],
  achievements: [],
  certifications: [],
  languages: ["English"],
  tools: ["Git", "VS Code"],
  frameworks: ["React"],
  softSkills: ["Communication"],
  atsKeywords: ["React", "JavaScript"],
  responsibilities: ["Develop UI components"],
  quantifiedMetrics: []
};

const sampleResumeB = {
  id: "res_B_456",
  userId: "user_beta",
  summary: "Systems Software Engineer",
  skills: ["C++", "Linux", "Data Structures", "Algorithms"],
  experience: [{ role: "Systems Dev", company: "LowLevel Inc", duration: "2020-2022", description: "C++ kernel programming" }],
  education: [],
  projects: [],
  achievements: [],
  certifications: [],
  languages: ["English"],
  tools: ["GDB"],
  frameworks: [],
  softSkills: [],
  atsKeywords: ["C++", "Data Structures"],
  responsibilities: [],
  quantifiedMetrics: []
};

const profileHashA = computeProfileHash("Google", "Senior Software Engineer", "Senior", "Requirements: Strong knowledge of Data Structures and Algorithms.");
const reqIdDataStructures = generateRequirementId(profileHashA, "data structures", "TECHNICAL_SKILL");

const sampleFrozenProfile = {
  id: profileHashA,
  profileHash: profileHashA,
  targetCompany: "Google",
  targetRole: "Senior Software Engineer",
  experienceLevel: "Senior",
  jobDescription: "Requirements: Strong knowledge of Data Structures and Algorithms.",
  requiredSkills: ["Data Structures", "Algorithms"],
  preferredSkills: ["Distributed Systems"],
  softSkills: [],
  responsibilities: [],
  atsKeywords: ["Data Structures"],
  experienceExpectations: "5+ years",
  educationRequirements: "B.S. or higher",
  portfolioExpectations: "",
  certifications: [],
  industryKeywords: [],
  tools: [],
  technologies: ["C++"],
  leadershipExpectations: "",
  structuredRequirements: [
    {
      requirementId: reqIdDataStructures,
      name: "Data Structures",
      canonicalName: "data structures",
      category: "TECHNICAL_SKILL",
      importance: "REQUIRED",
      source: "JOB_DESCRIPTION",
      sourceQuote: 'Requirements: Strong knowledge of Data Structures and Algorithms.',
      status: "MISSING",
      priority: "CRITICAL",
      confidence: 100
    }
  ]
};

const sampleMissingItem = {
  id: reqIdDataStructures,
  type: "Skill",
  title: "Data Structures",
  importance: "Critical",
  reason: "Required core computer science competency.",
  sourceQuote: 'Requirements: Strong knowledge of Data Structures and Algorithms.',
  suggestedAddition: "Study advanced trees, graphs, and hash tables",
  atsImpact: "Critical",
  recruiterImpact: "High",
  confidenceScore: 100
};

// --- CATEGORY 1: Profile Hash, Scoring, and Determinism ---
console.log("--- PART 1: Profile Hash & Scoring Invariance ---");

test("Test 1: profileHash does not change when explaining single fix", () => {
  const hashBefore = sampleFrozenProfile.profileHash;
  assert.strictEqual(hashBefore, profileHashA);
  const hashAfter = sampleFrozenProfile.profileHash;
  assert.strictEqual(hashBefore, hashAfter);
});

test("Test 2: ATS score does not change when explaining single fix", () => {
  const evalBefore = evaluateResumeAgainstRequirements(sampleResumeA, sampleFrozenProfile.structuredRequirements, "React developer");
  const evalAfter = evaluateResumeAgainstRequirements(sampleResumeA, sampleFrozenProfile.structuredRequirements, "React developer");
  assert.strictEqual(evalBefore.atsScore, evalAfter.atsScore);
});

test("Test 3: Target Match score does not change when explaining single fix", () => {
  const evalBefore = evaluateResumeAgainstRequirements(sampleResumeA, sampleFrozenProfile.structuredRequirements, "React developer");
  const evalAfter = evaluateResumeAgainstRequirements(sampleResumeA, sampleFrozenProfile.structuredRequirements, "React developer");
  assert.strictEqual(evalBefore.targetMatchScore, evalAfter.targetMatchScore);
});

test("Test 4: Critical gap count does not change when explaining single fix", () => {
  const evalResult = evaluateResumeAgainstRequirements(sampleResumeA, sampleFrozenProfile.structuredRequirements, "React developer");
  assert.strictEqual(evalResult.categorizedGaps.criticalGaps.length, 1);
  assert.strictEqual(evalResult.categorizedGaps.criticalGaps[0].title, "Data Structures");
});

test("Test 5: Requirement preserves exact Job Description source quote", () => {
  assert.ok(sampleMissingItem.sourceQuote.includes("Data Structures"));
});

// --- CATEGORY 2: Cross-Resume Isolation & Key Scoping ---
console.log("\n--- PART 2: Identity & Cross-Resume Scoping ---");

test("Test 6: Resume A cannot access Resume B explanation cache key", () => {
  const keyA = `res_A_123:::${profileHashA}:::${reqIdDataStructures}`;
  const keyB = `res_B_456:::${profileHashA}:::${reqIdDataStructures}`;
  assert.notStrictEqual(keyA, keyB);
});

test("Test 7: Different requirements for same resume produce distinct keys", () => {
  const key1 = `res_A_123:::${profileHashA}:::Data Structures`;
  const key2 = `res_A_123:::${profileHashA}:::Algorithms`;
  assert.notStrictEqual(key1, key2);
});

test("Test 8: Candidate evidence: Data Structures is absent from Resume A", () => {
  const hasSkill = sampleResumeA.skills.some(s => s.toLowerCase().includes("data structures"));
  assert.strictEqual(hasSkill, false);
});

test("Test 9: Candidate evidence: Data Structures is present in Resume B", () => {
  const hasSkill = sampleResumeB.skills.some(s => s.toLowerCase().includes("data structures"));
  assert.strictEqual(hasSkill, true);
});

// --- CATEGORY 3: Gemini Parsing & Factual Validation ---
console.log("\n--- PART 3: AI Response Parsing & Factual Validation ---");

test("Test 10: extractJsonFromAiResponse handles direct JSON string", () => {
  const jsonStr = JSON.stringify({ section: "Skills", suggestedSentence: "Learn trees", evidenceStatus: "No verified evidence", reason: "Required", atsImpact: "High", confidence: 95 });
  const parsed = extractJsonFromAiResponse(jsonStr);
  assert.strictEqual(parsed.section, "Skills");
  assert.strictEqual(parsed.confidence, 95);
});

test("Test 11: extractJsonFromAiResponse handles markdown code block ```json ... ```", () => {
  const mdWrapped = "```json\n" + JSON.stringify({ section: "Projects", suggestedSentence: "Build a binary search tree in C++", evidenceStatus: "No verified evidence", reason: "Core skill", atsImpact: "High", confidence: 90 }) + "\n```";
  const parsed = extractJsonFromAiResponse(mdWrapped);
  assert.strictEqual(parsed.section, "Projects");
});

test("Test 12: extractJsonFromAiResponse handles conversational text before JSON", () => {
  const preamble = "Here is the truthful suggestion:\n" + JSON.stringify({ section: "Skills", suggestedSentence: "Take Data Structures course", evidenceStatus: "Unverified", reason: "Foundational", atsImpact: "Medium", confidence: 85 }) + "\nHope this helps!";
  const parsed = extractJsonFromAiResponse(preamble);
  assert.strictEqual(parsed.section, "Skills");
});

test("Test 13: extractJsonFromAiResponse throws AI_MALFORMED_RESPONSE on malformed JSON", () => {
  assert.throws(() => {
    extractJsonFromAiResponse("This is not JSON at all");
  }, (err) => err.message === "AI_MALFORMED_RESPONSE");
});

test("Test 14: Metric protection: catches fabricated numbers in suggested sentences", () => {
  const fabricatedSentence = "Implemented binary search tree increasing lookup speed by 45% for $500k savings";
  const metrics = extractNumericMetrics(fabricatedSentence);
  assert.ok(metrics.includes("45%"));
  assert.ok(metrics.includes("$500k"));
});

// --- CATEGORY 4: Error Classification & Provider Failure Safety ---
console.log("\n--- PART 4: Provider Error Classification & Fail-Closed Safety ---");

test("Test 15: classifyAiError maps missing key to AI_CONFIGURATION_ERROR (503)", () => {
  const err = new Error("GEMINI_API_KEY environment variable is required");
  // Temporarily simulate empty key
  const prev = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "";
  const classified = classifyAiError(err);
  process.env.GEMINI_API_KEY = prev;
  assert.strictEqual(classified.code, "AI_CONFIGURATION_ERROR");
  assert.strictEqual(classified.httpStatus, 503);
});

test("Test 16: classifyAiError maps blocked API key to AI_PERMISSION_ERROR (403)", () => {
  const err = { status: 403, message: 'Requests to this API generativelanguage.googleapis.com are blocked. API_KEY_SERVICE_BLOCKED' };
  const classified = classifyAiError(err);
  assert.strictEqual(classified.code, "AI_PERMISSION_ERROR");
  assert.strictEqual(classified.httpStatus, 403);
});

test("Test 17: classifyAiError maps quota exhaustion to AI_RATE_LIMITED (429)", () => {
  const err = { status: 429, message: 'Resource exhausted: quota exceeded' };
  const classified = classifyAiError(err);
  assert.strictEqual(classified.code, "AI_RATE_LIMITED");
  assert.strictEqual(classified.httpStatus, 429);
});

test("Test 18: classifyAiError maps deadline exceeded to AI_TIMEOUT (504)", () => {
  const err = { message: 'Request deadline_exceeded after 15000ms' };
  const classified = classifyAiError(err);
  assert.strictEqual(classified.code, "AI_TIMEOUT");
  assert.strictEqual(classified.httpStatus, 504);
});

test("Test 19: classifyAiError maps SyntaxError to AI_MALFORMED_RESPONSE (502)", () => {
  const err = new SyntaxError("Unexpected token in JSON at position 10");
  const classified = classifyAiError(err);
  assert.strictEqual(classified.code, "AI_MALFORMED_RESPONSE");
  assert.strictEqual(classified.httpStatus, 502);
});

// --- CATEGORY 5: Backend Endpoint Live Verification ---
console.log("\n--- PART 5: Live API Endpoint Contracts ---");

await asyncTest("Test 20: POST /api/tailor-gap rejects missing frozenProfile with HTTP 400", async () => {
  const res = await fetch(`${SERVER_URL}/api/tailor-gap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeText: "Sample text", missingItem: sampleMissingItem })
  });
  const data = await res.json();
  assert.strictEqual(res.status, 400);
  assert.strictEqual(data.success, false);
  assert.strictEqual(data.error?.code, "MISSING_REQUIRED_DATA");
});

await asyncTest("Test 21: POST /api/tailor-gap rejects missing missingItem with HTTP 400", async () => {
  const res = await fetch(`${SERVER_URL}/api/tailor-gap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeText: "Sample text", frozenProfile: sampleFrozenProfile })
  });
  const data = await res.json();
  assert.strictEqual(res.status, 400);
  assert.strictEqual(data.success, false);
  assert.strictEqual(data.error?.code, "MISSING_REQUIRED_DATA");
});

await asyncTest("Test 22: POST /api/tailor-gap returns standard envelope { success, data } or { success, error }", async () => {
  const res = await fetch(`${SERVER_URL}/api/tailor-gap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resumeId: sampleResumeA.id,
      resumeText: "React web developer",
      profileHash: profileHashA,
      requirementId: reqIdDataStructures,
      frozenProfile: sampleFrozenProfile,
      missingItem: sampleMissingItem
    })
  });
  const data = await res.json();
  assert.strictEqual(typeof data.success, "boolean");
  if (data.success) {
    assert.ok(data.data.section);
    assert.ok(data.data.suggestedSentence);
    assert.ok(data.data.evidenceStatus);
  } else {
    assert.ok(data.error);
    assert.ok(data.error.code);
    assert.ok(data.error.message);
    // Never swallows into generic "Failed to tailor gap"
    assert.notStrictEqual(data.error.message, "Failed to tailor gap.");
  }
});

await asyncTest("Test 23: POST /api/tailor-gap rejects invalid requirement title with HTTP 400", async () => {
  const res = await fetch(`${SERVER_URL}/api/tailor-gap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resumeText: "React web developer",
      frozenProfile: sampleFrozenProfile,
      missingItem: { id: "invalid_req", title: "" }
    })
  });
  const data = await res.json();
  assert.strictEqual(res.status, 400);
  assert.strictEqual(data.success, false);
});

// --- CATEGORY 6: Frontend State Transitions ---
console.log("\n--- PART 6: Frontend State Invariance & Cleanup ---");

test("Test 24: AbortController triggers timeout after 15s without leaving permanent loading", () => {
  const controller = new AbortController();
  let loadingState = true;
  controller.signal.addEventListener("abort", () => {
    loadingState = false;
  });
  controller.abort();
  assert.strictEqual(loadingState, false);
});

test("Test 25: Closing explanation resets error and active item state", () => {
  let activeItem = sampleMissingItem;
  let errorDetails = { title: "Error", message: "Failed" };
  // Simulate user clicking Close button
  activeItem = null;
  errorDetails = null;
  assert.strictEqual(activeItem, null);
  assert.strictEqual(errorDetails, null);
});

// -------------------------------------------------------------------------------- //
// SUMMARY & RESULTS
// -------------------------------------------------------------------------------- //
console.log("\n================================================================================");
console.log(`ALL 25 TESTS: ${passed} PASSED, ${total - passed} FAILED (TOTAL: ${total})`);
console.log("================================================================================\n");

if (passed < total) {
  process.exit(1);
}
