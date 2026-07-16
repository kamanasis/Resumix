async function run() {
  try {
    const res = await fetch("http://localhost:3000/api/generate-requirement-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetCompany: "Google",
        targetRole: "Frontend Developer",
        experienceLevel: "1-2 years"
      })
    });
    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Fetch error:", err);
  }
}
run();
