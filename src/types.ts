export interface UserProfile {
  uid: string;
  email: string | null;
  createdAt: string;
  displayName: string | null;
}

export type ExtractionStatus = 
  | "EXTRACTION_PENDING" 
  | "EXTRACTION_SUCCESS" 
  | "EXTRACTION_PARTIAL" 
  | "EXTRACTION_FAILED" 
  | "EXTRACTION_UNVERIFIED";

export interface ExtractionQuality {
  charCount: number;
  wordCount: number;
  qualityScore: number;
  isScanned: boolean;
  isCorrupted: boolean;
  detectedSections: string[];
  warnings: string[];
}

export interface OriginalFileMeta {
  name: string;
  size: number;
  type: string;
  lastModified?: number;
}

export interface ResumeFile {
  id: string;
  userId: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  content: string; // Extracted plain text / markdown
  extractionStatus?: ExtractionStatus;
  extractionQuality?: ExtractionQuality;
  originalFileMeta?: OriginalFileMeta;
  isUserEdited?: boolean;
}

export interface SkillEvidence {
  skill: string;
  evidence: string; // Exact quote from resume
}

export interface ContactInfo {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  website?: string;
}

export interface ParsedProject {
  title: string;
  description: string;
  technologies?: string[];
  role?: string;
  impact?: string;
}

export interface ParsedExperience {
  role: string;
  company: string;
  duration: string;
  location?: string;
  description: string;
  bullets?: string[];
}

export interface ParsedEducation {
  degree: string;
  institution: string;
  graduationYear?: string;
  gpa?: string;
}

export interface ParsedResume {
  id: string;
  userId: string;
  resumeId: string;
  createdAt: string;
  
  contactInfo?: ContactInfo;
  summary: string;
  skills: string[];
  skillEvidence?: SkillEvidence[];
  projects: ParsedProject[];
  experience: ParsedExperience[];
  education: ParsedEducation[];
  achievements: string[];
  certifications: string[];
  languages: string[];
  tools: string[];
  frameworks: string[];
  softSkills: string[];
  atsKeywords: string[];
  responsibilities: string[];
  quantifiedMetrics: string[];
  parseStatus?: "PARSE_SUCCESS" | "PARSE_PARTIAL" | "PARSE_FAILED";
}

// V1 Legacy Analysis
export interface ResumeAnalysis {
  id: string;
  userId: string;
  resumeId: string;
  resumeName: string;
  targetCompany: string;
  targetRole: string;
  jobDescription?: string;
  createdAt: string;
  matchingScore: number;
  tailoredContent: string; // Markdown
  suggestedChanges: string; // Markdown bullets or fallback suggestions
  
  // PRD Company-Specific fields
  experienceLevel?: string;
  location?: string;
  overview?: string;
  hiringTrends?: string;
  responsibilities?: string[];
  requiredTechnologies?: string[];
  softSkills?: string[];
  projectExpectations?: string;
  missingSkills?: string[];
  missingProjects?: string[];
  missingCertifications?: string[];
  weakExperienceAreas?: string[];
  recommendations?: string;
  tailoredBullets?: { current: string; improved: string }[];
  atsKeywords?: string[];
}

// V2 Deterministic Types

export interface RequirementProfile {
  id: string;
  userId: string;
  targetCompany: string;
  targetRole: string;
  jobDescription?: string;
  experienceLevel: string;
  createdAt: string;
  
  // Frozen requirements
  requiredSkills: string[];
  preferredSkills: string[];
  softSkills: string[];
  responsibilities: string[];
  atsKeywords: string[];
  experienceExpectations: string;
  educationRequirements: string;
  portfolioExpectations: string;
  certifications: string[];
  industryKeywords: string[];
  tools: string[];
  technologies: string[];
  leadershipExpectations: string;
}

export interface MissingItem {
  id: string;
  type: "Skill" | "ATS Keyword" | "Project" | "Achievement" | "Responsibility" | "Certification" | "Technology" | "Grammar" | "Formatting" | "Experience";
  title: string;
  importance: "Critical" | "Recommended" | "Optional";
  reason: string;
  suggestedAddition: string;
  atsImpact: string;
  recruiterImpact: "High" | "Medium" | "Low";
  confidenceScore: number;
}

export interface GapReport {
  id: string;
  userId: string;
  resumeId: string;
  requirementProfileId: string;
  createdAt: string;
  
  missingItems: MissingItem[];
  
  // ATS Analysis
  atsPresent: string[];
  atsMissing: string[];
  atsWeak: string[];
  atsOverused: string[];
  
  // Scores (Category Scorecard)
  scores: {
    atsCompatibility: number;
    requiredSkills: number;
    preferredSkills: number;
    experienceMatch: number;
    projects: number;
    achievements: number;
    grammar: number;
    formatting: number;
    companyMatch: number;
    softSkills: number;
    leadership: number;
  };
  
  overallCompletion: number;
  isReadyToApply: boolean;
}

export interface TailorRecommendation {
  section: string;
  suggestedSentence: string;
  evidenceStatus: string;
  reason: string;
  atsImpact: string;
  confidence: number;
}
