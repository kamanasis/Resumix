import { RequirementTrend, RequirementTrendDirection } from "../../types";
import { JobWithSnapshot, calculateRequirementFrequencies } from "./frequencyEngine";

// ============================================================================
// RESUMIX STAGE 7: TEMPORAL REQUIREMENT TREND ENGINE
// ============================================================================
// Detects statistical shifts across job postings over time.
// Compares earlier vs later snapshots to classify trends into:
// TRENDING_UP, TRENDING_DOWN, STABLE, or INSUFFICIENT_DATA.
// Strictly non-causal: describes empirical frequency change without speculative explanation.
// ============================================================================

/**
 * Normalizes input items into common structure for trend calculation.
 */
function normalizeTrendItems(items: any[]): { timestamp: number; requirements: string[] }[] {
  return items.map(item => {
    const rawTime = item.observedAt || item.retrievedAt || item.snapshot?.retrievedAt || item.job?.createdAt || item.postedAt;
    const timestamp = rawTime ? new Date(rawTime).getTime() : Date.now();

    let requirements: string[] = [];
    if (Array.isArray(item.requirementsSummary)) {
      requirements = item.requirementsSummary;
    } else if (item.snapshot?.requirements) {
      requirements = item.snapshot.requirements.map((r: any) => r.canonicalName || r.name);
    } else if (item.requirements) {
      requirements = item.requirements.map((r: any) => r.canonicalName || r.name);
    } else if (item.job?.requirements) {
      requirements = item.job.requirements.map((r: any) => r.canonicalName || r.name);
    }

    return { timestamp, requirements };
  });
}

/**
 * Calculates temporal trends by splitting jobs chronologically.
 */
export function calculateRequirementTrends(
  items: (JobWithSnapshot | any)[]
): RequirementTrend[] {
  if (!items || items.length === 0) {
    return [];
  }

  const normalized = normalizeTrendItems(items);

  // Calculate time window in days
  const timestamps = normalized.map(n => n.timestamp).filter(t => !isNaN(t));
  const minTime = timestamps.length > 0 ? Math.min(...timestamps) : Date.now();
  const maxTime = timestamps.length > 0 ? Math.max(...timestamps) : Date.now();
  const timeWindowDays = Math.round(Math.abs(maxTime - minTime) / 86400000);

  if (normalized.length < 2) {
    // Insufficient sample size for temporal split
    const allReqs = Array.from(new Set(normalized.flatMap(n => n.requirements.map(r => r.toLowerCase()))));
    return allReqs.map(name => ({
      canonicalName: name,
      requirementName: name,
      direction: "INSUFFICIENT_DATA" as RequirementTrendDirection,
      historicalFrequency: 1.0,
      recentFrequency: 1.0,
      delta: 0,
      changePercentage: 0,
      timeWindowDays
    }));
  }

  // Sort items chronologically
  const sorted = [...normalized].sort((a, b) => a.timestamp - b.timestamp);

  const midpoint = Math.floor(sorted.length / 2);
  const olderGroup = sorted.slice(0, midpoint);
  const newerGroup = sorted.slice(midpoint);

  // Helper to calculate frequencies for a group
  const calcFreqs = (group: { requirements: string[] }[]) => {
    const counts = new Map<string, { original: string; count: number }>();
    for (const item of group) {
      const seen = new Set<string>();
      for (const req of item.requirements) {
        const key = req.toLowerCase().trim();
        if (!counts.has(key)) counts.set(key, { original: req, count: 0 });
        if (!seen.has(key)) {
          seen.add(key);
          counts.get(key)!.count += 1;
        }
      }
    }
    const map = new Map<string, number>();
    for (const [key, val] of counts.entries()) {
      map.set(key, group.length > 0 ? val.count / group.length : 0);
    }
    return { counts, map };
  };

  const older = calcFreqs(olderGroup);
  const newer = calcFreqs(newerGroup);

  const allKeys = new Set([...older.map.keys(), ...newer.map.keys()]);
  const trends: RequirementTrend[] = [];

  for (const key of allKeys) {
    const histFreq = older.map.get(key) || 0;
    const recFreq = newer.map.get(key) || 0;
    const delta = Math.round((recFreq - histFreq) * 1000) / 1000;
    const changePercentage = Math.round(delta * 100);

    let direction: RequirementTrendDirection = "STABLE";
    if (changePercentage > 10) {
      direction = "TRENDING_UP";
    } else if (changePercentage < -10) {
      direction = "TRENDING_DOWN";
    }

    const originalName = newer.counts.get(key)?.original || older.counts.get(key)?.original || key;

    trends.push({
      canonicalName: originalName,
      requirementName: originalName.toLowerCase(),
      direction,
      historicalFrequency: histFreq,
      recentFrequency: recFreq,
      delta,
      changePercentage,
      timeWindowDays
    });
  }

  // Sort by highest absolute delta
  trends.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return trends;
}
