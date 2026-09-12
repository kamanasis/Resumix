import assert from 'assert';

const BASE_URL = 'http://localhost:3000';

async function testCompanyAgnosticAnalysis() {
  console.log('=== RUNNING COMPANY-AGNOSTIC & REAL-TIME CAREER INTELLIGENCE TESTS ===\n');

  // 1. Health check
  console.log('[1/4] Checking server health...');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert.strictEqual(healthRes.status, 200, 'Health endpoint must return 200');
  const healthJson = await healthRes.json();
  console.log('  Health check OK:', healthJson);

  // Test scenarios across diverse companies & roles
  const testCases = [
    {
      company: 'Google',
      role: 'Senior Software Engineer',
      jd: 'Looking for a Senior Software Engineer with strong TypeScript, React, Distributed Systems, and Kubernetes experience. Must have 5+ years building scalable cloud platforms. Preferred: Go, GraphQL.',
      resumeText: 'Senior Software Engineer with 6 years of experience building scalable systems. Expert in TypeScript, React, Node.js, and Docker. Led migration of microservices. Proficient in SQL and Git.',
      experienceLevel: '5+ years'
    },
    {
      company: 'Microsoft',
      role: 'Backend Developer',
      jd: 'Seeking Backend Developer with C#, .NET Core, Azure, and SQL Server experience. Microservices architecture and CI/CD pipelines required.',
      resumeText: 'Backend Developer skilled in C#, .NET Core, SQL Server, and REST APIs. Experience with Docker and GitHub Actions CI/CD.',
      experienceLevel: '3-5 years'
    },
    {
      company: 'Amazon',
      role: 'Data Engineer',
      jd: 'Requires Data Engineer with Python, Apache Spark, AWS (S3, Redshift, Glue), and SQL data modeling. Distributed computing experience mandatory.',
      resumeText: 'Data Engineer with experience in Python, SQL, PostgreSQL, and AWS S3. Built ETL pipelines processing millions of records.',
      experienceLevel: '3-5 years'
    },
    {
      company: 'Deloitte',
      role: 'Business Technology Analyst',
      jd: 'Deloitte is hiring a Business Technology Analyst. Requirements: Requirements Gathering, Agile/Scrum, Stakeholder Management, SQL, Tableau, and Process Flow mapping.',
      resumeText: 'Business Analyst with 3 years experience. Skilled in Agile/Scrum, JIRA, Requirements Gathering, Stakeholder Management, and SQL reporting.',
      experienceLevel: '1-2 years'
    },
    {
      company: 'Shopify',
      role: 'Frontend Developer',
      jd: 'Shopify seeks Frontend Developer with React, TypeScript, GraphQL, CSS/Tailwind, and web performance optimization experience.',
      resumeText: 'Frontend Developer with React, JavaScript, HTML, CSS, TailwindCSS, and responsive design. Familiar with REST APIs.',
      experienceLevel: '1-2 years'
    }
  ];

  console.log('\n[2/4] Testing deterministic scoring, gap classification, and anti-fabrication across companies...');

  for (const tc of testCases) {
    console.log(`\n  Testing: ${tc.role} at ${tc.company}...`);
    
    // Call requirement-profile first
    const profileRes = await fetch(`${BASE_URL}/api/generate-requirement-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetCompany: tc.company,
        targetRole: tc.role,
        jobDescription: tc.jd,
        experienceLevel: tc.experienceLevel
      })
    });
    assert.strictEqual(profileRes.status, 200, `Requirement profile for ${tc.company} must return 200`);
    const profileJson = await profileRes.json();
    assert.strictEqual(profileJson.success, true, 'Profile response success must be true');
    const profile = profileJson.data;
    assert.ok(profile.requiredSkills && profile.requiredSkills.length > 0, 'Must extract requiredSkills from JD');

    // Parse resume
    const parseRes = await fetch(`${BASE_URL}/api/parse-resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeText: tc.resumeText })
    });
    assert.strictEqual(parseRes.status, 200, 'Resume parser must return 200');
    const parseJson = await parseRes.json();
    assert.strictEqual(parseJson.success, true, 'Parse resume response success must be true');
    const parsedResume = parseJson.data;

    // Call gap-analysis endpoint
    const gapRes1 = await fetch(`${BASE_URL}/api/gap-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parsedResume,
        frozenProfile: profile,
        rawResumeText: tc.resumeText
      })
    });
    assert.strictEqual(gapRes1.status, 200, `Gap analysis for ${tc.company} must return 200`);
    const gapJson1 = await gapRes1.json();
    assert.strictEqual(gapJson1.success, true, 'Gap analysis 1 response success must be true');
    const gap1 = gapJson1.data;

    // Verify reproducibility: run same gap analysis a second time
    const gapRes2 = await fetch(`${BASE_URL}/api/gap-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parsedResume,
        frozenProfile: profile,
        rawResumeText: tc.resumeText
      })
    });
    const gapJson2 = await gapRes2.json();
    const gap2 = gapJson2.data;

    // Deterministic equality
    assert.strictEqual(gap1.atsScore, gap2.atsScore, 'ATS Score must be 100% deterministic and reproducible');
    assert.strictEqual(gap1.scores.requiredSkills, gap2.scores.requiredSkills, 'Required skills score must be reproducible');
    assert.strictEqual(gap1.missingItems.length, gap2.missingItems.length, 'Missing items count must be reproducible');

    console.log(`    ✓ ATS Score: ${gap1.atsScore}/100 (Reproducible: verified)`);
    console.log(`    ✓ Confidence: ${gap1.scoreConfidence?.level} (isJdLimited: ${gap1.scoreConfidence?.isJdLimited})`);
    console.log(`    ✓ Application Readiness: ${gap1.applicationReadiness?.status} (${gap1.applicationReadiness?.headline})`);
    console.log(`    ✓ Highest-Impact Actions: ${gap1.highestImpactActions?.length || 0} items`);
    console.log(`    ✓ Resume Quality Audit: ${gap1.resumeQualityAudit?.parsingConfidence}% parsing confidence`);

    // Verify 4-tier gap classification and anti-fabrication
    assert.ok(gap1.highestImpactActions && gap1.highestImpactActions.length >= 1, 'Should generate ranked high-impact actions');
    assert.ok(gap1.scoreBreakdownDetails, 'Score breakdown details must be present');
    assert.ok(gap1.resumeQualityAudit && gap1.resumeQualityAudit.checks.length >= 3, 'Quality audit checks must be present');

    for (const item of gap1.missingItems) {
      assert.ok(['VERIFIED', 'PRESENT_BUT_WEAK', 'MISSING_ADDABLE', 'TRUE_GAP'].includes(item.gapClassification),
        `Item "${item.title}" must have valid gapClassification: ${item.gapClassification}`);
      assert.ok(['CRITICAL', 'HIGH_IMPACT', 'MEDIUM_IMPACT', 'LOW_IMPACT'].includes(item.priorityTier),
        `Item "${item.title}" must have valid priorityTier: ${item.priorityTier}`);

      // Anti-fabrication check
      if (item.gapClassification === 'TRUE_GAP') {
        assert.ok(
          item.recommendedAction?.toLowerCase().includes('do not add') ||
          item.recommendedAction?.toLowerCase().includes('not currently supported') ||
          item.recommendedAction?.toLowerCase().includes('genuine') ||
          item.recommendedAction?.toLowerCase().includes('truth'),
          `True gap item "${item.title}" must have strict anti-fabrication recommendation`
        );
      }
    }
    console.log(`    ✓ Anti-fabrication enforcement and gap classifications verified for all ${gap1.missingItems.length} items`);
  }

  // 3. Transparent Limited JD Confidence test
  console.log('\n[3/4] Testing transparent confidence disclosure when JD is limited...');
  const sparseProfileRes = await fetch(`${BASE_URL}/api/generate-requirement-profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetCompany: 'Acme Corp',
      targetRole: 'Software Developer',
      jobDescription: 'Software developer needed.', // Very sparse JD
      experienceLevel: '1-2 years'
    })
  });
  const sparseProfileJson = await sparseProfileRes.json();
  const sparseProfile = sparseProfileJson.data;
  const sparseGapRes = await fetch(`${BASE_URL}/api/gap-analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parsedResume: {
        skills: ['JavaScript', 'HTML'],
        projects: [],
        experience: [],
        achievements: [],
        education: [],
        certifications: [],
        languages: [],
        tools: [],
        frameworks: [],
        softSkills: [],
        atsKeywords: [],
        summary: 'Developer',
        responsibilities: [],
        quantifiedMetrics: []
      },
      frozenProfile: sparseProfile,
      rawResumeText: 'Developer skilled in JavaScript and HTML.'
    })
  });
  const sparseGapJson = await sparseGapRes.json();
  const sparseGap = sparseGapJson.data;
  assert.strictEqual(sparseGap.scoreConfidence?.isJdLimited, true, 'isJdLimited must be true for sparse JD');
  assert.strictEqual(sparseGap.scoreConfidence?.level, 'MEDIUM_CONFIDENCE', 'Score confidence should be reduced for sparse JD');
  console.log('  ✓ Transparent disclosure correctly flags limited JD and adjusts confidence level.');

  // 4. Single-fix 7-part coaching panel test
  console.log('\n[4/4] Testing /api/tailor-gap 7-part mini coaching panel...');
  const tailorRes = await fetch(`${BASE_URL}/api/tailor-gap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resumeId: 'res_test',
      resumeText: 'Software Engineer with 4 years experience. Experienced with Docker, Linux, CI/CD pipelines, and microservices.',
      profileHash: 'hash_google_platform',
      requirementId: 'req_k8s',
      frozenProfile: {
        profileHash: 'hash_google_platform',
        targetRole: 'Platform Engineer',
        targetCompany: 'Google',
        jobDescription: 'Seeking Platform Engineer experienced with Kubernetes, Docker, and cloud infrastructure.'
      },
      missingItem: {
        id: 'req_k8s',
        title: 'Kubernetes',
        type: 'Skill',
        importance: 'REQUIRED',
        category: 'DevOps',
        reason: 'Required for container orchestration and cluster deployments.',
        evidenceFound: 'Docker containerization',
        gapClassification: 'MISSING_ADDABLE',
        priorityTier: 'HIGH_IMPACT'
      }
    })
  });

  assert.strictEqual(tailorRes.status, 200, 'Tailor gap must return 200');
  const coachingJson = await tailorRes.json();
  assert.strictEqual(coachingJson.success, true, 'Coaching response success must be true');
  const coaching = coachingJson.data;
  console.log('  Coaching response received:');
  console.log('    1. Why it matters:', coaching.whyItMatters?.slice(0, 70) + '...');
  console.log('    2. What Resumix found:', coaching.whatResumixFound?.slice(0, 70) + '...');
  console.log('    3. What you can safely change:', coaching.whatYouCanSafelyChange?.slice(0, 70) + '...');
  console.log('    4. What you should NOT change:', coaching.whatYouShouldNotChange?.slice(0, 70) + '...');
  console.log('    5. Example of a better version:', coaching.exampleBetterVersion?.slice(0, 70) + '...');
  console.log('    6. Expected impact:', coaching.expectedImpact?.slice(0, 70) + '...');
  console.log('    7. Evidence needed:', coaching.evidenceNeeded?.slice(0, 70) + '...');

  // Assert all 7 parts are populated
  assert.ok(coaching.whyItMatters && coaching.whyItMatters.length > 10, 'whyItMatters must be populated');
  assert.ok(coaching.whatResumixFound && coaching.whatResumixFound.length > 5, 'whatResumixFound must be populated');
  assert.ok(coaching.whatYouCanSafelyChange && coaching.whatYouCanSafelyChange.length > 10, 'whatYouCanSafelyChange must be populated');
  assert.ok(coaching.whatYouShouldNotChange && coaching.whatYouShouldNotChange.length > 10, 'whatYouShouldNotChange must be populated');
  assert.ok(coaching.exampleBetterVersion && coaching.exampleBetterVersion.length > 10, 'exampleBetterVersion must be populated');
  assert.ok(coaching.expectedImpact && coaching.expectedImpact.length > 5, 'expectedImpact must be populated');
  assert.ok(coaching.evidenceNeeded && coaching.evidenceNeeded.length > 5, 'evidenceNeeded must be populated');
  
  // Anti-fabrication check in coaching
  assert.ok(
    coaching.whatYouShouldNotChange.toLowerCase().includes('not') ||
    coaching.whatYouShouldNotChange.toLowerCase().includes('fabricat') ||
    coaching.whatYouShouldNotChange.toLowerCase().includes('never') ||
    coaching.whatYouShouldNotChange.toLowerCase().includes('do not'),
    'Coaching whatYouShouldNotChange must emphasize anti-fabrication safety'
  );
  console.log('  ✓ 7-part coaching panel fully validated with anti-fabrication safety rules.');

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===\n');
}

testCompanyAgnosticAnalysis().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
