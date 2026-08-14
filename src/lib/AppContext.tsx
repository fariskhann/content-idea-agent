"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { genId } from "./id";
import { defaultSeed } from "./seed";
import { loadSettings, type Settings } from "./settings";
import {
  buildAiGeneratePromptForCategory,
  buildAiGeneratePromptGeneric,
  buildScriptPrompt,
  expandIdeas,
  getGenerationPools,
} from "./generation";
import { complete, parseJsonArray } from "./ai";
import { getModel, costUsd } from "./models";
import { loadUsageLog, type UsageLogEntry } from "./usage";
import { loadTranscriptLog, loadTranscriptBackupLog } from "./transcriptUsage";
import { supabase } from "./supabaseClient";
import { fetchUserRow, insertUserRow, updateAppData, updateSettingsRow, updateUsageLog, updateTranscriptLogs, type UserDataRow } from "./db";
import type {
  AppData,
  Category,
  Idea,
  IdeaStatus,
  Inspiration,
  LibraryEntry,
  Platform,
  PlatformGroup,
  TabId,
} from "./types";

const STORAGE_KEY = "cia_v1";

/** Backfills Category.platform / Inspiration.platform for data saved before those fields existed (or before Inspiration.platform was narrowed to just YouTube/IGTikTok) — non-destructive, idempotent. Run on every load, not just migration, since already-migrated DB rows can predate this. */
function normalizePlatformGroups(data: AppData): AppData {
  return {
    ...data,
    categories: (data.categories || []).map((c) => ({
      ...c,
      platform: c.platform === "YouTube" || c.platform === "IGTikTok" ? c.platform : "YouTube",
    })),
    inspirations: (data.inspirations || []).map((i) => ({
      ...i,
      platform: i.platform === "YouTube" || i.platform === "IGTikTok" ? i.platform : "IGTikTok",
    })),
  };
}

interface AiGenParsedItem {
  title?: string;
  hook?: string;
  notes?: string;
  category?: string;
}

interface AppState {
  data: AppData;
  activeTab: TabId;
  genCategory: string;
  genPlatformGroup: PlatformGroup;
  activeFrameworksPlatform: PlatformGroup;
  activeBoardPlatform: "All" | "YouTube" | "IGTikTok";
  genContext: string;
  generating: boolean;
  genError: string;
  justGenerated: boolean;
  expandedIds: Record<string, boolean>;
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
    generating: false,
    genError: "",
    justGenerated: false,
    expandedIds: {},
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
  const quickSpin = useCallback(() => {
    const d = state.data;
    const catsInGroup = d.categories.filter((c) => c.platform === state.genPlatformGroup);
    if (!catsInGroup.length) {
      setState((s) => ({ ...s, genError: `No content types yet for this platform — add one in Frameworks.` }));
      return;
    }
    const rounds = d.genBatchSize || 1;
    const newIdeas: Partial<Idea>[] = [];
    for (let i = 0; i < rounds; i++) {
      const cat = state.genCategory !== "all" ? d.categories.find((c) => c.id === state.genCategory) : catsInGroup[Math.floor(Math.random() * catsInGroup.length)];
      if (!cat || !cat.angles.length) {
        setState((s) => ({ ...s, genError: `Add at least one format to "${cat ? cat.name : "this category"}" first, in Frameworks.` }));
        return;
      }
      const hook = d.hooks.length ? d.hooks[Math.floor(Math.random() * d.hooks.length)] : null;
      const platform: Platform = state.genPlatformGroup === "YouTube" ? "YouTube" : "Instagram";
      const hookLine = hook ? `Open with a "${hook.text}"...` : "";
      const pools = getPoolsFor(cat);
      const ideas = expandIdeas(cat, "", hookLine, platform, "", pools);
      if (!ideas.length) {
        setState((s) => ({ ...s, genError: `Select at least one format to include for "${cat.name}".` }));
        return;
      }
      newIdeas.push(...ideas);
    }
    newIdeas.forEach((idea) => addIdea(idea));
    setState((s) => ({ ...s, genError: "", justGenerated: true }));
  }, [state.data, state.genCategory, state.genPlatformGroup, getPoolsFor, addIdea]);

  const aiGenerate = useCallback(async () => {
    const d = state.data;
    setState((s) => ({ ...s, generating: true, genError: "", justGenerated: false }));
    try {
      const cat = state.genCategory !== "all" ? d.categories.find((c) => c.id === state.genCategory) : null;
      const rounds = d.genBatchSize || 1;
      const model = getModel(d.aiModel);
      const apiKeys = { anthropicApiKey: state.settings.anthropicApiKey, deepseekApiKey: state.settings.deepseekApiKey };
      const platformGroup = state.genPlatformGroup;
      const pickPlatform = (): Platform => (platformGroup === "YouTube" ? "YouTube" : "Instagram");
      const platformLabel = platformGroup === "YouTube" ? "YouTube" : "Instagram or TikTok";

      if (cat) {
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
      } else {
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
      }
      setState((s) => ({ ...s, generating: false, justGenerated: true }));
    } catch (err) {
      setState((s) => ({ ...s, generating: false, genError: "Generation failed — try again. (" + (err instanceof Error ? err.message : "unknown error") + ")" }));
    }
  }, [state.data, state.genCategory, state.genPlatformGroup, state.genContext, state.settings.anthropicApiKey, state.settings.deepseekApiKey, getPoolsFor, addIdea, logUsage]);

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

  // ---- youtube inspiration ----
  const updateInspirationYoutube = useCallback(
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
    toggleCategoryExpand,
    openRegenPanel,
    closeRegenPanel,
    setRegenNote,
    isFormatChecked,
    isStructureChecked,
    toggleFormatCheck,
    toggleStructureCheck,
    getPoolsFor,
    quickSpin,
    aiGenerate,
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
    exportJSON,
    importJSON,
    updateSettings,
    setSettingsOpen,
    swapSupadataKeys,
    addLibraryEntries,
    updateLibraryEntryText,
    removeLibraryEntry,
    updateInspirationYoutube,
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
