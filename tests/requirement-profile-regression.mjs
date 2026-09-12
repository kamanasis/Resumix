import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

process.env.SKIP_SERVER_LISTEN = "true";
import app from "../server.ts";
import http from "http";

const TEST_PORT = 3045;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let passed = 0;
let failed = 0;

function assert(condition, name, details = "") {
  if (condition) {
    console.log(`  [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${name}: ${details}`);
    failed++;
  }
}

async function post(endpoint, body) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  let parseError = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    parseError = e;
  }
  return { status: res.status, ok: res.ok, contentType: res.headers.get("content-type"), text, data: json, parseError };
}

async function get(endpoint) {
  const res = await fetch(`${BASE_URL}${endpoint}`);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, ok: res.ok, contentType: res.headers.get("content-type"), data: json };
}

console.log("================================================================================");
console.log("RESUMIX REQUIREMENT PROFILE PIPELINE REGRESSION & ROOT-CAUSE VERIFICATION SUITE");
console.log("================================================================================");

const server = http.createServer(app);
await new Promise((resolve) => server.listen(TEST_PORT, "127.0.0.1", resolve));
console.log(`Test server active on ${BASE_URL}\n`);

try {
  // 1. Health check
  console.log("--- TEST GROUP 1: Liveness & Health Check ---");
  const health = await get("/api/health");
  assert(health.ok && health.data?.data?.backend === "healthy", "Health endpoint returns healthy backend JSON");

  // 2. Unhandled API route returns JSON (not HTML)
  console.log("\n--- TEST GROUP 2: API 404 Guard Contract ---");
  const notFound = await get("/api/nonexistent-endpoint-test");
  assert(notFound.status === 404, "Unknown API route returns 404");
  assert(notFound.data?.success === false && notFound.data?.code === "NOT_FOUND", "Unknown API route returns structured JSON error, not HTML");

  // 3. Validation failures (400) - Missing Company
  console.log("\n--- TEST GROUP 3: Request Contract Validation Failures ---");
  const noCompany = await post("/api/generate-requirement-profile", {
    targetCompany: "",
    targetRole: "Software Engineer"
  });
  assert(noCompany.status === 400, "Missing targetCompany returns HTTP 400", `status=${noCompany.status}`);
  assert(noCompany.data?.success === false, "Missing targetCompany returns success: false");
  assert(noCompany.data?.code === "INVALID_REQUEST", "Missing targetCompany returns code: INVALID_REQUEST");
  assert(noCompany.parseError === null, "Missing targetCompany response is valid JSON");

  // 4. Missing Role
  const noRole = await post("/api/generate-requirement-profile", {
    targetCompany: "Shopify",
    targetRole: ""
  });
  assert(noRole.status === 400, "Missing targetRole returns HTTP 400", `status=${noRole.status}`);
  assert(noRole.data?.code === "INVALID_REQUEST", "Missing targetRole returns code: INVALID_REQUEST");

  // 5. Missing Body entirely
  const emptyBody = await post("/api/generate-requirement-profile", {});
  assert(emptyBody.status === 400, "Empty payload returns HTTP 400", `status=${emptyBody.status}`);
  assert(emptyBody.data?.code === "INVALID_REQUEST", "Empty payload returns code: INVALID_REQUEST");

  // 6. Missing resume check
  console.log("\n--- TEST GROUP 4: Resume Quality Gates ---");
  const missingResume = await post("/api/generate-requirement-profile", {
    targetCompany: "Shopify",
    targetRole: "Backend Engineer",
    resume: null
  });
  assert(missingResume.status === 400, "Null resume reference returns HTTP 400", `status=${missingResume.status}`);
  assert(missingResume.data?.code === "MISSING_RESUME", "Null resume returns code: MISSING_RESUME");

  // 7. Invalid resumeId check
  const invalidResumeId = await post("/api/generate-requirement-profile", {
    targetCompany: "Shopify",
    targetRole: "Backend Engineer",
    resumeId: "invalid-id"
  });
  assert(invalidResumeId.status === 400, "Invalid resumeId returns HTTP 400", `status=${invalidResumeId.status}`);
  assert(invalidResumeId.data?.code === "INVALID_RESUME_ID", "Invalid resumeId returns code: INVALID_RESUME_ID");

  // 8. Invalid resumeText check
  const invalidResumeText = await post("/api/generate-requirement-profile", {
    targetCompany: "Shopify",
    targetRole: "Backend Engineer",
    resumeText: "abc"
  });
  assert(invalidResumeText.status === 400, "Too-short resumeText returns HTTP 400", `status=${invalidResumeText.status}`);
  assert(invalidResumeText.data?.code === "INVALID_RESUME_TEXT", "Too-short resumeText returns code: INVALID_RESUME_TEXT");

  // 9. Contract Property Flexibility (company vs targetCompany, role vs targetRole)
  console.log("\n--- TEST GROUP 5: Live Pipeline - Generic Company (Shopify) & Alias Support ---");
  const aliasRes = await post("/api/generate-requirement-profile", {
    company: "Shopify",
    role: "Backend Engineer",
    description: "Seeking a Ruby and Go engineer with experience in distributed databases, Kafka, and GraphQL.",
    experience: "Senior"
  });
  assert(aliasRes.status === 200, "Property aliases (company, role, description, experience) succeed with HTTP 200", `status=${aliasRes.status}, data=${JSON.stringify(aliasRes.data)}`);
  assert(aliasRes.data?.success === true, "Alias request returns success: true");
  assert(typeof aliasRes.data?.data?.profileHash === "string" && aliasRes.data?.data?.profileHash.length > 0, "Deterministic profileHash generated");
  assert(Array.isArray(aliasRes.data?.data?.structuredRequirements) && aliasRes.data?.data?.structuredRequirements.length > 0, "Structured requirements extracted and populated");

  // 10. Live Pipeline - Different Company (Deloitte) and Role (Data Analyst)
  console.log("\n--- TEST GROUP 6: Live Pipeline - Second Generic Company (Deloitte) ---");
  const deloitteRes = await post("/api/generate-requirement-profile", {
    targetCompany: "Deloitte",
    targetRole: "Data Analyst",
    jobDescription: "Requirements: SQL, Tableau, Power BI, Python for data analysis, Excel, statistical modeling.",
    experienceLevel: "2-4 years"
  });
  assert(deloitteRes.status === 200, "Deloitte Data Analyst succeeds with HTTP 200", `status=${deloitteRes.status}`);
  assert(deloitteRes.data?.success === true, "Deloitte returns success: true");
  assert(Array.isArray(deloitteRes.data?.data?.requiredSkills), "Deloitte requiredSkills is array");

  // 11. Server Resiliency: Server remains active and responsive after failures
  console.log("\n--- TEST GROUP 7: Server Resiliency After Fault Injections ---");
  const postFailLiveness = await get("/api/health");
  assert(postFailLiveness.ok && postFailLiveness.data?.data?.backend === "healthy", "Server remains healthy after deliberate fault injections");

  // 12. Standard Error Envelope Structure
  console.log("\n--- TEST GROUP 8: JSON Contract Integrity ---");
  assert(noCompany.data?.code && noCompany.data?.error?.code && noCompany.data?.message, "Error response provides dual top-level and nested error code/message for client compatibility");

} catch (err) {
  console.error("Suite unexpected error:", err);
  failed++;
} finally {
  server.close();
}

console.log("\n================================================================================");
console.log(`REGRESSION RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("================================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
