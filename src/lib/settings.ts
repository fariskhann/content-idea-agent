"use client";

const KEY = "cia_settings_v1";

export interface Settings {
  anthropicApiKey: string;
  youtubeApiKey: string;
}

const empty: Settings = { anthropicApiKey: "", youtubeApiKey: "" };

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
