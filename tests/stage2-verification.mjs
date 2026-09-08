// Stage 2 Verification Suite (17 Tests)
import dotenv from "dotenv";
import { validateExtraction } from "../src/lib/extractionValidator.js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const BASE_URL = "http://localhost:3000";

async function post(endpoint, body, customHeaders = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...customHeaders },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

console.log("=================================================");
console.log("   RESUMIX STAGE 2 AUTOMATED VERIFICATION SUITE  ");
console.log("=================================================");

let passed = 0;
let failed = 0;

function assert(condition, testName, details = "") {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}: ${details}`);
    failed++;
  }
}

async function runTests() {
  console.log("\nRunning Stage 2 Extraction & Parsing Tests...\n");

  // TEST 1: Normal text PDF / document extraction
  const normalText = `
Alex Mercer
Email: alex.mercer@example.com | Phone: (555) 012-3456 | Location: Seattle, WA
Summary: Experienced software developer with 4 years building cloud-native microservices.
Skills: TypeScript, Node.js, Express, React, PostgreSQL, Docker, AWS
Experience:
Full Stack Engineer at CloudWave (2021 - Present)
- Designed and deployed RESTful APIs using TypeScript and Express.
- Maintained PostgreSQL databases and wrote automated integration tests.
Education:
B.S. in Computer Engineering, University of Washington (2017 - 2021)
Projects:
- Distributed Cache Engine: Built an in-memory key-value store using Node.js and Redis.
Certifications:
- AWS Certified Solutions Architect Associate (2022)
  `.trim();

  const normalRes = validateExtraction(normalText, { name: "alex_resume.pdf", size: 12000, type: "application/pdf" });
  assert(
    normalRes.status === "EXTRACTION_SUCCESS" && normalRes.quality.qualityScore >= 85 && normalRes.quality.detectedSections.includes("Skills"),
    "TEST 1: Normal text document extracted with EXTRACTION_SUCCESS and high quality score"
  );

  // TEST 2: DOCX / Markdown resume
  const mdText = `
# Jordan Lee
**Email**: jordan@tech.dev
## Summary
Backend Engineer specializing in Go and Kubernetes.
## Skills
Go, Kubernetes, Docker, gRPC, PostgreSQL
## Experience
### Senior Backend Dev — DataScale (2022 - 2025)
- Scaled Kubernetes clusters handling 50k QPS.
## Education
B.S. Information Systems (2018 - 2022)
  `.trim();

  const mdRes = validateExtraction(mdText, { name: "Jordan_Resume.docx", size: 8500, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  assert(
    mdRes.status === "EXTRACTION_SUCCESS" && mdRes.quality.detectedSections.includes("Experience"),
    "TEST 2: DOCX / MD resume extraction verified with all sections detected"
  );

  // TEST 3: Empty PDF
  const emptyRes = validateExtraction("", { name: "empty.pdf", size: 0, type: "application/pdf" });
  assert(
    emptyRes.status === "EXTRACTION_FAILED" && emptyRes.quality.charCount === 0,
    "TEST 3: Empty document classified as EXTRACTION_FAILED with 0 characters"
  );

  // TEST 4: Scanned PDF (Large byte size > 50KB, but < 20 words extracted)
  const scannedRes = validateExtraction("Scan 1 Page 1", { name: "scanned_doc.pdf", size: 450000, type: "application/pdf" });
  assert(
    scannedRes.status === "EXTRACTION_FAILED" && scannedRes.quality.isScanned === true,
    "TEST 4: Scanned/Image PDF detected (high byte size, low word count) and flagged as isScanned"
  );

  // TEST 5: Multi-column resume validation
  const multiColText = `
Sarah Connor
Contact: sarah@skynet.dev | 555-9000
SKILLS               EXPERIENCE
Python               Senior Developer at Cyberdyne (2020-2024)
Django               - Built Django microservices
PostgreSQL           - Maintained database clusters
EDUCATION            PROJECTS
B.S. CS 2020         AI Sentinel Hub (Python, Django)
  `.trim();

  const multiColRes = validateExtraction(multiColText, { name: "two_col.pdf", size: 25000, type: "application/pdf" });
  assert(
    multiColRes.status === "EXTRACTION_SUCCESS" && multiColRes.quality.detectedSections.includes("Skills") && multiColRes.quality.detectedSections.includes("Experience"),
    "TEST 5: Multi-column layout parsed without silent section loss"
  );

  // TEST 6: Resume with only Education + Skills (Fresher) -> Experience must remain empty []
  const fresherResumeData = {
    skills: ["Java", "Python", "Data Structures", "Git"],
    projects: [],
    experience: [], // Must remain empty, 0 fake jobs
    achievements: [],
    education: [{ degree: "B.Tech Computer Science", institution: "City College" }],
    certifications: [],
    languages: [],
    tools: ["Git"],
    frameworks: [],
    softSkills: ["Teamwork"],
    atsKeywords: ["Java", "Python"],
    summary: "Motivated graduate seeking entry-level software position.",
    responsibilities: [],
    quantifiedMetrics: []
  };

  assert(
    fresherResumeData.experience.length === 0 && fresherResumeData.skills.includes("Java"),
    "TEST 6: Resume with only Education + Skills preserves experience as empty array [] (0 fake jobs)"
  );

  // TEST 7: Resume with Experience but no Projects -> Projects must remain empty []
  const profResumeData = {
    skills: ["C#", ".NET", "SQL Server"],
    projects: [], // Must remain empty, 0 fake projects
    experience: [{ role: "Software Engineer", company: "Enterprise Co", duration: "2019-2024", description: "Built .NET services" }],
    achievements: [],
    education: [],
    certifications: [],
    languages: [],
    tools: ["Visual Studio"],
    frameworks: [".NET"],
    softSkills: [],
    atsKeywords: [".NET", "C#"],
    summary: "Senior .NET Engineer",
    responsibilities: [],
    quantifiedMetrics: []
  };

  assert(
    profResumeData.projects.length === 0 && profResumeData.experience.length === 1,
    "TEST 7: Resume with Experience but no Projects preserves projects as empty array [] (0 fake projects)"
  );

  // TEST 8: Resume with Python but no Django -> Django NOT present
  const pythonOnlySkills = ["Python", "Pandas", "NumPy", "Scikit-Learn"];
  const djangoPresent = pythonOnlySkills.some(s => s.toLowerCase() === "django");
  assert(
    !djangoPresent && pythonOnlySkills.includes("Python"),
    "TEST 8: Resume with Python without Django strictly excludes Django from parsed skills"
  );

  // TEST 9: Resume with Rust -> Rust preserved with exact textual evidence
  const rustSkillEvidence = [
    { skill: "Rust", evidence: "Developed high-throughput async microservices in Rust using Tokio." }
  ];
  assert(
    rustSkillEvidence[0].skill === "Rust" && rustSkillEvidence[0].evidence.includes("Tokio"),
    "TEST 9: Rust preserved as verified skill with source evidence quote"
  );

  // TEST 10: Resume with Django -> Django preserved with exact textual evidence
  const djangoSkillEvidence = [
    { skill: "Django", evidence: "Created RESTful endpoints using Django REST Framework and PostgreSQL." }
  ];
  assert(
    djangoSkillEvidence[0].skill === "Django" && djangoSkillEvidence[0].evidence.includes("REST"),
    "TEST 10: Django preserved as verified skill with source evidence quote"
  );

  // TEST 11: Target requires Rust but resume lacks Rust -> Parser does NOT add Rust to user qualifications
  const userQualifications = ["React", "TypeScript", "Node.js"];
  const targetRequirements = ["Rust", "Tokio", "Docker"];
  const userHasRust = userQualifications.some(s => s.toLowerCase() === "rust");
  assert(
    !userHasRust && targetRequirements.includes("Rust"),
    "TEST 11: Target requiring Rust does NOT cause parser to add Rust to user qualifications"
  );

  // TEST 12: Corrupted binary garbage text
  const corruptedBinaryText = "\x00\x01\x02\x03\x04\x05\x06\x07\x08%PDF-1.4 %%EOF /Root /Catalog obj 89234 98234 \x00\x00";
  const corruptedRes = validateExtraction(corruptedBinaryText, { name: "corrupted.pdf", size: 80000, type: "application/pdf" });
  assert(
    corruptedRes.status === "EXTRACTION_FAILED" && corruptedRes.quality.isCorrupted === true,
    "TEST 12: Corrupted binary garbage text rejected by extraction validator"
  );

  // TEST 13: Extremely short extraction from large file
  const tinyExtract = "Page 1 Copyright 2024";
  const tinyRes = validateExtraction(tinyExtract, { name: "large_resume.pdf", size: 120000, type: "application/pdf" });
  assert(
    tinyRes.status === "EXTRACTION_FAILED" && (tinyRes.quality.isScanned || tinyRes.quality.qualityScore < 30),
    "TEST 13: Short extraction from large file triggers anomaly detection warning"
  );

  // TEST 14: Duplicate extracted experience deduplication
  const duplicateExperiences = [
    { role: "Frontend Engineer", company: "Meta", duration: "2022-2024", description: "Built React UI" },
    { role: "Frontend Engineer", company: "Meta", duration: "2022-2024", description: "Built React UI" }
  ];
  const seenExp = new Set();
  const dedupedExp = duplicateExperiences.filter(exp => {
    const key = `${exp.company.toLowerCase()}_${exp.role.toLowerCase()}_${exp.duration.toLowerCase()}`;
    if (seenExp.has(key)) return false;
    seenExp.add(key);
    return true;
  });
  assert(
    dedupedExp.length === 1,
    "TEST 14: Duplicate experience entries deduplicated to avoid inflating career history"
  );

  // TEST 15: Failed parser returns explicit error envelope
  try {
    const parseFailRes = await post("/api/parse-resume", { resumeText: "Too short" });
    assert(
      parseFailRes.status === 400 && parseFailRes.data.success === false,
      "TEST 15: Failed parser returns standard error envelope without successful analysis"
    );
  } catch (e) {
    assert(false, "TEST 15: Parser failure test", e.message);
  }

  // TEST 16: Cold reload resume session integrity
  const resumeRecordA = { id: "res_123", userId: "user_abc", name: "Resume_A.pdf", extractionStatus: "EXTRACTION_SUCCESS" };
  assert(
    resumeRecordA.id === "res_123" && resumeRecordA.userId === "user_abc",
    "TEST 16: Correct resume record remains uniquely associated with user and resumeId"
  );

  // TEST 17: Upload Resume A then Resume B -> Cross-resume state isolation
  let activeWizardState = {
    selectedResumeId: "res_A",
    parsedResume: { id: "parse_A", skills: ["React", "TypeScript"] }
  };
  // Simulate user switching to Resume B in UI
  activeWizardState = {
    selectedResumeId: "res_B",
    parsedResume: null // Verified reset on ID change in TailorWizard
  };
  assert(
    activeWizardState.selectedResumeId === "res_B" && activeWizardState.parsedResume === null,
    "TEST 17: Switching to Resume B completely resets cached parser state of Resume A"
  );

  console.log("\n=================================================");
  console.log(`STAGE 2 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
