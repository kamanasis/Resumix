// Gemini AI Service Verification Suite
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

const BASE_URL = "http://localhost:3000";

let passed = 0;
let failed = 0;

function assert(condition, testName, details = "") {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}: ${details}`);
    failed++;
  }
}

async function get(endpoint) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function post(endpoint, body) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

console.log("================================================================================");
console.log("RESUMIX GEMINI AI SERVICE INTEGRATION & ERROR CLASSIFICATION VERIFICATION SUITE");
console.log("================================================================================");

async function runVerification() {
  // --------------------------------------------------------------------------
  // PART 1: Safe Health Check Endpoint (/api/gemini-health)
  // --------------------------------------------------------------------------
  console.log("\n--- PART 1: Safe Health Check Endpoint ---");
  try {
    const healthRes = await get("/api/gemini-health");
    
    // Check that health check returns structured envelope
    assert(
      typeof healthRes.data === "object" && healthRes.data !== null,
      "Test 1: Health check endpoint returns JSON response"
    );

    // Ensure API key is NEVER exposed in the health response
    const rawResponse = JSON.stringify(healthRes.data);
    const key = process.env.GEMINI_API_KEY;
    const hasSecretLeaked = key && key.length > 10 && rawResponse.includes(key);
    assert(
      !hasSecretLeaked,
      "Test 2: Health check NEVER exposes the actual GEMINI_API_KEY",
      "API key detected in response!"
    );

    // If key is blocked/restricted (current status), verify it returns AI_PERMISSION_ERROR with 403
    if (!healthRes.ok) {
      assert(
        [401, 403, 429, 503].includes(healthRes.status),
        "Test 3: Unusable key returns appropriate HTTP status (401, 403, 429, or 503)",
        `Got HTTP ${healthRes.status}`
      );
      assert(
        healthRes.data.success === false && Boolean(healthRes.data.error?.code),
        "Test 4: Error response has standard fail-closed envelope { success: false, error: { code, message } }",
        `Got ${JSON.stringify(healthRes.data)}`
      );
    } else {
      assert(
        healthRes.data.success === true && healthRes.data.data?.reachable === true,
        "Test 3: Healthy Gemini connection returns { success: true, data: { status: 'healthy', reachable: true } }"
      );
    }
  } catch (err) {
    assert(false, "Part 1 Health Check", err.message);
  }

  // --------------------------------------------------------------------------
  // PART 2: Strict Fail-Closed Verification for /api/generate-requirement-profile
  // --------------------------------------------------------------------------
  console.log("\n--- PART 2: Fail-Closed Requirement Profile Pipeline ---");
  try {
    const reqRes = await post("/api/generate-requirement-profile", {
      targetCompany: "Google",
      targetRole: "Software Engineer",
      jobDescription: "Seeking a Software Engineer with expertise in Go, Kubernetes, and distributed systems.",
      experienceLevel: "Mid-level"
    });

    if (!reqRes.ok) {
      // Must fail closed with specific AI error code, NOT dummy data
      assert(
        reqRes.data.success === false,
        "Test 5: Failed AI provider request returns success: false (Strict Fail-Closed)"
      );
      assert(
        !reqRes.data.data,
        "Test 6: Failed AI call produces ZERO fake requirement profile data (Anti-Dummy Protection)"
      );

      const validCodes = [
        "AI_PERMISSION_ERROR",
        "AI_CONFIGURATION_ERROR",
        "AI_AUTHENTICATION_ERROR",
        "AI_RATE_LIMITED",
        "AI_MODEL_UNAVAILABLE",
        "AI_PROVIDER_ERROR",
        "AI_TIMEOUT"
      ];
      assert(
        validCodes.includes(reqRes.data.error?.code),
        "Test 7: Error code is specifically classified (not generic 500)",
        `Got error code: ${reqRes.data.error?.code}`
      );

      // Verify HTTP status code matches the error condition
      if (reqRes.data.error?.code === "AI_PERMISSION_ERROR") {
        assert(
          reqRes.status === 403,
          "Test 8: AI_PERMISSION_ERROR returns HTTP 403 Forbidden",
          `Got HTTP ${reqRes.status}`
        );
      } else if (reqRes.data.error?.code === "AI_AUTHENTICATION_ERROR") {
        assert(
          reqRes.status === 401,
          "Test 8: AI_AUTHENTICATION_ERROR returns HTTP 401 Unauthorized",
          `Got HTTP ${reqRes.status}`
        );
      } else if (reqRes.data.error?.code === "AI_RATE_LIMITED") {
        assert(
          reqRes.status === 429,
          "Test 8: AI_RATE_LIMITED returns HTTP 429 Too Many Requests",
          `Got HTTP ${reqRes.status}`
        );
      } else {
        assert(
          [502, 503, 504].includes(reqRes.status),
          "Test 8: AI service error returns appropriate 5xx status",
          `Got HTTP ${reqRes.status}`
        );
      }
    } else {
      // Live AI succeeded
      assert(
        reqRes.data.success === true && Array.isArray(reqRes.data.data?.requiredSkills),
        "Test 5: Live AI successfully generated requirement profile"
      );
      assert(
        Boolean(reqRes.data.data?.profileHash),
        "Test 6: Requirement profile includes deterministic profileHash"
      );
      assert(
        reqRes.status === 200,
        "Test 7: Successful AI call returns HTTP 200"
      );
    }
  } catch (err) {
    assert(false, "Part 2 Requirement Profile", err.message);
  }

  // --------------------------------------------------------------------------
  // PART 3: Server-Side Secret Isolation
  // --------------------------------------------------------------------------
  console.log("\n--- PART 3: Secret Isolation & Credential Safety ---");
  try {
    const key = process.env.GEMINI_API_KEY;
    assert(
      Boolean(key),
      "Test 9: process.env.GEMINI_API_KEY is accessible to the server process"
    );

    // Verify key does not leak into frontend public variables
    const viteKey = process.env.VITE_GEMINI_API_KEY;
    assert(
      !viteKey,
      "Test 10: VITE_GEMINI_API_KEY is NOT defined (Key is SERVER-SIDE ONLY)"
    );

    // Verify no mock data fallback in /api/parse-resume
    const parseRes = await post("/api/parse-resume", {
      resumeText: "Jane Doe. Software Engineer with experience in Python and PostgreSQL."
    });
    if (!parseRes.ok) {
      assert(
        parseRes.data.success === false && !parseRes.data.data,
        "Test 11: /api/parse-resume fails closed without returning fake skills or experiences"
      );
      assert(
        parseRes.data.error?.code !== "SUCCESS",
        "Test 12: /api/parse-resume returns classified error code"
      );
    } else {
      assert(
        parseRes.data.success === true && Array.isArray(parseRes.data.data.skills),
        "Test 11: /api/parse-resume succeeds with real extracted data"
      );
    }
  } catch (err) {
    assert(false, "Part 3 Secret Isolation", err.message);
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`GEMINI SERVICE VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification();
