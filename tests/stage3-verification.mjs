import assert from "node:assert";
import {
  computeProfileHash,
  generateRequirementId,
  normalizeTechnologyName,
  areTechnologiesEquivalent,
  isDistinctTechnology,
  deduplicateRequirements
} from "../src/lib/requirementEngine.js";
import {
  evaluateResumeAgainstRequirements,
  ATS_WEIGHTS
} from "../src/lib/atsEngine.js";

// ============================================================================
// RESUMIX STAGE 3 AUTOMATED VERIFICATION SUITE
// ============================================================================

console.log("=================================================");
console.log("   RESUMIX STAGE 3 AUTOMATED VERIFICATION SUITE  ");
console.log("=================================================\n");

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] TEST ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] TEST ${totalTests}: ${name}`);
    console.error(`       Error: ${err.message}\n`);
  }
}

// ----------------------------------------------------------------------------
// Test Data Fixtures
// ----------------------------------------------------------------------------

const sampleResumePythonReact = {
  summary: "Full Stack Software Engineer with experience in Python and React.",
  skills: ["Python", "React", "TypeScript", "PostgreSQL", "Git"],
  skillEvidence: [
    { skill: "Python", evidence: "Developed backend scripts in Python." },
    { skill: "React", evidence: "Built reactive web frontends using React and TypeScript." },
    { skill: "PostgreSQL", evidence: "Managed relational databases with PostgreSQL." }
  ],
  experience: [
    {
      role: "Software Engineer",
      company: "Tech Corp",
      duration: "2023 - Present",
      description: "Developed scalable web apps with React and Python."
    }
  ],
  education: [{ degree: "B.S. in Computer Science", institution: "University X" }],
  projects: [{ title: "Portfolio Web App", description: "Created fullstack app in React and Python." }],
  achievements: ["Employee of the Month"],
  certifications: [],
  languages: ["English"],
  tools: ["Git", "VS Code"],
  frameworks: ["React"],
  softSkills: ["Communication", "Problem Solving"],
  atsKeywords: ["Full Stack", "APIs"],
  responsibilities: ["Code review", "Feature delivery"],
  quantifiedMetrics: ["Improved page load by 30%"]
};

// ----------------------------------------------------------------------------
// TEST 1: Identical inputs produce identical profile hash
// ----------------------------------------------------------------------------
runTest("Same company + role + JD produces identical requirement profile hash", () => {
  const hash1 = computeProfileHash("Google", "Backend Engineer", "3–5 years", "Requires Go, Kubernetes, and gRPC.");
  const hash2 = computeProfileHash("Google", "Backend Engineer", "3–5 years", "Requires Go, Kubernetes, and gRPC.");
  const hash3 = computeProfileHash("google", "backend engineer ", "3–5 years", "Requires Go,   Kubernetes, and gRPC.");

  assert.strictEqual(hash1, hash2);
  assert.strictEqual(hash1, hash3);
  assert.strictEqual(typeof hash1, "string");
  assert.strictEqual(hash1.length, 16);
});

// ----------------------------------------------------------------------------
// TEST 2: Deterministic ATS scoring produces identical score across multiple runs
// ----------------------------------------------------------------------------
runTest("Re-running gap analysis with identical inputs produces identical ATS score", () => {
  const profileHash = computeProfileHash("Stripe", "Fullstack Engineer", "3-5 years", "React and Python required");
  const targetReqs = [
    {
      requirementId: generateRequirementId(profileHash, "React", "TECHNICAL_SKILL"),
      name: "React",
      canonicalName: "React",
      category: "TECHNICAL_SKILL",
      importance: "REQUIRED",
      source: "JOB_DESCRIPTION",
      status: "MISSING",
      priority: "CRITICAL",
      confidence: 100
    },
    {
      requirementId: generateRequirementId(profileHash, "Python", "TECHNICAL_SKILL"),
      name: "Python",
      canonicalName: "Python",
      category: "TECHNICAL_SKILL",
      importance: "REQUIRED",
      source: "JOB_DESCRIPTION",
      status: "MISSING",
      priority: "CRITICAL",
      confidence: 100
    },
    {
      requirementId: generateRequirementId(profileHash, "Docker", "TOOL"),
      name: "Docker",
      canonicalName: "Docker",
      category: "TOOL",
      importance: "PREFERRED",
      source: "JOB_DESCRIPTION",
      status: "MISSING",
      priority: "HIGH",
      confidence: 100
    }
  ];

  const eval1 = evaluateResumeAgainstRequirements(sampleResumePythonReact, targetReqs);
  const eval2 = evaluateResumeAgainstRequirements(sampleResumePythonReact, targetReqs);
  const eval3 = evaluateResumeAgainstRequirements(sampleResumePythonReact, targetReqs);

  assert.strictEqual(eval1.atsScore, eval2.atsScore);
  assert.strictEqual(eval2.atsScore, eval3.atsScore);
  assert.strictEqual(eval1.atsScore > 0 && eval1.atsScore <= 100, true);
});

// ----------------------------------------------------------------------------
// TEST 3: Deterministic Target Match score produces identical score
// ----------------------------------------------------------------------------
runTest("Re-running gap analysis with identical inputs produces identical Target Match score", () => {
  const profileHash = computeProfileHash("Meta", "Frontend Engineer", "1-2 years");
  const targetReqs = [
    {
      requirementId: generateRequirementId(profileHash, "React", "TECHNICAL_SKILL"),
      name: "React",
      canonicalName: "React",
      category: "TECHNICAL_SKILL",
      importance: "REQUIRED",
      source: "TARGET_ROLE",
      status: "MISSING",
      priority: "CRITICAL",
      confidence: 100
    }
  ];

  const eval1 = evaluateResumeAgainstRequirements(sampleResumePythonReact, targetReqs);
  const eval2 = evaluateResumeAgainstRequirements(sampleResumePythonReact, targetReqs);

  assert.strictEqual(eval1.targetMatchScore, eval2.targetMatchScore);
  assert.strictEqual(eval1.targetMatchScore >= 80 && eval1.targetMatchScore <= 100, true);
});

// ----------------------------------------------------------------------------
// TEST 4: Target requires Rust, Resume lacks Rust -> Rust is MISSING & Critical Gap
// ----------------------------------------------------------------------------
runTest("Target requiring Rust marks Rust as MISSING when resume lacks Rust", () => {
  const profileHash = computeProfileHash("Figma", "Systems Engineer", "3+ years", "Rust required");
  const targetReqs = [
    {
      requirementId: generateRequirementId(profileHash, "Rust", "TECHNICAL_SKILL"),
      name: "Rust",
      canonicalName: "Rust",
      category: "TECHNICAL_SKILL",
      importance: "REQUIRED",
      source: "JOB_DESCRIPTION",
      status: "MISSING",
      priority: "CRITICAL",
      confidence: 100
    }
  ];

  const evalResult = evaluateResumeAgainstRequirements(sampleResumePythonReact, targetReqs);
  const rustReq = evalResult.evaluatedRequirements.find(r => r.canonicalName === "Rust");

  assert.strictEqual(rustReq.status, "MISSING");
  assert.strictEqual(evalResult.categorizedGaps.criticalGaps.length, 1);
  assert.strictEqual(evalResult.categorizedGaps.criticalGaps[0].title, "Rust");
  assert.strictEqual(evalResult.isReadyToApply, false);
});

// ----------------------------------------------------------------------------
// TEST 5: Target requires Django, Resume has Django -> Django is PRESENT with evidence
// ----------------------------------------------------------------------------
runTest("Target requiring Django matches Django with source evidence", () => {
  const resumeWithDjango = {
    ...sampleResumePythonReact,
    skills: ["Python", "Django", "PostgreSQL"],
    skillEvidence: [{ skill: "Django", evidence: "Developed backend microservices using Django." }]
  };

  const profileHash = computeProfileHash("Pinterest", "Backend Engineer", "2+ years", "Django required");
  const targetReqs = [
    {
      requirementId: generateRequirementId(profileHash, "Django", "FRAMEWORK"),
      name: "Django",
      canonicalName: "Django",
      category: "FRAMEWORK",
      importance: "REQUIRED",
      source: "JOB_DESCRIPTION",
      status: "MISSING",
      priority: "CRITICAL",
      confidence: 100
    }
  ];

  const evalResult = evaluateResumeAgainstRequirements(resumeWithDjango, targetReqs);
  const djangoReq = evalResult.evaluatedRequirements.find(r => r.canonicalName === "Django");

  assert.strictEqual(djangoReq.status, "PRESENT");
  assert.strictEqual(djangoReq.evidenceQuote.includes("Django"), true);
  assert.strictEqual(evalResult.isReadyToApply, true);
});

// ----------------------------------------------------------------------------
// TEST 6: Target requires Django, Resume has Python only -> Django != PRESENT
// ----------------------------------------------------------------------------
runTest("Target requiring Django strictly excludes candidates with only generic Python", () => {
  const profileHash = computeProfileHash("Pinterest", "Backend Engineer", "2+ years", "Django required");
  const targetReqs = [
    {
      requirementId: generateRequirementId(profileHash, "Django", "FRAMEWORK"),
      name: "Django",
      canonicalName: "Django",
      category: "FRAMEWORK",
      importance: "REQUIRED",
      source: "JOB_DESCRIPTION",
      status: "MISSING",
      priority: "CRITICAL",
      confidence: 100
    }
  ];

  const evalResult = evaluateResumeAgainstRequirements(sampleResumePythonReact, targetReqs);
  const djangoReq = evalResult.evaluatedRequirements.find(r => r.canonicalName === "Django");

  assert.strictEqual(djangoReq.status, "MISSING");
  assert.strictEqual(evalResult.isReadyToApply, false);
});

// ----------------------------------------------------------------------------
// TEST 7: Target requires Rust, Resume has Rust -> Rust = PRESENT
// ----------------------------------------------------------------------------
runTest("Target requiring Rust matches candidate with verified Rust", () => {
  const resumeWithRust = {
    ...sampleResumePythonReact,
    skills: ["Rust", "Tokio", "C++"],
    skillEvidence: [{ skill: "Rust", evidence: "Built low-latency async services in Rust." }]
  };

  const profileHash = computeProfileHash("Cloudflare", "Systems Engineer", "2+ years", "Rust required");
  const targetReqs = [
    {
      requirementId: generateRequirementId(profileHash, "Rust", "LANGUAGE"),
      name: "Rust",
      canonicalName: "Rust",
      category: "LANGUAGE",
      importance: "REQUIRED",
      source: "JOB_DESCRIPTION",
      status: "MISSING",
      priority: "CRITICAL",
      confidence: 100
    }
  ];

  const evalResult = evaluateResumeAgainstRequirements(resumeWithRust, targetReqs);
  const rustReq = evalResult.evaluatedRequirements.find(r => r.canonicalName === "Rust");

  assert.strictEqual(rustReq.status, "PRESENT");
});

// ----------------------------------------------------------------------------
// TEST 8: Target requires React.js, Resume has React -> React = PRESENT via normalization
// ----------------------------------------------------------------------------
runTest("Controlled normalization matches React.js in target to React in resume", () => {
  const profileHash = computeProfileHash("Shopify", "Frontend Engineer", "1-2 years", "React.js required");
  const targetReqs = [
    {
      requirementId: generateRequirementId(profileHash, "React", "FRAMEWORK"),
      name: "React.js",
      canonicalName: normalizeTechnologyName("React.js"),
      category: "FRAMEWORK",
      importance: "REQUIRED",
      source: "JOB_DESCRIPTION",
      status: "MISSING",
      priority: "CRITICAL",
      confidence: 100
    }
  ];

  const evalResult = evaluateResumeAgainstRequirements(sampleResumePythonReact, targetReqs);
  const reactReq = evalResult.evaluatedRequirements[0];

  assert.strictEqual(reactReq.status, "PRESENT");
});

// ----------------------------------------------------------------------------
// TEST 9: Target requires PostgreSQL, Resume has Postgres -> PostgreSQL = PRESENT
// ----------------------------------------------------------------------------
runTest("Controlled normalization matches PostgreSQL in target to Postgres in resume", () => {
  const resumeWithPostgres = {
    ...sampleResumePythonReact,
    skills: ["Python", "Postgres"]
  };

  const profileHash = computeProfileHash("Uber", "Backend Engineer", "2+ years", "PostgreSQL required");
  const targetReqs = [
    {
      requirementId: generateRequirementId(profileHash, "PostgreSQL", "DATABASE"),
      name: "PostgreSQL",
      canonicalName: normalizeTechnologyName("PostgreSQL"),
      category: "DATABASE",
      importance: "REQUIRED",
      source: "JOB_DESCRIPTION",
      status: "MISSING",
      priority: "CRITICAL",
      confidence: 100
    }
  ];

  const evalResult = evaluateResumeAgainstRequirements(resumeWithPostgres, targetReqs);
  const pgReq = evalResult.evaluatedRequirements[0];

  assert.strictEqual(pgReq.status, "PRESENT");
});

// ----------------------------------------------------------------------------
// TEST 10: Target requires Python, Resume has Django -> Python not assumed unless evidence exists
// ----------------------------------------------------------------------------
runTest("Distinct technology isolation prevents Django from silently assuming Python without evidence", () => {
  assert.strictEqual(isDistinctTechnology("python", "django"), true);
  assert.strictEqual(areTechnologiesEquivalent("python", "django"), false);
  assert.strictEqual(areTechnologiesEquivalent("javascript", "react"), false);
  assert.strictEqual(areTechnologiesEquivalent("aws", "kubernetes"), false);
});

// ----------------------------------------------------------------------------
// TEST 11: All required requirements satisfied -> Critical gaps = 0, isReadyToApply = true
// ----------------------------------------------------------------------------
runTest("Satisfying all required items yields 0 critical gaps and READY_TO_APPLY state", () => {
  const profileHash = computeProfileHash("Airbnb", "Frontend Engineer", "2+ years");
  const targetReqs = [
    {
      requirementId: generateRequirementId(profileHash, "React", "FRAMEWORK"),
      name: "React",
      canonicalName: "React",
      category: "FRAMEWORK",
      importance: "REQUIRED",
      source: "TARGET_ROLE",
      status: "MISSING",
      priority: "CRITICAL",
      confidence: 100
    },
    {
      requirementId: generateRequirementId(profileHash, "TypeScript", "LANGUAGE"),
      name: "TypeScript",
      canonicalName: "TypeScript",
      category: "LANGUAGE",
      importance: "REQUIRED",
      source: "TARGET_ROLE",
      status: "MISSING",
      priority: "CRITICAL",
      confidence: 100
    }
  ];

  const evalResult = evaluateResumeAgainstRequirements(sampleResumePythonReact, targetReqs);

  assert.strictEqual(evalResult.categorizedGaps.criticalGaps.length, 0);
  assert.strictEqual(evalResult.isReadyToApply, true);
  assert.strictEqual(evalResult.completionState, "READY_TO_APPLY");
});

// ----------------------------------------------------------------------------
// TEST 12: Optional/Preferred requirement missing -> isReadyToApply remains true
// ----------------------------------------------------------------------------
runTest("Missing optional or preferred requirements do NOT block READY_TO_APPLY", () => {
  const profileHash = computeProfileHash("Airbnb", "Frontend Engineer", "2+ years");
  const targetReqs = [
    {
      requirementId: generateRequirementId(profileHash, "React", "FRAMEWORK"),
      name: "React",
      canonicalName: "React",
      category: "FRAMEWORK",
      importance: "REQUIRED",
      source: "TARGET_ROLE",
      status: "MISSING",
      priority: "CRITICAL",
      confidence: 100
    },
    {
      requirementId: generateRequirementId(profileHash, "GraphQL", "TOOL"),
      name: "GraphQL",
      canonicalName: "GraphQL",
      category: "TOOL",
      importance: "OPTIONAL",
      source: "TARGET_ROLE",
      status: "MISSING",
      priority: "LOW",
      confidence: 100
    }
  ];

  const evalResult = evaluateResumeAgainstRequirements(sampleResumePythonReact, targetReqs);

  assert.strictEqual(evalResult.categorizedGaps.criticalGaps.length, 0);
  assert.strictEqual(evalResult.categorizedGaps.optionalImprovements.length, 1);
  assert.strictEqual(evalResult.isReadyToApply, true);
  assert.strictEqual(evalResult.completionState, "READY_TO_APPLY");
});

// ----------------------------------------------------------------------------
// TEST 13: Changing Target Role or JD produces different profileHash
// ----------------------------------------------------------------------------
runTest("Changing target role or job description produces distinct profileHash", () => {
  const hashA = computeProfileHash("Google", "Software Engineer", "1-2 years", "Java required");
  const hashB = computeProfileHash("Google", "Software Engineer", "1-2 years", "Rust required");
  const hashC = computeProfileHash("Google", "Product Manager", "1-2 years", "Java required");

  assert.notStrictEqual(hashA, hashB);
  assert.notStrictEqual(hashA, hashC);
});

// ----------------------------------------------------------------------------
// TEST 14: Score edge cases (0 requirements, all matched, no match) produce valid numbers
// ----------------------------------------------------------------------------
runTest("Score normalization handles 0 requirements and extreme bounds without NaN or /0", () => {
  const emptyEval = evaluateResumeAgainstRequirements(sampleResumePythonReact, []);
  assert.strictEqual(Number.isNaN(emptyEval.atsScore), false);
  assert.strictEqual(Number.isNaN(emptyEval.targetMatchScore), false);
  assert.strictEqual(emptyEval.atsScore >= 0 && emptyEval.atsScore <= 100, true);

  const impossibleReqs = Array.from({ length: 50 }, (_, i) => ({
    requirementId: `req_imp_${i}`,
    name: `ImpossibleSkill_${i}`,
    canonicalName: `ImpossibleSkill_${i}`,
    category: "TECHNICAL_SKILL",
    importance: "REQUIRED",
    source: "JOB_DESCRIPTION",
    status: "MISSING",
    priority: "CRITICAL",
    confidence: 100
  }));

  const zeroEval = evaluateResumeAgainstRequirements(sampleResumePythonReact, impossibleReqs);
  assert.strictEqual(zeroEval.atsScore, 0);
  assert.strictEqual(zeroEval.targetMatchScore >= 0 && zeroEval.targetMatchScore <= 100, true);
  assert.strictEqual(Number.isNaN(zeroEval.atsScore), false);
});

// ----------------------------------------------------------------------------
// TEST 15: Deduplication of repeated requirements
// ----------------------------------------------------------------------------
runTest("Repeated requirement mentions in job description resolve to exactly one canonical requirement", () => {
  const reqs = [
    {
      requirementId: "1",
      name: "React.js",
      canonicalName: "React",
      category: "TECHNICAL_SKILL",
      importance: "PREFERRED",
      source: "AI_INFERENCE",
      status: "MISSING",
      priority: "HIGH",
      confidence: 100
    },
    {
      requirementId: "2",
      name: "React",
      canonicalName: "React",
      category: "TECHNICAL_SKILL",
      importance: "REQUIRED",
      source: "JOB_DESCRIPTION",
      status: "MISSING",
      priority: "CRITICAL",
      confidence: 100
    }
  ];

  const deduped = deduplicateRequirements(reqs);
  assert.strictEqual(deduped.length, 1);
  assert.strictEqual(deduped[0].canonicalName, "React");
  assert.strictEqual(deduped[0].importance, "REQUIRED");
  assert.strictEqual(deduped[0].source, "JOB_DESCRIPTION");
});

// ----------------------------------------------------------------------------
// TEST 16: Anti-Goalpost Moving guarantee
// ----------------------------------------------------------------------------
runTest("Anti-Goalpost Moving: Re-evaluating satisfied frozen profile never invents new requirements", () => {
  const profileHash = computeProfileHash("Netflix", "UI Engineer", "3+ years");
  const frozenReqs = [
    {
      requirementId: generateRequirementId(profileHash, "React", "FRAMEWORK"),
      name: "React",
      canonicalName: "React",
      category: "FRAMEWORK",
      importance: "REQUIRED",
      source: "TARGET_ROLE",
      status: "MISSING",
      priority: "CRITICAL",
      confidence: 100
    }
  ];

  const initialEval = evaluateResumeAgainstRequirements(sampleResumePythonReact, frozenReqs);
  const reEval = evaluateResumeAgainstRequirements(sampleResumePythonReact, frozenReqs);

  assert.strictEqual(initialEval.evaluatedRequirements.length, 1);
  assert.strictEqual(reEval.evaluatedRequirements.length, 1);
  assert.deepStrictEqual(initialEval.evaluatedRequirements, reEval.evaluatedRequirements);
});

// ----------------------------------------------------------------------------
// TEST 17: Score Bounds Guarantee
// ----------------------------------------------------------------------------
runTest("All scores strictly bounded between 0 and 100 with no negative numbers", () => {
  const evalResult = evaluateResumeAgainstRequirements(sampleResumePythonReact, []);
  assert.strictEqual(evalResult.atsScore >= 0 && evalResult.atsScore <= 100, true);
  assert.strictEqual(evalResult.targetMatchScore >= 0 && evalResult.targetMatchScore <= 100, true);
  for (const [key, val] of Object.entries(evalResult.categoryScores)) {
    assert.strictEqual(val >= 0 && val <= 100, true, `Score ${key} must be between 0 and 100`);
  }
});

// ----------------------------------------------------------------------------
// TEST 18: Score Breakdown Counts
// ----------------------------------------------------------------------------
runTest("Explainable score breakdown accurately reports matched vs total required counts", () => {
  const profileHash = computeProfileHash("Vercel", "Next.js Engineer", "2+ years");
  const targetReqs = [
    {
      requirementId: generateRequirementId(profileHash, "React", "FRAMEWORK"),
      name: "React",
      canonicalName: "React",
      category: "TECHNICAL_SKILL",
      importance: "REQUIRED",
      source: "JOB_DESCRIPTION",
      status: "MISSING",
      priority: "CRITICAL",
      confidence: 100
    },
    {
      requirementId: generateRequirementId(profileHash, "Rust", "LANGUAGE"),
      name: "Rust",
      canonicalName: "Rust",
      category: "TECHNICAL_SKILL",
      importance: "REQUIRED",
      source: "JOB_DESCRIPTION",
      status: "MISSING",
      priority: "CRITICAL",
      confidence: 100
    }
  ];

  const evalResult = evaluateResumeAgainstRequirements(sampleResumePythonReact, targetReqs);

  assert.strictEqual(evalResult.scoreBreakdown.requiredTotal, 2);
  assert.strictEqual(evalResult.scoreBreakdown.requiredMatched, 1);
  assert.strictEqual(evalResult.scoreBreakdown.requiredPercentage, 50);
  assert.strictEqual(evalResult.scoreBreakdown.criticalGapsCount, 1);
});

// ----------------------------------------------------------------------------
// TEST 19: Missing target requirements never added to user qualifications
// ----------------------------------------------------------------------------
runTest("Missing target requirements are strictly isolated and never added to user skills", () => {
  const originalUserSkills = [...sampleResumePythonReact.skills];
  const targetReqs = [
    {
      requirementId: "req_k8s",
      name: "Kubernetes",
      canonicalName: "Kubernetes",
      category: "TOOL",
      importance: "REQUIRED",
      source: "JOB_DESCRIPTION",
      status: "MISSING",
      priority: "CRITICAL",
      confidence: 100
    }
  ];

  const evalResult = evaluateResumeAgainstRequirements(sampleResumePythonReact, targetReqs);

  assert.strictEqual(sampleResumePythonReact.skills.includes("Kubernetes"), false);
  assert.deepStrictEqual(sampleResumePythonReact.skills, originalUserSkills);
  assert.strictEqual(evalResult.categorizedGaps.criticalGaps.some(g => g.title === "Kubernetes"), true);
});

// ----------------------------------------------------------------------------
// TEST 20: Verified Evidence attached to matched requirements
// ----------------------------------------------------------------------------
runTest("Verified evidence quote is attached to matched requirements from resume evidence", () => {
  const targetReqs = [
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

  const evalResult = evaluateResumeAgainstRequirements(sampleResumePythonReact, targetReqs);
  const pgReq = evalResult.evaluatedRequirements[0];

  assert.strictEqual(pgReq.status, "PRESENT");
  assert.strictEqual(typeof pgReq.evidenceQuote, "string");
  assert.strictEqual(pgReq.evidenceQuote.length > 0, true);
});

console.log("\n=================================================");
console.log(`STAGE 3 RESULTS: ${passedTests} PASSED, ${totalTests - passedTests} FAILED`);
console.log("=================================================\n");

if (passedTests !== totalTests) {
  process.exit(1);
}
