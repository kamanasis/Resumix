import crypto from "crypto";
import { 
  RoleSeniority, 
  NormalizedRoleEntity 
} from "../../types";

const SENIORITY_PATTERNS: [RegExp, RoleSeniority][] = [
  [/\b(intern|internship|co-op|coop|trainee|apprentice)\b/i, "Intern"],
  [/\b(junior|jr\.?|entry[\s-]level|associate|fresh|graduate)\b/i, "Junior"],
  [/\b(principal|distinguished|fellow)\b/i, "Principal"],
  [/\b(staff)\b/i, "Staff"],
  [/\b(lead|tech[\s-]lead|technical[\s-]lead|team[\s-]lead)\b/i, "Lead"],
  [/\b(senior|sr\.?|advanced|experienced)\b/i, "Senior"],
  [/\b(director|vp|vice[\s-]president|head\s+of|chief|cto|engineering\s+manager|manager)\b/i, "Executive"]
];

const SPECIALIZATION_KEYWORDS: [RegExp, string][] = [
  [/\brust\b/i, "Rust"],
  [/\bpython\b/i, "Python"],
  [/\bgo(lang)?\b/i, "Go"],
  [/\bjava\b/i, "Java"],
  [/\bc\+\+\b/i, "C++"],
  [/\bembedded|firmware\b/i, "Embedded Systems"],
  [/\brobotics|perception|autonomous\b/i, "Robotics & Perception"],
  [/\bbattery(\s+management)?\b/i, "Battery Management"],
  [/\bmine(\s+safety)?\b/i, "Mine Safety"],
  [/\bgeospatial|gis\b/i, "Geospatial"],
  [/\bclinical(\s+data)?\b/i, "Clinical Data"],
  [/\bquantitative|quant\b/i, "Quantitative Finance"],
  [/\bsecurity|infosec|appsec\b/i, "Security"],
  [/\bdistributed(\s+systems)?\b/i, "Distributed Systems"],
  [/\bcloud|infrastructure\b/i, "Cloud Infrastructure"],
  [/\bcomputer\s+vision|cv\b/i, "Computer Vision"],
  [/\bnlp|natural\s+language\b/i, "Natural Language Processing"],
  [/\bios|swift\b/i, "iOS"],
  [/\bandroid|kotlin\b/i, "Android"],
  [/\bapi|microservices\b/i, "APIs & Services"]
];

interface CanonicalRoleRule {
  pattern: RegExp;
  normalizedRole: string;
  roleFamily: string;
  defaultSpecialization?: string;
  confidence: number;
}

const CANONICAL_ROLE_RULES: CanonicalRoleRule[] = [
  // 1. Data & Machine Learning (Strict Boundaries: Data Engineer != Data Scientist != ML Engineer)
  {
    pattern: /\bdata\s+engineer(ing)?\b/i,
    normalizedRole: "Data Engineer",
    roleFamily: "Data & Machine Learning",
    defaultSpecialization: "Data Pipelines & Warehousing",
    confidence: 0.95
  },
  {
    pattern: /\b(data\s+scientist|data\s+science)\b/i,
    normalizedRole: "Data Scientist",
    roleFamily: "Data & Machine Learning",
    defaultSpecialization: "Statistical Modeling & Analytics",
    confidence: 0.95
  },
  {
    pattern: /\b(machine\s+learning\s+engineer|ml\s+engineer|ai\s+engineer|applied\s+ai\s+engineer|deep\s+learning\s+engineer)\b/i,
    normalizedRole: "Machine Learning Engineer",
    roleFamily: "Data & Machine Learning",
    defaultSpecialization: "Machine Learning & AI",
    confidence: 0.95
  },
  {
    pattern: /\b(computer\s+vision\s+engineer|cv\s+engineer)\b/i,
    normalizedRole: "Computer Vision Engineer",
    roleFamily: "Data & Machine Learning",
    defaultSpecialization: "Computer Vision",
    confidence: 0.95
  },
  {
    pattern: /\b(nlp\s+engineer|natural\s+language\s+processing\s+engineer)\b/i,
    normalizedRole: "NLP Engineer",
    roleFamily: "Data & Machine Learning",
    defaultSpecialization: "Natural Language Processing",
    confidence: 0.95
  },

  // 2. Product & Design (Strict Boundaries: Product Designer != UX Designer != UI Designer)
  {
    pattern: /\bproduct\s+designer\b/i,
    normalizedRole: "Product Designer",
    roleFamily: "Product & Design",
    defaultSpecialization: "Product Design",
    confidence: 0.95
  },
  {
    pattern: /\b(ux\s+designer|user\s+experience\s+designer)\b/i,
    normalizedRole: "UX Designer",
    roleFamily: "Product & Design",
    defaultSpecialization: "User Experience",
    confidence: 0.95
  },
  {
    pattern: /\b(ui\s+designer|user\s+interface\s+designer|visual\s+designer)\b/i,
    normalizedRole: "UI Designer",
    roleFamily: "Product & Design",
    defaultSpecialization: "User Interface",
    confidence: 0.95
  },
  {
    pattern: /\b(ux\s+researcher|user\s+researcher)\b/i,
    normalizedRole: "UX Researcher",
    roleFamily: "Product & Design",
    defaultSpecialization: "User Research",
    confidence: 0.95
  },
  {
    pattern: /\b(technical\s+product\s+manager|tpm)\b/i,
    normalizedRole: "Technical Product Manager",
    roleFamily: "Product Management",
    defaultSpecialization: "Technical Systems",
    confidence: 0.95
  },
  {
    pattern: /\b(product\s+manager|pm)\b/i,
    normalizedRole: "Product Manager",
    roleFamily: "Product Management",
    defaultSpecialization: "Product Strategy",
    confidence: 0.95
  },

  // 3. Software Engineering Core Disciplines (Backend != Frontend != Full Stack)
  {
    pattern: /\b(backend|back[\s-]end|server[\s-]side|api)\s+(engineer|developer)\b/i,
    normalizedRole: "Backend Engineer",
    roleFamily: "Software Engineering",
    defaultSpecialization: "Backend & Systems",
    confidence: 0.95
  },
  {
    pattern: /\b(frontend|front[\s-]end|client[\s-]side|ui)\s+(engineer|developer)\b/i,
    normalizedRole: "Frontend Engineer",
    roleFamily: "Software Engineering",
    defaultSpecialization: "Web & Frontend",
    confidence: 0.95
  },
  {
    pattern: /\b(full[\s-]stack|fullstack)\b/i,
    normalizedRole: "Full Stack Engineer",
    roleFamily: "Software Engineering",
    defaultSpecialization: "Full Stack",
    confidence: 0.95
  },
  {
    pattern: /\b(mobile|ios|android)\s+(engineer|developer)\b/i,
    normalizedRole: "Mobile Engineer",
    roleFamily: "Software Engineering",
    defaultSpecialization: "Mobile Development",
    confidence: 0.95
  },

  // 4. Hardware, Embedded & Robotics (Evaluated before generic software / systems engineer)
  {
    pattern: /\b(battery(\s+management)?\s+systems?\s+engineer)\b/i,
    normalizedRole: "Battery Management Systems Engineer",
    roleFamily: "Hardware & Embedded",
    defaultSpecialization: "Battery Management",
    confidence: 0.95
  },
  {
    pattern: /\b(embedded\s+firmware\s+engineer|firmware\s+engineer|embedded\s+software\s+engineer)\b/i,
    normalizedRole: "Embedded Firmware Engineer",
    roleFamily: "Hardware & Embedded",
    defaultSpecialization: "Embedded Systems",
    confidence: 0.95
  },
  {
    pattern: /\b(robotics\s+perception\s+engineer|robotics\s+engineer)\b/i,
    normalizedRole: "Robotics Perception Engineer",
    roleFamily: "Hardware & Embedded",
    defaultSpecialization: "Robotics & Perception",
    confidence: 0.95
  },
  {
    pattern: /\b(hardware\s+engineer|electronics\s+engineer)\b/i,
    normalizedRole: "Hardware Engineer",
    roleFamily: "Hardware & Embedded",
    defaultSpecialization: "Hardware Design",
    confidence: 0.95
  },

  // 5. Cloud, Platform & Infrastructure
  {
    pattern: /\b(site\s+reliability\s+engineer|sre)\b/i,
    normalizedRole: "Site Reliability Engineer",
    roleFamily: "DevOps & Cloud Infrastructure",
    defaultSpecialization: "Reliability & Operations",
    confidence: 0.95
  },
  {
    pattern: /\b(devops\s+engineer|platform\s+engineer|cloud\s+engineer|infrastructure\s+engineer)\b/i,
    normalizedRole: "DevOps & Cloud Engineer",
    roleFamily: "DevOps & Cloud Infrastructure",
    defaultSpecialization: "Infrastructure & Automation",
    confidence: 0.95
  },

  // 6. Generic Software Engineering Fallback
  {
    pattern: /\b(software\s+engineer|software\s+developer|application\s+engineer|systems\s+engineer)\b/i,
    normalizedRole: "Software Engineer",
    roleFamily: "Software Engineering",
    defaultSpecialization: "General Software",
    confidence: 0.90
  },

  // 6. Quality & Security
  {
    pattern: /\b(security\s+engineer|appsec\s+engineer|infosec\s+engineer|cybersecurity\s+engineer)\b/i,
    normalizedRole: "Security Engineer",
    roleFamily: "Quality & Security",
    defaultSpecialization: "Cybersecurity",
    confidence: 0.95
  },
  {
    pattern: /\b(qa\s+engineer|sdet|software\s+development\s+engineer\s+in\s+test|test\s+automation\s+engineer)\b/i,
    normalizedRole: "QA & Test Automation Engineer",
    roleFamily: "Quality & Security",
    defaultSpecialization: "Quality Assurance & Test Automation",
    confidence: 0.95
  },

  // 7. Analytics & Specialized Disciplines
  {
    pattern: /\b(clinical\s+data\s+analyst|clinical\s+analyst)\b/i,
    normalizedRole: "Clinical Data Analyst",
    roleFamily: "Analytics & Business Intelligence",
    defaultSpecialization: "Clinical Data",
    confidence: 0.95
  },
  {
    pattern: /\b(quantitative\s+developer|quant\s+developer)\b/i,
    normalizedRole: "Quantitative Developer",
    roleFamily: "Software Engineering",
    defaultSpecialization: "Quantitative Finance",
    confidence: 0.95
  },
  {
    pattern: /\b(quantitative\s+analyst|quant\s+analyst)\b/i,
    normalizedRole: "Quantitative Analyst",
    roleFamily: "Analytics & Business Intelligence",
    defaultSpecialization: "Financial Quantitative Modeling",
    confidence: 0.95
  },
  {
    pattern: /\b(data\s+analyst|bi\s+analyst|business\s+intelligence\s+analyst)\b/i,
    normalizedRole: "Data Analyst",
    roleFamily: "Analytics & Business Intelligence",
    defaultSpecialization: "Business Intelligence & Reporting",
    confidence: 0.95
  },
  {
    pattern: /\b(geospatial\s+data\s+scientist|gis\s+analyst)\b/i,
    normalizedRole: "Geospatial Data Scientist",
    roleFamily: "Data & Machine Learning",
    defaultSpecialization: "Geospatial Analytics",
    confidence: 0.95
  }
];

/**
 * Extracts career seniority from a raw title string.
 */
export function extractRoleSeniority(title: string): RoleSeniority {
  const clean = title.trim();
  for (const [regex, seniority] of SENIORITY_PATTERNS) {
    if (regex.test(clean)) {
      return seniority;
    }
  }
  return "Mid-Level";
}

/**
 * Extracts specific technical or domain specialization tokens.
 */
export function extractRoleSpecialization(title: string): string | null {
  for (const [regex, spec] of SPECIALIZATION_KEYWORDS) {
    if (regex.test(title)) {
      return spec;
    }
  }
  return null;
}

/**
 * Strips seniority modifiers from title to obtain clean base role.
 */
export function stripSeniorityPrefix(title: string): string {
  let cleaned = title.trim();
  const seniorityWordRegex = /\b(intern|internship|co-op|junior|jr\.?|entry[\s-]level|associate|senior|sr\.?|lead|staff|principal|distinguished|director|vp|head\s+of)\b/gi;
  cleaned = cleaned.replace(seniorityWordRegex, "").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : title.trim();
}

/**
 * Generates a deterministic role ID from canonical role name and seniority.
 */
export function generateRoleId(normalizedRole: string, seniority: RoleSeniority): string {
  const payload = `${normalizedRole.toLowerCase().trim()}_${seniority.toLowerCase().trim()}`;
  const hash = crypto.createHash("sha256").update(payload, "utf8").digest("hex").substring(0, 16);
  return `role_${hash}`;
}

/**
 * Checks whether a role input is ambiguous (e.g. single generic word like "Engineer" or "Developer").
 */
export function detectRoleAmbiguity(title: string): boolean {
  const trimmed = title.trim();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    const singleWords = new Set(["engineer", "developer", "specialist", "consultant", "analyst", "manager", "lead", "designer"]);
    if (singleWords.has(tokens[0].toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Universal Role Resolver: Normalizes any job role into a canonical entity.
 * Handles common, uncommon, specialized, novel, and ambiguous roles gracefully.
 */
export function normalizeRole(rawRole: string): NormalizedRoleEntity {
  const originalRole = (rawRole || "Software Engineer").trim();
  const now = new Date().toISOString();

  if (!originalRole || originalRole.length === 0) {
    return {
      roleId: generateRoleId("Software Engineer", "Mid-Level"),
      originalRole: "",
      normalizedRole: "Software Engineer",
      roleFamily: "Software Engineering",
      specialization: null,
      seniority: "Mid-Level",
      confidence: 0.50,
      aliases: [],
      status: "UNVERIFIED",
      createdAt: now,
      updatedAt: now
    };
  }

  const seniority = extractRoleSeniority(originalRole);
  const explicitSpecialization = extractRoleSpecialization(originalRole);
  const isAmbiguous = detectRoleAmbiguity(originalRole);

  // 1. Check known canonical matching rules
  for (const rule of CANONICAL_ROLE_RULES) {
    if (rule.pattern.test(originalRole)) {
      const roleId = generateRoleId(rule.normalizedRole, seniority);
      const aliases = Array.from(new Set([originalRole, rule.normalizedRole]));

      return {
        roleId,
        originalRole,
        normalizedRole: rule.normalizedRole,
        roleFamily: rule.roleFamily,
        specialization: explicitSpecialization || rule.defaultSpecialization || null,
        seniority,
        confidence: rule.confidence,
        aliases,
        status: isAmbiguous ? "AMBIGUOUS" : "CONFIDENT",
        createdAt: now,
        updatedAt: now
      };
    }
  }

  // 2. Handling uncommon, novel, or specialized roles (e.g. "Mine Safety AI Engineer", "Battery Management Systems Engineer")
  const baseTitle = stripSeniorityPrefix(originalRole);
  // Title-case capitalization for display
  const titleCased = baseTitle.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());

  // Determine likely role family from semantic hints
  let derivedFamily = "Specialized / Cross-Disciplinary";
  if (/\b(ai|ml|data|learning|intelligence|analytics|model)\b/i.test(originalRole)) {
    derivedFamily = "Data & Machine Learning";
  } else if (/\b(design|ux|ui|creative)\b/i.test(originalRole)) {
    derivedFamily = "Product & Design";
  } else if (/\b(product|program)\b/i.test(originalRole)) {
    derivedFamily = "Product Management";
  } else if (/\b(firmware|embedded|hardware|robotics|circuits|battery)\b/i.test(originalRole)) {
    derivedFamily = "Hardware & Embedded";
  } else if (/\b(security|safety|compliance|audit)\b/i.test(originalRole)) {
    derivedFamily = "Quality & Security";
  } else if (/\b(devops|cloud|infrastructure|sre)\b/i.test(originalRole)) {
    derivedFamily = "DevOps & Cloud Infrastructure";
  } else if (/\b(engineer|developer|architect|programmer)\b/i.test(originalRole)) {
    derivedFamily = "Software Engineering";
  }

  const roleId = generateRoleId(titleCased, seniority);

  return {
    roleId,
    originalRole,
    normalizedRole: titleCased,
    roleFamily: derivedFamily,
    specialization: explicitSpecialization || null,
    seniority,
    confidence: isAmbiguous ? 0.40 : 0.75,
    aliases: [originalRole],
    status: isAmbiguous ? "AMBIGUOUS" : "CONFIDENT",
    createdAt: now,
    updatedAt: now
  };
}
