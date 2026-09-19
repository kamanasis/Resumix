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

// ============================================================================
// STAGE 2: PROFESSIONAL STRUCTURED RESUMEDOCUMENT MODEL & TEMPLATES
// ============================================================================

export type ResumeTemplateId = 
  | "ats-classic" 
  | "modern-pro" 
  | "technical" 
  | "minimal-exec" 
  | "student-fresher";

export interface ResumeHeader {
  name: string;
  professionalTitle?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
}

export interface ResumeExperienceItem {
  company: string;
  title: string;
  location?: string;
  dates: string;
  bullets: string[];
}

export interface ResumeProjectItem {
  name: string;
  technologies?: string[];
  dates?: string;
  bullets: string[];
}

export interface ResumeEducationItem {
  degree: string;
  institution: string;
  location?: string;
  dates?: string;
  gpa?: string;
  honors?: string;
}

export interface ResumeSkillCategory {
  category: string;
  items: string[];
}

export interface ResumeCertificationItem {
  name: string;
  issuer?: string;
  date?: string;
}

export interface ResumeCustomSection {
  title: string;
  content: string[] | string;
}

export interface ResumeDocument {
  header: ResumeHeader;
  summary?: string;
  experience?: ResumeExperienceItem[];
  projects?: ResumeProjectItem[];
  education?: ResumeEducationItem[];
  skills?: ResumeSkillCategory[] | string[];
  certifications?: (string | ResumeCertificationItem)[];
  achievements?: string[];
  awards?: string[];
  publications?: string[];
  otherSections?: ResumeCustomSection[];
  templateId?: ResumeTemplateId;
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

export type RequirementCategory =
  | "TECHNICAL_SKILL"
  | "SOFT_SKILL"
  | "TOOL"
  | "FRAMEWORK"
  | "LANGUAGE"
  | "DATABASE"
  | "CLOUD"
  | "CERTIFICATION"
  | "EDUCATION"
  | "EXPERIENCE"
  | "RESPONSIBILITY"
  | "DOMAIN_KNOWLEDGE"
  | "KEYWORD"
  | "OTHER";

export type RequirementImportance = "REQUIRED" | "PREFERRED" | "OPTIONAL";

export type RequirementSource =
  | "JOB_DESCRIPTION"
  | "COMPANY_VERIFIED"
  | "TARGET_ROLE"
  | "ROLE_LEVEL"
  | "AI_INFERENCE";

export type RequirementStatus =
  | "PRESENT"
  | "PARTIAL"
  | "MISSING"
  | "UNVERIFIED"
  | "NOT_APPLICABLE";

export type RequirementPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface TargetRequirement {
  requirementId: string;
  name: string;
  canonicalName: string;
  category: RequirementCategory;
  importance: RequirementImportance;
  source: RequirementSource;
  sourceQuote?: string;
  status: RequirementStatus;
  priority: RequirementPriority;
  confidence: number;
  evidenceQuote?: string;
  reason?: string;
}

export interface ScoreBreakdown {
  requiredMatched: number;
  requiredTotal: number;
  requiredPercentage: number;
  preferredMatched: number;
  preferredTotal: number;
  preferredPercentage: number;
  keywordsMatched: number;
  keywordsTotal: number;
  keywordPercentage: number;
  experienceMatchScore: number;
  educationMatchScore: number;
  criticalGapsCount: number;
}

export interface CategorizedGaps {
  criticalGaps: MissingItem[];
  requiredGaps: MissingItem[];
  preferredGaps: MissingItem[];
  optionalImprovements: MissingItem[];
  matchedRequirements: TargetRequirement[];
  unverifiedRequirements: TargetRequirement[];
}

export type CompletionState =
  | "ANALYSIS_PENDING"
  | "CRITICAL_GAPS_REMAIN"
  | "READY_TO_APPLY";

// V2 & V3 Deterministic Types

export interface RequirementProfile {
  id: string;
  userId: string;
  targetCompany: string;
  targetRole: string;
  jobDescription?: string;
  experienceLevel: string;
  createdAt: string;
  
  // Stage 3 Frozen Profile metadata & structured requirements
  profileHash?: string;
  isFrozen?: boolean;
  structuredRequirements?: TargetRequirement[];

  // Stage 6 Real Job Association
  jobId?: string;
  snapshotId?: string;

  // Legacy & Categorized String arrays for UI compatibility
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

export type GapClassification = 
  | "VERIFIED"
  | "PRESENT_BUT_WEAK"
  | "MISSING_ADDABLE"
  | "TRUE_GAP";

export type PriorityTier = 
  | "CRITICAL"
  | "HIGH_IMPACT"
  | "MEDIUM_IMPACT"
  | "LOW_IMPACT";

export interface ScoreConfidence {
  level: "HIGH_CONFIDENCE" | "MEDIUM_CONFIDENCE" | "LOW_CONFIDENCE";
  score: number;
  reason: string;
  isJdLimited: boolean;
  factors: {
    resumeExtractionQuality: string;
    jobDescriptionCompleteness: string;
    evidenceAvailability: string;
  };
}

export interface ApplicationReadiness {
  status: "READY_TO_APPLY" | "NEEDS_MINOR_IMPROVEMENTS" | "NEEDS_SIGNIFICANT_OPTIMIZATION" | "LOW_MATCH";
  headline: string;
  reasons: Array<{ type: "positive" | "warning" | "neutral"; text: string }>;
}

export interface HighestImpactAction {
  rank: number;
  title: string;
  category: string;
  whyItMatters: string;
  actionableTip: string;
  effort: "Low" | "Medium" | "High";
}

export interface ResumeQualityAudit {
  overallScore: number;
  parsingConfidence: number;
  checks: Array<{ name: string; status: "PASS" | "WARN" | "INFO"; detail: string }>;
}

export interface ScoreBreakdownDetails {
  requiredSkills: { score: number; weight: number; matched: number; total: number; explanation: string };
  preferredSkills: { score: number; weight: number; matched: number; total: number; explanation: string };
  keywordCoverage: { score: number; weight: number; matched: number; total: number; explanation: string };
  experienceMatch: { score: number; weight: number; isRequired?: boolean; explanation: string };
  roleAlignment: { score: number; weight: number; explanation: string };
  resumeStructure: { score: number; weight: number; explanation: string };
  educationMatch?: { score: number; weight: number; isRequired: boolean; explanation: string };
  criticalGapPenalty: number;
  criticalGapCap?: number;
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
  gapClassification?: GapClassification;
  priorityTier?: PriorityTier;
  evidenceFound?: string;
  evidenceLocation?: string;
  recommendedAction?: string;
  whyItMatters?: string;
  evidenceNeeded?: string;
}

export interface GapReport {
  id: string;
  userId: string;
  resumeId: string;
  requirementProfileId: string;
  createdAt: string;
  
  missingItems: MissingItem[];
  
  // Explainable breakdowns & structured gaps
  atsScore?: number;
  targetMatchScore?: number;
  scoreBreakdown?: ScoreBreakdown;
  categorizedGaps?: CategorizedGaps;
  completionState?: CompletionState;

  scoreConfidence?: ScoreConfidence;
  applicationReadiness?: ApplicationReadiness;
  highestImpactActions?: HighestImpactAction[];
  resumeQualityAudit?: ResumeQualityAudit;
  scoreBreakdownDetails?: ScoreBreakdownDetails;

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
  whyItMatters?: string;
  whatResumixFound?: string;
  whatYouCanSafelyChange?: string;
  whatYouShouldNotChange?: string;
  exampleBetterVersion?: string;
  expectedImpact?: string;
  evidenceNeeded?: string;
  whatIsWrong?: string;
  whatCanSafelyChange?: string;
  missingInformation?: string;
  whatWillNotInvent?: string;
}

// Stage 4 Types: Evidence-Based Tailoring & Provenance
export type ChangeType =
  | "REPHRASE"
  | "REORDER"
  | "CONDENSE"
  | "KEYWORD_ALIGNMENT"
  | "SECTION_RESTRUCTURE"
  | "CLARIFICATION"
  | "USER_APPROVED_ADDITION"
  | "UNSUPPORTED_CHANGE";

export interface ProvenanceChange {
  id: string;
  section: string;
  originalText: string;
  generatedText: string;
  reason: string;
  relatedRequirementId?: string;
  evidenceQuote?: string;
  changeType: ChangeType;
}

export interface ScoreComparison {
  beforeAtsScore: number;
  afterAtsScore: number;
  atsScoreDelta: number;
  beforeTargetMatch: number;
  afterTargetMatch: number;
  targetMatchDelta: number;
  beforeCriticalGaps: number;
  afterCriticalGaps: number;
  beforeMatchedCount: number;
  afterMatchedCount: number;
}

export type FinalityStatus = "OPTIMIZING" | "FINAL_OPTIMIZED" | "VALIDATION_FAILED";

export interface TailoredResumeVersion {
  versionId: string;
  parentVersionId?: string;
  resumeId: string;
  requirementProfileId: string;
  profileHash: string;
  createdAt: string;
  tailoredContent: string;
  changes: ProvenanceChange[];
  scoreComparison: ScoreComparison;
  isValid: boolean;
  isFinalVersion: boolean;
  finalityStatus: FinalityStatus;
  validationErrors?: string[];
}

// Stage 5 Types: Export & Production Hardening
export type ExportFormat = "PDF" | "DOCX" | "MARKDOWN" | "PRINT";
export type ExportStatus = "IDLE" | "PREPARING" | "EXPORTED" | "EXPORT_FAILED";

export interface ExportMetadata {
  format: ExportFormat;
  filename: string;
  exportedAt: string;
  resumeVersionId?: string;
  profileHash?: string;
  byteSize: number;
}

// ============================================================================
// STAGE 6: UNIVERSAL JOB DATA FOUNDATION TYPES
// ============================================================================

export type JobProvider =
  | "GREENHOUSE"
  | "LEVER"
  | "ASHBY"
  | "WORKABLE"
  | "SMARTRECRUITERS"
  | "ADZUNA"
  | "USAJOBS"
  | "REMOTEOK"
  | "ARBEITNOW"
  | "JOOBLE"
  | "JSEARCH"
  | "JSON_LD"
  | "SEMANTIC_HTML"
  | "USER_URL"
  | "USER_PASTED";

export type JobSourceType =
  | "ATS_API"
  | "AGGREGATOR"
  | "WEB_JSON_LD"
  | "SEMANTIC_HTML"
  | "USER_INPUT"
  | "USER_PASTE";

export type JobConfidence =
  | "VERIFIED_ATS"
  | "PUBLIC_ATS"
  | "PUBLIC_PAGE"
  | "USER_PROVIDED"
  | "LOW_CONFIDENCE";

export interface JobSourceReference {
  sourceId: string;
  provider: JobProvider;
  sourceType: JobSourceType;
  sourceUrl: string | null;
  sourceDomain?: string;
  retrievedAt: string;
  sourceConfidence: JobConfidence;
  sourceLastVerifiedAt?: string;
  sourceHash?: string;
  sourceQuote?: string;
  sourceStatus?: "ACTIVE" | "EXPIRED" | "REMOVED" | "UNAVAILABLE" | "USER_SUPPLIED";
}

export interface CompanyEntity {
  companyId: string;
  canonicalName: string;
  rawName?: string;
  aliases: string[];
  domains: string[];
  careerDomains: string[];
  detectedSources: JobSourceReference[];
  officialWebsite?: string;
  domain?: string;
  careersUrl?: string;
  jobBoardProvider?: JobProvider;
  resolutionStatus?: "CONFIDENT" | "AMBIGUOUS" | "UNVERIFIED";
  createdAt: string;
  updatedAt: string;
}

export type JobStatus =
  | "ACTIVE"
  | "EXPIRED"
  | "REMOVED"
  | "UNAVAILABLE"
  | "USER_SUPPLIED"
  | "UNKNOWN";

export interface Job {
  jobId: string;
  companyId: string;
  companyName: string;
  title: string;
  canonicalTitle?: string;
  canonicalRole?: string;
  experienceLevel?: string;
  location?: string;
  employmentType?: string;
  source: JobSourceReference;
  currentSnapshotId: string;
  status: JobStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export type JobExtractionStatus =
  | "VERIFIED"
  | "NEEDS_REVIEW"
  | "FAILED";

export interface JobStructuredMetadata {
  datePosted?: string;
  validThrough?: string;
  hiringOrganization?: string;
  location?: string;
  employmentType?: string;
  skills?: string[];
  salary?: string;
  experienceRequirements?: string;
  educationRequirements?: string;
}

export interface JobSnapshot {
  snapshotId: string;
  jobId: string;
  retrievedAt: string;
  sourceUrl: string | null;
  sourceDomain?: string;
  contentHash: string;
  title: string;
  description: string;
  structuredMetadata?: JobStructuredMetadata;
  requirements: TargetRequirement[];
  extractionStatus: JobExtractionStatus;
  evidenceQuality: number;
  status?: JobStatus;
  sourceLastVerifiedAt?: string;
  sourceQuote?: string;
  createdAt: string;
}

export interface JobSource {
  sourceId: string;
  provider: JobProvider;
  sourceType: JobSourceType;
  endpoint?: string;
  termsVerified?: boolean;
  rateLimitKnown?: boolean;
  attributionRequired?: boolean;
  storagePolicy?: string;
  enabled: boolean;
}

export interface JobSourceInput {
  url?: string;
  company?: string;
  role?: string;
  rawText?: string;
  rawHtml?: string;
  provider?: JobProvider;
}

export interface JobFetchResult {
  success: boolean;
  job?: Job;
  snapshot?: JobSnapshot;
  company?: CompanyEntity;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// ============================================================================
// STAGE 7: UNIVERSAL COMPANY & ROLE INTELLIGENCE TYPES
// ============================================================================

export type EvidenceStrength =
  | "INSUFFICIENT_DATA"
  | "LIMITED_EVIDENCE"
  | "MODERATE_EVIDENCE"
  | "STRONG_EVIDENCE";

export type EvidenceClaimType =
  | "JOB_FREQUENCY"
  | "OBSERVED_POSTING_FREQUENCY"
  | "ROLE_PATTERN"
  | "TREND"
  | "CO_OCCURRENCE"
  | "STATISTICAL_CO_OCCURRENCE"
  | "USER_PROVIDED"
  | "OUTCOME_DATA";

export type ClaimConfidenceTier =
  | "VERIFIED_FACT"
  | "OBSERVED_PATTERN"
  | "EMPIRICAL_DATA"
  | "USER_PROVIDED"
  | "INFERENCE"
  | "INSUFFICIENT_DATA";

export type RequirementTrendDirection =
  | "TRENDING_UP"
  | "TRENDING_DOWN"
  | "STABLE"
  | "INSUFFICIENT_DATA";

export interface RequirementFrequency {
  canonicalName: string;
  requirementName?: string;
  category: RequirementCategory;
  occurrences: number;
  totalRelevantJobs: number;
  totalPostingsEvaluated?: number;
  frequency: number; // strictly 0.0 to 1.0 (0% to 100%)
  frequencyPercentage?: number; // 0 to 100
  requiredOccurrences: number;
  preferredOccurrences: number;
  optionalOccurrences: number;
  evidenceJobIds: string[];
  evidenceSnapshotIds: string[];
  evidenceClaimType?: EvidenceClaimType;
  confidenceTier?: ClaimConfidenceTier;
}

export interface ExperiencePattern {
  level: string;
  jobCount: number;
  percentage: number;
  topRequirements: string[];
}

export interface LocationPattern {
  location: string;
  jobCount: number;
  percentage: number;
  topRequirements: string[];
  isRemote?: boolean;
  count?: number;
}

export interface RoleFamilyPattern {
  canonicalRole: string;
  roleTitle?: string;
  postingCount?: number;
  jobCount: number;
  commonTitles: string[];
  requirementDistribution: RequirementFrequency[];
  experienceDistribution: ExperiencePattern[];
  locationDistribution: LocationPattern[];
  percentage?: number;
}

export interface RequirementTrend {
  canonicalName: string;
  requirementName?: string;
  direction: RequirementTrendDirection;
  historicalFrequency: number;
  recentFrequency: number;
  delta: number;
  changePercentage?: number;
  timeWindowDays?: number;
}

export interface CompanyIntelligenceProfile {
  profileId: string;
  companyId: string;
  companyName: string;
  sampleSize: number;
  analyzedJobCount: number;
  rolesAnalyzed: number;
  locationsAnalyzed: number;
  timeRange?: {
    start: string;
    end: string;
  };
  topRequirements: RequirementFrequency[];
  roleFamilies: RoleFamilyPattern[];
  experiencePatterns: ExperiencePattern[];
  locationPatterns: LocationPattern[];
  trendData: RequirementTrend[];
  evidenceQuality: EvidenceStrength;
  datasetVersion: string;
  generatedAt: string;
}

export type CompanySourceType =
  | "OFFICIAL_WEBSITE"
  | "PUBLIC_CAREERS_PAGE"
  | "JOB_BOARD_API"
  | "PUBLIC_JOB_POSTING"
  | "USER_SUPPLIED"
  | "FIRESTORE_CACHE";

export interface CompanySourceProvenance {
  field: string;
  value: any;
  sourceType: CompanySourceType;
  sourceUrl: string | null;
  observedAt: string;
  confidence: number;
}

export interface CompanyHiringSignal {
  type: string;
  summary: string;
  observedCount: number;
  recency: string;
  evidenceSource?: string;
}

export type CompanyConfidenceTier = "HIGH" | "MEDIUM" | "LOW" | "UNVERIFIED";

export type CompanyIntelligenceStatus = "VERIFIED" | "PARTIAL" | "UNVERIFIED" | "AMBIGUOUS";

export interface CompanyIntelligence {
  id: string;
  companyId: string;
  normalizedName: string;
  displayName: string;
  aliases: string[];
  officialWebsite: string | null;
  domain: string | null;
  industry: string | null;
  description: string | null;
  headquarters: string | null;
  locations: string[];
  companySize: string | null;
  careersUrl: string | null;
  jobBoardProvider: JobProvider | null;
  jobBoardIdentifier: string | null;
  sourceRecords: CompanySourceProvenance[];
  observedRoles: string[];
  observedSkills: string[];
  observedTechnologies: string[];
  observedExperiencePatterns: ExperiencePattern[];
  observedEducationPatterns: string[];
  observedKeywords: string[];
  hiringSignals: CompanyHiringSignal[];
  confidence: CompanyConfidenceTier;
  confidenceReasons: string[];
  confidenceScore: number;
  firstObservedAt: string;
  lastUpdatedAt: string;
  sourceCount: number;
  status: CompanyIntelligenceStatus;
  profile?: CompanyIntelligenceProfile;
}

export interface RoleIntelligenceProfile {
  profileId: string;
  canonicalRole: string;
  targetCompany?: string;
  sampleSize: number;
  requirementDistribution: RequirementFrequency[];
  requiredSkills: RequirementFrequency[];
  preferredSkills: RequirementFrequency[];
  coOccurrences: {
    skills: [string, string];
    count: number;
    percentage: number;
  }[];
  evidenceStrength: EvidenceStrength;
  datasetVersion: string;
  generatedAt: string;
}

export type RoleSourceType =
  | "PUBLIC_JOB_POSTING"
  | "JOB_BOARD_API"
  | "USER_JOB_DESCRIPTION"
  | "COMPANY_INTELLIGENCE"
  | "FIRESTORE_CACHE";

export interface RoleSourceProvenance {
  field: string;
  value: any;
  sourceType: RoleSourceType;
  sourceUrl: string | null;
  observedAt: string;
  confidence: number;
}

export type RoleSeniority =
  | "Intern"
  | "Junior"
  | "Mid-Level"
  | "Senior"
  | "Lead"
  | "Staff"
  | "Principal"
  | "Executive";

export type RoleConfidenceTier = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT_DATA";

export type RoleIntelligenceStatus = "VERIFIED" | "PARTIAL" | "UNVERIFIED" | "LIMITED_DATA";

export interface NormalizedRoleEntity {
  roleId: string;
  originalRole: string;
  normalizedRole: string;
  roleFamily: string;
  specialization: string | null;
  seniority: RoleSeniority;
  confidence: number;
  aliases: string[];
  status: "CONFIDENT" | "AMBIGUOUS" | "UNVERIFIED";
  createdAt: string;
  updatedAt: string;
}

export interface EmergingRoleSkill {
  technology: string;
  previousFrequency: number;
  recentFrequency: number;
  growthPercentage: number;
  trend: "TRENDING_UP" | "TRENDING_DOWN" | "STABLE";
  sampleSize: number;
}

export interface RoleMarketGapItem {
  skill: string;
  category: RequirementCategory;
  marketFrequency: number;
  marketClassification: "COMMON" | "EMERGING" | "OCCASIONAL";
  candidateEvidenceStatus: "VERIFIED" | "NO_EVIDENCE";
  recommendation: string;
}

export interface RoleIntelligence {
  id: string;
  roleId: string;
  originalRole: string;
  normalizedRole: string;
  roleFamily: string;
  specialization: string | null;
  seniority: RoleSeniority;
  aliases: string[];
  industries: string[];
  commonSkills: string[];
  requiredSkillPatterns: RequirementFrequency[];
  preferredSkillPatterns: RequirementFrequency[];
  commonTechnologies: string[];
  commonTools: string[];
  commonFrameworks: string[];
  commonLanguages: string[];
  commonDatabases: string[];
  commonCloudTechnologies: string[];
  commonCertifications: string[];
  commonEducationPatterns: string[];
  experiencePatterns: ExperiencePattern[];
  responsibilityPatterns: string[];
  keywordPatterns: string[];
  locationPatterns: LocationPattern[];
  employmentPatterns: string[];
  relatedRoles: string[];
  emergingSkills: EmergingRoleSkill[];
  marketGaps?: RoleMarketGapItem[];
  sourceRecords: RoleSourceProvenance[];
  observationCount: number;
  companyCount: number;
  confidence: RoleConfidenceTier;
  confidenceReasons: string[];
  confidenceScore: number;
  disclaimer: string;
  firstObservedAt: string;
  lastUpdatedAt: string;
  status: RoleIntelligenceStatus;
  profile?: RoleIntelligenceProfile;
}

export interface IntelligenceDatasetVersion {
  versionId: string;
  generatedAt: string;
  jobCount: number;
  snapshotCount: number;
  companyCount: number;
  roleCount: number;
  timeRange: {
    start: string;
    end: string;
  };
}

export interface IntelligenceEvidence {
  statementId: string;
  claimType: EvidenceClaimType;
  confidenceTier: ClaimConfidenceTier;
  sourceJobIds: string[];
  sourceSnapshotIds: string[];
  sourceQuotes?: string[];
  sampleSize: number;
  generatedAt: string;
}

export interface CandidateOutcomeRecord {
  outcomeId: string;
  jobId: string;
  snapshotId: string;
  candidateProfileHash: string;
  outcome:
    | "APPLIED"
    | "REJECTED"
    | "SCREEN"
    | "INTERVIEW"
    | "OFFER"
    | "HIRED"
    | "UNKNOWN";
  sourceType:
    | "USER_PROVIDED"
    | "LICENSED_DATASET"
    | "AUTHORIZED_IMPORT";
  verified: boolean;
  createdAt: string;
}

// ============================================================================
// APPLICATION TRACKING & OUTCOME INTELLIGENCE TYPES
// ============================================================================

export type ApplicationOutcome =
  | "APPLIED"
  | "REJECTED"
  | "RECRUITER_SCREEN"
  | "INTERVIEW"
  | "TECHNICAL_INTERVIEW"
  | "FINAL_ROUND"
  | "OFFER"
  | "HIRED"
  | "WITHDRAWN"
  | "UNKNOWN"
  | "APPLICATION_SUBMITTED"
  | "INTERVIEW_RECEIVED"
  | "ASSESSMENT_RECEIVED"
  | "REJECTION_RECEIVED"
  | "OFFER_RECEIVED"
  | "USER_WITHDREW"
  | "UNKNOWN_OUTCOME";

export type ApplicationSource =
  | "USER_ENTERED"
  | "AUTHORIZED_IMPORT"
  | "LICENSED_DATASET";

export type OutcomeConfidence =
  | "VERIFIED"
  | "USER_REPORTED"
  | "UNVERIFIED";

export type OutcomeEvidenceSource =
  | "EMAIL"
  | "RECRUITER_MESSAGE"
  | "CAREER_PORTAL"
  | "USER_ENTERED"
  | "OTHER_AUTHORIZED";

export interface ApplicationScoreSnapshot {
  atsScore: number;
  targetMatchScore: number;
  requiredMatched: number;
  requiredTotal: number;
  preferredMatched: number;
  preferredTotal: number;
  criticalGapsCount: number;
  requirementProfileHash: string;
  intelligenceDatasetVersion?: string;
  capturedAt: string;
}

export interface ApplicationRecord {
  applicationId: string;
  userId: string;
  jobId: string;
  resumeId: string;
  tailoredResumeId?: string;
  companyName: string;
  companyId?: string;
  roleTitle: string;
  roleId?: string;
  appliedAt: string;
  outcome: ApplicationOutcome;
  outcomeDate?: string;
  userNotes?: string;
  source: ApplicationSource;
  outcomeConfidence: OutcomeConfidence;
  outcomeEvidenceSource?: OutcomeEvidenceSource;
  scoreSnapshot: ApplicationScoreSnapshot;
  resumeVersionName?: string;
  isTailored?: boolean;
  beforeAtsScore?: number;
  afterAtsScore?: number;
  beforeTargetMatch?: number;
  afterTargetMatch?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationEvent {
  eventId: string;
  applicationId: string;
  userId: string;
  previousOutcome?: ApplicationOutcome;
  newOutcome: ApplicationOutcome;
  eventDate: string;
  notes?: string;
  confidence: OutcomeConfidence;
  evidenceSource?: OutcomeEvidenceSource;
  createdAt: string;
}

export interface OutcomeDatasetVersion {
  versionId: string;
  applicationCount: number;
  eligibleApplicationCount: number;
  companyCount: number;
  roleCount: number;
  dateRange: {
    start: string;
    end: string;
  };
  generatedAt: string;
}

export interface OutcomePattern {
  patternId: string;
  companyId?: string;
  companyName?: string;
  roleId?: string;
  roleTitle?: string;
  roleFamily?: string;
  sampleSize: number;
  condition: {
    metric: string;
    operator: string;
    value: number;
  };
  outcomeMetric: string;
  observedValue: number;
  evidenceLevel: EvidenceStrength;
  sourceApplicationIds: string[];
  generatedAt: string;
  datasetVersion: string;
}

export interface OutcomeCorrelation {
  metric: string;
  threshold: number;
  highGroupRate: number;
  lowGroupRate: number;
  description: string;
}

export interface OutcomeSummaryAnalytics {
  datasetVersion: string;
  sampleSize: number;
  eligibleCount: number;
  evidenceLevel: EvidenceStrength;
  applicationCount: number;
  totalSubmissionsCount?: number;
  recruiterScreenCount: number;
  recruiterScreenRate: number; // 0 to 100%
  interviewCount: number;
  interviewRate: number; // 0 to 100%
  offerCount: number;
  offerRate: number; // 0 to 100%
  hiredCount: number;
  hiredRate: number; // 0 to 100%
  rejectedCount: number;
  rejectedRate: number; // 0 to 100%
  withdrawnCount: number;
  unknownCount: number;
  correlations?: OutcomeCorrelation[];
  disclaimer: string;
}

// ============================================================================
// ADAPTIVE LEARNING & ML INTELLIGENCE TYPES
// ============================================================================

export type LearningEventType =
  | "COMPANY_SEARCHED"
  | "COMPANY_SELECTED"
  | "ROLE_SEARCHED"
  | "ROLE_SELECTED"
  | "JD_ANALYZED"
  | "RESUME_ANALYZED"
  | "ATS_ANALYSIS_PERFORMED"
  | "REQUIREMENT_PROFILE_GENERATED"
  | "GAP_IDENTIFIED"
  | "GAP_EXPLANATION_REQUESTED"
  | "TAILORING_PERFORMED"
  | "TAILORING_ACCEPTED"
  | "TAILORING_REJECTED"
  | "TAILORING_EDITED"
  | "RECOMMENDATION_ACCEPTED"
  | "RECOMMENDATION_REJECTED"
  | "KEYWORD_ACCEPTED"
  | "KEYWORD_REJECTED"
  | "TARGET_CHANGED"
  | "EXPORT_PERFORMED"
  | "USER_FEEDBACK_SUBMITTED"
  | "OUTCOME_RECORDED";

export interface LearningEvent {
  eventId: string;
  userId: string;
  eventType: LearningEventType;
  timestamp: string;
  companyId?: string;
  companyName?: string;
  roleId?: string;
  roleTitle?: string;
  roleFamily?: string;
  specialization?: string | null;
  seniority?: RoleSeniority;
  requirementCategory?: RequirementCategory;
  skillName?: string;
  recommendationType?: string;
  outcome?: "ACCEPTED" | "REJECTED" | "EDITED" | "VIEWED" | "USEFUL" | "NOT_USEFUL" | string;
  confidence?: number;
  modelVersion: string;
  metadata?: Record<string, any>;
}

export interface LearningAggregate {
  aggregateId: string;
  scopeKey: string;
  positiveSignals: number;
  negativeSignals: number;
  totalObservations: number;
  weightedScore: number;
  firstObservedAt: string;
  lastObservedAt: string;
  updatedAt: string;
}

export type LearningModelStatus = "COLD_START" | "LEARNING" | "MATURE";

export interface ModelMetadata {
  modelVersion: string;
  featureVersion: string;
  trainingDataVersion: string;
  totalEventsProcessed: number;
  globalAcceptanceRate: number;
  status: LearningModelStatus;
  updatedAt: string;
}

export interface CompanyLearningFeatures {
  companyCategory: string;
  companySizeTier: string;
  observedTechCount: number;
  confidenceTier: string;
  hiringFrequencyTier: string;
}

export interface RoleLearningFeatures {
  roleFamily: string;
  specialization: string | null;
  seniority: RoleSeniority;
  isTechnical: boolean;
  marketFrequency: number;
  isEmerging: boolean;
}

export interface MatchLearningFeatures {
  requiredCoverage: number;
  preferredCoverage: number;
  keywordCoverage: number;
  criticalGapCount: number;
  evidenceConfidence: number;
}

export interface BehavioralLearningFeatures {
  historicalAcceptanceRate: number;
  historicalRejectionCount: number;
  observationCount: number;
  feedbackScore: number;
}

export interface LearningFeatureVector {
  featureId: string;
  companyFeatures: CompanyLearningFeatures;
  roleFeatures: RoleLearningFeatures;
  matchFeatures: MatchLearningFeatures;
  behavioralFeatures: BehavioralLearningFeatures;
  extractedAt: string;
}

export type RecommendationConfidenceTier = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT_DATA";

export type RecommendationPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface AdaptiveRecommendation {
  id: string;
  type: "GAP_PRIORITY" | "KEYWORD_EMPHASIS" | "SECTION_IMPROVEMENT" | "TAILORING_SAFEGUARD" | "ROLE_ALIGNMENT";
  targetItem: string;
  learnedPriority: RecommendationPriority;
  evidenceScore: number;
  roleWeight: number;
  companyWeight: number;
  behaviorScore: number;
  recencyScore: number;
  finalScore: number;
  confidenceTier: RecommendationConfidenceTier;
  confidenceScore: number;
  reason: string;
  evidence: string;
  source: "ROLE_INTELLIGENCE" | "COMPANY_INTELLIGENCE" | "DETERMINISTIC_ATS" | "ADAPTIVE_LEARNING";
  modelVersion: string;
  status: "ACTIVE" | "DISMISSED" | "ACCEPTED";
  feedback?: "USEFUL" | "NOT_USEFUL";
}

export interface UserLearningProfile {
  userId: string;
  topRoleFamilies: { family: string; count: number }[];
  topSpecializations: { specialization: string; count: number }[];
  totalAnalyses: number;
  acceptanceRate: number;
  frequentMissingSkills: { skill: string; count: number }[];
  lastActiveAt: string;
  updatedAt: string;
}

export interface AdaptiveIntelligenceResponse {
  learningStatus: LearningModelStatus;
  confidence: RecommendationConfidenceTier;
  recommendations: AdaptiveRecommendation[];
  prioritizedGaps: {
    requirementName: string;
    verifiedImportance: "REQUIRED" | "PREFERRED" | "OPTIONAL";
    learnedPriority: RecommendationPriority;
    confidence: RecommendationConfidenceTier;
    reason: string;
  }[];
  highValueKeywords: {
    keyword: string;
    relevanceScore: number;
    source: string;
  }[];
  userInsights?: {
    primaryTargetRoleFamily?: string;
    tailoringAcceptanceRate?: number;
    suggestedFocusArea?: string;
  };
  modelVersion: string;
  featureVersion: string;
  generatedAt: string;
  disclaimer: string;
}

// ============================================================================
// REAL-WORLD JOB MARKET & OUTCOME INTELLIGENCE TYPES
// ============================================================================

export type MarketObservationWindow =
  | "30_DAYS"
  | "90_DAYS"
  | "12_MONTHS"
  | "HISTORICAL";

export interface TimeDecayedRequirementFrequency {
  canonicalName: string;
  category: RequirementCategory;
  observedCount: number;
  requiredCount: number;
  preferredCount: number;
  optionalCount: number;
  companiesObserved: number;
  rolesObserved: number;
  recentObservations: number;
  historicalObservations: number;
  recencyWeightedFrequency: number;
  confidence: EvidenceStrength;
}

export interface MarketAggregate {
  aggregateId: string;
  scope: "ROLE_FAMILY" | "COMPANY" | "CROSS_MARKET";
  targetIdentifier: string;
  observationWindow: MarketObservationWindow;
  totalPostingsObserved: number;
  uniqueCompaniesCount: number;
  frequencies: TimeDecayedRequirementFrequency[];
  updatedAt: string;
}

export type ApplicationOutcomeType =
  | "APPLICATION_SUBMITTED"
  | "INTERVIEW_RECEIVED"
  | "ASSESSMENT_RECEIVED"
  | "REJECTION_RECEIVED"
  | "OFFER_RECEIVED"
  | "USER_WITHDREW"
  | "UNKNOWN_OUTCOME";

export interface OutcomeLearningSignal {
  roleFamily: string;
  canonicalCompany: string;
  scoreRange: string;
  outcomeType: ApplicationOutcomeType;
  verifiedAt: string;
}

export interface PredictiveAlignmentScore {
  estimatedAlignmentScore: number; // 0-100
  modelConfidence: RecommendationConfidenceTier;
  alignmentLevel: "STRONG" | "MODERATE" | "DEVELOPING" | "INSUFFICIENT_DATA";
  breakdown: {
    directJobCoverage: number;
    companyObservedWeight: number;
    roleMarketAlignment: number;
    outcomeSignalBonus: number;
  };
  disclaimer: string;
}

// ============================================================================
// REAL-TIME RESUME INTELLIGENCE & LIVE ANALYSIS ENGINE
// ============================================================================

export type RecommendationCategory =
  | "STRUCTURE"
  | "CONTENT"
  | "ATS"
  | "KEYWORD"
  | "CLARITY"
  | "IMPACT"
  | "EVIDENCE"
  | "FORMATTING"
  | "MISSING_INFORMATION"
  | "TARGET_ALIGNMENT";

export type RecommendationSeverity = "HIGH" | "MEDIUM" | "LOW";

export type RecommendationStatus = "ACTIVE" | "APPLIED" | "DISMISSED" | "EDITED";

export type LiveAnalysisState =
  | "IDLE"
  | "UPLOADING"
  | "EXTRACTING"
  | "VALIDATING"
  | "UNDERSTANDING"
  | "ANALYZING"
  | "RECOMMENDING"
  | "READY"
  | "ERROR"
  | "STALE";

export interface StructuredRecommendation {
  id: string;
  category: RecommendationCategory;
  severity: RecommendationSeverity;
  title: string;
  problem: string;
  whyItMatters: string;
  evidence: string;
  recommendation: string;
  safeAction: string;
  whatWillNotInvent: string;
  originalSnippet?: string;
  suggestedSnippet?: string;
  section: string;
  requiresUserInput: boolean;
  status: RecommendationStatus;
  userEdits?: string;
}

export interface SectionAnalysisStatus {
  name: string;
  status: "ANALYZED" | "WARNING" | "MISSING";
  itemCount: number;
  details: string;
}

export interface StructuralMetrics {
  extractedLength: number;
  wordCount: number;
  detectedSectionsCount: number;
  experienceCount: number;
  projectCount: number;
  skillCount: number;
  educationCount: number;
  linkCount: number;
  extractionQualityScore: number;
  suspiciousIndicators: string[];
}

export interface RealtimeIntelligenceReport {
  resumeId: string;
  resumeVersion: number;
  analysisVersion: number;
  timestamp: string;
  mode: "GENERAL" | "TARGETED";
  targetContext?: {
    company?: string;
    role?: string;
    jobDescription?: string;
  };
  overallHealthScore: number;
  atsScore: number;
  targetMatchScore: number | null;
  contentQualityScore: number;
  structureScore: number;
  evidenceStrengthScore: number;
  readabilityScore: number;
  sections: SectionAnalysisStatus[];
  recommendations: StructuredRecommendation[];
  structuralMetrics: StructuralMetrics;
  summary: {
    highCount: number;
    mediumCount: number;
    lowCount: number;
    totalCount: number;
    appliedCount: number;
    dismissedCount: number;
  };
}


