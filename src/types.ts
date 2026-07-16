export interface UserProfile {
  uid: string;
  email: string | null;
  createdAt: string;
  displayName: string | null;
}

export interface ResumeFile {
  id: string;
  userId: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  content: string; // Plain text content of the resume
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

export interface ParsedResume {
  id: string;
  userId: string;
  resumeId: string;
  createdAt: string;
  
  skills: string[];
  projects: any[]; // Or specific struct
  experience: any[]; // Or specific struct
  achievements: string[];
  education: any[];
  certifications: string[];
  languages: string[];
  tools: string[];
  frameworks: string[];
  softSkills: string[];
  atsKeywords: string[];
  summary: string;
  responsibilities: string[];
  quantifiedMetrics: string[];
}

export interface MissingItem {
  id: string;
  type: "Skill" | "ATS Keyword" | "Project" | "Achievement" | "Responsibility" | "Certification" | "Technology" | "Grammar" | "Formatting" | "Experience";
  title: string;
  importance: "Critical" | "Recommended" | "Optional";
  reason: string;
  suggestedAddition: string; // Example addition
  atsImpact: string; // e.g., "+3%"
  recruiterImpact: "High" | "Medium" | "Low";
  confidenceScore: number; // 0-100
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
