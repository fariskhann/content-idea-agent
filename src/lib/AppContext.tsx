"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { genId } from "./id";
import { defaultSeed } from "./seed";
import { loadSettings, type Settings } from "./settings";
import {
  buildAiGeneratePromptForCategory,
  buildAiGeneratePromptGeneric,
  buildScriptPrompt,
  buildSmartAiGeneratePromptForCategory,
  buildSmartAiGeneratePromptGeneric,
  getGenerationPools,
} from "./generation";
import { complete, parseJsonArray, parseJsonObject } from "./ai";
import { getModel, costUsd } from "./models";
import { loadUsageLog, type UsageLogEntry } from "./usage";
import { loadTranscriptLog, loadTranscriptBackupLog } from "./transcriptUsage";
import { supabase } from "./supabaseClient";
import { fetchUserRow, insertUserRow, updateAppData, updateSettingsRow, updateUsageLog, updateTranscriptLogs, type UserDataRow } from "./db";
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

/** Backfills Category.platform / Inspiration.platform for data saved before those fields existed (or before Inspiration.platform was narrowed to just YouTube/IGTikTok, and later split back into a real 3-way YouTube/Instagram/TikTok value) — non-destructive, idempotent. Run on every load, not just migration, since already-migrated DB rows can predate this. */
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
  };
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

interface AppState {
  data: AppData;
  activeTab: TabId;
  genCategory: string;
  genPlatformGroup: PlatformGroup;
  activeFrameworksPlatform: PlatformGroup;
  activeBoardPlatform: "All" | "YouTube" | "IGTikTok";
  genContext: string;
  genSmartMode: boolean;
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
  genFormatChecks: Record<string, boolean>;
  genStructureChecks: Record<string, boolean>;
  settings: Settings;
  settingsOpen: boolean;
  usageLog: UsageLogEntry[];
  usageDialogOpen: boolean;
  transcriptLog: number[];
  transcriptBackupLog: number[];
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
    genSmartMode: false,
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
    genFormatChecks: {},
    genStructureChecks: {},
    settings: {
      anthropicApiKey: "",
      deepseekApiKey: "",
      youtubeApiKey: "",
      apifyApiKey: "",
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
        settings: row!.settings,
        usageLog: row!.usage_log,
        transcriptLog: row!.transcript_log,
        transcriptBackupLog: row!.transcript_backup_log,
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

  // ---- format / structure checkboxes on Generate ----
  const isFormatChecked = useCallback((id: string) => state.genFormatChecks[id] !== false, [state.genFormatChecks]);
  const isStructureChecked = useCallback((id: string) => state.genStructureChecks[id] !== false, [state.genStructureChecks]);
  const toggleFormatCheck = useCallback(
    (id: string) => setState((s) => ({ ...s, genFormatChecks: { ...s.genFormatChecks, [id]: !(s.genFormatChecks[id] !== false) } })),
    []
  );
  const toggleStructureCheck = useCallback(
    (id: string) => setState((s) => ({ ...s, genStructureChecks: { ...s.genStructureChecks, [id]: !(s.genStructureChecks[id] !== false) } })),
    []
  );

  const getPoolsFor = useCallback(
    (cat: Category) => {
      const scoped = !!(state.genCategory && state.genCategory !== "all");
      return getGenerationPools(cat, scoped, state.genFormatChecks, state.genStructureChecks);
    },
    [state.genCategory, state.genFormatChecks, state.genStructureChecks]
  );

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

  // ---- generation ----
  const aiGenerate = useCallback(async () => {
    const d = state.data;
    const smart = state.genSmartMode;
    if (smart && !state.genContext.trim()) {
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

      const resolveLibraryRefs = (refs: unknown, entries: LibraryEntry[]): string[] => {
        if (!Array.isArray(refs)) return [];
        const ids = refs.map((n) => (typeof n === "number" ? entries[n - 1]?.id : undefined)).filter((id): id is string => !!id);
        return Array.from(new Set(ids));
      };

      if (cat && !smart) {
        const pools = getPoolsFor(cat);
        const { prompt, slots } = buildAiGeneratePromptForCategory(d, cat, pools, platformLabel, state.genContext, rounds);
        const { text, usage } = await complete({
          model,
          apiKeys,
          prompt,
          maxTokens: Math.min(4000, 500 + slots.length * 220),
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
        const parsed = parseJsonArray(text) as AiGenParsedItem[] | null;
        if (!parsed || !parsed.length) throw new Error("unexpected response format");
        parsed.forEach((p, i) => {
          const slot = slots[i] || slots[slots.length - 1];
          addIdea({
            title: p.title || (slot ? slot.formatName : "Untitled idea"),
            hook: p.hook || "",
            platform: pickPlatform(),
            categoryId: cat.id,
            notes: [p.notes || "", slot?.structureText ? "Structure: " + slot.structureText : ""].filter(Boolean).join(" — "),
          });
        });
        setState((s) => ({ ...s, generating: false, justGenerated: true }));
      } else if (cat && smart) {
        const { prompt, libraryEntries } = buildSmartAiGeneratePromptForCategory(d, cat, platformLabel, state.genContext, rounds);
        const { text, usage } = await complete({
          model,
          apiKeys,
          prompt,
          maxTokens: Math.min(4000, 500 + rounds * 260),
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
          approved: true,
        }));
        setState((s) => ({
          ...s,
          generating: false,
          genPendingBatch: { batchName, candidates, categoryId: cat.id, platformGroup, context: state.genContext, max: rounds },
        }));
      } else if (!cat && !smart) {
        const catsInGroup = d.categories.filter((c) => c.platform === platformGroup);
        const prompt = buildAiGeneratePromptGeneric(d, catsInGroup, getPoolsFor, platformLabel, state.genContext, rounds);
        const { text, usage } = await complete({ model, apiKeys, prompt, maxTokens: 1800 });
        logUsage({
          feature: "generate",
          provider: model.provider,
          modelId: model.id,
          modelLabel: model.label,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costUsd: costUsd(model, usage.inputTokens, usage.outputTokens),
        });
        const parsed = parseJsonArray(text) as AiGenParsedItem[] | null;
        if (!parsed || !parsed.length) throw new Error("unexpected response format");
        parsed.forEach((p) => {
          const catMatch = catsInGroup.find((c) => c.name === p.category);
          addIdea({
            title: p.title || "Untitled idea",
            hook: p.hook || "",
            platform: (p as { platform?: Platform }).platform || pickPlatform(),
            categoryId: catMatch ? catMatch.id : "",
            notes: p.notes || "",
          });
        });
        setState((s) => ({ ...s, generating: false, justGenerated: true }));
      } else {
        const catsInGroup = d.categories.filter((c) => c.platform === platformGroup);
        const { prompt, libraryEntries } = buildSmartAiGeneratePromptGeneric(d, catsInGroup, platformLabel, state.genContext, rounds);
        const { text, usage } = await complete({ model, apiKeys, prompt, maxTokens: Math.min(3000, 500 + rounds * 220) });
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
  }, [state.data, state.genCategory, state.genPlatformGroup, state.genContext, state.genSmartMode, state.settings.anthropicApiKey, state.settings.deepseekApiKey, getPoolsFor, addIdea, logUsage]);

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
      const newIdeas: Idea[] = approved.map((c) => ({
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
        format: c.format || undefined,
        structure: c.structure || undefined,
        libraryEntryIds: c.libraryEntryIds.length ? c.libraryEntryIds : undefined,
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
        setData((cur) => ({ ...cur, ideas: cur.ideas.map((i) => (i.id === id ? { ...i, script: text.trim(), status: "scripted" } : i)) }));
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

  // ---- tabs ----
  const setActiveTab = useCallback((tab: TabId) => setState((s) => ({ ...s, activeTab: tab })), []);
  const goToBoard = useCallback(() => setState((s) => ({ ...s, activeTab: "ideas", justGenerated: false })), []);

  // ---- generate controls ----
  const setAiModel = useCallback((modelId: string) => setData((d) => ({ ...d, aiModel: modelId })), [setData]);
  const setGenBatchSize = useCallback((v: number) => setData((d) => ({ ...d, genBatchSize: v })), [setData]);
  const setGenCategory = useCallback((id: string) => setState((s) => ({ ...s, genCategory: id, genFormatChecks: {}, genStructureChecks: {} })), []);
  const setGenPlatformGroup = useCallback(
    (p: PlatformGroup) => setState((s) => ({ ...s, genPlatformGroup: p, genCategory: "all", genFormatChecks: {}, genStructureChecks: {} })),
    []
  );
  const setActiveFrameworksPlatform = useCallback((p: PlatformGroup) => setState((s) => ({ ...s, activeFrameworksPlatform: p })), []);
  const setActiveBoardPlatform = useCallback((p: "All" | "YouTube" | "IGTikTok") => setState((s) => ({ ...s, activeBoardPlatform: p })), []);
  const setGenContext = useCallback((v: string) => setState((s) => ({ ...s, genContext: v })), []);
  const setGenSmartMode = useCallback((v: boolean) => setState((s) => ({ ...s, genSmartMode: v })), []);

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
    deleteIdea,
    clearIdeas,
    toggleIdeaExpand,
    toggleSiblingsExpand,
    toggleCategoryExpand,
    openRegenPanel,
    closeRegenPanel,
    setRegenNote,
    isFormatChecked,
    isStructureChecked,
    toggleFormatCheck,
    toggleStructureCheck,
    getPoolsFor,
    aiGenerate,
    toggleCandidateApproval,
    setAllCandidatesApproved,
    discardPendingBatch,
    commitGenerationBatch,
    generateScript,
    setActiveTab,
    goToBoard,
    setAiModel,
    setGenBatchSize,
    setGenCategory,
    setGenPlatformGroup,
    setActiveFrameworksPlatform,
    setActiveBoardPlatform,
    setGenContext,
    setGenSmartMode,
    exportJSON,
    importJSON,
    updateSettings,
    setSettingsOpen,
    swapSupadataKeys,
    addLibraryEntries,
    updateLibraryEntryText,
    removeLibraryEntry,
    updateInspirationMedia,
    logUsage,
    clearUsage,
    setUsageDialogOpen,
    logTranscriptFetch,
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
