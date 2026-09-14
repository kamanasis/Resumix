import crypto from "crypto";
import { db } from "../firebase";
import { collection, doc, setDoc, getDoc } from "firebase/firestore";
import { 
  LearningEvent, 
  LearningEventType, 
  LearningAggregate, 
  UserLearningProfile, 
  ModelMetadata,
  LearningModelStatus
} from "../../types";

const CURRENT_MODEL_VERSION = "1.0.0";
const CURRENT_FEATURE_VERSION = "1.0.0";
const CURRENT_TRAINING_VERSION = "adaptive_v1";

export class LearningEventStore {
  private events: LearningEvent[] = [];
  private aggregates = new Map<string, LearningAggregate>();
  private userEvents = new Map<string, LearningEvent[]>();

  constructor() {
    this.initDefaultAggregates();
  }

  private initDefaultAggregates() {
    // Initial baseline seeds for common role families to assist cold start gracefully
  }

  public generateEventId(): string {
    return `evt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  }

  public generateAggregateId(scopeKey: string): string {
    const hash = crypto.createHash("sha256").update(scopeKey.toLowerCase().trim()).digest("hex").substring(0, 12);
    return `agg_${hash}`;
  }

  /**
   * Sanitizes learning event input to ensure strict privacy.
   * Strips any raw resume text or uncontrolled strings.
   */
  public sanitizeEvent(input: any): any {
    const clean: any = {
      eventType: input.eventType,
      userId: input.userId || "anonymous",
      timestamp: input.timestamp || new Date().toISOString(),
      modelVersion: input.modelVersion || CURRENT_MODEL_VERSION
    };

    if (input.companyId && typeof input.companyId === "string") clean.companyId = input.companyId;
    if (input.companyName && typeof input.companyName === "string") clean.companyName = input.companyName.trim();
    if (input.roleId && typeof input.roleId === "string") clean.roleId = input.roleId;
    if (input.roleTitle && typeof input.roleTitle === "string") clean.roleTitle = input.roleTitle.trim();
    if (input.roleFamily && typeof input.roleFamily === "string") clean.roleFamily = input.roleFamily.trim();
    if (input.specialization && typeof input.specialization === "string") clean.specialization = input.specialization.trim();
    if (input.seniority && typeof input.seniority === "string") clean.seniority = input.seniority;
    if (input.requirementCategory && typeof input.requirementCategory === "string") clean.requirementCategory = input.requirementCategory;
    if (input.skillName && typeof input.skillName === "string") clean.skillName = input.skillName.trim();
    if (input.recommendationType && typeof input.recommendationType === "string") clean.recommendationType = input.recommendationType;
    if (input.outcome && typeof input.outcome === "string") clean.outcome = input.outcome;
    if (typeof input.confidence === "number") clean.confidence = Math.max(0, Math.min(100, input.confidence));

    // Never accept raw resume text in metadata
    if (input.metadata && typeof input.metadata === "object") {
      clean.metadata = {};
      for (const [k, v] of Object.entries(input.metadata)) {
        if (k.toLowerCase().includes("resume") || k.toLowerCase().includes("raw") || k.toLowerCase().includes("text")) {
          continue; // Strip
        }
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
          clean.metadata[k] = v;
        }
      }
    }

    return clean;
  }

  /**
   * Records a learning event in memory and persists to Firestore under the user's isolated subcollection.
   */
  public async recordEvent(eventInput: Partial<LearningEvent> & { eventType: LearningEventType; userId: string }): Promise<LearningEvent> {
    const sanitized = this.sanitizeEvent(eventInput);
    const eventId = this.generateEventId();

    const fullEvent: LearningEvent = {
      ...sanitized,
      eventId
    };

    // Store in memory
    this.events.push(fullEvent);

    // Index by user
    const uList = this.userEvents.get(fullEvent.userId) || [];
    uList.push(fullEvent);
    this.userEvents.set(fullEvent.userId, uList);

    // Update aggregate learning signals incrementally
    this.updateAggregatesFromEvent(fullEvent);

    // Persist to user's isolated Firestore collection if available
    try {
      if (db && fullEvent.userId && fullEvent.userId !== "anonymous") {
        const userEventRef = doc(db, "users", fullEvent.userId, "learningEvents", eventId);
        await setDoc(userEventRef, fullEvent);
      }
    } catch (err) {
      console.warn("Could not persist learning event to Firestore (in-memory preserved):", err);
    }

    return fullEvent;
  }

  /**
   * Updates non-PII aggregate signals from an event.
   */
  private updateAggregatesFromEvent(event: LearningEvent): void {
    const now = new Date().toISOString();

    // 1. Role family aggregate
    if (event.roleFamily) {
      const scopeKey = `family:${event.roleFamily.toLowerCase().trim()}`;
      const isPositive = event.outcome === "ACCEPTED" || event.outcome === "USEFUL" || event.eventType === "TAILORING_ACCEPTED";
      const isNegative = event.outcome === "REJECTED" || event.outcome === "NOT_USEFUL" || event.eventType === "TAILORING_REJECTED";
      this.incrementAggregate(scopeKey, isPositive, isNegative, now);
    }

    // 2. Role + Skill interaction aggregate
    if (event.roleFamily && event.skillName) {
      const scopeKey = `role_skill:${event.roleFamily.toLowerCase().trim()}:${event.skillName.toLowerCase().trim()}`;
      const isPositive = event.outcome === "ACCEPTED" || event.outcome === "USEFUL" || event.eventType === "RECOMMENDATION_ACCEPTED" || event.eventType === "KEYWORD_ACCEPTED";
      const isNegative = event.outcome === "REJECTED" || event.outcome === "NOT_USEFUL" || event.eventType === "RECOMMENDATION_REJECTED" || event.eventType === "KEYWORD_REJECTED";
      this.incrementAggregate(scopeKey, isPositive, isNegative, now);
    }

    // 3. Recommendation Type aggregate
    if (event.recommendationType) {
      const scopeKey = `rec_type:${event.recommendationType.toLowerCase().trim()}`;
      const isPositive = event.outcome === "ACCEPTED" || event.outcome === "USEFUL";
      const isNegative = event.outcome === "REJECTED" || event.outcome === "NOT_USEFUL";
      this.incrementAggregate(scopeKey, isPositive, isNegative, now);
    }
  }

  private incrementAggregate(scopeKey: string, isPositive: boolean, isNegative: boolean, timestamp: string): void {
    const aggId = this.generateAggregateId(scopeKey);
    let agg = this.aggregates.get(scopeKey);

    if (!agg) {
      agg = {
        aggregateId: aggId,
        scopeKey,
        positiveSignals: isPositive ? 1 : 0,
        negativeSignals: isNegative ? 1 : 0,
        totalObservations: 1,
        weightedScore: isPositive ? 1.0 : isNegative ? -1.0 : 0.0,
        firstObservedAt: timestamp,
        lastObservedAt: timestamp,
        updatedAt: timestamp
      };
    } else {
      agg.totalObservations += 1;
      if (isPositive) agg.positiveSignals += 1;
      if (isNegative) agg.negativeSignals += 1;
      
      const net = agg.positiveSignals - agg.negativeSignals;
      agg.weightedScore = agg.totalObservations > 0 ? Number((net / agg.totalObservations).toFixed(3)) : 0;
      agg.lastObservedAt = timestamp;
      agg.updatedAt = timestamp;
    }

    this.aggregates.set(scopeKey, agg);
  }

  public getEventsByUser(userId: string): LearningEvent[] {
    return [...(this.userEvents.get(userId) || [])];
  }

  public getGlobalEvents(): LearningEvent[] {
    return [...this.events];
  }

  public getAggregates(): LearningAggregate[] {
    return Array.from(this.aggregates.values());
  }

  public getAggregate(scopeKey: string): LearningAggregate | null {
    return this.aggregates.get(scopeKey.toLowerCase().trim()) || null;
  }

  /**
   * Generates a personalized user learning profile based on interaction patterns.
   * Does NOT expose private resume text or unverified qualifications.
   */
  public getUserLearningProfile(userId: string): UserLearningProfile {
    const userEvts = this.userEvents.get(userId) || [];
    const roleFamilyCounts = new Map<string, number>();
    const specCounts = new Map<string, number>();
    const missingSkillCounts = new Map<string, number>();

    let accepted = 0;
    let rejected = 0;

    for (const evt of userEvts) {
      if (evt.roleFamily) {
        roleFamilyCounts.set(evt.roleFamily, (roleFamilyCounts.get(evt.roleFamily) || 0) + 1);
      }
      if (evt.specialization) {
        specCounts.set(evt.specialization, (specCounts.get(evt.specialization) || 0) + 1);
      }
      if (evt.eventType === "GAP_IDENTIFIED" && evt.skillName) {
        missingSkillCounts.set(evt.skillName, (missingSkillCounts.get(evt.skillName) || 0) + 1);
      }
      if (evt.outcome === "ACCEPTED" || evt.outcome === "USEFUL" || evt.eventType === "TAILORING_ACCEPTED" || evt.eventType === "RECOMMENDATION_ACCEPTED") {
        accepted++;
      } else if (evt.outcome === "REJECTED" || evt.outcome === "NOT_USEFUL" || evt.eventType === "TAILORING_REJECTED" || evt.eventType === "RECOMMENDATION_REJECTED") {
        rejected++;
      }
    }

    const topFamilies = Array.from(roleFamilyCounts.entries())
      .map(([family, count]) => ({ family, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    const topSpecs = Array.from(specCounts.entries())
      .map(([specialization, count]) => ({ specialization, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    const frequentMissing = Array.from(missingSkillCounts.entries())
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const totalDecisionEvents = accepted + rejected;
    const acceptanceRate = totalDecisionEvents > 0 ? Math.round((accepted / totalDecisionEvents) * 100) : 0;

    const lastActiveAt = userEvts.length > 0 ? userEvts[userEvts.length - 1].timestamp : new Date().toISOString();

    return {
      userId,
      topRoleFamilies: topFamilies,
      topSpecializations: topSpecs,
      totalAnalyses: userEvts.filter(e => e.eventType === "ATS_ANALYSIS_PERFORMED").length,
      acceptanceRate,
      frequentMissingSkills: frequentMissing,
      lastActiveAt,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Returns current learning model status and metadata.
   */
  public getModelMetadata(): ModelMetadata {
    const totalEvents = this.events.length;
    let status: LearningModelStatus = "COLD_START";
    if (totalEvents >= 100) {
      status = "MATURE";
    } else if (totalEvents >= 5) {
      status = "LEARNING";
    }

    let accepted = 0;
    let evaluated = 0;
    for (const e of this.events) {
      if (e.outcome === "ACCEPTED" || e.outcome === "USEFUL") {
        accepted++;
        evaluated++;
      } else if (e.outcome === "REJECTED" || e.outcome === "NOT_USEFUL") {
        evaluated++;
      }
    }

    const globalAcceptanceRate = evaluated > 0 ? Math.round((accepted / evaluated) * 100) : 0;

    return {
      modelVersion: CURRENT_MODEL_VERSION,
      featureVersion: CURRENT_FEATURE_VERSION,
      trainingDataVersion: CURRENT_TRAINING_VERSION,
      totalEventsProcessed: totalEvents,
      globalAcceptanceRate,
      status,
      updatedAt: new Date().toISOString()
    };
  }

  public clear(): void {
    this.events = [];
    this.aggregates.clear();
    this.userEvents.clear();
  }
}

export const globalLearningEventStore = new LearningEventStore();
