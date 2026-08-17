export interface ApifyLogEntry {
  ts: number;
  costUsd: number;
}

/** Apify's Free-plan monthly platform credit as of writing — see Settings for where this is surfaced. */
export const APIFY_FREE_TIER_USD = 5;

export interface ApifyUsageSummary {
  usedUsd: number;
  limitUsd: number;
  resetDate: Date;
  daysUntilReset: number;
}

/** Estimates the current billing-cycle window from a day-of-month anchor, summing estimated spend within it. This is a local guess, not authoritative — Apify's real invoice may differ. */
export function computeApifyUsage(log: ApifyLogEntry[], resetDay: number, now: Date = new Date()): ApifyUsageSummary {
  const day = Math.min(Math.max(resetDay || 1, 1), 28);
  const cycleStart = new Date(now.getFullYear(), now.getMonth(), day);
  if (cycleStart > now) cycleStart.setMonth(cycleStart.getMonth() - 1);
  const resetDate = new Date(cycleStart);
  resetDate.setMonth(resetDate.getMonth() + 1);

  const usedUsd = log.filter((e) => e.ts >= cycleStart.getTime()).reduce((sum, e) => sum + e.costUsd, 0);
  const daysUntilReset = Math.max(0, Math.ceil((resetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  return { usedUsd, limitUsd: APIFY_FREE_TIER_USD, resetDate, daysUntilReset };
}
