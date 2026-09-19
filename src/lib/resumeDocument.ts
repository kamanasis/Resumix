import {
  ParsedResume,
  ContactInfo,
  ResumeDocument,
  ResumeHeader,
  ResumeExperienceItem,
  ResumeProjectItem,
  ResumeEducationItem,
  ResumeSkillCategory,
  ResumeCertificationItem,
  ResumeCustomSection,
  ResumeTemplateId
} from "../types";

/**
 * ============================================================================
 * RESUMIX STAGE 2: STRUCTURED RESUME DOCUMENT CONVERTER & SERIALIZER
 * ============================================================================
 * Serves as the single unified source of truth for all formats:
 * Browser Preview, PDF, DOCX, Plain Text, and Clipboard.
 * Strict Fact Preservation: Never fabricates sections or invents entities.
 */

export interface CreateResumeDocOptions {
  summary?: string;
  professionalTitle?: string;
  tailoredBullets?: Array<{ current: string; improved: string }>;
  templateId?: ResumeTemplateId;
}

/**
 * Constructs a verified ResumeDocument from a ParsedResume without fabricating missing sections.
 */
export function createResumeDocument(
  parsed: ParsedResume,
  contactOverride?: ContactInfo,
  options: CreateResumeDocOptions = {}
): ResumeDocument {
  const contact: ContactInfo = {
    ...(parsed.contactInfo || {}),
    ...(contactOverride || {})
  };

  const header: ResumeHeader = {
    name: contact.name?.trim() || "Candidate",
    professionalTitle: options.professionalTitle || contact.location || undefined,
    email: contact.email?.trim() || undefined,
    phone: contact.phone?.trim() || undefined,
    location: contact.location?.trim() || undefined,
    linkedin: contact.linkedin?.trim() || undefined,
    github: contact.github?.trim() || undefined,
    portfolio: contact.website?.trim() || undefined
  };

  // 1. Summary: Only include if valid content exists
  const rawSummary = (options.summary || parsed.summary || "").trim();
  const summary = rawSummary.length > 5 ? rawSummary : undefined;

  // 2. Experience
  let experience: ResumeExperienceItem[] | undefined;
  if (Array.isArray(parsed.experience) && parsed.experience.length > 0) {
    experience = parsed.experience.map(exp => {
      let bullets: string[] = [];
      if (Array.isArray(exp.bullets) && exp.bullets.length > 0) {
        bullets = exp.bullets.map(b => cleanBulletText(b)).filter(Boolean);
      } else if (exp.description) {
        bullets = splitIntoBullets(exp.description);
      }

      // If tailored bullets exist, substitute improved versions where matched
      if (options.tailoredBullets && options.tailoredBullets.length > 0) {
        bullets = bullets.map(b => {
          const match = options.tailoredBullets?.find(tb => 
            tb.current.toLowerCase().trim() === b.toLowerCase().trim() ||
            b.toLowerCase().includes(tb.current.toLowerCase().trim().slice(0, 40))
          );
          return match ? cleanBulletText(match.improved) : b;
        });
      }

      return {
        company: exp.company || "Company",
        title: exp.role || "Role",
        location: exp.location || undefined,
        dates: exp.duration || "",
        bullets: bullets.length > 0 ? bullets : [cleanBulletText(exp.description || "")]
      };
    }).filter(e => e.company && e.title);
    if (experience.length === 0) experience = undefined;
  }

  // 3. Projects
  let projects: ResumeProjectItem[] | undefined;
  if (Array.isArray(parsed.projects) && parsed.projects.length > 0) {
    projects = parsed.projects.map(proj => {
      const bullets = splitIntoBullets(proj.description || "");
      return {
        name: proj.title || "Project",
        technologies: proj.technologies && proj.technologies.length > 0 ? proj.technologies : undefined,
        bullets: bullets.length > 0 ? bullets : [cleanBulletText(proj.description || "")]
      };
    }).filter(p => p.name);
    if (projects.length === 0) projects = undefined;
  }

  // 4. Education
  let education: ResumeEducationItem[] | undefined;
  if (Array.isArray(parsed.education) && parsed.education.length > 0) {
    education = parsed.education.map(edu => ({
      degree: edu.degree || "Degree",
      institution: edu.institution || "Institution",
      dates: edu.graduationYear || undefined,
      gpa: edu.gpa || undefined
    })).filter(e => e.degree && e.institution);
    if (education.length === 0) education = undefined;
  }

  // 5. Skills (Categorized if possible, otherwise clean list)
  let skills: ResumeSkillCategory[] | string[] | undefined;
  const rawSkills = Array.isArray(parsed.skills) ? parsed.skills.map(s => s.trim()).filter(Boolean) : [];
  const languages = Array.isArray(parsed.languages) ? parsed.languages.map(s => s.trim()).filter(Boolean) : [];
  const frameworks = Array.isArray(parsed.frameworks) ? parsed.frameworks.map(s => s.trim()).filter(Boolean) : [];
  const tools = Array.isArray(parsed.tools) ? parsed.tools.map(s => s.trim()).filter(Boolean) : [];

  if (languages.length > 0 || frameworks.length > 0 || tools.length > 0) {
    const cats: ResumeSkillCategory[] = [];
    if (languages.length > 0) cats.push({ category: "Languages", items: languages });
    if (frameworks.length > 0) cats.push({ category: "Frameworks & Libraries", items: frameworks });
    if (tools.length > 0) cats.push({ category: "Tools & Platforms", items: tools });
    
    // Remaining skills not covered by the sub-categories
    const assigned = new Set([...languages, ...frameworks, ...tools].map(s => s.toLowerCase()));
    const remaining = rawSkills.filter(s => !assigned.has(s.toLowerCase()));
    if (remaining.length > 0) {
      cats.push({ category: "Core Technologies", items: remaining });
    }
    skills = cats;
  } else if (rawSkills.length > 0) {
    skills = rawSkills;
  }

  // 6. Certifications
  let certifications: string[] | undefined;
  if (Array.isArray(parsed.certifications) && parsed.certifications.length > 0) {
    certifications = parsed.certifications.map(c => c.trim()).filter(Boolean);
    if (certifications.length === 0) certifications = undefined;
  }

  // 7. Achievements
  let achievements: string[] | undefined;
  if (Array.isArray(parsed.achievements) && parsed.achievements.length > 0) {
    achievements = parsed.achievements.map(a => cleanBulletText(a)).filter(Boolean);
    if (achievements.length === 0) achievements = undefined;
  }

  return {
    header,
    summary,
    experience,
    projects,
    education,
    skills,
    certifications,
    achievements,
    templateId: options.templateId || "ats-classic"
  };
}

/**
 * Parses markdown text into a structured ResumeDocument.
 * Used for backward compatibility with existing saved analyses and AI outputs.
 */
export function parseMarkdownToResumeDocument(
  markdown: string,
  fallbackParsed?: ParsedResume
): ResumeDocument {
  const lines = markdown.split(/\r?\n/).map(l => l.trim());
  
  let header: ResumeHeader = {
    name: fallbackParsed?.contactInfo?.name || "Candidate",
    email: fallbackParsed?.contactInfo?.email,
    phone: fallbackParsed?.contactInfo?.phone,
    location: fallbackParsed?.contactInfo?.location,
    linkedin: fallbackParsed?.contactInfo?.linkedin,
    github: fallbackParsed?.contactInfo?.github,
    portfolio: fallbackParsed?.contactInfo?.website
  };

  let summary: string | undefined;
  const experience: ResumeExperienceItem[] = [];
  const projects: ResumeProjectItem[] = [];
  const education: ResumeEducationItem[] = [];
  const skillsFlat: string[] = [];
  const skillCategories: ResumeSkillCategory[] = [];
  const certifications: string[] = [];
  const achievements: string[] = [];
  const otherSections: ResumeCustomSection[] = [];

  let currentSection = "HEADER";
  let currentCustomTitle = "";
  let currentCustomLines: string[] = [];
  let currentExpItem: ResumeExperienceItem | null = null;
  let currentProjItem: ResumeProjectItem | null = null;
  let summaryLines: string[] = [];

  const flushExp = () => {
    if (currentExpItem && currentExpItem.title && currentExpItem.company) {
      experience.push(currentExpItem);
    }
    currentExpItem = null;
  };

  const flushProj = () => {
    if (currentProjItem && currentProjItem.name) {
      projects.push(currentProjItem);
    }
    currentProjItem = null;
  };

  const flushCustom = () => {
    if (currentCustomTitle && currentCustomLines.length > 0) {
      otherSections.push({
        title: currentCustomTitle,
        content: currentCustomLines
      });
    }
    currentCustomTitle = "";
    currentCustomLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Detect Top Level Headings
    if (line.startsWith("# ")) {
      const title = line.substring(2).trim();
      if (currentSection === "HEADER") {
        header.name = title.replace(/\*+/g, "").trim();
      }
      continue;
    }

    if (line.startsWith("## ")) {
      flushExp();
      flushProj();
      flushCustom();

      const secName = line.substring(3).trim().toUpperCase();
      if (secName.includes("SUMMARY") || secName.includes("OBJECTIVE") || secName.includes("PROFILE")) {
        currentSection = "SUMMARY";
      } else if (secName.includes("EXPERIENCE") || secName.includes("WORK HISTORY") || secName.includes("EMPLOYMENT")) {
        currentSection = "EXPERIENCE";
      } else if (secName.includes("PROJECT")) {
        currentSection = "PROJECTS";
      } else if (secName.includes("EDUCATION")) {
        currentSection = "EDUCATION";
      } else if (secName.includes("SKILL")) {
        currentSection = "SKILLS";
      } else if (secName.includes("CERTIFICATION")) {
        currentSection = "CERTIFICATIONS";
      } else if (secName.includes("ACHIEVEMENT") || secName.includes("AWARD")) {
        currentSection = "ACHIEVEMENTS";
      } else {
        currentSection = "OTHER";
        currentCustomTitle = line.substring(3).trim();
      }
      continue;
    }

    // Section Content Handlers
    if (currentSection === "HEADER") {
      // Parse contact info row e.g., "alex@example.com | (555) 123-4567 | Seattle, WA | linkedin.com/in/alex"
      const parts = line.split(/[|•·]+/).map(p => p.trim());
      for (const part of parts) {
        if (!part) continue;
        if (part.includes("@") && !header.email) {
          header.email = part.replace(/^Email:\s*/i, "").trim();
        } else if (/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(part) && !header.phone) {
          header.phone = part.replace(/^Phone:\s*/i, "").trim();
        } else if (part.toLowerCase().includes("linkedin.com") && !header.linkedin) {
          header.linkedin = part.replace(/^LinkedIn:\s*/i, "").trim();
        } else if (part.toLowerCase().includes("github.com") && !header.github) {
          header.github = part.replace(/^GitHub:\s*/i, "").trim();
        } else if ((part.toLowerCase().includes("http") || part.toLowerCase().includes(".com") || part.toLowerCase().includes(".dev")) && !header.portfolio) {
          header.portfolio = part.replace(/^Portfolio:\s*/i, "").trim();
        } else if (!header.location && parts.length > 1 && !header.professionalTitle && isLocationString(part)) {
          header.location = part;
        } else if (!header.professionalTitle && i === 1 && !part.includes("@")) {
          header.professionalTitle = part;
        }
      }
    } else if (currentSection === "SUMMARY") {
      summaryLines.push(line);
    } else if (currentSection === "EXPERIENCE") {
      if (line.startsWith("### ")) {
        flushExp();
        const roleLine = line.substring(4).trim();
        const { title, company, dates, location } = parseExperienceHeader(roleLine);
        currentExpItem = { company, title, dates, location, bullets: [] };
      } else if (currentExpItem && (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• "))) {
        currentExpItem.bullets.push(cleanBulletText(line.substring(2)));
      } else if (!currentExpItem && line.includes(" at ") || line.includes(" - ")) {
        // Line formatted without ###
        const { title, company, dates, location } = parseExperienceHeader(line);
        if (title && company) {
          currentExpItem = { company, title, dates, location, bullets: [] };
        }
      } else if (currentExpItem && line.length > 5) {
        currentExpItem.bullets.push(cleanBulletText(line));
      }
    } else if (currentSection === "PROJECTS") {
      if (line.startsWith("### ")) {
        flushProj();
        const pLine = line.substring(4).trim();
        const { name, technologies } = parseProjectHeader(pLine);
        currentProjItem = { name, technologies, bullets: [] };
      } else if (currentProjItem && (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• "))) {
        currentProjItem.bullets.push(cleanBulletText(line.substring(2)));
      } else if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ")) {
        const bullet = cleanBulletText(line.substring(2));
        const colonIdx = bullet.indexOf(":");
        if (colonIdx > 2 && colonIdx < 40) {
          flushProj();
          currentProjItem = {
            name: bullet.substring(0, colonIdx).trim(),
            bullets: [bullet.substring(colonIdx + 1).trim()]
          };
        }
      } else if (currentProjItem && line.length > 5) {
        currentProjItem.bullets.push(cleanBulletText(line));
      }
    } else if (currentSection === "EDUCATION") {
      if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ") || line.startsWith("### ")) {
        const cleanEdu = line.replace(/^[#\-*•\s]+/, "").trim();
        const parsedEdu = parseEducationLine(cleanEdu);
        if (parsedEdu) education.push(parsedEdu);
      } else if (line.length > 5) {
        const parsedEdu = parseEducationLine(line);
        if (parsedEdu) education.push(parsedEdu);
      }
    } else if (currentSection === "SKILLS") {
      const cleanLine = line.replace(/^[#\-*•\s]+/, "").trim();
      const colonIndex = cleanLine.indexOf(":");
      if (colonIndex > 1 && colonIndex < 35) {
        const cat = cleanLine.substring(0, colonIndex).replace(/\*+/g, "").trim();
        const items = cleanLine.substring(colonIndex + 1).split(/[,|]+/).map(s => s.trim()).filter(Boolean);
        if (items.length > 0) {
          skillCategories.push({ category: cat, items });
        }
      } else {
        const items = cleanLine.split(/[,|]+/).map(s => s.trim()).filter(Boolean);
        skillsFlat.push(...items);
      }
    } else if (currentSection === "CERTIFICATIONS") {
      if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ")) {
        certifications.push(cleanBulletText(line.substring(2)));
      } else if (line.length > 4) {
        certifications.push(cleanBulletText(line));
      }
    } else if (currentSection === "ACHIEVEMENTS") {
      if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ")) {
        achievements.push(cleanBulletText(line.substring(2)));
      } else if (line.length > 4) {
        achievements.push(cleanBulletText(line));
      }
    } else if (currentSection === "OTHER") {
      currentCustomLines.push(line);
    }
  }

  flushExp();
  flushProj();
  flushCustom();

  if (summaryLines.length > 0) {
    summary = summaryLines.join(" ").trim();
  }

  // Fallback to original parsed data if markdown omitted essential sections
  if (experience.length === 0 && fallbackParsed?.experience && fallbackParsed.experience.length > 0) {
    const docFallback = createResumeDocument(fallbackParsed);
    if (docFallback.experience) experience.push(...docFallback.experience);
  }
  if (education.length === 0 && fallbackParsed?.education && fallbackParsed.education.length > 0) {
    const docFallback = createResumeDocument(fallbackParsed);
    if (docFallback.education) education.push(...docFallback.education);
  }
  if (skillsFlat.length === 0 && skillCategories.length === 0 && fallbackParsed?.skills) {
    const docFallback = createResumeDocument(fallbackParsed);
    if (Array.isArray(docFallback.skills)) {
      if (typeof docFallback.skills[0] === "string") {
        skillsFlat.push(...(docFallback.skills as string[]));
      } else {
        skillCategories.push(...(docFallback.skills as ResumeSkillCategory[]));
      }
    }
  }

  const finalSkills = skillCategories.length > 0 ? skillCategories : (skillsFlat.length > 0 ? skillsFlat : undefined);

  return {
    header,
    summary,
    experience: experience.length > 0 ? experience : undefined,
    projects: projects.length > 0 ? projects : undefined,
    education: education.length > 0 ? education : undefined,
    skills: finalSkills,
    certifications: certifications.length > 0 ? certifications : undefined,
    achievements: achievements.length > 0 ? achievements : undefined,
    otherSections: otherSections.length > 0 ? otherSections : undefined,
    templateId: "ats-classic"
  };
}

/**
 * Serializes a structured ResumeDocument into clean canonical Markdown.
 */
export function resumeDocumentToMarkdown(doc: ResumeDocument): string {
  const parts: string[] = [];

  // 1. Header
  parts.push(`# ${doc.header.name}`);
  const contactParts: string[] = [];
  if (doc.header.email) contactParts.push(doc.header.email);
  if (doc.header.phone) contactParts.push(doc.header.phone);
  if (doc.header.location) contactParts.push(doc.header.location);
  if (doc.header.linkedin) contactParts.push(doc.header.linkedin);
  if (doc.header.github) contactParts.push(doc.header.github);
  if (doc.header.portfolio) contactParts.push(doc.header.portfolio);
  if (contactParts.length > 0) {
    parts.push(contactParts.join(" | "));
  }
  parts.push("");

  // 2. Summary
  if (doc.summary) {
    parts.push("## PROFESSIONAL SUMMARY");
    parts.push(doc.summary);
    parts.push("");
  }

  // 3. Experience
  if (doc.experience && doc.experience.length > 0) {
    parts.push("## WORK EXPERIENCE");
    for (const exp of doc.experience) {
      const locPart = exp.location ? ` | ${exp.location}` : "";
      const datePart = exp.dates ? ` (${exp.dates})` : "";
      parts.push(`### ${exp.title} at ${exp.company}${datePart}${locPart}`);
      for (const bullet of exp.bullets) {
        parts.push(`- ${bullet}`);
      }
      parts.push("");
    }
  }

  // 4. Projects
  if (doc.projects && doc.projects.length > 0) {
    parts.push("## TECHNICAL PROJECTS");
    for (const proj of doc.projects) {
      const techPart = proj.technologies && proj.technologies.length > 0 
        ? ` [${proj.technologies.join(", ")}]` 
        : "";
      const datePart = proj.dates ? ` (${proj.dates})` : "";
      parts.push(`### ${proj.name}${techPart}${datePart}`);
      for (const bullet of proj.bullets) {
        parts.push(`- ${bullet}`);
      }
      parts.push("");
    }
  }

  // 5. Technical Skills
  if (doc.skills) {
    parts.push("## TECHNICAL SKILLS");
    if (Array.isArray(doc.skills) && doc.skills.length > 0) {
      if (typeof doc.skills[0] === "string") {
        parts.push((doc.skills as string[]).join(", "));
      } else {
        for (const cat of doc.skills as ResumeSkillCategory[]) {
          parts.push(`- **${cat.category}**: ${cat.items.join(", ")}`);
        }
      }
    }
    parts.push("");
  }

  // 6. Education
  if (doc.education && doc.education.length > 0) {
    parts.push("## EDUCATION");
    for (const edu of doc.education) {
      const datePart = edu.dates ? ` (${edu.dates})` : "";
      const gpaPart = edu.gpa ? ` - GPA: ${edu.gpa}` : "";
      parts.push(`- **${edu.degree}**, ${edu.institution}${datePart}${gpaPart}`);
    }
    parts.push("");
  }

  // 7. Certifications
  if (doc.certifications && doc.certifications.length > 0) {
    parts.push("## CERTIFICATIONS");
    for (const cert of doc.certifications) {
      const certStr = typeof cert === "string" 
        ? cert 
        : `${cert.name}${cert.issuer ? ` - ${cert.issuer}` : ""}${cert.date ? ` (${cert.date})` : ""}`;
      parts.push(`- ${certStr}`);
    }
    parts.push("");
  }

  // 8. Achievements
  if (doc.achievements && doc.achievements.length > 0) {
    parts.push("## KEY ACHIEVEMENTS");
    for (const ach of doc.achievements) {
      parts.push(`- ${ach}`);
    }
    parts.push("");
  }

  return parts.join("\n").trim();
}

/**
 * Serializes a structured ResumeDocument into clean recruiter-friendly Plain Text.
 */
export function resumeDocumentToPlainText(doc: ResumeDocument): string {
  const lines: string[] = [];
  const divider = "=".repeat(60);
  const subDivider = "-".repeat(60);

  // Header
  lines.push(doc.header.name.toUpperCase());
  if (doc.header.professionalTitle) {
    lines.push(doc.header.professionalTitle);
  }
  const contactParts: string[] = [];
  if (doc.header.email) contactParts.push(doc.header.email);
  if (doc.header.phone) contactParts.push(doc.header.phone);
  if (doc.header.location) contactParts.push(doc.header.location);
  if (contactParts.length > 0) lines.push(contactParts.join(" | "));

  const linkParts: string[] = [];
  if (doc.header.linkedin) linkParts.push(doc.header.linkedin);
  if (doc.header.github) linkParts.push(doc.header.github);
  if (doc.header.portfolio) linkParts.push(doc.header.portfolio);
  if (linkParts.length > 0) lines.push(linkParts.join(" | "));
  lines.push("");

  // Summary
  if (doc.summary) {
    lines.push("PROFESSIONAL SUMMARY");
    lines.push(subDivider);
    lines.push(doc.summary);
    lines.push("");
  }

  // Experience
  if (doc.experience && doc.experience.length > 0) {
    lines.push("PROFESSIONAL EXPERIENCE");
    lines.push(subDivider);
    for (const exp of doc.experience) {
      const rightMeta = [exp.location, exp.dates].filter(Boolean).join(" | ");
      lines.push(`${exp.title} - ${exp.company}${rightMeta ? ` (${rightMeta})` : ""}`);
      for (const bullet of exp.bullets) {
        lines.push(`  * ${bullet}`);
      }
      lines.push("");
    }
  }

  // Projects
  if (doc.projects && doc.projects.length > 0) {
    lines.push("TECHNICAL PROJECTS");
    lines.push(subDivider);
    for (const proj of doc.projects) {
      const techStr = proj.technologies && proj.technologies.length > 0 ? ` [${proj.technologies.join(", ")}]` : "";
      lines.push(`${proj.name}${techStr}`);
      for (const bullet of proj.bullets) {
        lines.push(`  * ${bullet}`);
      }
      lines.push("");
    }
  }

  // Skills
  if (doc.skills) {
    lines.push("TECHNICAL SKILLS");
    lines.push(subDivider);
    if (Array.isArray(doc.skills)) {
      if (typeof doc.skills[0] === "string") {
        lines.push((doc.skills as string[]).join(", "));
      } else {
        for (const cat of doc.skills as ResumeSkillCategory[]) {
          lines.push(`* ${cat.category}: ${cat.items.join(", ")}`);
        }
      }
    }
    lines.push("");
  }

  // Education
  if (doc.education && doc.education.length > 0) {
    lines.push("EDUCATION");
    lines.push(subDivider);
    for (const edu of doc.education) {
      const meta = [edu.dates, edu.gpa ? `GPA: ${edu.gpa}` : ""].filter(Boolean).join(" | ");
      lines.push(`${edu.degree} - ${edu.institution}${meta ? ` (${meta})` : ""}`);
    }
    lines.push("");
  }

  // Certifications
  if (doc.certifications && doc.certifications.length > 0) {
    lines.push("CERTIFICATIONS");
    lines.push(subDivider);
    for (const cert of doc.certifications) {
      const certStr = typeof cert === "string" 
        ? cert 
        : `${cert.name}${cert.issuer ? ` - ${cert.issuer}` : ""}${cert.date ? ` (${cert.date})` : ""}`;
      lines.push(`* ${certStr}`);
    }
    lines.push("");
  }

  // Achievements
  if (doc.achievements && doc.achievements.length > 0) {
    lines.push("KEY ACHIEVEMENTS");
    lines.push(subDivider);
    for (const ach of doc.achievements) {
      lines.push(`* ${ach}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

/**
 * Validates that a ResumeDocument preserves truth:
 * - Prohibits fabricated sections absent from original parsed data
 * - Prohibits empty sections
 */
export function validateResumeDocumentIntegrity(
  doc: ResumeDocument,
  originalParsed?: ParsedResume
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!doc.header?.name || doc.header.name.trim().length === 0) {
    errors.push("Missing required candidate name in header.");
  }

  // Verify no fabricated sections if original parsed is available
  if (originalParsed) {
    const origExpCount = originalParsed.experience?.length || 0;
    const docExpCount = doc.experience?.length || 0;
    if (origExpCount === 0 && docExpCount > 0) {
      errors.push("Fabricated work experience: Original resume had 0 experience items.");
    }

    const origEduCount = originalParsed.education?.length || 0;
    const docEduCount = doc.education?.length || 0;
    if (origEduCount === 0 && docEduCount > 0) {
      errors.push("Fabricated education: Original resume had 0 education items.");
    }

    const origCertCount = originalParsed.certifications?.length || 0;
    const docCertCount = doc.certifications?.length || 0;
    if (origCertCount === 0 && docCertCount > 0) {
      errors.push("Fabricated certifications: Original resume had 0 certifications.");
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// ----------------------------------------------------------------------------
// Internal Helper Functions
// ----------------------------------------------------------------------------

function cleanBulletText(text: string): string {
  return text
    .replace(/^[\s\-*•·—]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitIntoBullets(desc: string): string[] {
  return desc
    .split(/\r?\n|•|\.\s+(?=[A-Z])/)
    .map(cleanBulletText)
    .filter(b => b.length > 10);
}

function parseExperienceHeader(line: string): { title: string; company: string; dates: string; location?: string } {
  let title = "Software Engineer";
  let company = "Company";
  let dates = "";
  let location: string | undefined;

  // 1. Extract location after pipe if present: e.g. " | New York, NY"
  const pipeIdx = line.lastIndexOf("|");
  if (pipeIdx !== -1) {
    const pipePart = line.substring(pipeIdx + 1).trim();
    if (isLocationString(pipePart) || /^[A-Za-z\s,]+$/.test(pipePart)) {
      location = pipePart;
      line = line.substring(0, pipeIdx).trim();
    }
  }

  // 2. Extract dates in parentheses: e.g. " (2020 - Present)"
  const dateMatch = line.match(/\(([^)]+)\)/);
  if (dateMatch) {
    dates = dateMatch[1].trim();
    line = line.replace(dateMatch[0], "").trim();
  }

  // 3. Extract title and company from remaining string
  if (line.includes(" at ")) {
    const parts = line.split(" at ");
    title = cleanBulletText(parts[0]);
    company = cleanBulletText(parts.slice(1).join(" at "));
  } else if (line.includes(" - ")) {
    const parts = line.split(" - ");
    title = cleanBulletText(parts[0]);
    company = cleanBulletText(parts.slice(1).join(" - "));
  } else if (line.includes("|")) {
    const parts = line.split("|");
    title = cleanBulletText(parts[0]);
    company = cleanBulletText(parts[1] || "");
    if (parts[2] && !location) location = cleanBulletText(parts[2]);
  } else {
    title = cleanBulletText(line);
  }

  return { title, company, dates, location };
}

function parseProjectHeader(line: string): { name: string; technologies?: string[] } {
  let name = cleanBulletText(line);
  let technologies: string[] | undefined;

  const techMatch = line.match(/\[(.*?)\]/);
  if (techMatch) {
    technologies = techMatch[1].split(/[,|]+/).map(t => t.trim()).filter(Boolean);
    name = cleanBulletText(line.replace(techMatch[0], ""));
  }

  return { name, technologies };
}

function parseEducationLine(line: string): ResumeEducationItem | null {
  const parts = line.split(/[|,-]+/).map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const dateMatch = line.match(/\((\d{4}[^)]*)\)/) || line.match(/(\d{4})/);
  const dates = dateMatch ? dateMatch[1].trim() : undefined;
  
  const degree = cleanBulletText(parts[0] || "Degree");
  let institution = cleanBulletText(parts[1] || "Institution");
  if (dates) {
    institution = institution.replace(new RegExp(`\\(?${dates}\\)?`, "g"), "").trim();
  }

  return {
    degree,
    institution,
    dates,
    gpa: parts.find(p => /GPA:\s*[\d.]+/i.test(p))?.replace(/GPA:\s*/i, "")
  };
}

function isLocationString(str: string): boolean {
  return /^[A-Za-z\s]+,\s*[A-Z]{2}$/.test(str) || 
         /^[A-Za-z\s]+,\s*[A-Za-z\s]+$/.test(str) ||
         str.toLowerCase().includes("remote");
}
