import { ApplicationRecord, ApplicationEvent, ApplicationOutcome } from "../../types";

// ============================================================================
// APPLICATION STORE & EVENT TIMELINE REPOSITORY
// ============================================================================
// Manages tracked application records and chronological outcome events.
// Enforces tenant isolation, prevents duplicate applications, and maintains
// an append-only timeline of candidate application milestones.
// ============================================================================

export class ApplicationStore {
  private applications = new Map<string, ApplicationRecord>();
  private events = new Map<string, ApplicationEvent[]>();

  /**
   * Creates and stores a new application record with an initial milestone event.
   */
  public createApplication(record: Partial<ApplicationRecord> & {
    userId: string;
    jobId: string;
    resumeId: string;
    companyName: string;
    roleTitle: string;
    scoreSnapshot: any;
  }): ApplicationRecord {
    const applicationId = record.applicationId || `app_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();
    const appliedAt = record.appliedAt || now;

    // Deduplication check: userId + jobId + resumeId + date
    const dateShort = appliedAt.substring(0, 10);
    for (const existing of this.applications.values()) {
      if (
        existing.userId === record.userId &&
        existing.jobId === record.jobId &&
        existing.resumeId === record.resumeId &&
        (existing.appliedAt || "").substring(0, 10) === dateShort
      ) {
        throw new Error("DUPLICATE_APPLICATION: An identical application has already been recorded for this job and resume version.");
      }
    }

    const newRecord: ApplicationRecord = {
      applicationId,
      userId: record.userId,
      jobId: record.jobId,
      resumeId: record.resumeId,
      tailoredResumeId: record.tailoredResumeId,
      companyName: record.companyName,
      companyId: record.companyId,
      roleTitle: record.roleTitle,
      roleId: record.roleId,
      appliedAt,
      outcome: record.outcome || "APPLIED",
      outcomeDate: record.outcomeDate || appliedAt,
      userNotes: record.userNotes || "",
      source: record.source || "USER_ENTERED",
      outcomeConfidence: record.outcomeConfidence || "USER_REPORTED",
      outcomeEvidenceSource: record.outcomeEvidenceSource || "USER_ENTERED",
      scoreSnapshot: record.scoreSnapshot,
      resumeVersionName: record.resumeVersionName || "Current Resume",
      isTailored: Boolean(record.isTailored),
      beforeAtsScore: record.beforeAtsScore,
      afterAtsScore: record.afterAtsScore,
      beforeTargetMatch: record.beforeTargetMatch,
      afterTargetMatch: record.afterTargetMatch,
      createdAt: now,
      updatedAt: now
    };

    this.applications.set(applicationId, newRecord);

    // Create initial timeline milestone event
    const initialEvent: ApplicationEvent = {
      eventId: `event_${Date.now()}_init`,
      applicationId,
      userId: record.userId,
      newOutcome: newRecord.outcome,
      eventDate: appliedAt,
      notes: "Application submitted",
      confidence: newRecord.outcomeConfidence,
      evidenceSource: newRecord.outcomeEvidenceSource,
      createdAt: now
    };

    this.events.set(applicationId, [initialEvent]);

    return newRecord;
  }

  /**
   * Retrieves an application record, verifying user ownership if requested.
   */
  public getApplication(applicationId: string, userId?: string): ApplicationRecord | null {
    const record = this.applications.get(applicationId) || null;
    if (!record) return null;
    if (userId && record.userId !== userId) {
      return null; // Tenant privacy protection
    }
    return record;
  }

  /**
   * Retrieves all applications belonging to a specific user.
   */
  public getApplicationsByUser(userId: string): ApplicationRecord[] {
    const results: ApplicationRecord[] = [];
    for (const record of this.applications.values()) {
      if (record.userId === userId) {
        results.push(record);
      }
    }
    return results.sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime());
  }

  /**
   * Updates an application status and records a chronological event.
   */
  public updateApplication(params: {
    applicationId: string;
    userId: string;
    outcome?: ApplicationOutcome;
    outcomeDate?: string;
    userNotes?: string;
    confidence?: any;
    evidenceSource?: any;
  }): ApplicationRecord {
    const { applicationId, userId, outcome, outcomeDate, userNotes, confidence, evidenceSource } = params;
    const existing = this.getApplication(applicationId, userId);
    if (!existing) {
      throw new Error("APPLICATION_NOT_FOUND: Application does not exist or access is forbidden.");
    }

    const now = new Date().toISOString();
    const previousOutcome = existing.outcome;
    const newOutcome = outcome || previousOutcome;

    existing.outcome = newOutcome;
    if (outcomeDate) existing.outcomeDate = outcomeDate;
    if (userNotes !== undefined) existing.userNotes = userNotes;
    if (confidence) existing.outcomeConfidence = confidence;
    if (evidenceSource) existing.outcomeEvidenceSource = evidenceSource;
    existing.updatedAt = now;

    // Append chronological event to timeline
    const event: ApplicationEvent = {
      eventId: `event_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      applicationId,
      userId,
      previousOutcome,
      newOutcome,
      eventDate: outcomeDate || now,
      notes: userNotes || `Outcome updated to ${newOutcome}`,
      confidence: confidence || existing.outcomeConfidence,
      evidenceSource: evidenceSource || existing.outcomeEvidenceSource,
      createdAt: now
    };

    const currentEvents = this.events.get(applicationId) || [];
    currentEvents.push(event);
    currentEvents.sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
    this.events.set(applicationId, currentEvents);

    return existing;
  }

  /**
   * Retrieves all chronological timeline events for an application.
   */
  public getEvents(applicationId: string, userId?: string): ApplicationEvent[] {
    if (userId) {
      const app = this.getApplication(applicationId, userId);
      if (!app) return [];
    }
    return this.events.get(applicationId) || [];
  }

  /**
   * Returns all stored application records for system-wide statistical aggregation.
   */
  public getAllApplications(): ApplicationRecord[] {
    return Array.from(this.applications.values());
  }

  /**
   * Clears internal state (useful for tests and resets).
   */
  public clear(): void {
    this.applications.clear();
    this.events.clear();
  }
}

export const globalApplicationStore = new ApplicationStore();
