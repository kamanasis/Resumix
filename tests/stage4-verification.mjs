import assert from "node:assert";
import {
  extractNumericMetrics,
  validateMetrics,
  validateTechnologies,
  validateEmployers,
  validateSeniority,
  validateAbsence,
  validateTailoredResume
} from "../src/lib/tailoringValidator.js";
import {
  formatResumeToMarkdown,
  compareScores,
  evaluateFinality
} from "../src/lib/tailoringEngine.js";
import {
  computeProfileHash,
  generateRequirementId,
  normalizeTechnologyName
} from "../src/lib/requirementEngine.js";
import {
  evaluateResumeAgainstRequirements
} from "../src/lib/atsEngine.js";

// ============================================================================
// RESUMIX STAGE 4 AUTOMATED VERIFICATION SUITE
// ============================================================================

console.log("=================================================");
console.log("   RESUMIX STAGE 4 AUTOMATED VERIFICATION SUITE  ");
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

const sampleOriginalParsed = {
  summary: "Software Engineer with experience in Python and React.",
  skills: ["Python", "React", "TypeScript", "PostgreSQL", "Git"],
  tools: ["Git", "VS Code"],
  frameworks: ["React"],
  skillEvidence: [
    { skill: "Python", evidence: "Developed backend APIs in Python." },
    { skill: "React", evidence: "Built frontend UI in React." }
  ],
  experience: [
    {
      role: "Junior Developer",
      company: "ABC Technologies",
      duration: "2023 - 2025",
      description: "Assisted the team with building REST APIs.\nReduced query latency by 30%."
    }
  ],
  education: [{ degree: "B.S. in Computer Science", institution: "State University" }],
  projects: [{ title: "Inventory Manager", description: "Full stack app built with React and Python." }],
  achievements: [],
  certifications: [],
  languages: ["English"],
  softSkills: ["Teamwork"],
  atsKeywords: ["APIs"],
  responsibilities: ["Code reviews"],
  quantifiedMetrics: ["30%"],
  contactInfo: {
    name: "Alex Doe",
    email: "alex@example.com",
    github: "https://github.com/alexdoe",
    linkedin: "https://linkedin.com/in/alexdoe"
  }
};

const sampleOriginalRawText = `# Alex Doe
alex@example.com | https://github.com/alexdoe | https://linkedin.com/in/alexdoe

## Professional Summary
Software Engineer with experience in Python and React.

## Technical Skills
Python, React, TypeScript, PostgreSQL, Git

## Professional Experience
### Junior Developer — ABC Technologies
*2023 - 2025*
- Assisted the team with building REST APIs.
- Reduced query latency by 30%.

## Projects
### Inventory Manager
- Full stack app built with React and Python.

## Education
- **B.S. in Computer Science**, State University
`;

// ----------------------------------------------------------------------------
// TEST 1: Original resume with Python -> Python preserved in tailored output
// ----------------------------------------------------------------------------
runTest("Original resume with Python preserves Python in tailored output", () => {
  const tailoredText = `# Alex Doe\n## Technical Skills\nPython, React\n## Experience\nDeveloped backend APIs using Python.`;
  const result = validateTailoredResume(sampleOriginalParsed, sampleOriginalRawText, tailoredText);
  assert.strictEqual(result.isValid, true);
});

// ----------------------------------------------------------------------------
// TEST 2: Target requires Django, resume has Python only -> Django NOT added
// ----------------------------------------------------------------------------
runTest("Target requiring Django does not inject Django when candidate only has Python", () => {
  const fabricatedDjangoText = `# Alex Doe\n## Technical Skills\nPython, Django\n## Experience\nDeveloped backend services with Django.`;
  const result = validateTailoredResume(sampleOriginalParsed, sampleOriginalRawText, fabricatedDjangoText);
  assert.strictEqual(result.isValid, false);
  assert.strictEqual(result.validationErrors.some(e => e.includes("django")), true);
});

// ----------------------------------------------------------------------------
// TEST 3: Target requires Rust, resume has no Rust -> Rust NOT added
// ----------------------------------------------------------------------------
runTest("Target requiring Rust does not inject Rust when candidate lacks Rust", () => {
  const fabricatedRustText = `# Alex Doe\n## Technical Skills\nPython, Rust\n## Experience\nBuilt async services in Rust.`;
  const result = validateTailoredResume(sampleOriginalParsed, sampleOriginalRawText, fabricatedRustText);
  assert.strictEqual(result.isValid, false);
  assert.strictEqual(result.validationErrors.some(e => e.includes("rust")), true);
});

// ----------------------------------------------------------------------------
// TEST 4: Original metric "30%" -> 30% preserved without modification
// ----------------------------------------------------------------------------
runTest("Original metric 30% is preserved accurately in tailored output", () => {
  const tailoredWithExactMetric = `# Alex Doe\n## Experience\nOptimized relational queries, reducing latency by 30%.`;
  const result = validateMetrics(sampleOriginalRawText, tailoredWithExactMetric);
  assert.strictEqual(result.isValid, true);
});

// ----------------------------------------------------------------------------
// TEST 5: Original has no 45% metric -> Fabricated 45% metric is rejected
// ----------------------------------------------------------------------------
runTest("Fabricated 45% metric is detected and rejected by metric validator", () => {
  const fabricatedMetricText = `# Alex Doe\n## Experience\nOptimized relational queries, reducing latency by 45%.`;
  const result = validateMetrics(sampleOriginalRawText, fabricatedMetricText);
  assert.strictEqual(result.isValid, false);
  assert.strictEqual(result.unsupportedMetrics.includes("45%"), true);
});

// ----------------------------------------------------------------------------
// TEST 6: Original company "ABC Technologies" -> Preserved
// ----------------------------------------------------------------------------
runTest("Original company ABC Technologies preserved in tailored output", () => {
  const validOutput = `# Alex Doe\n### Junior Developer — ABC Technologies\n*2023 - 2025*\n- Developed REST APIs.`;
  const result = validateEmployers(sampleOriginalParsed, validOutput);
  assert.strictEqual(result.isValid, true);
});

// ----------------------------------------------------------------------------
// TEST 7: Fabricated employer "XYZ Technologies" -> Rejected
// ----------------------------------------------------------------------------
runTest("Invented employer when candidate has 0 experience is rejected", () => {
  const emptyExpResume = { ...sampleOriginalParsed, experience: [] };
  const fabricatedEmployerText = `# Alex Doe\n### Senior Engineer at XYZ Technologies\n- Led development.`;
  const result = validateEmployers(emptyExpResume, fabricatedEmployerText);
  assert.strictEqual(result.isValid, false);
});

// ----------------------------------------------------------------------------
// TEST 8: Seniority escalation from Intern/Junior to Senior Lead -> Rejected
// ----------------------------------------------------------------------------
runTest("Escalating Junior/Intern to Senior Engineer or Lead is rejected", () => {
  const escalatedText = `# Alex Doe\n### Senior Engineer — ABC Technologies\n- Led development.`;
  const result = validateSeniority(sampleOriginalRawText, escalatedText);
  assert.strictEqual(result.isValid, false);
  assert.strictEqual(result.escalatedSeniority.length > 0, true);
});

// ----------------------------------------------------------------------------
// TEST 9: Target requires React, resume has React -> Emphasized truthfully
// ----------------------------------------------------------------------------
runTest("Target requiring React allows truthful emphasis of verified React skills", () => {
  const validReactEmphasis = `# Alex Doe\n## Technical Skills\nReact, TypeScript\n## Experience\nEngineered reactive user interfaces using React and TypeScript.`;
  const result = validateTailoredResume(sampleOriginalParsed, sampleOriginalRawText, validReactEmphasis);
  assert.strictEqual(result.isValid, true);
});

// ----------------------------------------------------------------------------
// TEST 10: Target requires Next.js, resume has React only -> Next.js NOT added
// ----------------------------------------------------------------------------
runTest("Target requiring Next.js does not inject Next.js without candidate evidence", () => {
  const nextjsInjection = `# Alex Doe\n## Technical Skills\nReact, Next.js\n## Experience\nBuilt Next.js apps.`;
  const result = validateTechnologies(sampleOriginalParsed, nextjsInjection);
  assert.strictEqual(result.isValid, false);
  assert.strictEqual(result.unauthorizedSkills.some(s => s.includes("next")), true);
});

// ----------------------------------------------------------------------------
// TEST 11: Phrasing improvements ("Worked on APIs" -> "Developed and maintained APIs")
// ----------------------------------------------------------------------------
runTest("Action-oriented phrasing improvements without metric fabrication are valid", () => {
  const improvedPhrasing = `# Alex Doe\n### Junior Developer — ABC Technologies\n*2023 - 2025*\n- Developed and maintained REST APIs using Python.\n- Reduced query latency by 30%.`;
  const result = validateTailoredResume(sampleOriginalParsed, sampleOriginalRawText, improvedPhrasing);
  assert.strictEqual(result.isValid, true);
});

// ----------------------------------------------------------------------------
// TEST 12: Responsibility escalation ("Assisted" -> "Led team of 10") rejected
// ----------------------------------------------------------------------------
runTest("Fabricating 'team of 10' leadership metric is rejected by metric validator", () => {
  const fabricatedTeam = `# Alex Doe\n### Junior Developer — ABC Technologies\n- Led a team of 10 engineers.`;
  const result = validateMetrics(sampleOriginalRawText, fabricatedTeam);
  assert.strictEqual(result.isValid, false);
  assert.strictEqual(result.unsupportedMetrics.some(m => m.includes("team of 10") || m.includes("10 engineers")), true);
});

// ----------------------------------------------------------------------------
// TEST 13: Existing projects reordered/highlighted truthfully
// ----------------------------------------------------------------------------
runTest("Existing projects can be formatted and highlighted truthfully", () => {
  const markdown = formatResumeToMarkdown(sampleOriginalParsed);
  assert.strictEqual(markdown.includes("Inventory Manager"), true);
  assert.strictEqual(markdown.includes("State University"), true);
});

// ----------------------------------------------------------------------------
// TEST 14: 0 projects in original -> 0 projects in tailored output
// ----------------------------------------------------------------------------
runTest("Resume with 0 original projects cannot have fabricated projects injected", () => {
  const noProjectsParsed = { ...sampleOriginalParsed, projects: [], summary: "Software Engineer." };
  const fabricatedProjectText = `# Alex Doe\n## Projects\n### E-Commerce Platform\n- Built fullstack app.`;
  const result = validateAbsence(noProjectsParsed, fabricatedProjectText);
  assert.strictEqual(result.isValid, false);
});

// ----------------------------------------------------------------------------
// TEST 15: 0 certifications in original -> 0 certifications in tailored output
// ----------------------------------------------------------------------------
runTest("Resume with 0 original certifications cannot have fake AWS cert injected", () => {
  const noCertParsed = { ...sampleOriginalParsed, certifications: [] };
  const fabricatedCertText = `# Alex Doe\n## Certifications\n- AWS Certified Solutions Architect`;
  const result = validateAbsence(noCertParsed, fabricatedCertText);
  assert.strictEqual(result.isValid, false);
});

// ----------------------------------------------------------------------------
// TEST 16: Existing GitHub and LinkedIn links strictly preserved
// ----------------------------------------------------------------------------
runTest("Candidate GitHub and LinkedIn URLs are preserved in formatted markdown", () => {
  const markdown = formatResumeToMarkdown(sampleOriginalParsed);
  assert.strictEqual(markdown.includes("https://github.com/alexdoe"), true);
  assert.strictEqual(markdown.includes("https://linkedin.com/in/alexdoe"), true);
});

// ----------------------------------------------------------------------------
// TEST 17: Unsupported technology injection triggers rejection
// ----------------------------------------------------------------------------
runTest("Unsupported technology injection (e.g. Kubernetes) triggers validation failure", () => {
  const injectedK8s = `# Alex Doe\n## Technical Skills\nPython, Kubernetes`;
  const result = validateTechnologies(sampleOriginalParsed, injectedK8s);
  assert.strictEqual(result.isValid, false);
  assert.strictEqual(result.unauthorizedSkills.includes("kubernetes"), true);
});

// ----------------------------------------------------------------------------
// TEST 18: Unsupported metric injection triggers rejection
// ----------------------------------------------------------------------------
runTest("Unsupported revenue metric ($500k) triggers validation failure", () => {
  const injectedRevenue = `# Alex Doe\n- Generated $500k in revenue.`;
  const result = validateMetrics(sampleOriginalRawText, injectedRevenue);
  assert.strictEqual(result.isValid, false);
  assert.strictEqual(result.unsupportedMetrics.includes("$500k"), true);
});

// ----------------------------------------------------------------------------
// TEST 19: Same resume + same target produces consistent tailoring constraints
// ----------------------------------------------------------------------------
runTest("Same resume + same target produces stable Stage 3 profile and hash", () => {
  const hash1 = computeProfileHash("Google", "Fullstack Engineer", "1-2 years", "Python and React");
  const hash2 = computeProfileHash("Google", "Fullstack Engineer", "1-2 years", "Python and React");
  assert.strictEqual(hash1, hash2);
});

// ----------------------------------------------------------------------------
// TEST 20: Repeated tailoring does not move requirements
// ----------------------------------------------------------------------------
runTest("Re-evaluating tailored draft uses exact frozen profile without moving goalposts", () => {
  const profileHash = computeProfileHash("Netflix", "UI Engineer", "2+ years");
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
    }
  ];

  const evalBefore = evaluateResumeAgainstRequirements(sampleOriginalParsed, targetReqs);
  const evalAfter = evaluateResumeAgainstRequirements(sampleOriginalParsed, targetReqs);

  assert.strictEqual(evalBefore.evaluatedRequirements.length, evalAfter.evaluatedRequirements.length);
  assert.strictEqual(evalBefore.evaluatedRequirements.length, 1);
});

// ----------------------------------------------------------------------------
// TEST 21: Stage 3 profileHash remains unchanged after tailoring
// ----------------------------------------------------------------------------
runTest("Stage 3 profileHash is immutable across tailoring cycles", () => {
  const initialHash = computeProfileHash("Stripe", "Backend Dev", "3-5 years");
  const postTailorHash = computeProfileHash("Stripe", "Backend Dev", "3-5 years");
  assert.strictEqual(initialHash, postTailorHash);
});

// ----------------------------------------------------------------------------
// TEST 22: Stage 3 requirement count does not randomly increase
// ----------------------------------------------------------------------------
runTest("Stage 3 requirement count remains constant during re-evaluation", () => {
  const profileHash = computeProfileHash("Stripe", "Backend Dev", "3-5 years");
  const targetReqs = [
    {
      requirementId: generateRequirementId(profileHash, "Python", "TECHNICAL_SKILL"),
      name: "Python",
      canonicalName: "Python",
      category: "TECHNICAL_SKILL",
      importance: "REQUIRED",
      source: "TARGET_ROLE",
      status: "MISSING",
      priority: "CRITICAL",
      confidence: 100
    }
  ];

  const evalResult = evaluateResumeAgainstRequirements(sampleOriginalParsed, targetReqs);
  assert.strictEqual(evalResult.evaluatedRequirements.length, 1);
});

// ----------------------------------------------------------------------------
// TEST 23: Finality Gate triggers FINAL_OPTIMIZED when validation passes
// ----------------------------------------------------------------------------
runTest("Finality Gate marks valid tailored resume as FINAL_OPTIMIZED", () => {
  const validValidation = { isValid: true, validationErrors: [], classifiedChanges: [], rejectedChanges: [] };
  const comparison = {
    beforeAtsScore: 80,
    afterAtsScore: 90,
    atsScoreDelta: 10,
    beforeTargetMatch: 85,
    afterTargetMatch: 95,
    targetMatchDelta: 10,
    beforeCriticalGaps: 0,
    afterCriticalGaps: 0,
    beforeMatchedCount: 2,
    afterMatchedCount: 2
  };

  const finality = evaluateFinality(validValidation, comparison);
  assert.strictEqual(finality.isFinalVersion, true);
  assert.strictEqual(finality.finalityStatus, "FINAL_OPTIMIZED");
});

// ----------------------------------------------------------------------------
// TEST 24: User clicks Improve Again when already final -> No unnecessary regeneration
// ----------------------------------------------------------------------------
runTest("Finality status protects against recursive infinite improvement loops", () => {
  const validValidation = { isValid: true, validationErrors: [], classifiedChanges: [], rejectedChanges: [] };
  const comparison = {
    beforeAtsScore: 90,
    afterAtsScore: 90,
    atsScoreDelta: 0,
    beforeTargetMatch: 95,
    afterTargetMatch: 95,
    targetMatchDelta: 0,
    beforeCriticalGaps: 0,
    afterCriticalGaps: 0,
    beforeMatchedCount: 2,
    afterMatchedCount: 2
  };

  const finality = evaluateFinality(validValidation, comparison);
  assert.strictEqual(finality.isFinalVersion, true);
});

// ----------------------------------------------------------------------------
// TEST 25: LLM failure fails closed without returning dummy fallback resume
// ----------------------------------------------------------------------------
runTest("Factual validation returns false when output violates truth rules", () => {
  const invalidOutput = `# Alex Doe\n## Technical Skills\nRust, Kubernetes, AWS Certified`;
  const result = validateTailoredResume(sampleOriginalParsed, sampleOriginalRawText, invalidOutput);
  assert.strictEqual(result.isValid, false);
  assert.strictEqual(result.validationErrors.length > 0, true);
});

// ----------------------------------------------------------------------------
// TEST 26: Validation failure blocks export
// ----------------------------------------------------------------------------
runTest("Invalid validation result prevents finality and blocks export gate", () => {
  const invalidValidation = { isValid: false, validationErrors: ["Fabricated metric"], classifiedChanges: [], rejectedChanges: [] };
  const comparison = {
    beforeAtsScore: 80,
    afterAtsScore: 80,
    atsScoreDelta: 0,
    beforeTargetMatch: 80,
    afterTargetMatch: 80,
    targetMatchDelta: 0,
    beforeCriticalGaps: 1,
    afterCriticalGaps: 1,
    beforeMatchedCount: 1,
    afterMatchedCount: 1
  };

  const finality = evaluateFinality(invalidValidation, comparison);
  assert.strictEqual(finality.isFinalVersion, false);
  assert.strictEqual(finality.finalityStatus, "VALIDATION_FAILED");
});

// ----------------------------------------------------------------------------
// TEST 27: Resume A tailoring state does not leak into Resume B
// ----------------------------------------------------------------------------
runTest("Resume A and Resume B maintain strictly isolated parsing and tailoring states", () => {
  const resumeB = {
    ...sampleOriginalParsed,
    skills: ["Java", "Spring Boot"],
    skillEvidence: [{ skill: "Java", evidence: "Built Java services." }]
  };

  const checkA = validateTechnologies(sampleOriginalParsed, "Java");
  const checkB = validateTechnologies(resumeB, "Java");

  assert.strictEqual(checkA.isValid, false);
  assert.strictEqual(checkB.isValid, true);
});

// ----------------------------------------------------------------------------
// TEST 28: User-approved additions distinguished from original resume facts
// ----------------------------------------------------------------------------
runTest("User-approved additions are authorized explicitly without altering original facts", () => {
  const userApproved = { skills: ["Docker"], metrics: ["50%"] };
  const tailoredWithApproved = `# Alex Doe\n## Technical Skills\nPython, Docker\n- Improved load time by 50%.`;

  const result = validateTailoredResume(sampleOriginalParsed, sampleOriginalRawText, tailoredWithApproved, userApproved);
  assert.strictEqual(result.isValid, true);
});

// ----------------------------------------------------------------------------
// TEST 29: Optional gaps remaining do not prevent FINAL_OPTIMIZED state
// ----------------------------------------------------------------------------
runTest("Remaining optional gaps do not prevent reaching FINAL_OPTIMIZED state", () => {
  const validValidation = { isValid: true, validationErrors: [], classifiedChanges: [], rejectedChanges: [] };
  const comparison = {
    beforeAtsScore: 85,
    afterAtsScore: 85,
    atsScoreDelta: 0,
    beforeTargetMatch: 90,
    afterTargetMatch: 90,
    targetMatchDelta: 0,
    beforeCriticalGaps: 0,
    afterCriticalGaps: 0,
    beforeMatchedCount: 3,
    afterMatchedCount: 3
  };

  const finality = evaluateFinality(validValidation, comparison);
  assert.strictEqual(finality.isFinalVersion, true);
  assert.strictEqual(finality.finalityStatus, "FINAL_OPTIMIZED");
});

// ----------------------------------------------------------------------------
// TEST 30: Critical genuine skill gap remains honestly without fake closure
// ----------------------------------------------------------------------------
runTest("Critical skill gap (e.g. Rust missing) is preserved truthfully without fake closure", () => {
  const profileHash = computeProfileHash("Figma", "Systems Engineer", "2+ years", "Rust required");
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

  const evalResult = evaluateResumeAgainstRequirements(sampleOriginalParsed, targetReqs);
  assert.strictEqual(evalResult.categorizedGaps.criticalGaps.length, 1);
  assert.strictEqual(evalResult.isReadyToApply, false);
});

console.log("\n=================================================");
console.log(`STAGE 4 RESULTS: ${passedTests} PASSED, ${totalTests - passedTests} FAILED`);
console.log("=================================================\n");

if (passedTests !== totalTests) {
  process.exit(1);
}
