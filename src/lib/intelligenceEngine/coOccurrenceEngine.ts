import { JobWithSnapshot } from "./frequencyEngine";
import { EvidenceClaimType } from "../../types";

// ============================================================================
// RESUMIX STAGE 7: SKILL CO-OCCURRENCE ENGINE
// ============================================================================
// Analyzes statistical co-occurrences of skills across real job postings.
// STRICT PROHIBITION: Never infer architectural or policy causation.
// Reporting co-occurrence describes empirical coexistence, not causal requirement.
// ============================================================================

export interface SkillCoOccurrence {
  skills: [string, string];
  requirementA: string;
  requirementB: string;
  count: number;
  coOccurrenceCount: number;
  percentage: number; // 0.0 to 1.0
  coOccurrencePercentage: number; // 0 to 100
  evidenceClaimType: EvidenceClaimType;
}

/**
 * Calculates top skill co-occurrences across a set of jobs.
 */
export function calculateCoOccurrences(
  items: (JobWithSnapshot | any)[],
  minCount: number = 1,
  topN: number = 20
): SkillCoOccurrence[] {
  const totalJobs = items.length;
  if (totalJobs < 2) return [];

  const pairCounts = new Map<string, { skills: [string, string]; count: number }>();

  for (const item of items) {
    const job = item.job || item;
    const snapshot = item.snapshot || item;
    const requirements = snapshot.requirements || job.requirements || [];

    const uniqueSkills = Array.from(new Set(
      requirements.map((r: any) => (r.canonicalName || r.name || "").toLowerCase().trim()).filter(Boolean)
    )).sort();

    // Generate unique pairwise combinations
    for (let i = 0; i < uniqueSkills.length; i++) {
      for (let j = i + 1; j < uniqueSkills.length; j++) {
        const skillA = uniqueSkills[i];
        const skillB = uniqueSkills[j];
        const pairKey = `${skillA}|||${skillB}`;

        if (!pairCounts.has(pairKey)) {
          pairCounts.set(pairKey, { skills: [skillA, skillB] as [string, string], count: 0 });
        }
        pairCounts.get(pairKey)!.count += 1;
      }
    }
  }

  const results: SkillCoOccurrence[] = [];

  for (const pair of pairCounts.values()) {
    if (pair.count < minCount) continue;

    const percentage = totalJobs > 0
      ? Math.min(1.0, Math.max(0.0, Math.round((pair.count / totalJobs) * 1000) / 1000))
      : 0;
    const coOccurrencePercentage = Math.round(percentage * 100);

    results.push({
      skills: pair.skills,
      requirementA: pair.skills[0],
      requirementB: pair.skills[1],
      count: pair.count,
      coOccurrenceCount: pair.count,
      percentage,
      coOccurrencePercentage,
      evidenceClaimType: "STATISTICAL_CO_OCCURRENCE"
    });
  }

  // Sort by highest co-occurrence count descending
  results.sort((a, b) => b.count - a.count);

  return results.slice(0, topN);
}

export const calculateSkillCoOccurrences = calculateCoOccurrences;
