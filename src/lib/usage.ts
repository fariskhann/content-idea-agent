import type { Provider } from "./models";

export interface UsageLogEntry {
  id: string;
  timestamp: number;
  feature:
    | "generate"
    | "script"
    | "evaluate-idea"
    | "evaluate-script"
    | "revise-idea"
    | "distill-evaluations"
    | "youtube-analysis"
    | "library-distill"
    | "tiktok-fetch"
    | "instagram-fetch"
    | "tiktok-analysis"
    | "instagram-analysis";
  provider: Provider;
  modelId: string;
  modelLabel: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const STORAGE_KEY = "cia_usage_v1";

/** Reads the legacy localStorage copy — used only for the one-time migration into Supabase (see AppContext.tsx). */
export function loadUsageLog(): UsageLogEntry[] {
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

export interface UsageTotals {
  allTimeCostUsd: number;
  todayCostUsd: number;
  callCount: number;
  byModel: { modelId: string; modelLabel: string; provider: Provider; calls: number; costUsd: number }[];
}

export function computeTotals(log: UsageLogEntry[]): UsageTotals {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayCutoff = startOfToday.getTime();

  let allTimeCostUsd = 0;
  let todayCostUsd = 0;
  const byModelMap = new Map<string, { modelId: string; modelLabel: string; provider: Provider; calls: number; costUsd: number }>();

  for (const entry of log) {
    allTimeCostUsd += entry.costUsd;
    if (entry.timestamp >= todayCutoff) todayCostUsd += entry.costUsd;
    const existing = byModelMap.get(entry.modelId);
    if (existing) {
      existing.calls += 1;
      existing.costUsd += entry.costUsd;
    } else {
      byModelMap.set(entry.modelId, { modelId: entry.modelId, modelLabel: entry.modelLabel, provider: entry.provider, calls: 1, costUsd: entry.costUsd });
    }
  }

  return {
    allTimeCostUsd,
    todayCostUsd,
    callCount: log.length,
    byModel: Array.from(byModelMap.values()).sort((a, b) => b.costUsd - a.costUsd),
  };
}

export function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
