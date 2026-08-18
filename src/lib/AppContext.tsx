"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { genId } from "./id";
import { defaultSeed } from "./seed";
import { loadSettings, empty as defaultSettings, type Settings } from "./settings";
import {
  buildEvaluatePrompt,
  buildEvaluationDistillationPrompt,
  buildReviseIdeaPrompt,
  buildScriptEvaluatePrompt,
  buildScriptPrompt,
  buildSmartAiGeneratePromptForCategory,
  buildSmartAiGeneratePromptGeneric,
} from "./generation";
import { complete, parseJsonArray, parseJsonObject } from "./ai";
import { getModel, costUsd, providerLabel } from "./models";
import { loadUsageLog, type UsageLogEntry } from "./usage";
import { loadTranscriptLog, loadTranscriptBackupLog } from "./transcriptUsage";
import type { ApifyLogEntry } from "./apifyUsage";
import { supabase } from "./supabaseClient";
import { fetchUserRow, insertUserRow, updateAppData, updateSettingsRow, updateUsageLog, updateTranscriptLogs, updateApifyLogs, type UserDataRow } from "./db";
import type {
  AppData,
  Category,
  GenerationBatch,
  Idea,
  IdeaStatus,
  Inspiration,
  InspirationPlatform,
  LibraryEntry,
  Platform,
  PlatformGroup,
  TabId,
} from "./types";

const STORAGE_KEY = "cia_v1";

/** Legacy Inspiration rows may still carry the old merged "IGTikTok" value (or anything else unrecognized) from before Inspiration.platform became a real 3-way YouTube/Instagram/TikTok value — infer from the saved link/handle where possible, since that's a strictly-better-than-arbitrary guess and still easy to correct via the dropdown if wrong. */
function normalizeInspirationPlatform(i: Inspiration): InspirationPlatform {
  if (i.platform === "YouTube" || i.platform === "Instagram" || i.platform === "TikTok") return i.platform;
  const text = `${i.link} ${i.handle}`.toLowerCase();
  if (text.includes("tiktok.com")) return "TikTok";
  if (text.includes("instagram.com")) return "Instagram";
  return "Instagram";
}

/** Backfills Category.platform / Inspiration.platform for data saved before those fields existed (or before Inspiration.platform was narrowed to just YouTube/IGTikTok, and later split back into a real 3-way YouTube/Instagram/TikTok value), and Idea.order for ideas saved before drag-and-drop reordering existed — non-destructive, idempotent. Run on every load, not just migration, since already-migrated DB rows can predate any of these fields. */
function normalizePlatformGroups(data: AppData): AppData {
  return {
    ...data,
    categories: (data.categories || []).map((c) => ({
      ...c,
      platform: c.platform === "YouTube" || c.platform === "IGTikTok" ? c.platform : "YouTube",
    })),
    inspirations: (data.inspirations || []).map((i) => ({
      ...i,
      platform: normalizeInspirationPlatform(i),
    })),
    ideas: (data.ideas || []).map((i) => (i.order !== undefined ? i : { ...i, order: i.createdAt })),
  };
}

/** Maps 1-indexed numeric library citation refs from an AI response onto real LibraryEntry.id values, deduping. Shared by generation (candidate.libraryEntryIds) and standalone evaluation (evaluation.libraryEntryIds). */
function resolveLibraryRefs(refs: unknown, entries: LibraryEntry[]): string[] {
  if (!Array.isArray(refs)) return [];
  const ids = refs.map((n) => (typeof n === "number" ? entries[n - 1]?.id : undefined)).filter((id): id is string => !!id);
  return Array.from(new Set(ids));
}

interface AiGenParsedItem {
  title?: string;
  hook?: string;
  notes?: string;
  category?: string;
  format?: string;
  structure?: string;
  platform?: Platform;
  libraryRefs?: number[];
  concerns?: string;
}

/** One AI-generated candidate awaiting approval, before it becomes a real Idea. */
interface PendingCandidate {
  tempId: string;
  title: string;
  hook: string;
  notes: string;
  format: string;
  structure: string;
  platform: Platform;
  categoryId: string;
  libraryEntryIds: string[];
  concerns: string;
  approved: boolean;
}

/** A smart-mode generation result awaiting review — nothing here is persisted until commitGenerationBatch runs. */
interface PendingGenerationBatch {
  batchName: string;
  candidates: PendingCandidate[];
  categoryId: string;
  platformGroup: PlatformGroup;
  context: string;
  max: number;
}

/** One AI-proposed recurring-pattern Library entry awaiting review, before commitDistillBatch saves it. Unlike PendingCandidate, text is directly editable here. */
interface PendingDistillationCandidate {
  tempId: string;
  text: string;
  categoryIds: string[];
  sourceIdeaIds: string[];
  approved: boolean;
}

/** An evaluation-distillation result awaiting review — nothing here is persisted until commitDistillBatch runs. */
interface PendingDistillationBatch {
  candidates: PendingDistillationCandidate[];
  /** "" = distilled across all categories in platformGroup ("General" scope). */
  categoryId: string;
  platformGroup: PlatformGroup;
}

interface AppState {
  data: AppData;
  activeTab: TabId;
  genCategory: string;
  genPlatformGroup: PlatformGroup;
  activeFrameworksPlatform: PlatformGroup;
  activeBoardPlatform: "All" | "YouTube" | "IGTikTok";
  genContext: string;
  genPendingBatch: PendingGenerationBatch | null;
  generating: boolean;
  genError: string;
  justGenerated: boolean;
  expandedIds: Record<string, boolean>;
  expandedSiblingIds: Record<string, boolean>;
  scriptGeneratingIds: Record<string, boolean>;
  scriptRegenOpenIds: Record<string, boolean>;
  scriptRegenNotes: Record<string, string>;
  expandedCategoryIds: Record<string, boolean>;
  evaluatingIds: Record<string, boolean>;
  evaluationErrors: Record<string, string>;
  scriptEvaluatingIds: Record<string, boolean>;
  scriptEvaluationErrors: Record<string, string>;
  ideaRegenOpenIds: Record<string, boolean>;
  ideaRegenNotes: Record<string, string>;
  revisingIdeaIds: Record<string, boolean>;
  ideaRevisionErrors: Record<string, string>;
  distillPendingBatch: PendingDistillationBatch | null;
  distilling: boolean;
  distillError: string;
  settings: Settings;
  settingsOpen: boolean;
  usageLog: UsageLogEntry[];
  usageDialogOpen: boolean;
  transcriptLog: number[];
  transcriptBackupLog: number[];
  apifyLog: ApifyLogEntry[];
  apifyBackupLog: ApifyLogEntry[];
}

function initialAppState(): AppState {
  return {
    data: defaultSeed(),
    activeTab: "generate",
    genCategory: "all",
    genPlatformGroup: "YouTube",
    activeFrameworksPlatform: "YouTube",
    activeBoardPlatform: "All",
    genContext: "",
    genPendingBatch: null,
    generating: false,
    genError: "",
    justGenerated: false,
    expandedIds: {},
    expandedSiblingIds: {},
    scriptGeneratingIds: {},
    scriptRegenOpenIds: {},
    scriptRegenNotes: {},
    expandedCategoryIds: {},
    evaluatingIds: {},
    evaluationErrors: {},
    scriptEvaluatingIds: {},
    scriptEvaluationErrors: {},
    ideaRegenOpenIds: {},
    ideaRegenNotes: {},
    revisingIdeaIds: {},
    ideaRevisionErrors: {},
    distillPendingBatch: null,
    distilling: false,
    distillError: "",
    settings: {
      anthropicApiKey: "",
      deepseekApiKey: "",
      youtubeApiKey: "",
      apifyApiKey: "",
      apifyResetDay: 0,
      apifyBackupApiKey: "",
      apifyBackupResetDay: 0,
      supadataApiKey: "",
      supadataResetDay: 0,
      supadataBackupApiKey: "",
      supadataBackupResetDay: 0,
    },
    settingsOpen: false,
    usageLog: [],
    usageDialogOpen: false,
    transcriptLog: [],
    transcriptBackupLog: [],
    apifyLog: [],
    apifyBackupLog: [],
  };
}

type Ctx = ReturnType<typeof useAppStore>;
const AppCtx = createContext<Ctx | null>(null);

function useAppStore() {
  const [state, setState] = useState<AppState>(initialAppState);
  const [hydrated, setHydrated] = useState(false);
  const userIdRef = useRef<string | null>(null);

  // Debounced app_data / settings writes to Supabase — mutation callbacks fire on every keystroke,
  // so writing straight through on every call would hammer the network. usage/transcript logs are
  // event-driven (one write per AI call / transcript fetch / button click), so they write immediately.
  const appDataTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAppDataRef = useRef<AppData | null>(null);
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSettingsRef = useRef<Settings | null>(null);

  const persist = useCallback((data: AppData) => {
    if (!userIdRef.current) return;
    pendingAppDataRef.current = data;
    if (appDataTimerRef.current) clearTimeout(appDataTimerRef.current);
    appDataTimerRef.current = setTimeout(() => {
      appDataTimerRef.current = null;
      const toSave = pendingAppDataRef.current;
      pendingAppDataRef.current = null;
      if (toSave && userIdRef.current) updateAppData(userIdRef.current, toSave).catch(() => {});
    }, 800);
  }, []);

  const persistSettings = useCallback((settings: Settings) => {
    if (!userIdRef.current) return;
    pendingSettingsRef.current = settings;
    if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
    settingsTimerRef.current = setTimeout(() => {
      settingsTimerRef.current = null;
      const toSave = pendingSettingsRef.current;
      pendingSettingsRef.current = null;
      if (toSave && userIdRef.current) updateSettingsRow(userIdRef.current, toSave).catch(() => {});
    }, 800);
  }, []);

  // Flush any pending debounced writes immediately when the tab is hidden/closed, so a stray
  // 800ms window doesn't lose the last edit.
  useEffect(() => {
    const flush = () => {
      if (appDataTimerRef.current) {
        clearTimeout(appDataTimerRef.current);
        appDataTimerRef.current = null;
        if (pendingAppDataRef.current && userIdRef.current) updateAppData(userIdRef.current, pendingAppDataRef.current).catch(() => {});
        pendingAppDataRef.current = null;
      }
      if (settingsTimerRef.current) {
        clearTimeout(settingsTimerRef.current);
        settingsTimerRef.current = null;
        if (pendingSettingsRef.current && userIdRef.current) updateSettingsRow(userIdRef.current, pendingSettingsRef.current).catch(() => {});
        pendingSettingsRef.current = null;
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) flush();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);

  // Load the signed-in user's row from Supabase once on mount (AppProvider only ever mounts once
  // AuthGate has confirmed a session). On first-ever load with no row yet, migrate whatever's in
  // this browser's localStorage (if any) into the database, then use that as the initial row.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      userIdRef.current = user.id;

      let row: UserDataRow | null;
      try {
        row = await fetchUserRow(user.id);
      } catch {
        if (!cancelled) setState((s) => ({ ...s, genError: "Failed to load your data — check your connection and reload." }));
        return;
      }

      if (!row) {
        let legacyAppData: AppData | null = null;
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const saved = JSON.parse(raw);
            if (saved && Array.isArray(saved.categories)) legacyAppData = saved;
          }
        } catch {
          // ignore corrupt storage
        }
        row = {
          app_data: legacyAppData ? { ...defaultSeed(), ...legacyAppData } : defaultSeed(),
          settings: loadSettings(),
          usage_log: loadUsageLog(),
          transcript_log: loadTranscriptLog(),
          transcript_backup_log: loadTranscriptBackupLog(),
          apify_log: [],
          apify_backup_log: [],
        };
        try {
          await insertUserRow(user.id, row);
        } catch {
          if (!cancelled) setState((s) => ({ ...s, genError: "Failed to save your migrated data — check your connection and reload." }));
          return;
        }
      }

      if (cancelled) return;
      setState((s) => ({
        ...s,
        data: { ...s.data, ...normalizePlatformGroups(row!.app_data) },
        settings: { ...defaultSettings, ...row!.settings },
        usageLog: row!.usage_log,
        transcriptLog: row!.transcript_log ?? [],
        transcriptBackupLog: row!.transcript_backup_log ?? [],
        apifyLog: row!.apify_log ?? [],
        apifyBackupLog: row!.apify_backup_log ?? [],
      }));
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setData = useCallback(
    (updater: (d: AppData) => AppData) => {
      setState((s) => {
        const data = updater(s.data);
        persist(data);
        return { ...s, data };
      });
    },
    [persist]
  );

  // ---- brand / personal outline ----
  const setBrandField = useCallback(
    (field: keyof AppData) => (value: string) => setData((d) => ({ ...d, [field]: value })),
    [setData]
  );

  const addBrandPillar = useCallback(() => setData((d) => ({ ...d, brandPillars: [...d.brandPillars, { id: genId(), text: "" }] })), [setData]);
  const updateBrandPillar = useCallback(
    (id: string, text: string) => setData((d) => ({ ...d, brandPillars: d.brandPillars.map((p) => (p.id === id ? { ...p, text } : p)) })),
    [setData]
  );
  const removeBrandPillar = useCallback((id: string) => setData((d) => ({ ...d, brandPillars: d.brandPillars.filter((p) => p.id !== id) })), [setData]);

  const addPersonalTrait = useCallback(() => setData((d) => ({ ...d, personalTraits: [...d.personalTraits, { id: genId(), text: "" }] })), [setData]);
  const updatePersonalTrait = useCallback(
    (id: string, text: string) => setData((d) => ({ ...d, personalTraits: d.personalTraits.map((p) => (p.id === id ? { ...p, text } : p)) })),
    [setData]
  );
  const removePersonalTrait = useCallback((id: string) => setData((d) => ({ ...d, personalTraits: d.personalTraits.filter((p) => p.id !== id) })), [setData]);

  // ---- categories / frameworks ----
  const updateCategoryField = useCallback(
    <K extends keyof Category>(catId: string, field: K, value: Category[K]) =>
      setData((d) => ({ ...d, categories: d.categories.map((c) => (c.id === catId ? { ...c, [field]: value } : c)) })),
    [setData]
  );
  const addCategory = useCallback(
    (platform: PlatformGroup) =>
      setData((d) => ({
        ...d,
        categories: [
          ...d.categories,
          { id: genId(), name: "New content type", platform, stage: "TOF", owner: "brand", desc: "", structures: [], angles: [] },
        ],
      })),
    [setData]
  );
  const removeCategory = useCallback((id: string) => setData((d) => ({ ...d, categories: d.categories.filter((c) => c.id !== id) })), [setData]);

  const addStructure = useCallback(
    (catId: string) =>
      setData((d) => ({
        ...d,
        categories: d.categories.map((c) => (c.id === catId ? { ...c, structures: [...c.structures, { id: genId(), text: "" }] } : c)),
      })),
    [setData]
  );
  const updateStructure = useCallback(
    (catId: string, structId: string, text: string) =>
      setData((d) => ({
        ...d,
        categories: d.categories.map((c) =>
          c.id === catId ? { ...c, structures: c.structures.map((st) => (st.id === structId ? { ...st, text } : st)) } : c
        ),
      })),
    [setData]
  );
  const removeStructure = useCallback(
    (catId: string, structId: string) =>
      setData((d) => ({
        ...d,
        categories: d.categories.map((c) => (c.id === catId ? { ...c, structures: c.structures.filter((st) => st.id !== structId) } : c)),
      })),
    [setData]
  );

  const addAngle = useCallback(
    (catId: string) =>
      setData((d) => ({
        ...d,
        categories: d.categories.map((c) => (c.id === catId ? { ...c, angles: [...c.angles, { id: genId(), name: "New format", structure: "" }] } : c)),
      })),
    [setData]
  );
  const updateAngleField = useCallback(
    (catId: string, angleId: string, field: "name" | "structure", value: string) =>
      setData((d) => ({
        ...d,
        categories: d.categories.map((c) =>
          c.id === catId ? { ...c, angles: c.angles.map((a) => (a.id === angleId ? { ...a, [field]: value } : a)) } : c
        ),
      })),
    [setData]
  );
  const removeAngle = useCallback(
    (catId: string, angleId: string) =>
      setData((d) => ({ ...d, categories: d.categories.map((c) => (c.id === catId ? { ...c, angles: c.angles.filter((a) => a.id !== angleId) } : c)) })),
    [setData]
  );

  // ---- hooks ----
  const addHook = useCallback(() => setData((d) => ({ ...d, hooks: [...d.hooks, { id: genId(), text: "New hook formula" }] })), [setData]);
  const updateHook = useCallback((id: string, text: string) => setData((d) => ({ ...d, hooks: d.hooks.map((h) => (h.id === id ? { ...h, text } : h)) })), [setData]);
  const removeHook = useCallback((id: string) => setData((d) => ({ ...d, hooks: d.hooks.filter((h) => h.id !== id) })), [setData]);

  // ---- inspiration ----
  const addInspiration = useCallback(() => {
    const id = genId();
    setData((d) => ({
      ...d,
      inspirations: [{ id, name: "", handle: "", platform: "YouTube", link: "", tags: [], notes: "" }, ...d.inspirations],
    }));
    return id;
  }, [setData]);
  const updateInspiration = useCallback(
    <K extends keyof Inspiration>(id: string, field: K, value: Inspiration[K]) =>
      setData((d) => ({ ...d, inspirations: d.inspirations.map((i) => (i.id === id ? { ...i, [field]: value } : i)) })),
    [setData]
  );
  const toggleInspirationTag = useCallback(
    (id: string, catId: string) =>
      setData((d) => ({
        ...d,
        inspirations: d.inspirations.map((i) => {
          if (i.id !== id) return i;
          const has = i.tags.includes(catId);
          return { ...i, tags: has ? i.tags.filter((t) => t !== catId) : [...i.tags, catId] };
        }),
      })),
    [setData]
  );
  const removeInspiration = useCallback((id: string) => setData((d) => ({ ...d, inspirations: d.inspirations.filter((i) => i.id !== id) })), [setData]);

  // ---- ideas ----
  const addIdea = useCallback(
    (partial: Partial<Idea>) => {
      const idea: Idea = {
        id: genId(),
        title: "",
        hook: "",
        platform: "Any",
        categoryId: "",
        status: "idea",
        notes: "",
        link: "",
        script: "",
        isDraft: true,
        createdAt: Date.now(),
        order: Date.now(),
        ...partial,
      };
      setData((d) => ({ ...d, ideas: [idea, ...d.ideas] }));
    },
    [setData]
  );
  const updateIdea = useCallback(
    <K extends keyof Idea>(id: string, field: K, value: Idea[K]) =>
      setData((d) => ({ ...d, ideas: d.ideas.map((i) => (i.id === id ? { ...i, [field]: value, isDraft: false } : i)) })),
    [setData]
  );
  const setIdeaStatus = useCallback(
    (id: string, status: IdeaStatus) => setData((d) => ({ ...d, ideas: d.ideas.map((i) => (i.id === id ? { ...i, status } : i)) })),
    [setData]
  );
  /** Batched write for drag-and-drop: applies a full set of status+order changes in one setData call rather than one write per moved card. */
  const reorderIdeas = useCallback(
    (updates: { id: string; status: IdeaStatus; order: number }[]) =>
      setData((d) => ({
        ...d,
        ideas: d.ideas.map((i) => {
          const u = updates.find((x) => x.id === i.id);
          return u ? { ...i, status: u.status, order: u.order } : i;
        }),
      })),
    [setData]
  );
  const deleteIdea = useCallback((id: string) => setData((d) => ({ ...d, ideas: d.ideas.filter((i) => i.id !== id) })), [setData]);
  /** Clears ideas matching a status ("all" for every column) and the given board platform filter — mirrors whatever's currently visible on the board. */
  const clearIdeas = useCallback(
    (status: IdeaStatus | "all", platformFilter: "All" | "YouTube" | "IGTikTok") =>
      setData((d) => ({
        ...d,
        ideas: d.ideas.filter((i) => {
          const statusMatch = status === "all" || i.status === status;
          const platformMatch = platformFilter === "All" || (platformFilter === "YouTube" ? i.platform === "YouTube" : i.platform === "Instagram" || i.platform === "TikTok");
          return !(statusMatch && platformMatch);
        }),
      })),
    [setData]
  );
  const toggleIdeaExpand = useCallback((id: string) => setState((s) => ({ ...s, expandedIds: { ...s.expandedIds, [id]: !s.expandedIds[id] } })), []);
  const toggleCategoryExpand = useCallback(
    (id: string) => setState((s) => ({ ...s, expandedCategoryIds: { ...s.expandedCategoryIds, [id]: !s.expandedCategoryIds[id] } })),
    []
  );
  const toggleSiblingsExpand = useCallback(
    (id: string) => setState((s) => ({ ...s, expandedSiblingIds: { ...s.expandedSiblingIds, [id]: !s.expandedSiblingIds[id] } })),
    []
  );

  // ---- script regen panel ----
  const openRegenPanel = useCallback((id: string) => setState((s) => ({ ...s, scriptRegenOpenIds: { ...s.scriptRegenOpenIds, [id]: true } })), []);
  const closeRegenPanel = useCallback((id: string) => setState((s) => ({ ...s, scriptRegenOpenIds: { ...s.scriptRegenOpenIds, [id]: false } })), []);
  const setRegenNote = useCallback((id: string, value: string) => setState((s) => ({ ...s, scriptRegenNotes: { ...s.scriptRegenNotes, [id]: value } })), []);

  // ---- idea regen panel ("Apply feedback" on an idea evaluation) ----
  const openIdeaRegenPanel = useCallback((id: string) => setState((s) => ({ ...s, ideaRegenOpenIds: { ...s.ideaRegenOpenIds, [id]: true } })), []);
  const closeIdeaRegenPanel = useCallback((id: string) => setState((s) => ({ ...s, ideaRegenOpenIds: { ...s.ideaRegenOpenIds, [id]: false } })), []);
  const setIdeaRegenNote = useCallback((id: string, value: string) => setState((s) => ({ ...s, ideaRegenNotes: { ...s.ideaRegenNotes, [id]: value } })), []);

  // ---- usage / cost tracking ----
  const logUsage = useCallback((entry: Omit<UsageLogEntry, "id" | "timestamp">) => {
    setState((s) => {
      const usageLog = [{ ...entry, id: genId(), timestamp: Date.now() }, ...s.usageLog].slice(0, 500);
      if (userIdRef.current) updateUsageLog(userIdRef.current, usageLog).catch(() => {});
      return { ...s, usageLog };
    });
  }, []);
  const clearUsage = useCallback(() => {
    setState((s) => {
      if (userIdRef.current) updateUsageLog(userIdRef.current, []).catch(() => {});
      return { ...s, usageLog: [] };
    });
  }, []);
  const setUsageDialogOpen = useCallback((open: boolean) => setState((s) => ({ ...s, usageDialogOpen: open })), []);

  /** Logs one Supadata transcript call against the local free-tier estimate shown in Settings. */
  const logTranscriptFetch = useCallback(() => {
    setState((s) => {
      const transcriptLog = [...s.transcriptLog, Date.now()].slice(-1000);
      if (userIdRef.current) updateTranscriptLogs(userIdRef.current, transcriptLog, s.transcriptBackupLog).catch(() => {});
      return { ...s, transcriptLog };
    });
  }, []);

  /** Logs one Apify call's estimated cost against the local per-key cycle estimate shown in Settings. Call in addition to logUsage(), not instead of it. */
  const logApifySpend = useCallback((costUsd: number) => {
    setState((s) => {
      const apifyLog = [...s.apifyLog, { ts: Date.now(), costUsd }].slice(-1000);
      if (userIdRef.current) updateApifyLogs(userIdRef.current, apifyLog, s.apifyBackupLog).catch(() => {});
      return { ...s, apifyLog };
    });
  }, []);

  // ---- generation ----
  const aiGenerate = useCallback(async () => {
    const d = state.data;
    if (!state.genContext.trim()) {
      setState((s) => ({ ...s, genError: "Add a bit of context — rough is fine — so the AI can pick the right fit." }));
      return;
    }
    setState((s) => ({ ...s, generating: true, genError: "", justGenerated: false, genPendingBatch: null }));
    try {
      const cat = state.genCategory !== "all" ? d.categories.find((c) => c.id === state.genCategory) : null;
      const rounds = d.genBatchSize || 1;
      const model = getModel(d.aiModel);
      const apiKeys = { anthropicApiKey: state.settings.anthropicApiKey, deepseekApiKey: state.settings.deepseekApiKey };
      const platformGroup = state.genPlatformGroup;
      const pickPlatform = (): Platform => (platformGroup === "YouTube" ? "YouTube" : "Instagram");
      const platformLabel = platformGroup === "YouTube" ? "YouTube" : "Instagram or TikTok";

      if (cat) {
        const { prompt, libraryEntries } = buildSmartAiGeneratePromptForCategory(d, cat, platformLabel, state.genContext, rounds);
        const { text, usage } = await complete({
          model,
          apiKeys,
          prompt,
          maxTokens: Math.min(4500, 500 + rounds * 300),
        });
        logUsage({
          feature: "generate",
          provider: model.provider,
          modelId: model.id,
          modelLabel: model.label,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costUsd: costUsd(model, usage.inputTokens, usage.outputTokens),
        });
        const obj = parseJsonObject(text);
        const ideasRaw = obj && Array.isArray(obj.ideas) ? (obj.ideas as AiGenParsedItem[]) : null;
        if (!ideasRaw) throw new Error("unexpected response format");
        const batchName = typeof obj!.batchName === "string" && (obj!.batchName as string).trim() ? (obj!.batchName as string).trim() : "Generated batch";
        const capped = ideasRaw.slice(0, rounds);
        const candidates: PendingCandidate[] = capped.map((p) => ({
          tempId: genId(),
          title: p.title || "Untitled idea",
          hook: p.hook || "",
          notes: p.notes || "",
          format: p.format || "",
          structure: p.structure || "",
          platform: pickPlatform(),
          categoryId: cat.id,
          libraryEntryIds: resolveLibraryRefs(p.libraryRefs, libraryEntries),
          concerns: p.concerns || "",
          approved: true,
        }));
        setState((s) => ({
          ...s,
          generating: false,
          genPendingBatch: { batchName, candidates, categoryId: cat.id, platformGroup, context: state.genContext, max: rounds },
        }));
      } else {
        const catsInGroup = d.categories.filter((c) => c.platform === platformGroup);
        const { prompt, libraryEntries } = buildSmartAiGeneratePromptGeneric(d, catsInGroup, platformLabel, state.genContext, rounds);
        const { text, usage } = await complete({ model, apiKeys, prompt, maxTokens: Math.min(3500, 500 + rounds * 260) });
        logUsage({
          feature: "generate",
          provider: model.provider,
          modelId: model.id,
          modelLabel: model.label,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costUsd: costUsd(model, usage.inputTokens, usage.outputTokens),
        });
        const obj = parseJsonObject(text);
        const ideasRaw = obj && Array.isArray(obj.ideas) ? (obj.ideas as AiGenParsedItem[]) : null;
        if (!ideasRaw) throw new Error("unexpected response format");
        const batchName = typeof obj!.batchName === "string" && (obj!.batchName as string).trim() ? (obj!.batchName as string).trim() : "Generated batch";
        const capped = ideasRaw.slice(0, rounds);
        const candidates: PendingCandidate[] = capped.map((p) => {
          const catMatch = catsInGroup.find((c) => c.name === p.category);
          return {
            tempId: genId(),
            title: p.title || "Untitled idea",
            hook: p.hook || "",
            notes: p.notes || "",
            format: p.format || "",
            structure: p.structure || "",
            platform: p.platform || pickPlatform(),
            categoryId: catMatch ? catMatch.id : "",
            libraryEntryIds: resolveLibraryRefs(p.libraryRefs, libraryEntries),
            concerns: p.concerns || "",
            approved: true,
          };
        });
        setState((s) => ({
          ...s,
          generating: false,
          genPendingBatch: { batchName, candidates, categoryId: "", platformGroup, context: state.genContext, max: rounds },
        }));
      }
    } catch (err) {
      setState((s) => ({ ...s, generating: false, genError: "Generation failed — try again. (" + (err instanceof Error ? err.message : "unknown error") + ")" }));
    }
  }, [state.data, state.genCategory, state.genPlatformGroup, state.genContext, state.settings.anthropicApiKey, state.settings.deepseekApiKey, logUsage]);

  // ---- pending generation batch review ----
  const toggleCandidateApproval = useCallback((tempId: string) => {
    setState((s) =>
      s.genPendingBatch
        ? { ...s, genPendingBatch: { ...s.genPendingBatch, candidates: s.genPendingBatch.candidates.map((c) => (c.tempId === tempId ? { ...c, approved: !c.approved } : c)) } }
        : s
    );
  }, []);
  const setAllCandidatesApproved = useCallback((approved: boolean) => {
    setState((s) =>
      s.genPendingBatch ? { ...s, genPendingBatch: { ...s.genPendingBatch, candidates: s.genPendingBatch.candidates.map((c) => ({ ...c, approved })) } } : s
    );
  }, []);
  const discardPendingBatch = useCallback(() => setState((s) => ({ ...s, genPendingBatch: null })), []);
  const commitGenerationBatch = useCallback(() => {
    setState((s) => {
      const pending = s.genPendingBatch;
      if (!pending) return s;
      const approved = pending.candidates.filter((c) => c.approved);
      if (!approved.length) return { ...s, genPendingBatch: null };
      const batchId = genId();
      const now = Date.now();
      const newIdeas: Idea[] = approved.map((c, i) => ({
        id: genId(),
        title: c.title,
        hook: c.hook,
        platform: c.platform,
        categoryId: c.categoryId,
        status: "idea",
        notes: c.notes,
        link: "",
        script: "",
        isDraft: true,
        createdAt: now,
        order: now + i,
        format: c.format || undefined,
        structure: c.structure || undefined,
        libraryEntryIds: c.libraryEntryIds.length ? c.libraryEntryIds : undefined,
        evaluation: c.concerns
          ? { reasoning: c.concerns, libraryEntryIds: c.libraryEntryIds.length ? c.libraryEntryIds : undefined, generatedAt: now }
          : undefined,
        batchId,
      }));
      const batch: GenerationBatch = {
        id: batchId,
        name: pending.batchName,
        createdAt: now,
        categoryId: pending.categoryId,
        platformGroup: pending.platformGroup,
        context: pending.context,
      };
      const data: AppData = { ...s.data, ideas: [...newIdeas, ...s.data.ideas], generationBatches: [batch, ...s.data.generationBatches] };
      persist(data);
      return { ...s, data, genPendingBatch: null, justGenerated: true };
    });
  }, [persist]);

  const generateScript = useCallback(
    async (id: string, instruction?: string) => {
      const d = state.data;
      const idea = d.ideas.find((i) => i.id === id);
      if (!idea) return;
      setState((s) => ({ ...s, scriptGeneratingIds: { ...s.scriptGeneratingIds, [id]: true } }));
      try {
        const cat = d.categories.find((c) => c.id === idea.categoryId);
        const prompt = buildScriptPrompt(d, idea, cat, instruction || "");
        const model = getModel(d.aiModel);
        const { text, usage } = await complete({
          model,
          apiKeys: { anthropicApiKey: state.settings.anthropicApiKey, deepseekApiKey: state.settings.deepseekApiKey },
          prompt,
          maxTokens: 1200,
        });
        logUsage({
          feature: "script",
          provider: model.provider,
          modelId: model.id,
          modelLabel: model.label,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costUsd: costUsd(model, usage.inputTokens, usage.outputTokens),
        });
        setData((cur) => ({
          ...cur,
          ideas: cur.ideas.map((i) => (i.id === id ? { ...i, script: text.trim(), status: "scripted", scriptEvaluation: undefined } : i)),
        }));
        setState((s) => ({
          ...s,
          scriptGeneratingIds: { ...s.scriptGeneratingIds, [id]: false },
          scriptRegenOpenIds: { ...s.scriptRegenOpenIds, [id]: false },
          scriptRegenNotes: { ...s.scriptRegenNotes, [id]: "" },
        }));
      } catch {
        setState((s) => ({ ...s, scriptGeneratingIds: { ...s.scriptGeneratingIds, [id]: false }, genError: "Script generation failed — try again." }));
      }
    },
    [state.data, state.settings.anthropicApiKey, state.settings.deepseekApiKey, setData, logUsage]
  );

  /** Critiques a single idea already on the board — standalone, opt-in, its own AI call. Errors surface per-id on the card itself (evaluationErrors), not the global genError which only renders on the Generate tab. Writes its result via setData directly, never updateIdea, so idea.isDraft is never touched as a side effect. */
  const evaluateIdea = useCallback(
    async (id: string) => {
      const d = state.data;
      const idea = d.ideas.find((i) => i.id === id);
      if (!idea) return;
      const model = getModel(d.aiModel);
      const hasKey = model.provider === "anthropic" ? !!state.settings.anthropicApiKey : !!state.settings.deepseekApiKey;
      if (!hasKey) {
        setState((s) => ({ ...s, evaluationErrors: { ...s.evaluationErrors, [id]: `Add your ${providerLabel(model.provider)} API key in Settings first.` } }));
        return;
      }
      setState((s) => ({ ...s, evaluatingIds: { ...s.evaluatingIds, [id]: true }, evaluationErrors: { ...s.evaluationErrors, [id]: "" } }));
      try {
        const cat = d.categories.find((c) => c.id === idea.categoryId);
        const { prompt, libraryEntries } = buildEvaluatePrompt(d, idea, cat);
        const { text, usage } = await complete({
          model,
          apiKeys: { anthropicApiKey: state.settings.anthropicApiKey, deepseekApiKey: state.settings.deepseekApiKey },
          prompt,
          maxTokens: 500,
        });
        logUsage({
          feature: "evaluate-idea",
          provider: model.provider,
          modelId: model.id,
          modelLabel: model.label,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costUsd: costUsd(model, usage.inputTokens, usage.outputTokens),
        });
        const obj = parseJsonObject(text);
        const reasoning = obj && typeof obj.reasoning === "string" ? obj.reasoning.trim() : "";
        if (!reasoning) throw new Error("unexpected response format");
        const libraryEntryIds = resolveLibraryRefs(obj!.libraryRefs, libraryEntries);
        setData((cur) => ({
          ...cur,
          ideas: cur.ideas.map((i) =>
            i.id === id ? { ...i, evaluation: { reasoning, libraryEntryIds: libraryEntryIds.length ? libraryEntryIds : undefined, generatedAt: Date.now() } } : i
          ),
        }));
        setState((s) => ({ ...s, evaluatingIds: { ...s.evaluatingIds, [id]: false } }));
      } catch (err) {
        setState((s) => ({
          ...s,
          evaluatingIds: { ...s.evaluatingIds, [id]: false },
          evaluationErrors: { ...s.evaluationErrors, [id]: "Evaluation failed — try again. (" + (err instanceof Error ? err.message : "unknown error") + ")" },
        }));
      }
    },
    [state.data, state.settings.anthropicApiKey, state.settings.deepseekApiKey, setData, logUsage]
  );

  /** Critiques the actual script content of a single idea already on the board — standalone, opt-in, its own AI call, structurally identical to evaluateIdea but targets idea.scriptEvaluation and only runs once a script exists. Errors surface per-id (scriptEvaluationErrors), never the global genError. Writes via setData directly, never updateIdea, so idea.isDraft is never touched as a side effect. */
  const evaluateScript = useCallback(
    async (id: string) => {
      const d = state.data;
      const idea = d.ideas.find((i) => i.id === id);
      if (!idea || !idea.script.trim()) return;
      const model = getModel(d.aiModel);
      const hasKey = model.provider === "anthropic" ? !!state.settings.anthropicApiKey : !!state.settings.deepseekApiKey;
      if (!hasKey) {
        setState((s) => ({ ...s, scriptEvaluationErrors: { ...s.scriptEvaluationErrors, [id]: `Add your ${providerLabel(model.provider)} API key in Settings first.` } }));
        return;
      }
      setState((s) => ({ ...s, scriptEvaluatingIds: { ...s.scriptEvaluatingIds, [id]: true }, scriptEvaluationErrors: { ...s.scriptEvaluationErrors, [id]: "" } }));
      try {
        const cat = d.categories.find((c) => c.id === idea.categoryId);
        const { prompt, libraryEntries } = buildScriptEvaluatePrompt(d, idea, cat);
        const { text, usage } = await complete({
          model,
          apiKeys: { anthropicApiKey: state.settings.anthropicApiKey, deepseekApiKey: state.settings.deepseekApiKey },
          prompt,
          maxTokens: 500,
        });
        logUsage({
          feature: "evaluate-script",
          provider: model.provider,
          modelId: model.id,
          modelLabel: model.label,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costUsd: costUsd(model, usage.inputTokens, usage.outputTokens),
        });
        const obj = parseJsonObject(text);
        const reasoning = obj && typeof obj.reasoning === "string" ? obj.reasoning.trim() : "";
        if (!reasoning) throw new Error("unexpected response format");
        const libraryEntryIds = resolveLibraryRefs(obj!.libraryRefs, libraryEntries);
        setData((cur) => ({
          ...cur,
          ideas: cur.ideas.map((i) =>
            i.id === id ? { ...i, scriptEvaluation: { reasoning, libraryEntryIds: libraryEntryIds.length ? libraryEntryIds : undefined, generatedAt: Date.now() } } : i
          ),
        }));
        setState((s) => ({ ...s, scriptEvaluatingIds: { ...s.scriptEvaluatingIds, [id]: false } }));
      } catch (err) {
        setState((s) => ({
          ...s,
          scriptEvaluatingIds: { ...s.scriptEvaluatingIds, [id]: false },
          scriptEvaluationErrors: { ...s.scriptEvaluationErrors, [id]: "Evaluation failed — try again. (" + (err instanceof Error ? err.message : "unknown error") + ")" },
        }));
      }
    },
    [state.data, state.settings.anthropicApiKey, state.settings.deepseekApiKey, setData, logUsage]
  );

  /** Revises a single idea's title/hook to address a critique or instruction — the "Apply feedback" counterpart to evaluateIdea, structurally identical guard/loading/error shape. On success, treated as an active reviewed content change: clears isDraft (same as a manual edit) and clears the now-stale evaluation, since it critiqued the superseded title/hook. */
  const reviseIdea = useCallback(
    async (id: string, instruction: string) => {
      const d = state.data;
      const idea = d.ideas.find((i) => i.id === id);
      if (!idea || !instruction.trim()) return;
      const model = getModel(d.aiModel);
      const hasKey = model.provider === "anthropic" ? !!state.settings.anthropicApiKey : !!state.settings.deepseekApiKey;
      if (!hasKey) {
        setState((s) => ({ ...s, ideaRevisionErrors: { ...s.ideaRevisionErrors, [id]: `Add your ${providerLabel(model.provider)} API key in Settings first.` } }));
        return;
      }
      setState((s) => ({ ...s, revisingIdeaIds: { ...s.revisingIdeaIds, [id]: true }, ideaRevisionErrors: { ...s.ideaRevisionErrors, [id]: "" } }));
      try {
        const cat = d.categories.find((c) => c.id === idea.categoryId);
        const { prompt, libraryEntries } = buildReviseIdeaPrompt(d, idea, cat, instruction);
        const { text, usage } = await complete({
          model,
          apiKeys: { anthropicApiKey: state.settings.anthropicApiKey, deepseekApiKey: state.settings.deepseekApiKey },
          prompt,
          maxTokens: 400,
        });
        logUsage({
          feature: "revise-idea",
          provider: model.provider,
          modelId: model.id,
          modelLabel: model.label,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costUsd: costUsd(model, usage.inputTokens, usage.outputTokens),
        });
        const obj = parseJsonObject(text);
        const title = obj && typeof obj.title === "string" ? obj.title.trim() : "";
        const hook = obj && typeof obj.hook === "string" ? obj.hook.trim() : "";
        if (!title) throw new Error("unexpected response format");
        const libraryEntryIds = resolveLibraryRefs(obj!.libraryRefs, libraryEntries);
        setData((cur) => ({
          ...cur,
          ideas: cur.ideas.map((i) =>
            i.id === id
              ? { ...i, title, hook, isDraft: false, evaluation: undefined, libraryEntryIds: libraryEntryIds.length ? libraryEntryIds : undefined }
              : i
          ),
        }));
        setState((s) => ({
          ...s,
          revisingIdeaIds: { ...s.revisingIdeaIds, [id]: false },
          ideaRegenOpenIds: { ...s.ideaRegenOpenIds, [id]: false },
          ideaRegenNotes: { ...s.ideaRegenNotes, [id]: "" },
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          revisingIdeaIds: { ...s.revisingIdeaIds, [id]: false },
          ideaRevisionErrors: { ...s.ideaRevisionErrors, [id]: "Revision failed — try again. (" + (err instanceof Error ? err.message : "unknown error") + ")" },
        }));
      }
    },
    [state.data, state.settings.anthropicApiKey, state.settings.deepseekApiKey, setData, logUsage]
  );

  // ---- tabs ----
  const setActiveTab = useCallback((tab: TabId) => setState((s) => ({ ...s, activeTab: tab })), []);
  const goToBoard = useCallback(() => setState((s) => ({ ...s, activeTab: "ideas", justGenerated: false })), []);

  // ---- generate controls ----
  const setAiModel = useCallback((modelId: string) => setData((d) => ({ ...d, aiModel: modelId })), [setData]);
  const setGenBatchSize = useCallback((v: number) => setData((d) => ({ ...d, genBatchSize: v })), [setData]);
  const setGenCategory = useCallback((id: string) => setState((s) => ({ ...s, genCategory: id })), []);
  const setGenPlatformGroup = useCallback((p: PlatformGroup) => setState((s) => ({ ...s, genPlatformGroup: p, genCategory: "all" })), []);
  const setActiveFrameworksPlatform = useCallback((p: PlatformGroup) => setState((s) => ({ ...s, activeFrameworksPlatform: p })), []);
  const setActiveBoardPlatform = useCallback((p: "All" | "YouTube" | "IGTikTok") => setState((s) => ({ ...s, activeBoardPlatform: p })), []);
  const setGenContext = useCallback((v: string) => setState((s) => ({ ...s, genContext: v })), []);

  // ---- export / import ----
  const exportJSON = useCallback(() => {
    const d = state.data;
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (d.brandName || "content-idea-agent") + "-export.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [state.data]);

  const importJSON = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          setData((d) => ({ ...d, ...parsed }));
        } catch {
          setState((s) => ({ ...s, genError: "Import failed — invalid file." }));
        }
      };
      reader.readAsText(file);
    },
    [setData]
  );

  // ---- settings ----
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setState((s) => {
      const settings = { ...s.settings, ...patch };
      // First time a Supadata key is saved, anchor its free-tier reset estimate to today —
      // the user can correct it in Settings once they know the account's actual billing date.
      if (patch.supadataApiKey && !s.settings.supadataApiKey && !settings.supadataResetDay) {
        settings.supadataResetDay = Math.min(new Date().getDate(), 28);
      }
      if (patch.supadataBackupApiKey && !s.settings.supadataBackupApiKey && !settings.supadataBackupResetDay) {
        settings.supadataBackupResetDay = Math.min(new Date().getDate(), 28);
      }
      if (patch.apifyApiKey && !s.settings.apifyApiKey && !settings.apifyResetDay) {
        settings.apifyResetDay = Math.min(new Date().getDate(), 28);
      }
      if (patch.apifyBackupApiKey && !s.settings.apifyBackupApiKey && !settings.apifyBackupResetDay) {
        settings.apifyBackupResetDay = Math.min(new Date().getDate(), 28);
      }
      persistSettings(settings);
      return { ...s, settings };
    });
  }, [persistSettings]);
  const setSettingsOpen = useCallback((open: boolean) => setState((s) => ({ ...s, settingsOpen: open })), []);

  /** Swaps the primary and backup Supadata keys, along with their reset-day settings and usage logs — the log always stays attached to its actual key, and only the primary key is ever used for calls. */
  const swapSupadataKeys = useCallback(() => {
    // Cancel any pending debounced settings write so it can't clobber this swap moments later.
    if (settingsTimerRef.current) {
      clearTimeout(settingsTimerRef.current);
      settingsTimerRef.current = null;
      pendingSettingsRef.current = null;
    }
    setState((s) => {
      const settings: Settings = {
        ...s.settings,
        supadataApiKey: s.settings.supadataBackupApiKey,
        supadataBackupApiKey: s.settings.supadataApiKey,
        supadataResetDay: s.settings.supadataBackupResetDay,
        supadataBackupResetDay: s.settings.supadataResetDay,
      };
      const transcriptLog = s.transcriptBackupLog;
      const transcriptBackupLog = s.transcriptLog;
      if (userIdRef.current) {
        updateSettingsRow(userIdRef.current, settings).catch(() => {});
        updateTranscriptLogs(userIdRef.current, transcriptLog, transcriptBackupLog).catch(() => {});
      }
      return { ...s, settings, transcriptLog, transcriptBackupLog };
    });
  }, []);

  /** Swaps the primary and backup Apify keys, along with their reset-day settings and estimated-spend logs — the log always stays attached to its actual key, and only the primary key is ever used for calls. */
  const swapApifyKeys = useCallback(() => {
    if (settingsTimerRef.current) {
      clearTimeout(settingsTimerRef.current);
      settingsTimerRef.current = null;
      pendingSettingsRef.current = null;
    }
    setState((s) => {
      const settings: Settings = {
        ...s.settings,
        apifyApiKey: s.settings.apifyBackupApiKey,
        apifyBackupApiKey: s.settings.apifyApiKey,
        apifyResetDay: s.settings.apifyBackupResetDay,
        apifyBackupResetDay: s.settings.apifyResetDay,
      };
      const apifyLog = s.apifyBackupLog;
      const apifyBackupLog = s.apifyLog;
      if (userIdRef.current) {
        updateSettingsRow(userIdRef.current, settings).catch(() => {});
        updateApifyLogs(userIdRef.current, apifyLog, apifyBackupLog).catch(() => {});
      }
      return { ...s, settings, apifyLog, apifyBackupLog };
    });
  }, []);

  // ---- knowledge library ----
  const addLibraryEntries = useCallback(
    (entries: LibraryEntry[]) => setData((d) => ({ ...d, library: [...entries, ...d.library] })),
    [setData]
  );
  const updateLibraryEntryText = useCallback(
    (id: string, text: string) =>
      setData((d) => ({ ...d, library: d.library.map((e) => (e.id === id ? { ...e, text, updatedAt: Date.now() } : e)) })),
    [setData]
  );
  const removeLibraryEntry = useCallback(
    (id: string) => setData((d) => ({ ...d, library: d.library.filter((e) => e.id !== id) })),
    [setData]
  );

  /** Reviews accumulated idea/script evaluation critiques (scoped to one category, or "" for every category in platformGroup — "General" scope) and proposes recurring-pattern Library entries for review. A singleton action (not per-idea), so its state is flat like aiGenerate's, not a per-id map. */
  const distillEvaluations = useCallback(
    async (categoryId: string, platformGroup: PlatformGroup) => {
      const d = state.data;
      const model = getModel(d.aiModel);
      const hasKey = model.provider === "anthropic" ? !!state.settings.anthropicApiKey : !!state.settings.deepseekApiKey;
      if (!hasKey) {
        setState((s) => ({ ...s, distillError: `Add your ${providerLabel(model.provider)} API key in Settings first.` }));
        return;
      }
      const catsInGroup = d.categories.filter((c) => c.platform === platformGroup);
      const candidateIdeas = d.ideas.filter(
        (i) =>
          (categoryId ? i.categoryId === categoryId : catsInGroup.some((c) => c.id === i.categoryId)) &&
          (i.evaluation?.reasoning || i.scriptEvaluation?.reasoning)
      );
      if (!candidateIdeas.length) {
        setState((s) => ({ ...s, distillError: "No evaluated ideas in this content type yet." }));
        return;
      }
      setState((s) => ({ ...s, distilling: true, distillError: "" }));
      try {
        const prompt = buildEvaluationDistillationPrompt(d, catsInGroup, candidateIdeas);
        const { text, usage } = await complete({
          model,
          apiKeys: { anthropicApiKey: state.settings.anthropicApiKey, deepseekApiKey: state.settings.deepseekApiKey },
          prompt,
          maxTokens: Math.min(3000, 500 + candidateIdeas.length * 200),
        });
        logUsage({
          feature: "distill-evaluations",
          provider: model.provider,
          modelId: model.id,
          modelLabel: model.label,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costUsd: costUsd(model, usage.inputTokens, usage.outputTokens),
        });
        const parsed = parseJsonArray(text) as Record<string, unknown>[] | null;
        if (!parsed) throw new Error("unexpected response format");
        const candidates: PendingDistillationCandidate[] = parsed
          .map((p) => {
            const names = Array.isArray(p.categoryNames) ? (p.categoryNames as unknown[]) : [];
            const categoryIds = names
              .map((n) => catsInGroup.find((c) => c.name.trim().toLowerCase() === String(n).trim().toLowerCase())?.id)
              .filter((id): id is string => !!id);
            const ideaIdsRaw = Array.isArray(p.ideaIds) ? (p.ideaIds as unknown[]) : [];
            const sourceIdeaIds = ideaIdsRaw
              .filter((v): v is string => typeof v === "string")
              .filter((ideaId) => candidateIdeas.some((i) => i.id === ideaId));
            return { tempId: genId(), text: String(p.text || "").trim(), categoryIds, sourceIdeaIds, approved: true };
          })
          .filter((c) => c.text);
        setState((s) => ({
          ...s,
          distilling: false,
          distillPendingBatch: { candidates, categoryId, platformGroup },
        }));
      } catch (err) {
        setState((s) => ({ ...s, distilling: false, distillError: "Distilling failed — try again. (" + (err instanceof Error ? err.message : "unknown error") + ")" }));
      }
    },
    [state.data, state.settings.anthropicApiKey, state.settings.deepseekApiKey, logUsage]
  );

  const toggleDistillCandidateApproval = useCallback((tempId: string) => {
    setState((s) =>
      s.distillPendingBatch
        ? {
            ...s,
            distillPendingBatch: {
              ...s.distillPendingBatch,
              candidates: s.distillPendingBatch.candidates.map((c) => (c.tempId === tempId ? { ...c, approved: !c.approved } : c)),
            },
          }
        : s
    );
  }, []);
  const setAllDistillCandidatesApproved = useCallback((approved: boolean) => {
    setState((s) =>
      s.distillPendingBatch
        ? { ...s, distillPendingBatch: { ...s.distillPendingBatch, candidates: s.distillPendingBatch.candidates.map((c) => ({ ...c, approved })) } }
        : s
    );
  }, []);
  const updateDistillCandidateText = useCallback((tempId: string, text: string) => {
    setState((s) =>
      s.distillPendingBatch
        ? {
            ...s,
            distillPendingBatch: {
              ...s.distillPendingBatch,
              candidates: s.distillPendingBatch.candidates.map((c) => (c.tempId === tempId ? { ...c, text } : c)),
            },
          }
        : s
    );
  }, []);
  const discardDistillBatch = useCallback(() => setState((s) => ({ ...s, distillPendingBatch: null })), []);
  const commitDistillBatch = useCallback(() => {
    setState((s) => {
      const pending = s.distillPendingBatch;
      if (!pending) return s;
      const approved = pending.candidates.filter((c) => c.approved && c.text.trim());
      if (!approved.length) return { ...s, distillPendingBatch: null };
      const now = Date.now();
      const newEntries: LibraryEntry[] = approved.map((c) => ({
        id: genId(),
        categoryIds: c.categoryIds,
        platform: pending.platformGroup,
        text: c.text.trim(),
        sourceKind: "evaluation",
        sourceVideoIds: [],
        sourceIdeaIds: c.sourceIdeaIds,
        createdAt: now,
        updatedAt: now,
      }));
      const data: AppData = { ...s.data, library: [...newEntries, ...s.data.library] };
      persist(data);
      return { ...s, data, distillPendingBatch: null };
    });
  }, [persist]);

  // ---- fetched inspiration media (YouTube/TikTok/Instagram) ----
  const updateInspirationMedia = useCallback(
    (id: string, patch: Partial<Inspiration>) =>
      setData((d) => ({ ...d, inspirations: d.inspirations.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
    [setData]
  );

  return {
    ...state,
    hydrated,
    setBrandField,
    addBrandPillar,
    updateBrandPillar,
    removeBrandPillar,
    addPersonalTrait,
    updatePersonalTrait,
    removePersonalTrait,
    updateCategoryField,
    addCategory,
    removeCategory,
    addStructure,
    updateStructure,
    removeStructure,
    addAngle,
    updateAngleField,
    removeAngle,
    addHook,
    updateHook,
    removeHook,
    addInspiration,
    updateInspiration,
    toggleInspirationTag,
    removeInspiration,
    addIdea,
    updateIdea,
    setIdeaStatus,
    reorderIdeas,
    deleteIdea,
    clearIdeas,
    toggleIdeaExpand,
    toggleSiblingsExpand,
    toggleCategoryExpand,
    openRegenPanel,
    closeRegenPanel,
    setRegenNote,
    aiGenerate,
    toggleCandidateApproval,
    setAllCandidatesApproved,
    discardPendingBatch,
    commitGenerationBatch,
    generateScript,
    evaluateIdea,
    evaluateScript,
    openIdeaRegenPanel,
    closeIdeaRegenPanel,
    setIdeaRegenNote,
    reviseIdea,
    setActiveTab,
    goToBoard,
    setAiModel,
    setGenBatchSize,
    setGenCategory,
    setGenPlatformGroup,
    setActiveFrameworksPlatform,
    setActiveBoardPlatform,
    setGenContext,
    exportJSON,
    importJSON,
    updateSettings,
    setSettingsOpen,
    swapSupadataKeys,
    swapApifyKeys,
    addLibraryEntries,
    updateLibraryEntryText,
    removeLibraryEntry,
    distillEvaluations,
    toggleDistillCandidateApproval,
    setAllDistillCandidatesApproved,
    updateDistillCandidateText,
    discardDistillBatch,
    commitDistillBatch,
    updateInspirationMedia,
    logUsage,
    clearUsage,
    setUsageDialogOpen,
    logTranscriptFetch,
    logApifySpend,
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const store = useAppStore();
  const value = useMemo(() => store, [store]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
