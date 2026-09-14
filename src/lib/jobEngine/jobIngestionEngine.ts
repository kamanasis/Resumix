import { 
  Job, 
  JobSnapshot, 
  JobSourceInput, 
  JobFetchResult, 
  JobProvider, 
  JobSourceType 
} from "../../types";
import { 
  JobSourceAdapter, 
  GreenhouseAdapter, 
  LeverAdapter, 
  AshbyAdapter, 
  WorkableAdapter, 
  SmartRecruitersAdapter, 
  JSONLDAdapter, 
  SemanticHTMLAdapter, 
  UserPastedAdapter,
  AdzunaAdapter,
  USAJobsAdapter
} from "./adapters";
import { evaluateSnapshotCreation } from "./jobSnapshotManager";
import { compareJobsForDeduplication } from "./jobDeduplicator";

export class JobIngestionEngine {
  private adapters: JobSourceAdapter[];
  private jobStore: Map<string, Job> = new Map();
  private snapshotStore: Map<string, JobSnapshot[]> = new Map(); // jobId -> JobSnapshot[]

  constructor() {
    this.adapters = [
      new GreenhouseAdapter(),
      new LeverAdapter(),
      new AshbyAdapter(),
      new WorkableAdapter(),
      new SmartRecruitersAdapter(),
      new AdzunaAdapter(),
      new USAJobsAdapter(),
      new JSONLDAdapter(),
      new SemanticHTMLAdapter(),
      new UserPastedAdapter()
    ];
  }

  /**
   * Resolves the appropriate provider and adapter for a given input.
   */
  resolveSource(input: JobSourceInput): {
    provider: JobProvider;
    sourceType: JobSourceType;
    canHandle: boolean;
  } {
    for (const adapter of this.adapters) {
      if (adapter.canHandle(input)) {
        return {
          provider: adapter.provider,
          sourceType: adapter.sourceType,
          canHandle: true
        };
      }
    }

    return {
      provider: "USER_URL",
      sourceType: "WEB_JSON_LD",
      canHandle: false
    };
  }

  /**
   * Ingests a job from URL, ATS, or pasted text through the universal pipeline.
   */
  async ingestJob(input: JobSourceInput): Promise<JobFetchResult> {
    // 1. Find suitable adapter
    let matchedAdapter: JobSourceAdapter | null = null;
    for (const adapter of this.adapters) {
      if (adapter.canHandle(input)) {
        matchedAdapter = adapter;
        break;
      }
    }

    if (!matchedAdapter) {
      return {
        success: false,
        error: {
          code: "UNSUPPORTED_JOB_SOURCE",
          message: "No provider adapter available to process this source input."
        }
      };
    }

    // 2. Fetch and verify via adapter
    const result = await matchedAdapter.fetchJob(input);
    if (!result.success || !result.job || !result.snapshot) {
      return result;
    }

    const { job, snapshot } = result;

    // 3. Deduplication Check against existing stored jobs
    for (const [existingJobId, existingJob] of this.jobStore.entries()) {
      const dedup = compareJobsForDeduplication(job, existingJob);
      if (dedup.isDuplicate && dedup.confidence >= 0.8) {
        // Link to existing job and check snapshot update
        const existingSnapshots = this.snapshotStore.get(existingJobId) || [];
        const evalSnapshot = evaluateSnapshotCreation(existingSnapshots, snapshot.description);

        if (!evalSnapshot.createNew && evalSnapshot.matchedSnapshot) {
          // No content change: touch lastSeenAt
          existingJob.lastSeenAt = new Date().toISOString();
          return {
            success: true,
            job: existingJob,
            snapshot: evalSnapshot.matchedSnapshot,
            company: result.company
          };
        } else {
          // Content changed: append new immutable snapshot to existing job
          existingJob.currentSnapshotId = snapshot.snapshotId;
          existingJob.lastSeenAt = new Date().toISOString();
          existingJob.updatedAt = new Date().toISOString();
          existingSnapshots.push(snapshot);
          this.snapshotStore.set(existingJobId, existingSnapshots);

          return {
            success: true,
            job: existingJob,
            snapshot,
            company: result.company
          };
        }
      }
    }

    // 4. Register new Job and initial Snapshot
    this.jobStore.set(job.jobId, job);
    this.snapshotStore.set(job.jobId, [snapshot]);

    return {
      success: true,
      job,
      snapshot,
      company: result.company
    };
  }

  /**
   * Convenience helper for URL import.
   */
  async importJobUrl(url: string, targetCompany?: string, targetRole?: string): Promise<JobFetchResult> {
    if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url.trim())) {
      return {
        success: false,
        error: {
          code: "INVALID_URL",
          message: "Please provide a valid HTTP or HTTPS job posting URL."
        }
      };
    }

    return this.ingestJob({
      url: url.trim(),
      company: targetCompany,
      role: targetRole
    });
  }

  /**
   * Convenience helper for raw pasted JD import.
   */
  async importJobText(rawText: string, targetCompany?: string, targetRole?: string): Promise<JobFetchResult> {
    if (!rawText || typeof rawText !== "string" || rawText.trim().length === 0) {
      return {
        success: false,
        error: {
          code: "JOB_EXTRACTION_FAILED",
          message: "Job description text cannot be empty."
        }
      };
    }

    return this.ingestJob({
      rawText: rawText.trim(),
      company: targetCompany,
      role: targetRole
    });
  }

  /**
   * Retrieves a stored Job by its ID.
   */
  getJob(jobId: string): Job | undefined {
    return this.jobStore.get(jobId);
  }

  /**
   * Retrieves all historical snapshots for a Job.
   */
  getJobSnapshots(jobId: string): JobSnapshot[] {
    return this.snapshotStore.get(jobId) || [];
  }

  /**
   * Retrieves all stored Jobs.
   */
  getAllJobs(): Job[] {
    return Array.from(this.jobStore.values());
  }

  /**
   * Retrieves all snapshots paired with their parent job.
   */
  getAllSnapshots(): { job: Job; snapshot: JobSnapshot }[] {
    const results: { job: Job; snapshot: JobSnapshot }[] = [];
    for (const [jobId, snapshots] of this.snapshotStore.entries()) {
      const job = this.jobStore.get(jobId);
      if (job) {
        for (const snap of snapshots) {
          results.push({ job, snapshot: snap });
        }
      }
    }
    return results;
  }
}

// Global Singleton Instance
export const globalJobIngestionEngine = new JobIngestionEngine();

export const globalJobSnapshotStore = {
  getSnapshots: (jobId: string): JobSnapshot[] => globalJobIngestionEngine.getJobSnapshots(jobId),
  getSnapshot: (snapshotId: string): JobSnapshot | undefined => {
    for (const item of globalJobIngestionEngine.getAllSnapshots()) {
      if (item.snapshot.snapshotId === snapshotId || (item.snapshot as any).id === snapshotId) {
        return item.snapshot;
      }
    }
    return undefined;
  },
  getAllSnapshots: () => globalJobIngestionEngine.getAllSnapshots()
};
