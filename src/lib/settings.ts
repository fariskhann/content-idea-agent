"use client";

const KEY = "cia_settings_v1";

export interface Settings {
  anthropicApiKey: string;
  deepseekApiKey: string;
  youtubeApiKey: string;
  /** The key actually used for transcript calls. */
  supadataApiKey: string;
  /** Day of month (1-28) this key's plan renews — used only to estimate the local usage counter. */
  supadataResetDay: number;
  /** A second Supadata key (separate account) kept on standby — swap it into the primary slot via Settings. Never used for calls while in this slot. */
  supadataBackupApiKey: string;
  supadataBackupResetDay: number;
}

const empty: Settings = {
  anthropicApiKey: "",
  deepseekApiKey: "",
  youtubeApiKey: "",
  supadataApiKey: "",
  supadataResetDay: 0,
  supadataBackupApiKey: "",
  supadataBackupResetDay: 0,
};

/** Reads the legacy localStorage copy — used only for the one-time migration into Supabase (see AppContext.tsx). */
export function loadSettings(): Settings {
  if (typeof window === "undefined") return empty;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    return { ...empty, ...parsed };
  } catch {
    return empty;
  }
}
