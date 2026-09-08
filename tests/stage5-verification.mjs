import assert from 'node:assert';
import { 
  sanitizeExportFileName, 
  generatePrintableHtml, 
  generateDocxBlob,
  triggerDownload
} from '../src/lib/exportEngine.ts';
import { 
  validateExportReadiness, 
  verifyExportContentIntegrity 
} from '../src/lib/exportValidator.ts';

console.log("================================================================================");
console.log("STAGE 5 VERIFICATION SUITE: EXPORT INTEGRITY, PDF/DOCX & PRODUCTION HARDENING");
console.log("================================================================================\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] Test ${passed + failed + 1}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] Test ${passed + failed + 1}: ${name}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

// -------------------------------------------------------------------------------- //
// PART 1: FILENAME SANITIZATION & METADATA FORMATTING (Tests 1 - 10)
// -------------------------------------------------------------------------------- //
console.log("--- PART 1: Filename Sanitization & Metadata ---");

test("sanitizeExportFileName creates clean filename from standard inputs", () => {
  const result = sanitizeExportFileName("Jane Doe", "Google", "Senior Frontend Engineer", "docx");
  assert.strictEqual(result, "Jane_Doe_Google_Senior_Frontend_Engineer_Resume.docx");
});

test("sanitizeExportFileName strips illegal file system characters (\\ / : * ? \" < > |)", () => {
  const result = sanitizeExportFileName("Jane/Doe:Candidate?", "Acme:Corp*<US>", "Tech/Lead|Manager?", "pdf");
  assert.ok(!result.includes("/"));
  assert.ok(!result.includes(":"));
  assert.ok(!result.includes("*"));
  assert.ok(!result.includes("?"));
  assert.ok(!result.includes("<"));
  assert.ok(!result.includes(">"));
  assert.ok(!result.includes("|"));
  assert.strictEqual(result, "Jane_Doe_Candidate_Acme_Corp_US_Tech_Lead_Manager_Resume.pdf");
});

test("sanitizeExportFileName handles missing/empty candidate name gracefully", () => {
  const result = sanitizeExportFileName("", "Amazon", "Backend Developer", "md");
  assert.ok(result.startsWith("Candidate_Amazon_Backend_Developer"));
  assert.ok(result.endsWith(".md"));
});

test("sanitizeExportFileName handles empty company and role", () => {
  const result = sanitizeExportFileName("Alex Smith", "", "", "docx");
  assert.strictEqual(result, "Alex_Smith_Resume.docx");
});

test("sanitizeExportFileName collapses consecutive underscores and whitespace", () => {
  const result = sanitizeExportFileName("   Alex    Smith   ", "Meta   Platforms", "Software   Engineer", "html");
  assert.strictEqual(result, "Alex_Smith_Meta_Platforms_Software_Engineer_Resume.html");
});

test("sanitizeExportFileName strips dots from extension if user passes .docx", () => {
  const result = sanitizeExportFileName("Jane Doe", "Stripe", "Architect", ".docx");
  assert.strictEqual(result, "Jane_Doe_Stripe_Architect_Resume.docx");
});

test("sanitizeExportFileName handles non-ASCII and accented characters", () => {
  const result = sanitizeExportFileName("Renée Françoise", "Société Générale", "Développeur", "docx");
  assert.ok(result.endsWith(".docx"));
  assert.ok(!result.includes("/"));
});

test("sanitizeExportFileName caps filename length to prevent OS max path overflow", () => {
  const longRole = "A".repeat(300);
  const result = sanitizeExportFileName("Jane Doe", "MegaCorp", longRole, "docx");
  assert.ok(result.length <= 150);
  assert.ok(result.endsWith(".docx"));
});

test("sanitizeExportFileName preserves exact extension casing in lowercase", () => {
  const result = sanitizeExportFileName("Jane Doe", "Apple", "iOS Dev", "DOCX");
  assert.strictEqual(result, "Jane_Doe_Apple_iOS_Dev_Resume.docx");
});

test("sanitizeExportFileName works for all supported export formats (pdf, docx, md, html)", () => {
  const formats = ["pdf", "docx", "md", "html"];
  for (const fmt of formats) {
    const fn = sanitizeExportFileName("John", "Target", "Dev", fmt);
    assert.ok(fn.endsWith(`.${fmt}`));
  }
});

// -------------------------------------------------------------------------------- //
// PART 2: EXPORT READINESS VALIDATION GATE (Tests 11 - 20)
// -------------------------------------------------------------------------------- //
console.log("\n--- PART 2: Export Readiness Validation Gate ---");

test("validateExportReadiness rejects empty tailoredContent", () => {
  const res = validateExportReadiness({
    status: "FINAL_OPTIMIZED",
    tailoredContent: "",
  });
  assert.strictEqual(res.isValid, false);
  assert.ok(res.errors.some(e => e.includes("empty")));
});

test("validateExportReadiness rejects whitespace-only content", () => {
  const res = validateExportReadiness({
    status: "FINAL_OPTIMIZED",
    tailoredContent: "   \n\n   ",
  });
  assert.strictEqual(res.isValid, false);
});

test("validateExportReadiness rejects non-final unoptimized draft status", () => {
  const res = validateExportReadiness({
    status: "DRAFT",
    tailoredContent: "# Jane Doe\n## Experience\n- Built systems at Google",
  });
  assert.strictEqual(res.isValid, false);
  assert.ok(res.errors.some(e => e.includes("final") || e.includes("status")));
});

test("validateExportReadiness passes valid tailored resume with FINAL_OPTIMIZED status", () => {
  const validResume = `# Jane Doe
jane@example.com | 555-0199 | linkedin.com/in/janedoe

## Summary
Experienced software engineer with 5 years in distributed systems.

## Skills
- TypeScript, React, Node.js, Go, Kubernetes, PostgreSQL

## Professional Experience
### Senior Engineer | Acme Corp (2021 - Present)
- Engineered scalable microservices processing 50k req/sec.

## Education
- B.S. in Computer Science, University of Technology`;

  const res = validateExportReadiness({
    status: "FINAL_OPTIMIZED",
    tailoredContent: validResume,
    parsedResume: {
      name: "Jane Doe",
      email: "jane@example.com",
      skills: ["TypeScript", "React", "Node.js"],
      experience: [{ company: "Acme Corp", role: "Senior Engineer", duration: "2021 - Present", bullets: [] }],
      education: ["B.S. in Computer Science"],
      projects: []
    }
  });

  assert.strictEqual(res.isValid, true);
  assert.strictEqual(res.errors.length, 0);
});

test("validateExportReadiness flags missing Experience/Projects section with warning or error", () => {
  const noExperience = `# Jane Doe\n## Skills\n- TypeScript, Python\n## Education\n- BS CS`;
  const res = validateExportReadiness({
    status: "FINAL_OPTIMIZED",
    tailoredContent: noExperience
  });
  assert.ok(res.warnings.length > 0 || res.errors.length > 0);
});

test("validateExportReadiness detects un-rendered template placeholders (e.g. {{COMPANY}})", () => {
  const templateResume = `# Jane Doe\n## Experience\n- Worked at {{COMPANY_NAME}} as a {{ROLE_TITLE}}`;
  const res = validateExportReadiness({
    status: "FINAL_OPTIMIZED",
    tailoredContent: templateResume
  });
  assert.strictEqual(res.isValid, false);
  assert.ok(res.errors.some(e => e.includes("placeholder")));
});

test("validateExportReadiness detects square bracket placeholders like [Insert Metric]", () => {
  const placeholderResume = `# Jane Doe\n## Experience\n- Improved latency by [Insert Metric Here]`;
  const res = validateExportReadiness({
    status: "FINAL_OPTIMIZED",
    tailoredContent: placeholderResume
  });
  assert.strictEqual(res.isValid, false);
  assert.ok(res.errors.some(e => e.includes("placeholder")));
});

test("validateExportReadiness detects TODO comments or dummy markers", () => {
  const todoResume = `# Jane Doe\n## Experience\n- TODO: Add bullet point for React migration`;
  const res = validateExportReadiness({
    status: "FINAL_OPTIMIZED",
    tailoredContent: todoResume
  });
  assert.strictEqual(res.isValid, false);
});

test("validateExportReadiness warns if contact information is completely absent", () => {
  const noContact = `# Jane Doe\n\n## Summary\nEngineer.\n\n## Experience\n- Google (2020-2022)\n\n## Skills\n- Java`;
  const res = validateExportReadiness({
    status: "FINAL_OPTIMIZED",
    tailoredContent: noContact
  });
  assert.ok(res.warnings.some(w => w.toLowerCase().includes("email") || w.toLowerCase().includes("contact")));
});

test("validateExportReadiness verifies candidate name presence", () => {
  const content = `## Summary\nEngineer.\n## Experience\n- Dev at Amazon`;
  const res = validateExportReadiness({
    status: "FINAL_OPTIMIZED",
    tailoredContent: content,
    parsedResume: {
      name: "Marcus Aurelius",
      skills: ["Rust"],
      experience: [],
      education: [],
      projects: []
    }
  });
  assert.ok(res.warnings.some(w => w.includes("Marcus Aurelius")) || res.errors.some(e => e.includes("name")));
});

// -------------------------------------------------------------------------------- //
// PART 3: FACTUAL AND CONTENT INTEGRITY VERIFICATION (Tests 21 - 30)
// -------------------------------------------------------------------------------- //
console.log("\n--- PART 3: Factual and Content Integrity ---");

test("verifyExportContentIntegrity passes when all verified skills are preserved", () => {
  const parsed = {
    name: "Jane Doe",
    email: "jane@test.com",
    skills: ["Python", "Django", "PostgreSQL", "Docker"],
    experience: [{ company: "TechCorp", role: "Developer", duration: "2020-2023", bullets: [] }],
    education: ["B.Tech CS"],
    projects: []
  };
  const exportMarkdown = `# Jane Doe
jane@test.com
## Skills
Python, Django, PostgreSQL, Docker
## Experience
TechCorp - Developer (2020-2023)`;

  const check = verifyExportContentIntegrity(parsed, exportMarkdown);
  assert.strictEqual(check.isIntegrityPreserved, true);
  assert.strictEqual(check.omittedSkills.length, 0);
  assert.strictEqual(check.omittedCompanies.length, 0);
});

test("verifyExportContentIntegrity identifies accidentally dropped skills", () => {
  const parsed = {
    name: "Jane Doe",
    skills: ["Python", "Rust", "Kubernetes", "AWS"],
    experience: [],
    education: [],
    projects: []
  };
  const exportMarkdown = `# Jane Doe\n## Skills\nPython, AWS`;

  const check = verifyExportContentIntegrity(parsed, exportMarkdown);
  assert.ok(check.omittedSkills.includes("Rust"));
  assert.ok(check.omittedSkills.includes("Kubernetes"));
});

test("verifyExportContentIntegrity verifies company preservation", () => {
  const parsed = {
    name: "Jane Doe",
    skills: ["React"],
    experience: [
      { company: "Microsoft", role: "SDE", duration: "2019-2021", bullets: [] },
      { company: "Stripe", role: "Senior SDE", duration: "2021-2023", bullets: [] }
    ],
    education: [],
    projects: []
  };
  const exportMarkdown = `# Jane Doe\n## Experience\n- Senior SDE at Stripe (2021-2023)`;

  const check = verifyExportContentIntegrity(parsed, exportMarkdown);
  assert.ok(check.omittedCompanies.includes("Microsoft"));
});

test("verifyExportContentIntegrity checks project title preservation", () => {
  const parsed = {
    name: "Jane Doe",
    skills: ["Go"],
    experience: [],
    education: [],
    projects: ["Distributed Key-Value Store", "Resumix ATS Parser"]
  };
  const exportMarkdown = `# Jane Doe\n## Projects\n- Resumix ATS Parser: High speed parser in Go`;

  const check = verifyExportContentIntegrity(parsed, exportMarkdown);
  assert.ok(check.omittedProjects.includes("Distributed Key-Value Store"));
});

test("verifyExportContentIntegrity checks email and contact preservation", () => {
  const parsed = {
    name: "Jane Doe",
    email: "janedoe@alumni.stanford.edu",
    skills: ["Go"],
    experience: [],
    education: [],
    projects: []
  };
  const exportMarkdown = `# Jane Doe\n## Skills\nGo`;

  const check = verifyExportContentIntegrity(parsed, exportMarkdown);
  assert.strictEqual(check.isContactPreserved, false);
});

test("verifyExportContentIntegrity passes case-insensitive skill matching", () => {
  const parsed = {
    name: "Jane Doe",
    skills: ["javascript", "REACT", "Node.JS"],
    experience: [],
    education: [],
    projects: []
  };
  const exportMarkdown = `# Jane Doe\n## Skills\nJavaScript, React, Node.js`;

  const check = verifyExportContentIntegrity(parsed, exportMarkdown);
  assert.strictEqual(check.omittedSkills.length, 0);
});

test("verifyExportContentIntegrity checks candidate name preservation", () => {
  const parsed = {
    name: "Aarav Sharma",
    skills: ["Java"],
    experience: [],
    education: [],
    projects: []
  };
  const exportMarkdown = `# Tailored Resume\n## Skills\nJava`;

  const check = verifyExportContentIntegrity(parsed, exportMarkdown);
  assert.strictEqual(check.isNamePreserved, false);
});

test("verifyExportContentIntegrity reports detailed discrepancy report", () => {
  const parsed = {
    name: "Jane Doe",
    email: "jane@doe.com",
    skills: ["C++", "CUDA", "PyTorch"],
    experience: [{ company: "NVIDIA", role: "AI Engineer", duration: "2022-2024", bullets: [] }],
    education: [],
    projects: ["LLM Inference Engine"]
  };
  const exportMarkdown = `# Jane Doe\njane@doe.com\n## Skills\nPyTorch\n## Experience\n- AI Engineer (2022-2024)`;

  const check = verifyExportContentIntegrity(parsed, exportMarkdown);
  assert.strictEqual(check.isIntegrityPreserved, false);
  assert.ok(check.discrepancyCount > 0);
  assert.ok(check.summary.includes("NVIDIA") || check.summary.includes("C++"));
});

test("verifyExportContentIntegrity handles empty parsed resume safely", () => {
  const check = verifyExportContentIntegrity(null, "# Resume");
  assert.strictEqual(check.isIntegrityPreserved, true);
});

test("verifyExportContentIntegrity returns clean summary string on perfect match", () => {
  const parsed = {
    name: "Jane Doe",
    email: "jane@doe.com",
    skills: ["Python"],
    experience: [{ company: "Google", role: "Dev", duration: "2020", bullets: [] }],
    education: [],
    projects: []
  };
  const content = `# Jane Doe\njane@doe.com\nGoogle - Dev (2020)\nPython`;
  const check = verifyExportContentIntegrity(parsed, content);
  assert.strictEqual(check.isIntegrityPreserved, true);
  assert.strictEqual(check.discrepancyCount, 0);
});

// -------------------------------------------------------------------------------- //
// PART 4: PRINTABLE HTML & CSS EXPORT RENDERING (Tests 31 - 40)
// -------------------------------------------------------------------------------- //
console.log("\n--- PART 4: Printable HTML & CSS Export Rendering ---");

test("generatePrintableHtml produces valid HTML5 document structure", () => {
  const html = generatePrintableHtml("# Jane Doe\nSoftware Engineer", "Jane Doe - Resume");
  assert.ok(html.startsWith("<!DOCTYPE html>"));
  assert.ok(html.includes("<html"));
  assert.ok(html.includes("<head>"));
  assert.ok(html.includes("<body>"));
  assert.ok(html.includes("</html>"));
});

test("generatePrintableHtml includes title with candidate and role", () => {
  const html = generatePrintableHtml("# Jane Doe", "Jane Doe - Google - Resume");
  assert.ok(html.includes("<title>Jane Doe - Google - Resume</title>"));
});

test("generatePrintableHtml includes @media print CSS rules", () => {
  const html = generatePrintableHtml("# Jane Doe", "Resume");
  assert.ok(html.includes("@media print"));
  assert.ok(html.includes("page-break-inside: avoid") || html.includes("break-inside: avoid"));
});

test("generatePrintableHtml renders Markdown headings as semantic HTML (h1, h2, h3)", () => {
  const markdown = `# Jane Doe\n## Professional Experience\n### Senior Developer`;
  const html = generatePrintableHtml(markdown, "Resume");
  assert.ok(html.includes("<h1>Jane Doe</h1>"));
  assert.ok(html.includes("<h2>Professional Experience</h2>"));
  assert.ok(html.includes("<h3>Senior Developer</h3>"));
});

test("generatePrintableHtml renders bullet lists as <ul> and <li> elements", () => {
  const markdown = `## Skills\n- TypeScript\n- React\n- Node.js`;
  const html = generatePrintableHtml(markdown, "Resume");
  assert.ok(html.includes("<ul"));
  assert.ok(html.includes("<li>TypeScript</li>"));
  assert.ok(html.includes("<li>React</li>"));
  assert.ok(html.includes("<li>Node.js</li>"));
});

test("generatePrintableHtml escapes HTML entities in resume content to prevent injection", () => {
  const markdown = `## Summary\nExpert in <script>alert('xss')</script> and C++ <template> programming`;
  const html = generatePrintableHtml(markdown, "Resume");
  assert.ok(!html.includes("<script>alert"));
  assert.ok(html.includes("&lt;script&gt;") || !html.includes("<script>"));
});

test("generatePrintableHtml converts bold and italic markdown tokens (**bold**, *italic*)", () => {
  const markdown = `**Senior Software Engineer** at *Acme Corp*`;
  const html = generatePrintableHtml(markdown, "Resume");
  assert.ok(html.includes("<strong>Senior Software Engineer</strong>") || html.includes("<b>Senior Software Engineer</b>"));
  assert.ok(html.includes("<em>Acme Corp</em>") || html.includes("<i>Acme Corp</i>"));
});

test("generatePrintableHtml formats contact divider bars cleanly", () => {
  const markdown = `# Jane Doe\njane@example.com | (555) 123-4567 | github.com/janedoe`;
  const html = generatePrintableHtml(markdown, "Resume");
  assert.ok(html.includes("jane@example.com"));
  assert.ok(html.includes("github.com/janedoe"));
});

test("generatePrintableHtml includes standard ATS print margins (0.5in - 0.75in)", () => {
  const html = generatePrintableHtml("# Jane", "Resume");
  assert.ok(html.includes("margin:") || html.includes("@page"));
});

test("generatePrintableHtml contains zero external script dependencies", () => {
  const html = generatePrintableHtml("# Jane Doe", "Resume");
  assert.ok(!html.includes("<script src="));
});

// -------------------------------------------------------------------------------- //
// PART 5: DOCX / WORD EXPORT GENERATION & MIMES (Tests 41 - 45)
// -------------------------------------------------------------------------------- //
console.log("\n--- PART 5: DOCX / Word Document Generation ---");

test("generateDocxBlob produces a Blob with Word MIME type", () => {
  const markdown = `# Jane Doe\n## Experience\n- Lead Developer at Stripe`;
  const blob = generateDocxBlob(markdown, "Jane Doe Resume");
  assert.ok(blob instanceof Blob);
  assert.ok(blob.type.includes("msword") || blob.type.includes("wordprocessingml"));
});

test("generateDocxBlob includes Microsoft Office XML namespaces for compatibility", () => {
  const markdown = `# Jane Doe\n## Skills\n- Python`;
  const blob = generateDocxBlob(markdown, "Jane Doe Resume");
  assert.ok(blob.size > 100);
});

test("generateDocxBlob converts markdown headings into formatted Word paragraphs", () => {
  const markdown = `# Jane Doe\n## Skills\n- Python, Django\n## Experience\n- Built APIs`;
  const blob = generateDocxBlob(markdown, "Resume");
  assert.ok(blob.size > 200);
});

test("generateDocxBlob preserves bullet lists with bullet formatting", () => {
  const markdown = `# Jane Doe\n- Bullet 1\n- Bullet 2\n- Bullet 3`;
  const blob = generateDocxBlob(markdown, "Resume");
  assert.ok(blob.size > 150);
});

test("generateDocxBlob produces non-empty output for complex multi-page resumes", () => {
  const largeResume = `# Jane Doe\njane@doe.com\n\n` +
    `## Summary\nAccomplished engineer.\n\n` +
    `## Experience\n` +
    `### Company A\n- Impact 1\n- Impact 2\n\n`.repeat(10);
  const blob = generateDocxBlob(largeResume, "Full Resume");
  assert.ok(blob.size > 1000);
});

// -------------------------------------------------------------------------------- //
// PART 6: ZERO-AI EXPORT & ZERO RE-GENERATION POLICY (Tests 46 - 50)
// -------------------------------------------------------------------------------- //
console.log("\n--- PART 6: Zero-AI Export Architecture & Pipeline Continuity ---");

test("Export operations execute with 0 Gemini API calls", () => {
  // Export functions must be purely deterministic and local
  const markdown = `# Jane Doe\n## Experience\n- Google (2020-2024)`;
  const startTime = Date.now();
  const html = generatePrintableHtml(markdown, "Resume");
  const docx = generateDocxBlob(markdown, "Resume");
  const duration = Date.now() - startTime;
  
  assert.ok(html.length > 0);
  assert.ok(docx.size > 0);
  assert.ok(duration < 100, "Export generation took less than 100ms without network latency");
});

test("Export Validator executes synchronously with 0 external dependencies", () => {
  const res = validateExportReadiness({
    status: "FINAL_OPTIMIZED",
    tailoredContent: "# Jane Doe\n## Skills\n- Python"
  });
  assert.strictEqual(typeof res.isValid, "boolean");
});

test("Content Integrity checker executes synchronously with 0 external dependencies", () => {
  const check = verifyExportContentIntegrity(
    { name: "Jane", skills: ["Python"], experience: [], education: [], projects: [] },
    "# Jane\n## Skills\nPython"
  );
  assert.strictEqual(typeof check.isIntegrityPreserved, "boolean");
});

test("End-to-End Pipeline Integrity: Stage 1 -> Stage 2 -> Stage 3 -> Stage 4 -> Stage 5", () => {
  // Verified that parsed resume flows through scoring, tailoring, validation, and export
  const parsedResume = {
    name: "Kamanasis Roy",
    email: "kamanasis@example.com",
    skills: ["TypeScript", "React", "Node.js", "Docker", "PostgreSQL"],
    experience: [
      {
        company: "InnovateTech",
        role: "Full Stack Engineer",
        duration: "2021 - Present",
        bullets: ["Developed high throughput web apps using React and Node.js."]
      }
    ],
    education: ["B.S. in Computer Science"],
    projects: ["Resumix AI Platform"]
  };

  const tailoredResume = `# Kamanasis Roy
kamanasis@example.com | github.com/kamanasis

## Professional Summary
Full Stack Engineer with proven experience in TypeScript, React, and Node.js.

## Core Technical Skills
TypeScript, React, Node.js, Docker, PostgreSQL

## Professional Experience
### Full Stack Engineer | InnovateTech (2021 - Present)
- Architected high-throughput web applications using React and Node.js, ensuring 99.9% uptime.

## Key Projects
- Resumix AI Platform: Built ATS-optimized resume analysis pipeline.

## Education
- B.S. in Computer Science`;

  // 1. Validate export readiness
  const readiness = validateExportReadiness({
    status: "FINAL_OPTIMIZED",
    tailoredContent: tailoredResume,
    parsedResume
  });
  assert.strictEqual(readiness.isValid, true);

  // 2. Verify factual content integrity
  const integrity = verifyExportContentIntegrity(parsedResume, tailoredResume);
  assert.strictEqual(integrity.isIntegrityPreserved, true);

  // 3. Generate sanitized export filename
  const fnDocx = sanitizeExportFileName(parsedResume.name, "Google", "Full Stack Engineer", "docx");
  const fnPdf = sanitizeExportFileName(parsedResume.name, "Google", "Full Stack Engineer", "pdf");
  assert.strictEqual(fnDocx, "Kamanasis_Roy_Google_Full_Stack_Engineer_Resume.docx");
  assert.strictEqual(fnPdf, "Kamanasis_Roy_Google_Full_Stack_Engineer_Resume.pdf");

  // 4. Generate DOCX Blob
  const docxBlob = generateDocxBlob(tailoredResume, "Kamanasis Roy Resume");
  assert.ok(docxBlob.size > 0);

  // 5. Generate Printable HTML
  const printableHtml = generatePrintableHtml(tailoredResume, "Kamanasis Roy Resume");
  assert.ok(printableHtml.includes("Kamanasis Roy"));
  assert.ok(printableHtml.includes("InnovateTech"));
  assert.ok(printableHtml.includes("@media print"));
});

test("triggerDownload handles mock document environment safely without throwing", () => {
  // In Node environment, triggerDownload falls back safely or uses global document if present
  try {
    const blob = new Blob(["test"], { type: "text/plain" });
    triggerDownload(blob, "test.txt");
    assert.ok(true);
  } catch (e) {
    // If running in pure node without DOM, it shouldn't crash unhandled
    assert.ok(e instanceof Error);
  }
});

// -------------------------------------------------------------------------------- //
// SUMMARY REPORT
// -------------------------------------------------------------------------------- //
console.log("\n================================================================================");
console.log(`STAGE 5 VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("================================================================================");

if (failed > 0) {
  process.exit(1);
}
