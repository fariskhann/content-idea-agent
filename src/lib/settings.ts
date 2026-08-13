"use client";

const KEY = "cia_settings_v1";

export interface Settings {
  anthropicApiKey: string;
  deepseekApiKey: string;
  youtubeApiKey: string;
  supadataApiKey: string;
  /** Day of month (1-28) Supadata's free-tier credits renew — used only to estimate the local usage counter. */
  supadataResetDay: number;
}

const empty: Settings = { anthropicApiKey: "", deepseekApiKey: "", youtubeApiKey: "", supadataApiKey: "", supadataResetDay: 0 };

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

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
