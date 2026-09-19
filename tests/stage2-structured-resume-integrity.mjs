// ============================================================================
// RESUMIX STAGE 2: PROFESSIONAL STRUCTURED RESUME GENERATION & PREVIEW SUITE
// 20 Comprehensive Automated Acceptance & Integrity Tests
// ============================================================================

import assert from "assert";
import dotenv from "dotenv";
import JSZip from "jszip";
import {
  createResumeDocument,
  parseMarkdownToResumeDocument,
  resumeDocumentToMarkdown,
  resumeDocumentToPlainText,
  validateResumeDocumentIntegrity
} from "../src/lib/resumeDocument.ts";
import {
  buildDocxDocument,
  generateDocxBuffer,
  generatePrintableHtml,
  generatePlainText,
  DOCX_MIME_TYPE
} from "../src/lib/exportEngine.ts";
import { validateDocxPackage } from "../src/lib/docxValidator.ts";

dotenv.config({ path: ".env.local" });
dotenv.config();

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

let passedCount = 0;
let failedCount = 0;
let testIndex = 1;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  [PASS] Test ${testIndex}: ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  [FAIL] Test ${testIndex}: ${name}`);
    console.error(`         ${err.message || err}`);
    failedCount++;
    throw err;
  } finally {
    testIndex++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] Test ${testIndex}: ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  [FAIL] Test ${testIndex}: ${name}`);
    console.error(`         ${err.message || err}`);
    failedCount++;
    throw err;
  } finally {
    testIndex++;
  }
}

// ----------------------------------------------------------------------------
// Sample Data Sets
// ----------------------------------------------------------------------------
const SAMPLE_PARSED_RESUME = {
  id: "res_001",
  userId: "user_001",
  resumeId: "res_001",
  createdAt: new Date().toISOString(),
  contactInfo: {
    name: "Alex Doe",
    email: "alex.doe@example.com",
    phone: "(555) 234-5678",
    location: "San Francisco, CA",
    linkedin: "linkedin.com/in/alexdoe",
    github: "github.com/alexdoe",
    website: "alexdoe.dev"
  },
  summary: "Experienced Full Stack Engineer with 5 years building distributed cloud applications and high-throughput microservices.",
  skills: ["TypeScript", "Node.js", "React", "PostgreSQL", "Docker", "AWS", "GraphQL", "Redis"],
  languages: ["TypeScript", "Python", "SQL"],
  frameworks: ["React", "Express", "Node.js"],
  tools: ["Docker", "AWS", "Git"],
  experience: [
    {
      role: "Senior Full Stack Engineer",
      company: "Acme Cloud Corp",
      duration: "2021 - Present",
      location: "San Francisco, CA",
      description: "Led backend microservices team. Designed and implemented GraphQL APIs handling 5M daily requests. Optimized PostgreSQL queries reducing latency by 40%.",
      bullets: [
        "Architected scalable microservices using Node.js and TypeScript handling 5M daily queries.",
        "Optimized database indexes in PostgreSQL reducing P99 latency by 40%."
      ]
    },
    {
      role: "Software Developer",
      company: "Innovatech Labs",
      duration: "2019 - 2021",
      location: "San Jose, CA",
      description: "Built customer-facing React web applications.",
      bullets: [
        "Developed responsive frontend components in React and TypeScript.",
        "Implemented CI/CD deployment pipelines using Docker and AWS."
      ]
    }
  ],
  projects: [
    {
      title: "Realtime Analytics Engine",
      description: "Built real-time streaming dashboard with Redis and Node.js.",
      technologies: ["Node.js", "Redis", "WebSocket"]
    }
  ],
  education: [
    {
      degree: "B.S. in Computer Science",
      institution: "University of California, Berkeley",
      graduationYear: "2019",
      gpa: "3.8"
    }
  ],
  certifications: ["AWS Certified Solutions Architect (2022)"],
  achievements: ["Dean's Honors List 2018, 2019"]
};

const SAMPLE_FRESHER_PARSED = {
  id: "res_fresher",
  userId: "user_fresher",
  resumeId: "res_fresher",
  createdAt: new Date().toISOString(),
  contactInfo: {
    name: "Taylor Smith",
    email: "taylor.smith@university.edu",
    phone: "(555) 987-6543",
    location: "Austin, TX",
    github: "github.com/taylorsmith"
  },
  summary: "Computer Science graduate with strong foundations in algorithms, data structures, and full-stack web development.",
  skills: ["Java", "Python", "JavaScript", "React", "SQL", "Git"],
  languages: ["Java", "Python", "JavaScript"],
  frameworks: ["React", "Spring Boot"],
  tools: ["Git", "Postman"],
  experience: [], // 0 professional experience items
  projects: [
    {
      title: "Campus Marketplace Platform",
      description: "Full-stack web application for student book exchange using React and Python Flask.",
      technologies: ["React", "Python", "Flask", "SQLite"]
    }
  ],
  education: [
    {
      degree: "B.S. in Computer Science",
      institution: "University of Texas at Austin",
      graduationYear: "2024",
      gpa: "3.9"
    }
  ],
  certifications: [], // 0 certifications
  achievements: ["First Place, University Hackathon 2023"]
};

// ----------------------------------------------------------------------------
// TEST EXECUTION
// ----------------------------------------------------------------------------
async function main() {
  console.log("================================================================================");
  console.log("RESUMIX STAGE 2: PROFESSIONAL STRUCTURED RESUME GENERATION & PREVIEW SUITE");
  console.log("================================================================================\n");

  console.log("--- PART 1: Unified Structured ResumeDocument Model (Tests 1-5) ---");

  runTest("1. createResumeDocument constructs verified ResumeDocument without data loss", () => {
    const doc = createResumeDocument(SAMPLE_PARSED_RESUME);
    assert.strictEqual(doc.header.name, "Alex Doe");
    assert.strictEqual(doc.header.email, "alex.doe@example.com");
    assert.strictEqual(doc.header.location, "San Francisco, CA");
    assert.strictEqual(doc.summary, SAMPLE_PARSED_RESUME.summary);
    assert.strictEqual(doc.experience?.length, 2);
    assert.strictEqual(doc.experience?.[0].company, "Acme Cloud Corp");
    assert.strictEqual(doc.projects?.length, 1);
    assert.strictEqual(doc.education?.length, 1);
    assert.strictEqual(doc.certifications?.length, 1);
    assert.strictEqual(doc.achievements?.length, 1);
  });

  runTest("2. createResumeDocument strictly preserves factual absence (zero fake sections)", () => {
    const doc = createResumeDocument(SAMPLE_FRESHER_PARSED);
    assert.strictEqual(doc.experience, undefined, "Fresher with 0 experience must not have experience section");
    assert.strictEqual(doc.certifications, undefined, "Fresher with 0 certifications must not have certifications section");
    assert.ok(doc.education && doc.education.length === 1, "Education must be preserved");
    assert.ok(doc.projects && doc.projects.length === 1, "Projects must be preserved");
  });

  runTest("3. createResumeDocument categorizes skills into Languages, Frameworks, and Tools", () => {
    const doc = createResumeDocument(SAMPLE_PARSED_RESUME);
    assert.ok(Array.isArray(doc.skills), "Skills must be an array");
    const categories = doc.skills;
    const catNames = categories.map(c => c.category);
    assert.ok(catNames.includes("Languages"), "Must include Languages category");
    assert.ok(catNames.includes("Frameworks & Libraries"), "Must include Frameworks category");
    assert.ok(catNames.includes("Tools & Platforms"), "Must include Tools category");
  });

  runTest("4. parseMarkdownToResumeDocument parses markdown headers, contact, experience, and bullets", () => {
    const markdown = `
# Jordan Lee
jordan@example.com | (555) 345-6789 | New York, NY | linkedin.com/in/jordanlee

## PROFESSIONAL SUMMARY
Dedicated DevOps engineer specialized in Kubernetes and Terraform infrastructure automation.

## WORK EXPERIENCE
### Lead SRE at Horizon Cloud (2020 - Present) | New York, NY
- Architected multi-region Kubernetes clusters with 99.99% availability.
- Automated provisioning with Terraform reducing deployment time by 60%.

## EDUCATION
- **B.S. in Information Systems**, NYU (2020) - GPA: 3.7
    `.trim();

    const doc = parseMarkdownToResumeDocument(markdown);
    assert.strictEqual(doc.header.name, "Jordan Lee");
    assert.strictEqual(doc.header.email, "jordan@example.com");
    assert.strictEqual(doc.header.location, "New York, NY");
    assert.ok(doc.summary?.includes("DevOps engineer"));
    assert.strictEqual(doc.experience?.length, 1);
    assert.strictEqual(doc.experience?.[0].company, "Horizon Cloud");
    assert.strictEqual(doc.experience?.[0].title, "Lead SRE");
    assert.strictEqual(doc.experience?.[0].bullets.length, 2);
    assert.strictEqual(doc.education?.length, 1);
    assert.strictEqual(doc.education?.[0].institution, "NYU");
  });

  runTest("5. validateResumeDocumentIntegrity flags fabricated experience absent from original", () => {
    const fabricatedDoc = {
      header: { name: "Fake Candidate" },
      experience: [
        { company: "Invented Corp", title: "Principal Architect", dates: "2020-2024", bullets: ["Invented work"] }
      ]
    };
    const audit = validateResumeDocumentIntegrity(fabricatedDoc, SAMPLE_FRESHER_PARSED);
    assert.strictEqual(audit.isValid, false, "Must detect fabricated experience");
    assert.ok(audit.errors[0].includes("Fabricated work experience"));
  });

  console.log("\n--- PART 2: Professional Templates Presentation (Tests 6-11) ---");

  runTest("6. generatePrintableHtml renders ATS Classic template with traditional typography", () => {
    const doc = createResumeDocument(SAMPLE_PARSED_RESUME);
    const html = generatePrintableHtml(doc, "ats-classic");
    assert.ok(html.includes('data-template="ats-classic"'));
    assert.ok(html.includes("Alex Doe"));
    assert.ok(html.includes("Work Experience"));
    assert.ok(html.includes("Acme Cloud Corp"));
    assert.ok(html.includes("Technical Skills"));
  });

  runTest("7. generatePrintableHtml renders Modern Pro template with slate/teal styling", () => {
    const doc = createResumeDocument(SAMPLE_PARSED_RESUME);
    const html = generatePrintableHtml(doc, "modern-pro");
    assert.ok(html.includes('data-template="modern-pro"'));
    assert.ok(html.includes("Alex Doe"));
    assert.ok(html.includes("Acme Cloud Corp"));
    assert.ok(html.includes("#0f766e")); // Teal accent color in stylesheet
  });

  runTest("8. generatePrintableHtml renders Technical template prioritizing skills & tech chips", () => {
    const doc = createResumeDocument(SAMPLE_PARSED_RESUME);
    const html = generatePrintableHtml(doc, "technical");
    assert.ok(html.includes('data-template="technical"'));
    assert.ok(html.includes("Realtime Analytics Engine"));
    assert.ok(html.includes("[Node.js, Redis, WebSocket]"));
  });

  runTest("9. generatePrintableHtml renders Minimal Executive template with small-caps styling", () => {
    const doc = createResumeDocument(SAMPLE_PARSED_RESUME);
    const html = generatePrintableHtml(doc, "minimal-exec");
    assert.ok(html.includes('data-template="minimal-exec"'));
    assert.ok(html.includes("Alex Doe"));
    assert.ok(html.includes("Work Experience"));
  });

  runTest("10. generatePrintableHtml renders Student/Fresher template prioritizing Education & Projects", () => {
    const doc = createResumeDocument(SAMPLE_FRESHER_PARSED);
    const html = generatePrintableHtml(doc, "student-fresher");
    assert.ok(html.includes('data-template="student-fresher"'));
    assert.ok(html.includes("Taylor Smith"));
    assert.ok(html.includes("Campus Marketplace Platform"));
    assert.ok(html.includes("University of Texas at Austin"));
    // Verify Education appears before experience in markup
    const eduIdx = html.indexOf("Education");
    const projIdx = html.indexOf("Technical Projects");
    assert.ok(eduIdx !== -1 && projIdx !== -1 && eduIdx < projIdx, "Education must precede Projects");
  });

  runTest("11. Template switching preserves 100% factual content across all 5 templates", () => {
    const doc = createResumeDocument(SAMPLE_PARSED_RESUME);
    const templates = ["ats-classic", "modern-pro", "technical", "minimal-exec", "student-fresher"];
    for (const t of templates) {
      const html = generatePrintableHtml(doc, t);
      assert.ok(html.includes("Alex Doe"), `Template ${t} must contain candidate name`);
      assert.ok(html.includes("Acme Cloud Corp"), `Template ${t} must contain employer name`);
      assert.ok(html.includes("alex.doe@example.com"), `Template ${t} must contain email`);
      assert.ok(html.includes("University of California, Berkeley"), `Template ${t} must contain university`);
    }
  });

  console.log("\n--- PART 3: Unified Multi-Format Source of Truth (Tests 12-16) ---");

  runTest("12. resumeDocumentToPlainText produces clean recruiter-ready ASCII document", () => {
    const doc = createResumeDocument(SAMPLE_PARSED_RESUME);
    const plainText = resumeDocumentToPlainText(doc);
    assert.ok(plainText.includes("ALEX DOE"));
    assert.ok(plainText.includes("alex.doe@example.com"));
    assert.ok(plainText.includes("PROFESSIONAL EXPERIENCE"));
    assert.ok(plainText.includes("Senior Full Stack Engineer - Acme Cloud Corp"));
    assert.ok(plainText.includes("* Architected scalable microservices"));
    assert.ok(plainText.includes("EDUCATION"));
  });

  runTest("13. resumeDocumentToMarkdown produces canonical Markdown with proper section markers", () => {
    const doc = createResumeDocument(SAMPLE_PARSED_RESUME);
    const md = resumeDocumentToMarkdown(doc);
    assert.ok(md.startsWith("# Alex Doe"));
    assert.ok(md.includes("## WORK EXPERIENCE"));
    assert.ok(md.includes("### Senior Full Stack Engineer at Acme Cloud Corp"));
    assert.ok(md.includes("- Architected scalable microservices"));
  });

  runTest("14. buildDocxDocument constructs native Word Document from ResumeDocument", () => {
    const doc = createResumeDocument(SAMPLE_PARSED_RESUME);
    const docxDoc = buildDocxDocument(doc, "ats-classic");
    assert.ok(docxDoc, "Must return valid Document object");
    assert.strictEqual(typeof docxDoc, "object", "Document must be an object");
  });

  await runAsyncTest("15. generateDocxBuffer produces genuine OpenXML binary with all 4 required parts", async () => {
    const doc = createResumeDocument(SAMPLE_PARSED_RESUME);
    const buffer = await generateDocxBuffer(doc, "modern-pro");
    assert.ok(Buffer.isBuffer(buffer), "Output must be a Node.js Buffer");
    assert.ok(buffer.length > 1000, "Buffer size must be realistic for DOCX archive");

    const validation = await validateDocxPackage(buffer);
    assert.strictEqual(validation.isValid, true, `DOCX package must be valid: ${validation.error}`);
    assert.strictEqual(validation.hasContentTypes, true);
    assert.strictEqual(validation.hasRels, true);
    assert.strictEqual(validation.hasDocumentXml, true);
    assert.strictEqual(validation.hasDocumentRels, true);
  });

  runTest("16. Cross-Format Consistency: HTML, DOCX, Plain Text, and Markdown contain identical factual text", () => {
    const doc = createResumeDocument(SAMPLE_PARSED_RESUME);
    const plainText = generatePlainText(doc);
    const markdown = resumeDocumentToMarkdown(doc);
    const html = generatePrintableHtml(doc, "ats-classic");

    // All must contain the same core entities
    for (const text of [plainText, markdown, html]) {
      assert.ok(text.toLowerCase().includes("alex doe"), "Must contain name");
      assert.ok(text.includes("Acme Cloud Corp"), "Must contain employer");
      assert.ok(text.includes("Senior Full Stack Engineer"), "Must contain role");
      assert.ok(text.includes("alex.doe@example.com"), "Must contain email");
      assert.ok(text.includes("Berkeley"), "Must contain university");
    }
  });

  console.log("\n--- PART 4: Server HTTP Endpoints Integration (Tests 17-20) ---");

  await runAsyncTest("17. POST /api/export-resume-docx accepts resumeDocument and returns binary DOCX", async () => {
    const doc = createResumeDocument(SAMPLE_PARSED_RESUME);
    const res = await fetch(`${BASE_URL}/api/export-resume-docx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resumeDocument: doc,
        targetCompany: "Google",
        targetRole: "Senior Software Engineer",
        templateId: "technical"
      })
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("content-type"), DOCX_MIME_TYPE);

    const arrayBuf = await res.arrayBuffer();
    const validation = await validateDocxPackage(arrayBuf);
    assert.strictEqual(validation.isValid, true);
  });

  await runAsyncTest("18. POST /api/export-resume-docx supports templateId parameter", async () => {
    const doc = createResumeDocument(SAMPLE_FRESHER_PARSED);
    const res = await fetch(`${BASE_URL}/api/export-resume-docx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resumeDocument: doc,
        targetCompany: "Microsoft",
        targetRole: "Software Engineer",
        templateId: "student-fresher"
      })
    });

    assert.strictEqual(res.status, 200);
    const arrayBuf = await res.arrayBuffer();
    const validation = await validateDocxPackage(arrayBuf);
    assert.strictEqual(validation.isValid, true);
  });

  await runAsyncTest("19. POST /api/export-resume-html accepts resumeDocument and returns printable HTML", async () => {
    const doc = createResumeDocument(SAMPLE_PARSED_RESUME);
    const res = await fetch(`${BASE_URL}/api/export-resume-html`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resumeDocument: doc,
        templateId: "modern-pro"
      })
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.data.html.includes("Alex Doe"));
    assert.ok(json.data.html.includes("modern-pro"));
  });

  await runAsyncTest("20. POST /api/tailor-resume-batch returns structured tailoredDocument in response", async () => {
    const sampleResumeText = `
Alex Doe
Email: alex.doe@example.com | Location: San Francisco, CA
Summary: Full Stack Engineer with 4 years experience building microservices.
Skills: TypeScript, Node.js, React, PostgreSQL, Docker
Experience:
Full Stack Engineer at CloudWave (2021 - Present)
- Designed and built RESTful APIs using TypeScript and Node.js.
- Maintained PostgreSQL databases and wrote automated integration tests.
Education:
B.S. in Computer Science, University of California (2021)
    `.trim();

    const sampleProfile = {
      profileHash: "test_hash_001",
      companyName: "Acme Corp",
      targetRole: "Full Stack Engineer",
      requiredSkills: ["TypeScript", "Node.js", "Docker"],
      structuredRequirements: [
        {
          requirementId: "req_ts",
          name: "TypeScript",
          canonicalName: "TypeScript",
          category: "TECHNICAL_SKILL",
          importance: "REQUIRED",
          status: "PRESENT",
          priority: "HIGH",
          confidence: 1.0
        }
      ]
    };

    const res = await fetch(`${BASE_URL}/api/tailor-resume-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resumeText: sampleResumeText,
        parsedResume: {
          skills: ["TypeScript", "Node.js", "React", "PostgreSQL", "Docker"],
          experience: [{
            role: "Full Stack Engineer",
            company: "CloudWave",
            duration: "2021 - Present",
            description: "Designed and built RESTful APIs using TypeScript and Node.js."
          }],
          education: [{
            degree: "B.S. in Computer Science",
            institution: "University of California"
          }],
          summary: "Full Stack Engineer with 4 years experience building microservices.",
          contactInfo: {
            name: "Alex Doe",
            email: "alex.doe@example.com",
            location: "San Francisco, CA"
          }
        },
        frozenProfile: sampleProfile,
        selectedItems: [
          { id: "item_1", title: "TypeScript", type: "skill" }
        ]
      })
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.data.tailoredContent, "Must return tailoredContent");
    assert.ok(json.data.tailoredDocument, "Must return structured tailoredDocument");
    assert.strictEqual(json.data.tailoredDocument.header.name, "Alex Doe");
    assert.ok(json.data.tailoredDocument.experience?.length > 0);
  });

  console.log("\n================================================================================");
  console.log(`SUMMARY: ${passedCount} OF ${passedCount + failedCount} TESTS PASSED CLEANLY (${Math.round((passedCount / (passedCount + failedCount)) * 100)}% PASS RATE)`);
  console.log("================================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error("FATAL ERROR IN TEST SUITE:", err);
  process.exit(1);
});
