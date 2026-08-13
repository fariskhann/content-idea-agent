"use client";

const STORAGE_KEY = "cia_transcript_usage_v1";
const BACKUP_STORAGE_KEY = "cia_transcript_usage_backup_v1";
const MAX_ENTRIES = 1000;

/** Supadata's free tier as of writing — see Settings for where this is surfaced. */
export const SUPADATA_FREE_TIER_LIMIT = 100;

function loadLog(key: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLog(key: string, log: number[]) {
  try {
    localStorage.setItem(key, JSON.stringify(log.slice(-MAX_ENTRIES)));
  } catch {
    // ignore quota errors
  }
}

export function loadTranscriptLog(): number[] {
  return loadLog(STORAGE_KEY);
}

export function saveTranscriptLog(log: number[]) {
  saveLog(STORAGE_KEY, log);
}

export function loadTranscriptBackupLog(): number[] {
  return loadLog(BACKUP_STORAGE_KEY);
}

export function saveTranscriptBackupLog(log: number[]) {
  saveLog(BACKUP_STORAGE_KEY, log);
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
