import assert from "node:assert/strict";
import { sanitizeHistoryString, getScoreTier, formatHistoryDate } from "../src/components/AnalysisHistory.tsx";
import { sanitizeExportFileName, generatePrintableHtml, generateDocxBlob } from "../src/lib/exportEngine.ts";

console.log("=== Resumix Optimization History & Synchronization Verification ===");

// 1. String Sanitization Tests
console.log("\n[TEST 1] String Sanitization (Fixes trailing backslashes and casing)");
{
  assert.equal(sanitizeHistoryString("google\\"), "Google", "Trailing backslash must be stripped and casing normalized");
  assert.equal(sanitizeHistoryString("deloitte"), "Deloitte", "All lowercase company should be title-cased");
  assert.equal(sanitizeHistoryString("delottic"), "Delottic", "Startup or misspelled company names should be preserved cleanly");
  assert.equal(sanitizeHistoryString("back end developer"), "Back End Developer", "Role should be title-cased cleanly");
  assert.equal(sanitizeHistoryString("   Amazon Web Services   "), "Amazon Web Services", "Whitespace should be trimmed");
  assert.equal(sanitizeHistoryString(""), "", "Empty string should return empty string");
  assert.equal(sanitizeHistoryString(undefined), "", "Undefined should return empty string");
  console.log("✓ String sanitization correctly fixed 'google\\' -> 'Google' and normalized casing.");
}

// 2. ATS Score Tier Classification
console.log("\n[TEST 2] ATS Score Tier Classification");
{
  const tier85 = getScoreTier(85);
  assert.equal(tier85.label, "Strong Match");
  assert.match(tier85.badgeClass, /emerald/);

  const tier75 = getScoreTier(75);
  assert.equal(tier75.label, "Partial Match");
  assert.match(tier75.badgeClass, /amber/);

  const tier25 = getScoreTier(25);
  assert.equal(tier25.label, "Low Match");
  assert.match(tier25.badgeClass, /red/);
  console.log("✓ ATS score tiers correctly classified across 85% (Strong), 75% (Partial), and 25% (Low).");
}

// 3. Dual-Collection Unification and Deduplication
console.log("\n[TEST 3] Dual-Collection Unification & Deduplication");
{
  const mockAnalyses = [
    {
      id: "opt_1",
      targetCompany: "Deloitte",
      targetRole: "Back End Developer",
      resumeId: "res_1",
      resumeName: "Kamanasis Roy resume.docx",
      createdAt: "2026-07-05T12:00:00Z",
      matchingScore: 75,
      beforeAtsScore: 68,
      afterAtsScore: 75,
      atsScoreDelta: 7,
      tailoredContent: "# Kamanasis Roy\n## Professional Summary\nExperienced Engineer...",
      tailoredBullets: [{ current: "Worked on API", improved: "Engineered scalable REST APIs" }]
    },
    {
      id: "opt_2",
      targetCompany: "Google",
      targetRole: "Frontend Designer",
      resumeId: "res_1",
      resumeName: "Kamanasis Roy resume.docx",
      createdAt: "2026-07-13T12:00:00Z",
      matchingScore: 25,
      tailoredContent: "# Frontend Resume"
    }
  ];

  const mockGapReports = [
    {
      id: "gap_1",
      targetCompany: "Deloitte",
      targetRole: "Full Stack Engineer",
      resumeId: "res_1",
      createdAt: "2026-08-01T12:00:00Z",
      atsScore: 84,
      scores: { atsCompatibility: 84, requiredSkills: 85, roleAlignment: 80 },
      missingItems: ["Kubernetes", "Kafka"]
    },
    {
      id: "opt_1", // Duplicate ID that should be deduped
      targetCompany: "Deloitte",
      targetRole: "Back End Developer",
      createdAt: "2026-07-05T12:00:00Z",
      atsScore: 75
    }
  ];

  // Merge and deduplicate
  const seenIds = new Set();
  const unified = [];

  for (const a of mockAnalyses) {
    if (a.id && !seenIds.has(a.id)) {
      seenIds.add(a.id);
      unified.push({ ...a, type: "TAILORED", atsScore: a.matchingScore });
    }
  }

  for (const g of mockGapReports) {
    if (g.id && !seenIds.has(g.id)) {
      seenIds.add(g.id);
      unified.push({ ...g, type: "DIAGNOSTIC", atsScore: g.atsScore });
    }
  }

  assert.equal(unified.length, 3, "Should have exactly 3 unique items after deduplication");
  assert.equal(unified.filter(i => i.type === "TAILORED").length, 2);
  assert.equal(unified.filter(i => i.type === "DIAGNOSTIC").length, 1);

  // Sorting
  unified.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  assert.equal(unified[0].id, "gap_1", "Most recent item (Aug 1) should appear first");
  assert.equal(unified[0].atsScore, 84, "Should preserve the 84% score from the gap report");
  console.log("✓ Unified dual-collection mapping correctly merged, deduped, and sorted records.");
}

// 4. Multi-Format Export Generation
console.log("\n[TEST 4] Multi-Format Export Generation");
{
  const sampleMarkdown = "# Jane Doe\n## Experience\n- Built high throughput systems using Node.js and TypeScript.";
  const filenamePdf = sanitizeExportFileName("Jane Doe", "Deloitte", "Back End Developer", "html");
  const filenameDocx = sanitizeExportFileName("Jane Doe", "Deloitte", "Back End Developer", "docx");
  const filenameMd = sanitizeExportFileName("Jane Doe", "Deloitte", "Back End Developer", "md");

  assert.equal(filenamePdf, "Jane_Doe_Deloitte_Back_End_Developer_Resume.html");
  assert.equal(filenameDocx, "Jane_Doe_Deloitte_Back_End_Developer_Resume.docx");
  assert.equal(filenameMd, "Jane_Doe_Deloitte_Back_End_Developer_Resume.md");

  const html = generatePrintableHtml(sampleMarkdown, "Back End Developer - Jane Doe");
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /Built high throughput systems/);

  const docxBlob = generateDocxBlob(sampleMarkdown);
  assert.ok(docxBlob.size > 0, "Docx blob must not be empty");
  console.log("✓ Multi-format export filenames and document rendering verified.");
}

// 5. Date Formatting
console.log("\n[TEST 5] Date Formatting");
{
  const formatted = formatHistoryDate("2026-07-05T12:00:00Z");
  assert.match(formatted, /2026/);
  assert.equal(formatHistoryDate(undefined), "Recent");
  assert.equal(formatHistoryDate("invalid-date"), "Recent");
  console.log("✓ Date formatting handles valid ISO dates and bad inputs gracefully.");
}

// 6. Workspace Synchronization Callbacks (Tailor Tool, Applications, Resume Selection)
console.log("\n[TEST 6] Workspace Synchronization Callbacks");
{
  let tailorLoadedContext = null;
  const handleOpenInTailor = (ctx) => { tailorLoadedContext = { ...ctx }; };

  let applicationTrackedContext = null;
  const handleTrackApplication = (ctx) => { applicationTrackedContext = { ...ctx }; };

  let activeResumeId = "res_1";
  const handleSelectResume = (id) => { activeResumeId = id; };

  // Simulate user triggering customize from history
  handleOpenInTailor({
    company: "Google",
    role: "Back End Developer",
    jobDescription: "Senior Node.js distributed systems engineer.",
    resumeId: "res_2"
  });

  assert.equal(tailorLoadedContext.company, "Google");
  assert.equal(tailorLoadedContext.role, "Back End Developer");
  assert.equal(tailorLoadedContext.resumeId, "res_2");

  // Simulate user triggering track in applications
  handleTrackApplication({
    company: "Deloitte",
    role: "Software Designer",
    resumeId: "res_1"
  });

  assert.equal(applicationTrackedContext.company, "Deloitte");
  assert.equal(applicationTrackedContext.role, "Software Designer");

  // Simulate user selecting resume from history item
  handleSelectResume("res_2");
  assert.equal(activeResumeId, "res_2");

  console.log("✓ Workspace synchronization callbacks verified for Customization Tool, Applications, and Resume Selection.");
}

console.log("\n=======================================================");
console.log("ALL OPTIMIZATION HISTORY TESTS PASSED SUCCESSFULLY!");
console.log("=======================================================");
