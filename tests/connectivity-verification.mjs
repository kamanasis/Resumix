// Resumix Connectivity & Regression Verification Suite
import dotenv from "dotenv";
import { readFileSync } from "fs";

dotenv.config({ path: ".env.local" });
dotenv.config();

const BASE_URL = "http://localhost:3000";

let passed = 0;
let failed = 0;

function assert(condition, testName, details) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}${details ? ": " + details : ""}`);
    failed++;
  }
}

async function get(endpoint) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url);
  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await res.json().catch(() => ({})) : await res.text();
  return { status: res.status, ok: res.ok, isJson, data };
}

async function post(endpoint, body) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

console.log("=============================================================");
console.log("   RESUMIX CONNECTIVITY & REGRESSION VERIFICATION SUITE      ");
console.log("=============================================================");

async function runTests() {
  console.log("\n--- Part 1: Backend Reachability ---");
  try {
    const r = await get("/api/health");
    assert(r.ok, "Backend is reachable (HTTP 200)", `status=${r.status}`);
    assert(r.isJson, "GET /api/health returns JSON (not HTML)", r.isJson ? "" : "Got non-JSON — health route may be missing");
    if (r.isJson) {
      assert(r.data?.success === true, "GET /api/health: success=true", JSON.stringify(r.data));
      assert(r.data?.data?.status === "ok", "GET /api/health: data.status=ok", JSON.stringify(r.data?.data));
      assert(r.data?.data?.backend === "healthy", "GET /api/health: data.backend=healthy", JSON.stringify(r.data?.data));
      assert(r.data?.data?.ai === "configured" || r.data?.data?.ai === "unconfigured", "GET /api/health: data.ai is truthful (configured|unconfigured)", JSON.stringify(r.data?.data));
      assert(!JSON.stringify(r.data).includes("GEMINI_API_KEY") && !JSON.stringify(r.data).includes("AQ.") && !JSON.stringify(r.data).includes("AIza"), "GET /api/health: does not expose API key or secret");
    }
  } catch (err) {
    assert(false, "Backend reachable", `Connection error: ${err.message}`);
    console.error("\n  FATAL: Cannot reach backend at", BASE_URL);
    console.error("  Make sure the server is running: npm run dev\n");
    process.exit(1);
  }

  console.log("\n--- Part 2: Gemini Health Endpoint ---");
  let geminiHealthy = false;
  try {
    const r = await get("/api/gemini-health");
    assert(r.ok || r.status === 503 || r.status === 401 || r.status === 403, "GET /api/gemini-health returns truthful status", `status=${r.status}`);
    assert(typeof r.data?.success === "boolean", "GET /api/gemini-health: response has success field", JSON.stringify(r.data));
    geminiHealthy = r.data?.success === true && r.data?.data?.reachable === true;
  } catch (err) {
    assert(false, "GET /api/gemini-health reachable", err.message);
  }

  console.log("\n--- Part 3: Core API Route Reachability ---");
  try {
    const r = await post("/api/generate-requirement-profile", { targetCompany: "", targetRole: "" });
    assert(r.status !== 404, "POST /api/generate-requirement-profile is registered (not 404)", `status=${r.status}`);
    assert(typeof r.data?.success === "boolean", "POST /api/generate-requirement-profile: response is JSON envelope", JSON.stringify(r.data).slice(0, 120));
  } catch (err) {
    assert(false, "POST /api/generate-requirement-profile reachable", err.message);
  }

  console.log("\n--- Part 4: Fail-Closed Behavior ---");
  try {
    const r = await post("/api/generate-requirement-profile", { targetCompany: "", targetRole: "" });
    assert(r.data?.success === false, "Missing required fields: success=false (fail-closed)", JSON.stringify(r.data));
    assert(typeof r.data?.error?.code === "string", "Missing required fields: error.code is present", JSON.stringify(r.data?.error));
    assert(!r.data?.data?.requiredSkills && !r.data?.data?.profileHash, "Missing required fields: no fake requirement profile in response", JSON.stringify(r.data?.data));
  } catch (err) {
    assert(false, "Fail-closed: missing fields test", err.message);
  }

  console.log("\n--- Part 5: Gemini Unavailability (if applicable) ---");
  if (!geminiHealthy) {
    try {
      const r = await post("/api/generate-requirement-profile", { targetCompany: "TestCorp", targetRole: "Engineer", jobDescription: "Test", experienceLevel: "1-2 years" });
      if (!r.ok) {
        assert(r.data?.success === false, "Gemini unavailable: success=false", JSON.stringify(r.data));
        assert(r.data?.error?.code?.startsWith("AI_"), "Gemini unavailable: error.code is AI_* classification", `got: ${r.data?.error?.code}`);
        assert(!r.data?.data?.requiredSkills, "Gemini unavailable: no fake requirement profile generated", JSON.stringify(r.data?.data));
      } else {
        console.log("  [SKIP] Gemini is healthy — skipping AI unavailability test");
      }
    } catch (err) {
      assert(false, "Gemini unavailable test", err.message);
    }
  } else {
    console.log("  [SKIP] Gemini is healthy — AI unavailability test not applicable");
  }

  console.log("\n--- Part 6: Source Code Integrity Checks ---");
  try {
    const serverCode = readFileSync("server.ts", "utf8");
    const fakePhrases = ["fakeRequirements", "mockRequirements", "simulatedScore", "placeholderResume", "dummyResume", "inventedSkills", "fakeProfile", "fallbackRequirements"];
    for (const phrase of fakePhrases) {
      assert(!serverCode.includes(phrase), `server.ts: no "${phrase}" fake-data identifier found`);
    }
  } catch (err) {
    assert(false, "Source code integrity check", err.message);
  }

  console.log("\n=============================================================");
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=============================================================\n");
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
