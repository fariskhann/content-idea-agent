"use client";

import { useState } from "react";
import { useApp } from "@/lib/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { muted, pageSubtitle, pageTitle, primaryBtn, removeBtn } from "@/lib/styles";
import { complete, parseJsonArray } from "@/lib/ai";
import { getModel, costUsd, providerLabel } from "@/lib/models";
import { computeOutliers, DEFAULT_VIDEO_COUNT, MAX_VIDEO_COUNT, fetchChannelVideos, fetchTranscript, buildYoutubeAnalysisPrompt } from "@/lib/youtube";
import type { AnalysisField as AnalysisFieldType, Category, Inspiration, YoutubeOutlierResult, YoutubeVideo } from "@/lib/types";

function platformLabel(p: Inspiration["platform"]): string {
  return p === "YouTube" ? "YouTube" : "IG + TikTok";
}

function fmtViews(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

/** "titleBreakdown" -> "Title breakdown" */
function labelFromKey(key: string): string {
  const spaced = key.replace(/([A-Z])/g, " $1").trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Renders a `why`/`borrow` field that may be a plain string or a structured breakdown object from custom Analysis instructions. */
function AnalysisFieldView({ value }: { value: AnalysisFieldType }) {
  if (typeof value === "string") return <>{value}</>;
  if (!value || typeof value !== "object") return <>{String(value)}</>;
  return (
    <span style={{ display: "block" }}>
      {Object.entries(value).map(([key, v]) => (
        <span key={key} style={{ display: "block", marginTop: 2 }}>
          <em>{labelFromKey(key)}:</em> {typeof v === "string" ? v : JSON.stringify(v)}
        </span>
      ))}
    </span>
  );
}

function YoutubeSection({ insp, taggedCategories }: { insp: Inspiration; taggedCategories: Category[] }) {
  const app = useApp();
  const [count, setCount] = useState(DEFAULT_VIDEO_COUNT);
  const [fetching, setFetching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [expandedTranscriptIds, setExpandedTranscriptIds] = useState<Set<string>>(new Set());
  const [minimizedOverrides, setMinimizedOverrides] = useState<Record<string, boolean>>({});

  function toggleTranscriptExpanded(id: string) {
    setExpandedTranscriptIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const videos = insp.youtubeVideos || [];
  const { avgViews, outliers } = computeOutliers(videos);
  const outlierIds = new Set(outliers.map((v) => v.id));
  const analysisById = new Map<string, YoutubeOutlierResult>((insp.youtubeAnalysis?.results || []).map((r) => [r.videoId, r]));

  /** Videos that have already had a transcript attempt or an analysis run default to minimised; freshly fetched ones stay expanded until processed. */
  function isMinimized(v: YoutubeVideo): boolean {
    const override = minimizedOverrides[v.id];
    if (override !== undefined) return override;
    return v.transcriptStatus !== "not_fetched" || analysisById.has(v.id);
  }

  function toggleMinimized(v: YoutubeVideo) {
    setMinimizedOverrides((prev) => ({ ...prev, [v.id]: !isMinimized(v) }));
  }

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // Reset the selection (not the outlier highlighting) each time a fresh fetch lands.
  const [lastSeenFetch, setLastSeenFetch] = useState(insp.youtubeLastFetched);
  if (lastSeenFetch !== insp.youtubeLastFetched) {
    setLastSeenFetch(insp.youtubeLastFetched);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleFetch() {
    setError("");
    if (!app.settings.youtubeApiKey) {
      setError("Add your YouTube Data API key in Settings first.");
      return;
    }
    const ref = insp.link || insp.handle;
    if (!ref) {
      setError("Add this channel's link or @handle first.");
      return;
    }
    setFetching(true);
    try {
      const res = await fetchChannelVideos({ apiKey: app.settings.youtubeApiKey, ref, maxResults: count });
      const existingById = new Map(videos.map((v) => [v.id, v]));
      const merged: YoutubeVideo[] = res.videos.map((v) => {
        const prev = existingById.get(v.id);
        return { ...v, transcript: prev?.transcript, transcriptStatus: prev?.transcriptStatus || "not_fetched" };
      });
      app.updateInspirationYoutube(insp.id, { youtubeVideos: merged, youtubeLastFetched: Date.now() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch videos.");
    } finally {
      setFetching(false);
    }
  }

  /** Shared by the batch "Analyse videos" button and the per-video re-analyse icon. A transcript already marked "ok" is never re-fetched; "unavailable"/"not_fetched" always gets another attempt, since a missing transcript should only ever be a temporary state, not a permanent skip. */
  async function runAnalysis(targetVideos: YoutubeVideo[]) {
    setError("");
    const selectedModel = getModel(app.data.aiModel);
    const hasKey = selectedModel.provider === "anthropic" ? !!app.settings.anthropicApiKey : !!app.settings.deepseekApiKey;
    if (!hasKey) {
      setError(`Add your ${providerLabel(selectedModel.provider)} API key in Settings first.`);
      return;
    }
    if (!targetVideos.length) {
      setError("Tick at least one video to analyze.");
      return;
    }
    setAnalyzing(true);
    try {
      const updatedVideos = [...videos];
      const withTranscripts: YoutubeVideo[] = [];
      let transcriptWarning = "";
      let stopFetchingTranscripts = false;
      for (const selected of targetVideos) {
        let current = selected;
        if (!stopFetchingTranscripts && current.transcriptStatus !== "ok") {
          const result = await fetchTranscript(current.id, app.settings.supadataApiKey);
          if (result.status === "ok" || result.status === "unavailable") {
            // Both outcomes reached Supadata and likely consumed a credit — only no_key/invalid_key/quota_exceeded don't.
            app.logTranscriptFetch();
            current = { ...current, transcript: result.text, transcriptStatus: result.status };
          } else {
            stopFetchingTranscripts = true;
            transcriptWarning =
              result.status === "no_key"
                ? "Add your Supadata API key in Settings to include transcripts — continuing without them."
                : result.status === "quota_exceeded"
                  ? "Supadata free-tier limit reached for this cycle — continuing without transcripts."
                  : (result.error || "Transcript fetch failed — continuing without transcripts.");
          }
          const idx = updatedVideos.findIndex((v) => v.id === current.id);
          if (idx !== -1) updatedVideos[idx] = current;
        }
        withTranscripts.push(current);
      }
      app.updateInspirationYoutube(insp.id, { youtubeVideos: updatedVideos });
      if (transcriptWarning) setError(transcriptWarning);

      const prompt = buildYoutubeAnalysisPrompt(app.data, insp.name || insp.handle, avgViews, withTranscripts, taggedCategories);
      const model = getModel(app.data.aiModel);
      const { text, usage } = await complete({
        model,
        apiKeys: { anthropicApiKey: app.settings.anthropicApiKey, deepseekApiKey: app.settings.deepseekApiKey },
        prompt,
        // max_tokens is a ceiling, not a guaranteed spend — err high since structured multi-part
        // breakdowns from custom Analysis instructions need much more room than a plain sentence.
        // Capped at 60000 to stay under Claude Haiku 4.5's 64K output ceiling with margin.
        maxTokens: Math.min(60000, Math.max(20000, withTranscripts.length * 6000)),
      });
      app.logUsage({
        feature: "youtube-analysis",
        provider: model.provider,
        modelId: model.id,
        modelLabel: model.label,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: costUsd(model, usage.inputTokens, usage.outputTokens),
      });
      const parsed = parseJsonArray(text) as Record<string, unknown>[] | null;
      if (!parsed || !parsed.length) {
        console.error("YouTube analysis: failed to parse model response as JSON array. Raw response:", text);
        const looksTruncated = text.trim().length > 0 && !text.trim().endsWith("]") && !text.trim().endsWith("}");
        if (looksTruncated) {
          throw new Error("The model's response was cut off before finishing — try analyzing fewer videos at once.");
        }
        const snippet = text.length > 300 ? text.slice(0, 300) + "…" : text;
        throw new Error(`Unexpected response format — model didn't return valid JSON. Raw response: "${snippet}"`);
      }
      const newResults: YoutubeOutlierResult[] = parsed.map((p) => {
        const { videoId, ...fields } = p;
        return { videoId: typeof videoId === "string" ? videoId : "", fields: fields as Record<string, AnalysisFieldType> };
      });
      // Merge rather than replace, so re-analysing one video (or a partial batch) doesn't wipe out results for videos not in this run.
      const newIds = new Set(newResults.map((r) => r.videoId));
      const mergedResults = [...(insp.youtubeAnalysis?.results || []).filter((r) => !newIds.has(r.videoId)), ...newResults];
      const generatedAt = Date.now();
      app.updateInspirationYoutube(insp.id, { youtubeAnalysis: { generatedAt, avgViews, results: mergedResults } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed — try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleAnalyze() {
    await runAnalysis(videos.filter((v) => selectedIds.has(v.id)));
  }

  async function handleReanalyzeOne(id: string) {
    const video = videos.find((v) => v.id === id);
    if (video) await runAnalysis([video]);
  }

  /** Clears cached transcript status/text and any prior AI notes so the next analyze run starts clean. */
  function handleReset() {
    const resetVideos = videos.map((v) => ({ ...v, transcript: undefined, transcriptStatus: "not_fetched" as const }));
    app.updateInspirationYoutube(insp.id, { youtubeVideos: resetVideos, youtubeAnalysis: undefined });
    setMinimizedOverrides({});
    setError("");
  }

  return (
    <div style={{ borderTop: `1px solid ${muted(25)}`, marginTop: 8, paddingTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: muted(55) }}>
        YouTube videos <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— Shorts are excluded automatically</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: muted(55) }}>Last</span>
        <input
          type="number"
          min={1}
          max={MAX_VIDEO_COUNT}
          value={count}
          onChange={(e) => setCount(Math.min(MAX_VIDEO_COUNT, Math.max(1, parseInt(e.target.value, 10) || 1)))}
          style={{ width: 52, border: `1px solid ${muted(25)}`, background: "var(--color-surface)", fontSize: 12, color: "var(--color-text)", padding: "5px 6px" }}
        />
        <span style={{ fontSize: 11, color: muted(55) }}>videos (max {MAX_VIDEO_COUNT})</span>
        <button
          onClick={handleFetch}
          disabled={fetching}
          style={{ border: "1px solid var(--color-divider)", background: "transparent", color: "var(--color-text)", padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
        >
          {fetching ? "Fetching…" : videos.length ? "Refresh videos" : "Fetch videos"}
        </button>
        {videos.length > 0 && (
          <button
            onClick={handleAnalyze}
            disabled={analyzing || selectedIds.size === 0}
            style={{ border: "1px solid var(--color-accent)", background: "var(--color-accent)", color: "var(--color-bg)", padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
          >
            {analyzing ? "Analysing…" : `Analyse videos (${selectedIds.size})`}
          </button>
        )}
        {videos.length > 0 && (
          <button
            onClick={handleReset}
            disabled={analyzing || fetching}
            title="Clears cached transcript status and AI notes so the next analysis re-fetches and re-analyzes from scratch."
            style={{ border: `1px solid ${muted(35)}`, background: "transparent", color: muted(70), padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
          >
            Reset
          </button>
        )}
      </div>

      {error && <div style={{ fontSize: 11, color: "var(--color-accent-800)" }}>{error}</div>}

      {videos.length > 0 && (
        <div style={{ fontSize: 11, color: muted(55) }}>
          Average views this batch: {fmtViews(avgViews)} · {outliers.length} outlier{outliers.length === 1 ? "" : "s"} flagged (≥1.5× average) · tick any video
          below to include it in analysis
        </div>
      )}

      {videos.length === 0 && !fetching && (
        <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: muted(50), border: `1px solid ${muted(15)}` }}>No videos fetched yet.</div>
      )}

      {videos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 10 }}>
          {videos.map((v) => {
            const isOutlier = outlierIds.has(v.id);
            const analysis = analysisById.get(v.id);
            const minimized = isMinimized(v);
            return (
              <div
                key={v.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  background: "var(--color-surface)",
                  border: isOutlier ? "1px solid var(--color-accent)" : `1px solid ${muted(15)}`,
                }}
              >
                <div style={{ position: "relative", aspectRatio: "16 / 9", background: muted(10), flexShrink: 0 }}>
                  {v.thumbnail && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} className="grayscale" />
                  )}
                  <div style={{ position: "absolute", top: 5, left: 5, display: "flex", flexDirection: "row", gap: 3, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(v.id)}
                      onChange={() => toggleSelected(v.id)}
                      style={{ accentColor: "var(--color-accent)", width: 15, height: 15, display: "block" }}
                    />
                    {analysis && (
                      <button
                        onClick={() => handleReanalyzeOne(v.id)}
                        disabled={analyzing}
                        title="Analyse again — reuses the existing transcript and picks up any changes to Analysis instructions"
                        style={{
                          border: "none",
                          background: "rgba(255,255,255,0.9)",
                          width: 15,
                          height: 15,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 0,
                          color: muted(70),
                          cursor: analyzing ? "default" : "pointer",
                          fontSize: 11,
                          lineHeight: 1,
                        }}
                      >
                        ↻
                      </button>
                    )}
                  </div>
                  <div style={{ position: "absolute", top: 5, right: 5, display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}>
                    {isOutlier && <span style={{ fontSize: 10, background: "var(--color-accent-100)", color: "var(--color-accent-800)", padding: "1px 6px", whiteSpace: "nowrap" }}>Outlier</span>}
                    {analysis && <span style={{ fontSize: 10, background: "var(--color-neutral-100)", color: "var(--color-neutral-800)", padding: "1px 6px", whiteSpace: "nowrap" }}>Analysed</span>}
                  </div>
                </div>

                <div style={{ padding: "8px 5px 8px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text)" }}>{v.title}</span>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 11, lineHeight: 1, color: muted(55) }}>
                      {fmtViews(v.viewCount)} views · {new Date(v.publishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    <button
                      onClick={() => toggleMinimized(v)}
                      style={{ textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, lineHeight: 1, fontWeight: 600, color: muted(55), flexShrink: 0 }}
                    >
                      {minimized ? "+ Expand" : "− Collapse"}
                    </button>
                  </div>

                  {!minimized && (
                    <>
                      {v.transcriptStatus !== "not_fetched" && (
                        <div style={{ fontSize: 11, color: muted(55) }}>
                          {v.transcriptStatus === "unavailable" && "No transcript available"}
                          {v.transcriptStatus === "ok" && v.transcript && (
                            <button
                              onClick={() => toggleTranscriptExpanded(v.id)}
                              style={{ border: "none", background: "none", padding: 0, font: "inherit", color: "var(--color-accent-800)", textDecoration: "underline", cursor: "pointer" }}
                            >
                              {expandedTranscriptIds.has(v.id) ? "hide transcript" : `view transcript (${v.transcript.length.toLocaleString()} chars)`}
                            </button>
                          )}
                        </div>
                      )}
                      {v.transcriptStatus === "ok" && v.transcript && expandedTranscriptIds.has(v.id) && (
                        <div
                          style={{
                            fontSize: 11,
                            lineHeight: 1.5,
                            color: muted(70),
                            maxHeight: 180,
                            overflowY: "auto",
                            background: "var(--color-bg)",
                            border: `1px solid ${muted(15)}`,
                            padding: 8,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {v.transcript}
                        </div>
                      )}
                      {analysis && (
                        <div style={{ fontSize: 12, color: "var(--color-text)" }}>
                          {Object.entries(analysis.fields || {}).map(([key, value]) => (
                            <div key={key}>
                              <strong>{labelFromKey(key)}:</strong> <AnalysisFieldView value={value} />
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InspirationDetail({ insp }: { insp: Inspiration }) {
  const app = useApp();
  const taggedCategories = app.data.categories.filter((c) => insp.tags.includes(c.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <input
        value={insp.name}
        onChange={(e) => app.updateInspiration(insp.id, "name", e.target.value)}
        placeholder="Name / page"
        style={{
          border: "none",
          borderBottom: "1px solid transparent",
          background: "transparent",
          fontFamily: "var(--font-heading)",
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: "-0.01em",
          color: "var(--color-text)",
          padding: "2px 0",
        }}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={insp.handle}
          onChange={(e) => app.updateInspiration(insp.id, "handle", e.target.value)}
          placeholder="@handle"
          style={{ width: 200, border: `1px solid ${muted(25)}`, background: "var(--color-bg)", fontSize: 13, color: "var(--color-text)", padding: "8px 10px" }}
        />
        <select
          value={insp.platform}
          onChange={(e) => app.updateInspiration(insp.id, "platform", e.target.value as Inspiration["platform"])}
          style={{ border: `1px solid ${muted(25)}`, background: "var(--color-bg)", fontSize: 13, color: "var(--color-text)", padding: "8px 10px" }}
        >
          <option value="YouTube">YouTube</option>
          <option value="IGTikTok">IG + TikTok</option>
        </select>
        <input
          value={insp.link}
          onChange={(e) => app.updateInspiration(insp.id, "link", e.target.value)}
          placeholder="https://..."
          style={{ flex: 1, minWidth: 220, border: `1px solid ${muted(25)}`, background: "var(--color-bg)", fontSize: 13, color: "var(--color-text)", padding: "8px 10px" }}
        />
        {insp.link && (
          <a href={insp.link} target="_blank" rel="noopener" style={{ fontSize: 13 }}>
            Open ↗
          </a>
        )}
      </div>

      {insp.platform === "YouTube" && (
        <ErrorBoundary
          fallbackTitle="Something in this creator's fetched YouTube data crashed the page. This is likely a malformed video/transcript record — resetting clears just that data (you'll need to re-fetch and re-analyze)."
          onReset={() => app.updateInspirationYoutube(insp.id, { youtubeVideos: [], youtubeAnalysis: undefined, youtubeLastFetched: undefined })}
        >
          <YoutubeSection insp={insp} taggedCategories={taggedCategories} />
        </ErrorBoundary>
      )}
    </div>
  );
}

export function InspirationTab() {
  const app = useApp();
  const inspirations = app.data.inspirations;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = inspirations.find((i) => i.id === selectedId) || inspirations[0] || null;

  function handleAdd() {
    const id = app.addInspiration();
    setSelectedId(id);
  }

  function handleRemove(id: string) {
    const remaining = inspirations.filter((i) => i.id !== id);
    app.removeInspiration(id);
    setSelectedId(remaining[0]?.id ?? null);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={pageTitle}>Inspiration</h1>
          <p style={{ ...pageSubtitle, margin: 0 }}>
            Pages, creators, or competitors worth tracking. Tag them by category so the generator can borrow their angle. For YouTube channels, pull
            recent videos and flag which ones outperformed the channel&apos;s own baseline.
          </p>
        </div>
        <button onClick={handleAdd} style={{ flexShrink: 0, ...primaryBtn, padding: "11px 18px", fontSize: 13 }}>
          + Add
        </button>
      </div>

      {inspirations.length === 0 ? (
        <div style={{ fontSize: 14, color: muted(50), padding: 32, textAlign: "center", border: "1px solid var(--color-divider)" }}>
          No inspiration saved yet — add a page or creator you admire.
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", gap: 2, overflowX: "auto", borderBottom: `1px solid ${muted(25)}`, marginBottom: 24 }}>
            {inspirations.map((insp) => {
              const active = selected?.id === insp.id;
              return (
                <div key={insp.id} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                  <button
                    onClick={() => setSelectedId(insp.id)}
                    style={{
                      textAlign: "left",
                      padding: "9px 12px",
                      borderBottom: `2px solid ${active ? "var(--color-accent)" : "transparent"}`,
                      background: active ? "var(--color-surface)" : "transparent",
                      color: active ? "var(--color-accent-700)" : "var(--color-text)",
                      cursor: active ? "default" : "pointer",
                      fontSize: 13,
                      fontWeight: active ? 800 : 400,
                      display: "flex",
                      alignItems: "baseline",
                      gap: 6,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span>{insp.name || insp.handle || "Untitled"}</span>
                    <span style={{ fontSize: 10, color: muted(50), fontWeight: 400 }}>{platformLabel(insp.platform)}</span>
                  </button>
                  <button onClick={() => handleRemove(insp.id)} style={{ ...removeBtn, fontSize: 14, flexShrink: 0 }}>
                    ×
                  </button>
                </div>
              );
            })}
          </div>
          {selected && <InspirationDetail insp={selected} />}
        </div>
      )}
    </div>
  );
}
