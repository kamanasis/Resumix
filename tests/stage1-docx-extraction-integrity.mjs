import assert from "assert";
import { Document, Paragraph, TextRun, HeadingLevel, Packer } from "docx";
import JSZip from "jszip";
import { extractTextFromDocx } from "../src/lib/docxExtractor.ts";
import { validateDocxPackage, MANDATORY_DOCX_ENTRIES } from "../src/lib/docxValidator.ts";
import { validateExtraction } from "../src/lib/extractionValidator.ts";
import { 
  buildDocxDocument, 
  generateDocxBuffer, 
  DOCX_MIME_TYPE, 
  sanitizeExportFileName, 
  generatePrintableHtml 
} from "../src/lib/exportEngine.ts";
import { validateExportReadiness } from "../src/lib/exportValidator.ts";
import { evaluateFinality } from "../src/lib/tailoringEngine.ts";

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] Test ${totalTests}: ${name}`);
    console.error(`         ${err.message}\n`);
    throw err;
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
    throw err;
  }
}

async function main() {
  console.log("================================================================================");
  console.log("RESUMIX STAGE 1: DOCX EXTRACTION, TAILORING GATING & DOCX/PDF INTEGRITY SUITE");
  console.log("================================================================================\n");

  // --- PART 1: DOCX Extraction (Tests 1-3) ---
  console.log("--- PART 1: DOCX Extraction (Tests 1-3) ---");

  await runAsyncTest("1. Valid DOCX extraction succeeds and recovers paragraphs and bullet points", async () => {
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ text: "Jane Developer", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: "Senior Software Engineer with 6 years experience in TypeScript and React." }),
          new Paragraph({ text: "Technical Skills", heading: HeadingLevel.HEADING_2 }),
          new Paragraph({
            children: [new TextRun({ text: "Engineered scalable microservices using Node.js and PostgreSQL." })],
            bullet: { level: 0 }
          }),
          new Paragraph({
            children: [new TextRun({ text: "Reduced latency by 35% through Redis caching." })],
            bullet: { level: 0 }
          })
        ]
      }]
    });

    const docxBuf = await Packer.toBuffer(doc);
    const extraction = await extractTextFromDocx(docxBuf);

    assert.strictEqual(extraction.success, true);
    assert.ok(extraction.paragraphCount >= 4);
    assert.ok(extraction.text.includes("Jane Developer"));
    assert.ok(extraction.text.includes("Senior Software Engineer"));
    assert.ok(extraction.text.includes("Node.js and PostgreSQL"));
    assert.ok(extraction.text.includes("- Reduced latency by 35%"));
  });

  await runAsyncTest("2. Corrupted DOCX extraction fails closed without throwing unhandled exceptions", async () => {
    const corruptedBuffer = Buffer.from("Not a real zip or docx file at all. Just random junk text.");
    const extraction = await extractTextFromDocx(corruptedBuffer);

    assert.strictEqual(extraction.success, false);
    assert.strictEqual(extraction.text, "");
    assert.ok(extraction.error.includes("DOCX extraction failed"));
  });

  await runAsyncTest("3. DOCX missing word/document.xml fails closed with explicit error", async () => {
    const emptyZip = new JSZip();
    emptyZip.file("other_file.txt", "Some random text");
    const zipBuf = await emptyZip.generateAsync({ type: "nodebuffer" });

    const extraction = await extractTextFromDocx(zipBuf);
    assert.strictEqual(extraction.success, false);
    assert.ok(extraction.error.includes("missing word/document.xml"));
  });

  // --- PART 2: Extraction Quality & Binary Anomaly Validator (Tests 4-7) ---
  console.log("\n--- PART 2: Extraction Quality & Binary Anomaly Validator (Tests 4-7) ---");

  runTest("4. validateExtraction detects unparsed ZIP signatures and marks EXTRACTION_FAILED", () => {
    const zipHeaderGarbage = "PK\x03\x04\x14\x00\x06\x00word/document.xml[Content_Types].xml garbage stream text";
    const res = validateExtraction(zipHeaderGarbage);

    assert.strictEqual(res.status, "EXTRACTION_FAILED");
    assert.strictEqual(res.quality.isCorrupted, true);
    assert.ok(res.userMessage.includes("unreadable binary archive"));
  });

  runTest("5. validateExtraction detects OpenXML archive paths in text and marks EXTRACTION_FAILED", () => {
    const openXmlInText = "Some text with word/document.xml and [Content_Types].xml from an unparsed archive";
    const res = validateExtraction(openXmlInText);

    assert.strictEqual(res.status, "EXTRACTION_FAILED");
    assert.strictEqual(res.quality.isCorrupted, true);
  });

  runTest("6. validateExtraction detects AI unparsed binary explanation and marks EXTRACTION_FAILED", () => {
    const aiExplanation = "The source document content provided is an unparsed binary file stream (DOCX package archive) containing no extractable plain text experience, skills, or employment history.";
    const res = validateExtraction(aiExplanation);

    assert.strictEqual(res.status, "EXTRACTION_FAILED");
    assert.strictEqual(res.quality.isCorrupted, true);
  });

  runTest("7. validateExtraction succeeds on clean, genuine resume text", () => {
    const cleanResume = `
John Doe
johndoe@example.com | 555-123-4567 | San Francisco, CA

Professional Summary
Experienced full-stack engineer with 5 years building web applications and microservices.

Technical Skills
TypeScript, Node.js, React, PostgreSQL, Docker, AWS

Professional Experience
Senior Software Engineer — Cloud Corp (2021 - Present)
- Designed and implemented RESTful APIs serving 2M daily requests.
- Optimized database indexing, improving throughput by 40%.

Education
B.S. in Computer Science — State University
    `;
    const res = validateExtraction(cleanResume);

    assert.strictEqual(res.status, "EXTRACTION_SUCCESS");
    assert.strictEqual(res.quality.isCorrupted, false);
    assert.ok(res.quality.detectedSections.length >= 3);
  });

  // --- PART 3: Hard Tailoring Gate & Final Status Logic (Tests 8-10) ---
  console.log("\n--- PART 3: Hard Tailoring Gate & Final Status Logic (Tests 8-10) ---");

  runTest("8. Failed extraction blocks finality in evaluateFinality", () => {
    const mockValidation = { isValid: true, validationErrors: [] };
    const mockScores = {
      beforeAtsScore: 70,
      afterAtsScore: 85,
      atsScoreDelta: 15,
      beforeTargetMatch: 65,
      afterTargetMatch: 80,
      targetMatchDelta: 15,
      beforeCriticalGaps: 2,
      afterCriticalGaps: 0,
      beforeMatchedCount: 5,
      afterMatchedCount: 7
    };

    // When extraction status is EXTRACTION_FAILED, finality MUST be blocked
    const result = evaluateFinality(mockValidation, mockScores, "EXTRACTION_FAILED");
    assert.strictEqual(result.isFinalVersion, false);
    assert.strictEqual(result.finalityStatus, "VALIDATION_FAILED");
  });

  runTest("9. Failed validation blocks finality in evaluateFinality", () => {
    const invalidValidation = { isValid: false, validationErrors: ["Fabricated metric detected"] };
    const mockScores = {
      beforeAtsScore: 70,
      afterAtsScore: 85,
      atsScoreDelta: 15,
      beforeTargetMatch: 65,
      afterTargetMatch: 80,
      targetMatchDelta: 15,
      beforeCriticalGaps: 0,
      afterCriticalGaps: 0,
      beforeMatchedCount: 5,
      afterMatchedCount: 7
    };

    const result = evaluateFinality(invalidValidation, mockScores, "EXTRACTION_SUCCESS");
    assert.strictEqual(result.isFinalVersion, false);
    assert.strictEqual(result.finalityStatus, "VALIDATION_FAILED");
  });

  runTest("10. Successful extraction AND successful validation produces FINAL_OPTIMIZED", () => {
    const validValidation = { isValid: true, validationErrors: [] };
    const mockScores = {
      beforeAtsScore: 70,
      afterAtsScore: 85,
      atsScoreDelta: 15,
      beforeTargetMatch: 65,
      afterTargetMatch: 80,
      targetMatchDelta: 15,
      beforeCriticalGaps: 0,
      afterCriticalGaps: 0,
      beforeMatchedCount: 5,
      afterMatchedCount: 7
    };

    const result = evaluateFinality(validValidation, mockScores, "EXTRACTION_SUCCESS");
    assert.strictEqual(result.isFinalVersion, true);
    assert.strictEqual(result.finalityStatus, "FINAL_OPTIMIZED");
  });

  // --- PART 4: Export Readiness Gates (Tests 11-13) ---
  console.log("\n--- PART 4: Export Readiness Gates (Tests 11-13) ---");

  runTest("11. validateExportReadiness blocks empty or corrupt content from export", () => {
    const emptyCheck = validateExportReadiness({ tailoredContent: "", finalityStatus: "FINAL_OPTIMIZED" });
    assert.strictEqual(emptyCheck.canExport, false);
    assert.ok(emptyCheck.errors.some(e => e.includes("empty")));

    const shortCheck = validateExportReadiness({ tailoredContent: "Too short", finalityStatus: "FINAL_OPTIMIZED" });
    assert.strictEqual(shortCheck.canExport, false);
  });

  runTest("12. validateExportReadiness blocks non-final or validation-failed resumes", () => {
    const failedCheck = validateExportReadiness({
      tailoredContent: "A valid length resume text with experience and skills...",
      finalityStatus: "VALIDATION_FAILED",
      isValid: false
    });
    assert.strictEqual(failedCheck.canExport, false);
    assert.ok(failedCheck.errors.some(e => e.includes("failed")));
  });

  runTest("13. validateExportReadiness permits export for verified final resumes", () => {
    const validCheck = validateExportReadiness({
      tailoredContent: `# Jane Doe\njane@example.com | (555) 123-4567\n\n## Experience\nSoftware Engineer at TechCorp\n- Built scalable systems`,
      finalityStatus: "FINAL_OPTIMIZED",
      isValid: true
    });
    assert.strictEqual(validCheck.canExport, true);
    assert.strictEqual(validCheck.errors.length, 0);
  });

  // --- PART 5: Genuine OpenXML DOCX Generation & Package Integrity (Tests 14-17) ---
  console.log("\n--- PART 5: Genuine OpenXML DOCX Generation & Package Integrity (Tests 14-17) ---");

  await runAsyncTest("14. generateDocxBuffer produces genuine OpenXML binary with ZIP header", async () => {
    const markdown = `# Alex Developer\nalex@example.com | 555-0100\n\n## Technical Skills\nTypeScript, Node.js, React\n\n## Experience\n### Staff Engineer — ScaleUp\n- Led distributed cloud migrations`;
    const buf = await generateDocxBuffer(markdown);

    assert.ok(Buffer.isBuffer(buf));
    assert.ok(buf.length > 5000, "DOCX buffer must be non-empty OpenXML archive");
    // Verify ZIP magic number: PK\x03\x04
    assert.strictEqual(buf[0], 0x50);
    assert.strictEqual(buf[1], 0x4B);
    assert.strictEqual(buf[2], 0x03);
    assert.strictEqual(buf[3], 0x04);
  });

  await runAsyncTest("15. validateDocxPackage confirms all 4 mandatory OpenXML entries are present", async () => {
    const markdown = `# Alex Developer\n## Experience\n- Bullet 1\n- Bullet 2`;
    const buf = await generateDocxBuffer(markdown);
    const result = await validateDocxPackage(buf);

    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.missingFiles.length, 0);
    assert.strictEqual(result.hasContentTypes, true);
    assert.strictEqual(result.hasRels, true);
    assert.strictEqual(result.hasDocumentXml, true);
    assert.strictEqual(result.hasDocumentRels, true);
    assert.ok(result.fileCount >= 4);
  });

  await runAsyncTest("16. validateDocxPackage rejects corrupted or incomplete packages", async () => {
    // 1. Random non-zip buffer
    const fakeBuf = Buffer.from("<html><body>Not a docx</body></html>");
    const fakeRes = await validateDocxPackage(fakeBuf);
    assert.strictEqual(fakeRes.isValid, false);
    assert.ok(fakeRes.error.includes("magic signature"));

    // 2. Zip missing mandatory document.xml
    const incompleteZip = new JSZip();
    incompleteZip.file("[Content_Types].xml", "<xml/>");
    incompleteZip.file("_rels/.rels", "<xml/>");
    const incompleteBuf = await incompleteZip.generateAsync({ type: "nodebuffer" });

    const incRes = await validateDocxPackage(incompleteBuf);
    assert.strictEqual(incRes.isValid, false);
    assert.ok(incRes.missingFiles.includes("word/document.xml"));
    assert.ok(incRes.missingFiles.includes("word/_rels/document.xml.rels"));
  });

  runTest("17. DOCX_MIME_TYPE is standard OpenXML wordprocessingml document", () => {
    assert.strictEqual(
      DOCX_MIME_TYPE,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  });

  // --- PART 6: Server HTTP Endpoints Integration (Tests 18-21) ---
  console.log("\n--- PART 6: Server HTTP Endpoints Integration (Tests 18-21) ---");

  const BASE_URL = "http://localhost:3000";

  await runAsyncTest("18. POST /api/parse-resume rejects unparsed binary stream with HTTP 422", async () => {
    const unparsedBinary = "PK\x03\x04\x14\x00[Content_Types].xml word/document.xml unparsed binary stream content";
    const res = await fetch(`${BASE_URL}/api/parse-resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText: unparsedBinary })
    });

    assert.strictEqual(res.status, 422);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error.code, "EXTRACTION_VALIDATION_FAILED");
  });

  await runAsyncTest("19. POST /api/tailor-resume-batch rejects unparsed binary stream with HTTP 422", async () => {
    const unparsedBinary = "PK\x03\x04\x14\x00[Content_Types].xml word/document.xml unparsed binary stream content";
    const res = await fetch(`${BASE_URL}/api/tailor-resume-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resumeText: unparsedBinary,
        frozenProfile: { targetCompany: "Google", targetRole: "Engineer", structuredRequirements: [] },
        selectedItems: [{ title: "TypeScript" }]
      })
    });

    assert.strictEqual(res.status, 422);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error.code, "EXTRACTION_VALIDATION_FAILED");
  });

  await runAsyncTest("20. POST /api/export-resume-docx returns genuine binary DOCX with valid package", async () => {
    const res = await fetch(`${BASE_URL}/api/export-resume-docx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tailoredContent: `# Jane Engineer\njane@example.com | 555-0199\n\n## Experience\n### Lead Developer — Acme\n- Engineered distributed systems with 99.99% uptime`,
        parsedResume: { contactInfo: { name: "Jane Engineer" } },
        targetCompany: "Stripe",
        targetRole: "Backend Engineer"
      })
    });

    assert.strictEqual(res.status, 200);
    const contentType = res.headers.get("content-type");
    assert.ok(contentType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
    const contentDisposition = res.headers.get("content-disposition");
    assert.ok(contentDisposition.includes("attachment; filename="));
    assert.ok(contentDisposition.includes(".docx"));

    const arrayBuf = await res.arrayBuffer();
    assert.ok(arrayBuf.byteLength > 5000);

    // Validate the package directly
    const packageValidation = await validateDocxPackage(arrayBuf);
    assert.strictEqual(packageValidation.isValid, true);
    assert.strictEqual(packageValidation.hasDocumentXml, true);
  });

  await runAsyncTest("21. POST /api/export-resume-html generates clean printable HTML document", async () => {
    const res = await fetch(`${BASE_URL}/api/export-resume-html`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tailoredContent: `# Jane Engineer\n\n## Experience\n- Built web systems`,
        parsedResume: { contactInfo: { name: "Jane Engineer" } }
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.html.includes("<!DOCTYPE html>"));
    assert.ok(data.data.html.includes("@media print"));
    assert.ok(data.data.html.includes("Jane Engineer"));
  });

  console.log("\n================================================================================");
  console.log(`SUMMARY: ${passedTests} OF ${totalTests} TESTS PASSED CLEANLY (100% PASS RATE)`);
  console.log("================================================================================\n");
}

main().catch(err => {
  console.error("FATAL ERROR IN TEST SUITE:", err);
  process.exit(1);
});
