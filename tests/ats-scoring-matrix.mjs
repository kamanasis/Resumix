import assert from "node:assert";
import { evaluateResumeAgainstRequirements } from "../src/lib/atsEngine.ts";
import { normalizeTechnologyName } from "../src/lib/requirementEngine.ts";

console.log("================================================================================");
console.log("RESUMIX DETERMINISTIC ATS COMPATIBILITY SCORING MATRIX (12 SCENARIOS)");
console.log("================================================================================\n");

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  [PASS] Test ${total}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] Test ${total}: ${name}`);
    console.error(`         ${err.message}`);
  }
}

// -----------------------------------------------------------------------------
// Base Resumes and Requirements
// -----------------------------------------------------------------------------

const seniorReactResume = {
  id: "res_senior_react",
  name: "Jane Doe",
  email: "jane.doe@example.com",
  phone: "+1-555-0199",
  summary: "Senior Full Stack Engineer with 6 years of experience specializing in React, TypeScript, Node.js, and AWS microservices.",
  skills: ["React", "TypeScript", "Node.js", "AWS", "PostgreSQL", "Tailwind CSS", "Docker", "Git"],
  experience: [
    {
      role: "Lead Frontend Engineer",
      company: "TechFlow Inc",
      duration: "2020 - Present (4 years)",
      description: "Architected high-throughput web applications using React, TypeScript, and Tailwind CSS. Implemented automated CI/CD pipelines with Docker and AWS ECS."
    },
    {
      role: "Full Stack Developer",
      company: "DevCloud",
      duration: "2018 - 2020 (2 years)",
      description: "Developed RESTful backend microservices in Node.js and PostgreSQL. Led frontend component architecture using React."
    }
  ],
  education: [
    {
      degree: "Bachelor of Science in Computer Science",
      institution: "State University",
      graduationYear: "2018"
    }
  ],
  projects: [
    {
      title: "Cloud Analytics Dashboard",
      description: "Interactive real-time metrics platform built with React, TypeScript, Node.js, and AWS Lambda."
    }
  ],
  certifications: ["AWS Certified Solutions Architect"],
  atsKeywords: ["React", "TypeScript", "Node.js", "AWS", "Docker", "PostgreSQL"]
};

const partialMatchResume = {
  id: "res_partial_match",
  name: "Alex Smith",
  email: "alex@example.com",
  phone: "+1-555-0188",
  summary: "Frontend Developer with 3 years experience building responsive web interfaces in React and TypeScript.",
  skills: ["React", "TypeScript", "Tailwind CSS", "Git"],
  experience: [
    {
      role: "Frontend Developer",
      company: "StartupLab",
      duration: "2021 - 2024 (3 years)",
      description: "Built landing pages and user interfaces using React and TypeScript. Collaborated using Git."
    }
  ],
  education: [
    {
      degree: "Bachelor of Science in Information Technology",
      institution: "State College",
      graduationYear: "2021"
    }
  ],
  projects: [
    {
      title: "Design System Component Library",
      description: "Reusable component library built with React, TypeScript, and Storybook."
    }
  ],
  atsKeywords: ["React", "TypeScript", "Tailwind CSS"]
};

const pythonDataResume = {
  id: "res_python_data",
  name: "Priya Sharma",
  email: "priya@example.com",
  summary: "Data Scientist specialized in Python, PyTorch, pandas, Machine Learning, and statistical modeling.",
  skills: ["Python", "PyTorch", "Pandas", "NumPy", "SQL", "Scikit-Learn"],
  experience: [
    {
      role: "Data Scientist",
      company: "AI Insights",
      duration: "2021 - Present (3 years)",
      description: "Trained transformer models using Python and PyTorch. Performed exploratory data analysis with pandas and NumPy."
    }
  ],
  education: [
    {
      degree: "Master of Science in Data Science",
      institution: "Tech Institute",
      graduationYear: "2021"
    }
  ],
  projects: [],
  atsKeywords: ["Python", "PyTorch", "Machine Learning"]
};

const reactJobReqs = [
  { requirementId: "req_1", name: "React", canonicalName: "react", category: "TECHNICAL_SKILL", importance: "REQUIRED", source: "JOB_DESCRIPTION", status: "MISSING", priority: "CRITICAL", confidence: 100 },
  { requirementId: "req_2", name: "TypeScript", canonicalName: "typescript", category: "TECHNICAL_SKILL", importance: "REQUIRED", source: "JOB_DESCRIPTION", status: "MISSING", priority: "CRITICAL", confidence: 100 },
  { requirementId: "req_3", name: "Node.js", canonicalName: "node.js", category: "TECHNICAL_SKILL", importance: "REQUIRED", source: "JOB_DESCRIPTION", status: "MISSING", priority: "CRITICAL", confidence: 100 },
  { requirementId: "req_4", name: "AWS", canonicalName: "aws", category: "TECHNICAL_SKILL", importance: "PREFERRED", source: "JOB_DESCRIPTION", status: "MISSING", priority: "HIGH", confidence: 100 },
  { requirementId: "req_5", name: "Docker", canonicalName: "docker", category: "TOOL", importance: "PREFERRED", source: "JOB_DESCRIPTION", status: "MISSING", priority: "HIGH", confidence: 100 }
];

// -----------------------------------------------------------------------------
// Test 1: Strong Match (High Score >= 80)
// -----------------------------------------------------------------------------
test("1. Strong Match yields high ATS Compatibility Score (>= 80)", () => {
  const evalResult = evaluateResumeAgainstRequirements(
    seniorReactResume,
    reactJobReqs,
    JSON.stringify(seniorReactResume),
    {
      targetRole: "Senior Full Stack React Engineer",
      targetCompany: "CloudScale Systems",
      jobDescription: "Seeking Senior Full Stack Engineer with 4+ years experience in React, TypeScript, and Node.js. AWS and Docker experience preferred. BS in Computer Science required."
    }
  );

  assert.ok(evalResult.atsScore >= 80, `Expected score >= 80, got ${evalResult.atsScore}`);
  assert.strictEqual(evalResult.categorizedGaps.criticalGaps.length, 0, "Strong candidate should have 0 critical gaps");
  assert.strictEqual(evalResult.applicationReadiness.status, "READY_TO_APPLY");
  assert.ok(evalResult.scoreBreakdown.requiredPercentage >= 90, "Required skills coverage should be high");
});

// -----------------------------------------------------------------------------
// Test 2: Partial Match (Medium Score ~50-75)
// -----------------------------------------------------------------------------
test("2. Partial Match yields medium ATS Compatibility Score (50-75)", () => {
  const evalResult = evaluateResumeAgainstRequirements(
    partialMatchResume,
    reactJobReqs,
    JSON.stringify(partialMatchResume),
    {
      targetRole: "Senior Full Stack React Engineer",
      targetCompany: "CloudScale Systems",
      jobDescription: "Seeking Senior Full Stack Engineer with 3+ years experience in React, TypeScript, and Node.js. AWS and Docker experience preferred."
    }
  );

  assert.ok(evalResult.atsScore >= 50 && evalResult.atsScore <= 75, `Expected score 50-75, got ${evalResult.atsScore}`);
  assert.strictEqual(evalResult.categorizedGaps.criticalGaps.length, 1, "Should have exactly 1 critical gap (Node.js)");
  assert.ok(evalResult.applicationReadiness.status !== "READY_TO_APPLY", "Partial match should not be fully ready to apply");
});

// -----------------------------------------------------------------------------
// Test 3: Low Match (Low Score < 50)
// -----------------------------------------------------------------------------
test("3. Low Match yields low ATS Compatibility Score (< 50)", () => {
  const iosReqs = [
    { requirementId: "req_ios1", name: "Swift", canonicalName: "swift", category: "TECHNICAL_SKILL", importance: "REQUIRED", source: "JOB_DESCRIPTION", status: "MISSING", priority: "CRITICAL", confidence: 100 },
    { requirementId: "req_ios2", name: "SwiftUI", canonicalName: "swiftui", category: "FRAMEWORK", importance: "REQUIRED", source: "JOB_DESCRIPTION", status: "MISSING", priority: "CRITICAL", confidence: 100 },
    { requirementId: "req_ios3", name: "iOS SDK", canonicalName: "ios sdk", category: "TECHNICAL_SKILL", importance: "REQUIRED", source: "JOB_DESCRIPTION", status: "MISSING", priority: "CRITICAL", confidence: 100 },
    { requirementId: "req_ios4", name: "Xcode", canonicalName: "xcode", category: "TOOL", importance: "PREFERRED", source: "JOB_DESCRIPTION", status: "MISSING", priority: "HIGH", confidence: 100 }
  ];

  const evalResult = evaluateResumeAgainstRequirements(
    pythonDataResume,
    iosReqs,
    JSON.stringify(pythonDataResume),
    {
      targetRole: "Senior iOS Developer",
      targetCompany: "MobileApp Co",
      jobDescription: "Looking for iOS Developer with Swift, SwiftUI, and iOS SDK experience."
    }
  );

  assert.ok(evalResult.atsScore < 50, `Expected score < 50, got ${evalResult.atsScore}`);
  assert.strictEqual(evalResult.scoreBreakdown.requiredMatched, 0, "Data scientist should match 0 iOS required skills");
  assert.strictEqual(
    evalResult.applicationReadiness.status,
    "LOW_MATCH",
    `Expected LOW_MATCH readiness status, got ${evalResult.applicationReadiness.status}`
  );
});

// -----------------------------------------------------------------------------
// Test 4: Unsupported Tech / Distinction Safeguards (Java != JavaScript)
// -----------------------------------------------------------------------------
test("4. Unsupported tech distinction: Java requirement is NOT satisfied by JavaScript resume", () => {
  const javaBackendReqs = [
    { requirementId: "req_java1", name: "Java", canonicalName: "java", category: "TECHNICAL_SKILL", importance: "REQUIRED", source: "JOB_DESCRIPTION", status: "MISSING", priority: "CRITICAL", confidence: 100 },
    { requirementId: "req_java2", name: "Spring Boot", canonicalName: "spring boot", category: "FRAMEWORK", importance: "REQUIRED", source: "JOB_DESCRIPTION", status: "MISSING", priority: "CRITICAL", confidence: 100 }
  ];

  const jsOnlyResume = {
    id: "res_js_only",
    name: "Sam JS",
    summary: "JavaScript developer with React and Node.js experience.",
    skills: ["JavaScript", "React", "Node.js"],
    experience: [{ role: "Developer", company: "JS Corp", duration: "2 years", description: "Built apps in JavaScript." }],
    education: [],
    projects: [],
    atsKeywords: ["JavaScript"]
  };

  const evalResult = evaluateResumeAgainstRequirements(
    jsOnlyResume,
    javaBackendReqs,
    "JavaScript developer with React and Node.js experience. Built apps in JavaScript.",
    {
      targetRole: "Java Backend Engineer",
      targetCompany: "Enterprise Systems",
      jobDescription: "Must have deep Java and Spring Boot experience."
    }
  );

  const matchedNames = evalResult.categorizedGaps.matchedRequirements.map(r => r.canonicalName);
  assert.ok(!matchedNames.includes("java"), "Java must NOT be matched by JavaScript");
  assert.strictEqual(evalResult.scoreBreakdown.requiredMatched, 0, "No Java requirements should be matched");
});

// -----------------------------------------------------------------------------
// Test 5: Determinism (10 identical runs = 10 identical scores)
// -----------------------------------------------------------------------------
test("5. Determinism: Running evaluation 10 times produces identical score every time", () => {
  const scores = [];
  for (let i = 0; i < 10; i++) {
    const res = evaluateResumeAgainstRequirements(
      seniorReactResume,
      reactJobReqs,
      JSON.stringify(seniorReactResume),
      {
        targetRole: "Senior Full Stack React Engineer",
        targetCompany: "CloudScale Systems",
        jobDescription: "Seeking Senior Full Stack Engineer with 4+ years experience in React, TypeScript, and Node.js. AWS and Docker experience preferred."
      }
    );
    scores.push(res.atsScore);
  }

  const firstScore = scores[0];
  const allIdentical = scores.every(s => s === firstScore);
  assert.ok(allIdentical, `Scores were not identical across 10 runs: ${scores.join(", ")}`);
});

// -----------------------------------------------------------------------------
// Test 6: Job Sensitivity (Same resume evaluated against 2 different jobs)
// -----------------------------------------------------------------------------
test("6. Job Sensitivity: Same resume gets different scores for different jobs", () => {
  const devopsReqs = [
    { requirementId: "req_d1", name: "Kubernetes", canonicalName: "kubernetes", category: "TECHNICAL_SKILL", importance: "REQUIRED", source: "JOB_DESCRIPTION", status: "MISSING", priority: "CRITICAL", confidence: 100 },
    { requirementId: "req_d2", name: "Terraform", canonicalName: "terraform", category: "TOOL", importance: "REQUIRED", source: "JOB_DESCRIPTION", status: "MISSING", priority: "CRITICAL", confidence: 100 },
    { requirementId: "req_d3", name: "Golang", canonicalName: "golang", category: "TECHNICAL_SKILL", importance: "REQUIRED", source: "JOB_DESCRIPTION", status: "MISSING", priority: "CRITICAL", confidence: 100 },
    { requirementId: "req_d4", name: "Ansible", canonicalName: "ansible", category: "TOOL", importance: "PREFERRED", source: "JOB_DESCRIPTION", status: "MISSING", priority: "HIGH", confidence: 100 }
  ];

  const evalReact = evaluateResumeAgainstRequirements(
    seniorReactResume,
    reactJobReqs,
    JSON.stringify(seniorReactResume),
    { targetRole: "Senior React Engineer", targetCompany: "Co A", jobDescription: "React, TypeScript, Node.js" }
  );

  const evalDevops = evaluateResumeAgainstRequirements(
    seniorReactResume,
    devopsReqs,
    JSON.stringify(seniorReactResume),
    { targetRole: "DevOps Infrastructure Engineer", targetCompany: "Co B", jobDescription: "Kubernetes, Terraform, Golang, Ansible" }
  );

  assert.ok(evalReact.atsScore > evalDevops.atsScore + 30, `React score (${evalReact.atsScore}) should be much higher than DevOps score (${evalDevops.atsScore})`);
});

// -----------------------------------------------------------------------------
// Test 7: Company Neutrality (Google vs Startup with identical reqs = exact same score)
// -----------------------------------------------------------------------------
test("7. Company Neutrality: Target company name does not influence numeric score", () => {
  const evalGoogle = evaluateResumeAgainstRequirements(
    seniorReactResume,
    reactJobReqs,
    JSON.stringify(seniorReactResume),
    {
      targetRole: "Software Engineer",
      targetCompany: "Google",
      jobDescription: "React, TypeScript, Node.js. AWS and Docker preferred."
    }
  );

  const evalStartup = evaluateResumeAgainstRequirements(
    seniorReactResume,
    reactJobReqs,
    JSON.stringify(seniorReactResume),
    {
      targetRole: "Software Engineer",
      targetCompany: "SeedStage Startup X",
      jobDescription: "React, TypeScript, Node.js. AWS and Docker preferred."
    }
  );

  assert.strictEqual(evalGoogle.atsScore, evalStartup.atsScore, `Scores must be identical regardless of company (${evalGoogle.atsScore} vs ${evalStartup.atsScore})`);
  assert.strictEqual(evalGoogle.scoreBreakdownDetails.roleAlignment.score, evalStartup.scoreBreakdownDetails.roleAlignment.score);
});

// -----------------------------------------------------------------------------
// Test 8: Anti-Keyword Stuffing (1 occurrence vs 15 occurrences = 0 inflation)
// -----------------------------------------------------------------------------
test("8. Anti-Keyword Stuffing: Repeating a keyword 15 times yields 0 extra score", () => {
  const singleMentionResume = {
    id: "res_single_mention",
    summary: "Software developer with Docker knowledge.",
    skills: ["Docker"],
    experience: [{ role: "Engineer", company: "A", duration: "1 year", description: "Configured Docker containers." }],
    education: [],
    projects: [],
    atsKeywords: ["Docker"]
  };

  const stuffedResume = {
    id: "res_stuffed",
    summary: "Software developer with Docker Docker Docker Docker Docker knowledge.",
    skills: ["Docker", "Docker", "Docker", "Docker", "Docker"],
    experience: [{ role: "Engineer", company: "A", duration: "1 year", description: "Docker Docker Docker Docker Docker Docker Docker Docker Docker Docker." }],
    education: [],
    projects: [],
    atsKeywords: ["Docker", "Docker", "Docker"]
  };

  const singleMentionText = JSON.stringify(singleMentionResume);
  const stuffedText = JSON.stringify(stuffedResume);

  const dockerReq = [
    { requirementId: "req_doc", name: "Docker", canonicalName: "docker", category: "TOOL", importance: "REQUIRED", source: "JOB_DESCRIPTION", status: "MISSING", priority: "CRITICAL", confidence: 100 }
  ];

  const evalSingle = evaluateResumeAgainstRequirements(singleMentionResume, dockerReq, singleMentionText, {
    targetRole: "DevOps",
    targetCompany: "Co",
    jobDescription: "Requires Docker"
  });

  const evalStuffed = evaluateResumeAgainstRequirements(stuffedResume, dockerReq, stuffedText, {
    targetRole: "DevOps",
    targetCompany: "Co",
    jobDescription: "Requires Docker"
  });

  assert.strictEqual(
    evalSingle.scoreBreakdown.keywordPercentage,
    evalStuffed.scoreBreakdown.keywordPercentage,
    "Keyword percentage must be identical despite 15x stuffing"
  );
  assert.strictEqual(
    evalSingle.atsScore,
    evalStuffed.atsScore,
    "ATS Score must not be inflated by repetition stuffing"
  );
});

// -----------------------------------------------------------------------------
// Test 9: No Education Requirement = 0 Penalty (Dynamic Weight Redistribution)
// -----------------------------------------------------------------------------
test("9. No Education Requirement: Candidate is not penalized when JD omits education", () => {
  const evalWithoutEduReq = evaluateResumeAgainstRequirements(
    seniorReactResume,
    reactJobReqs,
    JSON.stringify(seniorReactResume),
    {
      targetRole: "Senior React Engineer",
      targetCompany: "CloudScale",
      jobDescription: "Seeking Senior React Developer. Must know React, TypeScript, Node.js." // No degree mentioned
    }
  );

  // Education weight should be 0, and other weights should dynamically rebalance to sum to 1.0
  const b = evalWithoutEduReq.scoreBreakdownDetails;
  assert.strictEqual(b.educationMatch.weight, 0, "Education weight must be 0 when not required by JD");
  assert.strictEqual(b.educationMatch.isRequired, false);

  const totalWeight = b.requiredSkills.weight +
    b.preferredSkills.weight +
    b.keywordCoverage.weight +
    b.experienceMatch.weight +
    b.roleAlignment.weight +
    b.resumeStructure.weight +
    (b.educationMatch?.weight || 0);

  assert.ok(Math.abs(totalWeight - 1.0) < 0.01, `Total weight must equal 1.0, got ${totalWeight}`);
});

// -----------------------------------------------------------------------------
// Test 10: Limited JD = Lower Score Confidence (No Hallucinated Requirements)
// -----------------------------------------------------------------------------
test("10. Limited JD: Produces LOWER score confidence and does not hallucinate requirements", () => {
  const shortReqs = [
    { requirementId: "req_simple", name: "React", canonicalName: "react", category: "TECHNICAL_SKILL", importance: "REQUIRED", source: "JOB_DESCRIPTION", status: "MISSING", priority: "CRITICAL", confidence: 100 }
  ];

  const evalLimited = evaluateResumeAgainstRequirements(
    seniorReactResume,
    shortReqs,
    JSON.stringify(seniorReactResume),
    {
      targetRole: "Frontend Developer",
      targetCompany: "Acme",
      jobDescription: "Need React dev." // Very short JD (< 100 chars)
    }
  );

  assert.strictEqual(evalLimited.scoreConfidence.isJdLimited, true, "isJdLimited should be true for short JD");
  assert.strictEqual(evalLimited.scoreConfidence.level, "MEDIUM_CONFIDENCE");
  assert.ok(evalLimited.missingItems.length <= 1, "Should not hallucinate arbitrary missing requirements for sparse JD");
});

// -----------------------------------------------------------------------------
// Test 11: Weak vs Deep Evidence (Skills-list-only vs Full Experience Proof)
// -----------------------------------------------------------------------------
test("11. Evidence Weighting: Skills-list-only earns 65% credit vs 100% for Work Experience", () => {
  const skillsListOnlyResume = {
    id: "res_weak_proof",
    skills: ["Kubernetes"],
    experience: [{ role: "Support Tech", company: "HelpDesk", duration: "1 year", description: "Answered phone calls." }],
    education: [],
    projects: [],
    atsKeywords: []
  };

  const experienceProofResume = {
    id: "res_deep_proof",
    skills: ["Kubernetes"],
    experience: [{ role: "DevOps Engineer", company: "CloudCorp", duration: "2 years", description: "Orchestrated Kubernetes clusters in production." }],
    education: [],
    projects: [],
    atsKeywords: []
  };

  const k8sReq = [
    { requirementId: "req_k8s", name: "Kubernetes", canonicalName: "kubernetes", category: "TECHNICAL_SKILL", importance: "REQUIRED", source: "JOB_DESCRIPTION", status: "MISSING", priority: "CRITICAL", confidence: 100 }
  ];

  const evalWeak = evaluateResumeAgainstRequirements(skillsListOnlyResume, k8sReq, JSON.stringify(skillsListOnlyResume), {
    targetRole: "DevOps Engineer",
    targetCompany: "CloudCorp",
    jobDescription: "Requires Kubernetes"
  });

  const evalDeep = evaluateResumeAgainstRequirements(experienceProofResume, k8sReq, JSON.stringify(experienceProofResume), {
    targetRole: "DevOps Engineer",
    targetCompany: "CloudCorp",
    jobDescription: "Requires Kubernetes"
  });

  assert.strictEqual(evalWeak.scoreBreakdown.requiredPercentage, 65, "Skills list only should receive exactly 65% credit");
  assert.strictEqual(evalDeep.scoreBreakdown.requiredPercentage, 100, "Experience proof should receive 100% credit");
  assert.ok(evalDeep.atsScore > evalWeak.atsScore, "Deep experience proof must yield higher ATS score than skills list mention");
});

// -----------------------------------------------------------------------------
// Test 12: Experience Gap Flagged When Candidate Experience < Required
// -----------------------------------------------------------------------------
test("12. Experience Gap: Penalized and flagged when candidate has fewer years than required", () => {
  const juniorResume = {
    id: "res_junior_years",
    summary: "Junior developer with 1 year experience.",
    skills: ["React", "TypeScript", "Node.js"],
    experience: [
      { role: "Junior Dev", company: "Co A", duration: "2023 - 2024 (1 year)", description: "Built React apps." }
    ],
    education: [],
    projects: [],
    atsKeywords: ["React", "TypeScript", "Node.js"]
  };

  const evalSeniorRole = evaluateResumeAgainstRequirements(
    juniorResume,
    reactJobReqs,
    JSON.stringify(juniorResume),
    {
      targetRole: "Principal Software Architect",
      targetCompany: "Enterprise",
      jobDescription: "Requires at least 10+ years of software engineering experience in React and Node.js."
    }
  );

  const expScore = evalSeniorRole.scoreBreakdownDetails.experienceMatch.score;
  assert.ok(expScore < 50, `Experience match score for 1 yr vs 10 yr JD should be low (< 50), got ${expScore}`);
  assert.ok(evalSeniorRole.atsScore < 75, `ATS score should be gated/capped due to significant experience gap, got ${evalSeniorRole.atsScore}`);
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log("\n================================================================================");
console.log(`ATS SCORING MATRIX RESULTS: ${passed}/${total} TESTS PASSED`);
console.log("================================================================================\n");

if (passed === total) {
  console.log("All 12 ATS Compatibility Scoring Matrix scenarios PASSED with 100% fidelity.\n");
  process.exit(0);
} else {
  console.error(`${total - passed} test(s) FAILED.\n`);
  process.exit(1);
}
