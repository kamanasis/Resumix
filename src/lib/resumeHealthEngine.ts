import { ParsedResume, ContactInfo } from "../types";
import { extractNumericMetrics } from "./tailoringValidator";

export interface HealthCategoryScore {
  id: string;
  name: string;
  score: number; // 0 - 100
  weight: number;
  status: "EXCELLENT" | "GOOD" | "NEEDS_IMPROVEMENT" | "CRITICAL";
  summary: string;
  findingsCount: number;
}

export interface HealthFinding {
  id: string;
  categoryId: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  whyItMatters: string;
  whatResumixCanSafelyImprove: string;
  whatResumixCannotInvent: string;
  evidenceFound?: string;
  section?: string;
}

export interface ResumeHealthReport {
  overallScore: number; // 0 - 100
  rating: "Exceptional" | "Competitive" | "Fair" | "Needs Attention";
  categories: HealthCategoryScore[];
  findings: HealthFinding[];
  summary: {
    totalFindings: number;
    highPriorityCount: number;
    mediumPriorityCount: number;
    lowPriorityCount: number;
    quantifiedBulletsCount: number;
    actionVerbsCount: number;
    totalBulletsCount: number;
    estimatedWordCount: number;
  };
}

const STRONG_ACTION_VERBS = new Set([
  "engineered", "architected", "spearheaded", "developed", "built", "implemented",
  "designed", "optimized", "accelerated", "deployed", "orchestrated", "refactored",
  "automated", "streamlined", "scaled", "delivered", "executed", "collaborated",
  "mentored", "initiated", "established", "analyzed", "reduced", "increased",
  "generated", "resolved", "maintained", "integrated", "managed", "led"
]);

/**
 * Helper to parse raw text into structural ParsedResume when a raw string is provided.
 */
export function parseRawResumeText(text: string): ParsedResume {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const contactInfo: ContactInfo = {};

  // Extract email
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) contactInfo.email = emailMatch[0];

  // Extract phone
  const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) contactInfo.phone = phoneMatch[0];

  // Extract linkedin / github
  const linkedinMatch = text.match(/linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);
  if (linkedinMatch) contactInfo.linkedin = linkedinMatch[0];
  const githubMatch = text.match(/github\.com\/[a-zA-Z0-9_-]+/i);
  if (githubMatch) contactInfo.github = githubMatch[0];

  // Name is typically first line if not an email or header
  if (lines.length > 0 && !lines[0].includes("@") && lines[0].length < 50) {
    contactInfo.name = lines[0];
  }

  const experience: any[] = [];
  const education: any[] = [];
  const skills: string[] = [];
  let summary = "";

  let currentSection = "";
  let currentBullets: string[] = [];
  let currentRole: any = null;

  for (const line of lines) {
    const clean = line.replace(/[:#]/g, "").trim().toUpperCase();
    if (clean === "EXPERIENCE" || clean === "WORK EXPERIENCE" || clean === "EMPLOYMENT") {
      currentSection = "EXPERIENCE";
      continue;
    } else if (clean === "EDUCATION" || clean === "ACADEMIC BACKGROUND") {
      currentSection = "EDUCATION";
      continue;
    } else if (clean === "SKILLS" || clean === "TECHNICAL SKILLS") {
      currentSection = "SKILLS";
      continue;
    } else if (clean === "SUMMARY" || clean === "PROFESSIONAL SUMMARY" || clean === "OBJECTIVE") {
      currentSection = "SUMMARY";
      continue;
    } else if (clean === "PROJECTS" || clean === "PERSONAL PROJECTS") {
      currentSection = "PROJECTS";
      continue;
    }

    if (currentSection === "SUMMARY") {
      summary += (summary ? " " : "") + line;
    } else if (currentSection === "SKILLS") {
      const parts = line.split(/[,|•]/).map(s => s.trim()).filter(s => s.length > 1 && !s.toLowerCase().includes("skills:"));
      skills.push(...parts);
    } else if (currentSection === "EXPERIENCE") {
      if (line.startsWith("-") || line.startsWith("•") || line.startsWith("*")) {
        const bullet = line.replace(/^[-•*]\s*/, "").trim();
        if (currentRole) {
          currentRole.bullets = currentRole.bullets || [];
          currentRole.bullets.push(bullet);
        } else {
          currentBullets.push(bullet);
        }
      } else {
        currentRole = {
          title: line,
          company: line,
          bullets: []
        };
        experience.push(currentRole);
      }
    } else if (currentSection === "EDUCATION") {
      education.push({ degree: line, school: line });
    }
  }

  if (experience.length === 0 && currentBullets.length > 0) {
    experience.push({ title: "Software Engineer", company: "Company", bullets: currentBullets });
  }

  return {
    contactInfo,
    summary,
    skills,
    experience,
    education,
    projects: []
  } as unknown as ParsedResume;
}

/**
 * Deterministically evaluates the health of a candidate resume
 * based on actual parsed structural evidence.
 */
export function evaluateResumeHealth(
  parsedOrText: ParsedResume | string,
  rawTextOrJob: string = ""
): ResumeHealthReport {
  const findings: HealthFinding[] = [];

  let parsed: ParsedResume;
  let rawText = "";

  if (typeof parsedOrText === "string") {
    rawText = parsedOrText;
    parsed = parseRawResumeText(parsedOrText);
  } else {
    parsed = (parsedOrText || { skills: [], experience: [], education: [] }) as ParsedResume;
    rawText = rawTextOrJob || "";
  }

  // Extract bullets from experience and projects
  const experienceBullets: string[] = [];
  if (Array.isArray(parsed.experience)) {
    for (const exp of parsed.experience) {
      if (Array.isArray(exp.bullets) && exp.bullets.length > 0) {
        experienceBullets.push(...exp.bullets);
      } else if (exp.description) {
        const split = exp.description
          .split(/(?:\r?\n|•|\*\s+|\d+\.\s+)/)
          .map(b => b.trim())
          .filter(b => b.length > 10);
        experienceBullets.push(...(split.length > 0 ? split : [exp.description.trim()]));
      }
    }
  }

  const projectBullets: string[] = [];
  if (Array.isArray(parsed.projects)) {
    for (const proj of parsed.projects) {
      if (proj.description) {
        const split = proj.description
          .split(/(?:\r?\n|•|\*\s+|\d+\.\s+)/)
          .map(b => b.trim())
          .filter(b => b.length > 10);
        projectBullets.push(...(split.length > 0 ? split : [proj.description.trim()]));
      }
    }
  }

  const allBullets = [...experienceBullets, ...projectBullets];
  const totalBulletsCount = allBullets.length;

  // 1. Quantified Metrics Count
  let quantifiedBulletsCount = 0;
  for (const b of allBullets) {
    const metrics = extractNumericMetrics(b);
    if (metrics.length > 0) {
      quantifiedBulletsCount++;
    }
  }

  // 2. Action Verbs Count
  let actionVerbsCount = 0;
  for (const b of allBullets) {
    const firstWord = b.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "");
    if (firstWord && STRONG_ACTION_VERBS.has(firstWord)) {
      actionVerbsCount++;
    }
  }

  // Word count
  const estimatedWordCount = rawText
    ? rawText.trim().split(/\s+/).filter(Boolean).length
    : (allBullets.join(" ") + " " + (parsed.summary || "")).split(/\s+/).filter(Boolean).length;

  // -------------------------------------------------------------
  // DIMENSION 1: ATS Compatibility (Weight: 20%)
  // -------------------------------------------------------------
  let atsScore = 100;
  const contact = parsed.contactInfo || {};

  if (!contact.email) {
    atsScore -= 30;
    findings.push({
      id: "ats-missing-email",
      categoryId: "ats-compatibility",
      priority: "HIGH",
      title: "Missing Email Address in Header",
      whyItMatters: "Applicant tracking systems automatically create candidate records using email as the primary key.",
      whatResumixCanSafelyImprove: "Resumix will prompt for your email address and place it in the standardized header layout.",
      whatResumixCannotInvent: "Resumix will never fabricate an email address.",
      section: "Header"
    });
  }

  if (!contact.phone) {
    atsScore -= 20;
    findings.push({
      id: "ats-missing-phone",
      categoryId: "ats-compatibility",
      priority: "MEDIUM",
      title: "Missing Phone Number in Header",
      whyItMatters: "Recruiters and ATS parsing engines extract phone numbers for interview scheduling and SMS reminders.",
      whatResumixCanSafelyImprove: "Resumix formats verified phone numbers with international and regional standard delimiters.",
      whatResumixCannotInvent: "Resumix will never invent contact numbers.",
      section: "Header"
    });
  }

  if (!parsed.experience || parsed.experience.length === 0) {
    atsScore -= 25;
    findings.push({
      id: "ats-missing-experience",
      categoryId: "ats-compatibility",
      priority: "HIGH",
      title: "No Structured Experience Section Found",
      whyItMatters: "ATS filters evaluate minimum years of experience and past employment duration directly from structured company roles.",
      whatResumixCanSafelyImprove: "Resumix organizes roles, dates, and employers into canonical ATS-parsable blocks.",
      whatResumixCannotInvent: "Resumix will never invent employers or job titles.",
      section: "Experience"
    });
  }

  if (!parsed.education || parsed.education.length === 0) {
    atsScore -= 15;
    findings.push({
      id: "ats-missing-education",
      categoryId: "ats-compatibility",
      priority: "MEDIUM",
      title: "Missing Education Section",
      whyItMatters: "Many automated job filters screen for degree credentials or relevant fields of study.",
      whatResumixCanSafelyImprove: "Resumix formats institution names, graduation dates, and degree titles cleanly.",
      whatResumixCannotInvent: "Resumix will never fabricate universities or degrees.",
      section: "Education"
    });
  }
  atsScore = Math.max(20, Math.min(100, atsScore));

  // -------------------------------------------------------------
  // DIMENSION 2: Content Quality & Verbs (Weight: 15%)
  // -------------------------------------------------------------
  let contentQualityScore = 100;
  const actionVerbRatio = totalBulletsCount > 0 ? actionVerbsCount / totalBulletsCount : 0;

  if (actionVerbRatio < 0.4 && totalBulletsCount > 0) {
    contentQualityScore -= 30;
    findings.push({
      id: "content-weak-action-verbs",
      categoryId: "content-quality",
      priority: "HIGH",
      title: "Low Action Verb Density in Bullets",
      whyItMatters: "Bullets starting with passive descriptions (e.g., 'Responsible for', 'Worked on') score significantly lower with recruiters than active accomplishment verbs (e.g., 'Engineered', 'Optimized', 'Delivered').",
      whatResumixCanSafelyImprove: "Resumix transforms passive statements into strong, active accomplishment statements while preserving your exact factual contributions.",
      whatResumixCannotInvent: "Resumix will not alter the scope of your work or claim actions you did not perform.",
      section: "Experience"
    });
  } else if (actionVerbRatio < 0.7 && totalBulletsCount > 0) {
    contentQualityScore -= 15;
    findings.push({
      id: "content-moderate-action-verbs",
      categoryId: "content-quality",
      priority: "LOW",
      title: "Some Bullets Lack Strong Leading Verbs",
      whyItMatters: "Consistent action verbs throughout every bullet maintain recruiter momentum during rapid skimming.",
      whatResumixCanSafelyImprove: "Resumix unifies bullet structures to lead with high-impact technical action verbs.",
      whatResumixCannotInvent: "Resumix will never change the core nature of the responsibilities described.",
      section: "Experience"
    });
  }

  if (!parsed.summary || parsed.summary.trim().length < 40) {
    contentQualityScore -= 20;
    findings.push({
      id: "content-missing-summary",
      categoryId: "content-quality",
      priority: "MEDIUM",
      title: "Missing Professional Summary",
      whyItMatters: "A targeted 2-3 sentence executive summary anchors the candidate's career narrative and immediately highlights core capabilities to recruiters.",
      whatResumixCanSafelyImprove: "Resumix synthesizes a verified summary directly highlighting your verified skills and target role alignment.",
      whatResumixCannotInvent: "Resumix will not include target keywords that are not verified in your source resume.",
      section: "Summary"
    });
  }
  contentQualityScore = Math.max(25, Math.min(100, contentQualityScore));

  // -------------------------------------------------------------
  // DIMENSION 3: Structure & Completeness (Weight: 15%)
  // -------------------------------------------------------------
  let structureScore = 100;
  if (!contact.linkedin && !contact.github && !contact.website) {
    structureScore -= 15;
    findings.push({
      id: "structure-missing-links",
      categoryId: "structure",
      priority: "LOW",
      title: "No Professional Profile Links (LinkedIn / GitHub)",
      whyItMatters: "Recruiters frequently verify candidate projects, code repositories, and professional networks via direct links in the header.",
      whatResumixCanSafelyImprove: "Resumix renders clean, clickable link badges in the resume header.",
      whatResumixCannotInvent: "Resumix will not invent URLs or social media profiles.",
      section: "Header"
    });
  }

  if (Array.isArray(parsed.experience)) {
    const missingDatesCount = parsed.experience.filter(e => !e.duration || e.duration.trim() === "").length;
    if (missingDatesCount > 0) {
      structureScore -= 25;
      findings.push({
        id: "structure-missing-dates",
        categoryId: "structure",
        priority: "HIGH",
        title: "Work Experience Entries Missing Dates / Timeline",
        whyItMatters: "Chronological integrity is mandatory for ATS tenure calculations. Missing employment dates can cause parsing disqualification.",
        whatResumixCanSafelyImprove: "Resumix aligns employment date ranges cleanly on the right margin.",
        whatResumixCannotInvent: "Resumix will never invent employment dates or tenure.",
        section: "Experience"
      });
    }
  }
  structureScore = Math.max(30, Math.min(100, structureScore));

  // -------------------------------------------------------------
  // DIMENSION 4: Keyword Alignment & Skills (Weight: 20%)
  // -------------------------------------------------------------
  let keywordScore = 100;
  const totalSkillsCount = (parsed.skills || []).length + (parsed.tools || []).length + (parsed.frameworks || []).length;

  if (totalSkillsCount < 5) {
    keywordScore -= 45;
    findings.push({
      id: "skills-very-low",
      categoryId: "keyword-alignment",
      priority: "HIGH",
      title: "Critically Low Technical Skill Count",
      whyItMatters: "ATS search algorithms rely heavily on indexed technical keywords to match candidates against job requisition filters.",
      whatResumixCanSafelyImprove: "Resumix surfaces verified technologies from your work history and categorizes them into Languages, Frameworks, and Tools.",
      whatResumixCannotInvent: "Resumix will strictly NEVER add required skills that you have not demonstrated or approved.",
      section: "Skills"
    });
  } else if (totalSkillsCount < 10) {
    keywordScore -= 20;
    findings.push({
      id: "skills-uncategorized",
      categoryId: "keyword-alignment",
      priority: "MEDIUM",
      title: "Technical Skills Should Be Categorized",
      whyItMatters: "Categorized skills (Languages, Frameworks, Developer Tools) enable recruiters to evaluate core competencies in under 5 seconds.",
      whatResumixCanSafelyImprove: "Resumix automatically groups your verified skills into clean, domain-specific categories.",
      whatResumixCannotInvent: "Resumix will not add unverified technologies.",
      section: "Skills"
    });
  }
  keywordScore = Math.max(30, Math.min(100, keywordScore));

  // -------------------------------------------------------------
  // DIMENSION 5: Evidence Strength & Quantification (Weight: 15%)
  // -------------------------------------------------------------
  let evidenceScore = 100;
  const quantifiedRatio = totalBulletsCount > 0 ? quantifiedBulletsCount / totalBulletsCount : 0;

  if (quantifiedRatio < 0.2 && totalBulletsCount > 0) {
    evidenceScore -= 40;
    findings.push({
      id: "evidence-low-quantification",
      categoryId: "evidence-strength",
      priority: "HIGH",
      title: "Few Quantified Impact Metrics in Bullets",
      whyItMatters: "Top tech recruiters look for proof of scale and impact (percentages, latencies, dollar savings, throughput, team sizes). Bullet points without numbers read like job descriptions rather than achievements.",
      whatResumixCanSafelyImprove: "Resumix restructures bullet points around the Google X-Y-Z formula ('Accomplished [X], as measured by [Y], by doing [Z]') using your existing context.",
      whatResumixCannotInvent: "Resumix will strictly NEVER invent fake percentages (e.g., 'improved by 45%') or fabricated metrics.",
      section: "Experience"
    });
  } else if (quantifiedRatio < 0.5 && totalBulletsCount > 0) {
    evidenceScore -= 20;
    findings.push({
      id: "evidence-moderate-quantification",
      categoryId: "evidence-strength",
      priority: "MEDIUM",
      title: "Opportunity to Quantify Additional Achievements",
      whyItMatters: "Increasing quantified bullets to 50%+ significantly boosts recruiter interview conversion rates.",
      whatResumixCanSafelyImprove: "Resumix highlights bullets where verified numbers can be emphasized.",
      whatResumixCannotInvent: "Resumix will never fabricate metrics.",
      section: "Experience"
    });
  }
  evidenceScore = Math.max(25, Math.min(100, evidenceScore));

  // -------------------------------------------------------------
  // DIMENSION 6: Recruiter Readability (Weight: 15%)
  // -------------------------------------------------------------
  let readabilityScore = 100;
  if (estimatedWordCount > 1100) {
    readabilityScore -= 25;
    findings.push({
      id: "readability-too-long",
      categoryId: "recruiter-readability",
      priority: "MEDIUM",
      title: "Resume Length Exceeds Standard Recruiter Skim Target",
      whyItMatters: "Resumes over 1,000 words risk key accomplishments being buried during the initial 6-second recruiter review.",
      whatResumixCanSafelyImprove: "Resumix condenses verbose phrasing and removes redundant filler words while preserving every verified fact.",
      whatResumixCannotInvent: "Resumix preserves all verified project and experience facts.",
      section: "General"
    });
  } else if (estimatedWordCount < 250 && estimatedWordCount > 0) {
    readabilityScore -= 30;
    findings.push({
      id: "readability-too-short",
      categoryId: "recruiter-readability",
      priority: "HIGH",
      title: "Resume Appears Sparse / Missing Detail",
      whyItMatters: "A resume under 250 words often signals lack of technical depth or incomplete project descriptions.",
      whatResumixCanSafelyImprove: "Resumix formats project architectures and verified skills with proper structural depth.",
      whatResumixCannotInvent: "Resumix will not fabricate projects or achievements.",
      section: "General"
    });
  }
  readabilityScore = Math.max(30, Math.min(100, readabilityScore));

  // Calculate Weighted Overall Health Score
  const overallScore = Math.round(
    atsScore * 0.20 +
    contentQualityScore * 0.15 +
    structureScore * 0.15 +
    keywordScore * 0.20 +
    evidenceScore * 0.15 +
    readabilityScore * 0.15
  );

  const getStatus = (sc: number): HealthCategoryScore["status"] => {
    if (sc >= 85) return "EXCELLENT";
    if (sc >= 70) return "GOOD";
    if (sc >= 50) return "NEEDS_IMPROVEMENT";
    return "CRITICAL";
  };

  const categories: HealthCategoryScore[] = [
    {
      id: "ats-compatibility",
      name: "ATS Compatibility",
      score: atsScore,
      weight: 20,
      status: getStatus(atsScore),
      summary: "Header, contact information, and standard parsable section headings.",
      findingsCount: findings.filter(f => f.categoryId === "ats-compatibility").length
    },
    {
      id: "content-quality",
      name: "Content Quality",
      score: contentQualityScore,
      weight: 15,
      status: getStatus(contentQualityScore),
      summary: "Action verbs, executive summary, and achievement-oriented phrasing.",
      findingsCount: findings.filter(f => f.categoryId === "content-quality").length
    },
    {
      id: "structure",
      name: "Structure & Completeness",
      score: structureScore,
      weight: 15,
      status: getStatus(structureScore),
      summary: "Chronological timelines, social links, and section hierarchy.",
      findingsCount: findings.filter(f => f.categoryId === "structure").length
    },
    {
      id: "keyword-alignment",
      name: "Keyword Alignment",
      score: keywordScore,
      weight: 20,
      status: getStatus(keywordScore),
      summary: "Technical skills inventory, categorized tools, and industry keywords.",
      findingsCount: findings.filter(f => f.categoryId === "keyword-alignment").length
    },
    {
      id: "evidence-strength",
      name: "Evidence Strength",
      score: evidenceScore,
      weight: 15,
      status: getStatus(evidenceScore),
      summary: "Quantified metrics ($, %, counts) and verifiable impact claims.",
      findingsCount: findings.filter(f => f.categoryId === "evidence-strength").length
    },
    {
      id: "recruiter-readability",
      name: "Recruiter Readability",
      score: readabilityScore,
      weight: 15,
      status: getStatus(readabilityScore),
      summary: "Word count, visual density, and 6-second recruiter skim efficiency.",
      findingsCount: findings.filter(f => f.categoryId === "recruiter-readability").length
    }
  ];

  let rating: ResumeHealthReport["rating"] = "Needs Attention";
  if (overallScore >= 85) rating = "Exceptional";
  else if (overallScore >= 70) rating = "Competitive";
  else if (overallScore >= 50) rating = "Fair";

  return {
    overallScore,
    rating,
    categories,
    findings,
    summary: {
      totalFindings: findings.length,
      highPriorityCount: findings.filter(f => f.priority === "HIGH").length,
      mediumPriorityCount: findings.filter(f => f.priority === "MEDIUM").length,
      lowPriorityCount: findings.filter(f => f.priority === "LOW").length,
      quantifiedBulletsCount,
      actionVerbsCount,
      totalBulletsCount,
      estimatedWordCount
    }
  };
}
