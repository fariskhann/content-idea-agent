"use client";

const STORAGE_KEY = "cia_transcript_usage_v1";
const MAX_ENTRIES = 1000;

/** Supadata's free tier as of writing — see Settings for where this is surfaced. */
export const SUPADATA_FREE_TIER_LIMIT = 100;

export function loadTranscriptLog(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTranscriptLog(log: number[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log.slice(-MAX_ENTRIES)));
  } catch {
    // ignore quota errors
  }
}

export interface SupadataUsageSummary {
  used: number;
  limit: number;
  resetDate: Date;
  daysUntilReset: number;
}

/** Estimates the current billing-cycle window from a day-of-month anchor. This is a local guess, not authoritative — Supadata doesn't expose a usage/quota endpoint. */
export function computeSupadataUsage(log: number[], resetDay: number, now: Date = new Date()): SupadataUsageSummary {
  const day = Math.min(Math.max(resetDay || 1, 1), 28);
  const cycleStart = new Date(now.getFullYear(), now.getMonth(), day);
  if (cycleStart > now) cycleStart.setMonth(cycleStart.getMonth() - 1);
  const resetDate = new Date(cycleStart);
  resetDate.setMonth(resetDate.getMonth() + 1);

  const used = log.filter((ts) => ts >= cycleStart.getTime()).length;
  const daysUntilReset = Math.max(0, Math.ceil((resetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  return { used, limit: SUPADATA_FREE_TIER_LIMIT, resetDate, daysUntilReset };
}
