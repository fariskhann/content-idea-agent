"use client";

import { useState } from "react";
import { useApp } from "@/lib/AppContext";
import { chipStyle, muted, pageSubtitle, pageTitle, primaryBtn, removeBtn, secondaryBtn } from "@/lib/styles";
import { complete, parseJsonArray } from "@/lib/ai";
import { getModel, costUsd, providerLabel } from "@/lib/models";
import { computeOutliers, DEFAULT_VIDEO_COUNT, MAX_VIDEO_COUNT, fetchChannelVideos, fetchTranscript, buildYoutubeAnalysisPrompt } from "@/lib/youtube";
import type { Inspiration, YoutubeOutlierResult, YoutubeVideo } from "@/lib/types";

function fmtViews(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function YoutubeVideosDialog({ insp, onClose }: { insp: Inspiration; onClose: () => void }) {
  const app = useApp();
  const [count, setCount] = useState(DEFAULT_VIDEO_COUNT);
  const [fetching, setFetching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  const videos = insp.youtubeVideos || [];
  const { medianViews, outliers } = computeOutliers(videos);
  const outlierIds = new Set(outliers.map((v) => v.id));
  const analysisById = new Map<string, YoutubeOutlierResult>((insp.youtubeAnalysis?.results || []).map((r) => [r.videoId, r]));

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

  async function handleAnalyze() {
    setError("");
    const selectedModel = getModel(app.data.aiModel);
    const hasKey = selectedModel.provider === "anthropic" ? !!app.settings.anthropicApiKey : !!app.settings.deepseekApiKey;
    if (!hasKey) {
      setError(`Add your ${providerLabel(selectedModel.provider)} API key in Settings first.`);
      return;
    }
    const { medianViews: mv, outliers: outlierVideos } = computeOutliers(videos);
    if (!outlierVideos.length) {
      setError("No outliers in the current batch — nothing meaningfully above this channel's own median yet.");
      return;
    }
    setAnalyzing(true);
    try {
      const updatedVideos = [...videos];
      const outliersWithTranscripts: YoutubeVideo[] = [];
      for (const outlier of outlierVideos) {
        let current = outlier;
        if (current.transcriptStatus !== "ok" && current.transcriptStatus !== "unavailable") {
          const result = await fetchTranscript(current.id);
          current = { ...current, transcript: result.text, transcriptStatus: result.status };
          const idx = updatedVideos.findIndex((v) => v.id === current.id);
          if (idx !== -1) updatedVideos[idx] = current;
        }
        outliersWithTranscripts.push(current);
      }
      app.updateInspirationYoutube(insp.id, { youtubeVideos: updatedVideos });

      const prompt = buildYoutubeAnalysisPrompt(app.data, insp.name || insp.handle, mv, outliersWithTranscripts);
      const model = getModel(app.data.aiModel);
      const { text, usage } = await complete({
        model,
        apiKeys: { anthropicApiKey: app.settings.anthropicApiKey, deepseekApiKey: app.settings.deepseekApiKey },
        prompt,
        maxTokens: Math.min(4000, 400 + outliersWithTranscripts.length * 300),
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
      const parsed = parseJsonArray(text) as { videoId?: string; why?: string; borrow?: string }[] | null;
      if (!parsed || !parsed.length) throw new Error("unexpected response format");
      const results: YoutubeOutlierResult[] = parsed.map((p) => ({ videoId: p.videoId || "", why: p.why || "", borrow: p.borrow || "" }));
      app.updateInspirationYoutube(insp.id, { youtubeAnalysis: { generatedAt: Date.now(), medianViews: mv, results } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed — try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", padding: 16, background: "color-mix(in srgb, var(--color-neutral-900) 50%, transparent)", zIndex: 50 }}
      onClick={onClose}
    >
      <div
        style={{ width: "min(760px, 100%)", maxHeight: "88vh", display: "flex", flexDirection: "column", gap: 14, padding: 24, background: "var(--color-bg)", border: "2px solid var(--color-divider)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, margin: "0 0 4px" }}>{insp.name || insp.handle || "YouTube channel"}</h2>
            <p style={{ fontSize: 12, color: muted(55), margin: 0 }}>Shorts are excluded — only regular uploads are pulled and scored.</p>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: muted(50), cursor: "pointer", fontSize: 20, lineHeight: 1 }}>
            ×
          </button>
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
              disabled={analyzing}
              style={{ border: "1px solid var(--color-accent)", background: "var(--color-accent)", color: "var(--color-bg)", padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >
              {analyzing ? "Analyzing…" : "Analyze outliers"}
            </button>
          )}
        </div>

        {error && <div style={{ fontSize: 11, color: "var(--color-accent-800)" }}>{error}</div>}

        {videos.length > 0 && (
          <div style={{ fontSize: 11, color: muted(55) }}>
            Median views this batch: {fmtViews(medianViews)} · {outliers.length} outlier{outliers.length === 1 ? "" : "s"} flagged (≥1.75× median)
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingRight: 2 }}>
          {videos.length === 0 && !fetching && (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: muted(50), border: `1px solid ${muted(15)}` }}>No videos fetched yet.</div>
          )}
          {videos.map((v) => {
            const isOutlier = outlierIds.has(v.id);
            const analysis = analysisById.get(v.id);
            return (
              <div key={v.id} style={{ display: "flex", gap: 10, background: "var(--color-surface)", padding: 10, border: isOutlier ? "1px solid var(--color-accent)" : `1px solid ${muted(15)}` }}>
                {v.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.thumbnail} alt="" width={120} height={68} style={{ objectFit: "cover", flexShrink: 0 }} className="grayscale" />
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text)" }}>{v.title}</span>
                    {isOutlier && <span style={{ fontSize: 10, background: "var(--color-accent-100)", color: "var(--color-accent-800)", padding: "1px 6px" }}>Outlier</span>}
                  </div>
                  <div style={{ fontSize: 11, color: muted(55) }}>
                    {fmtViews(v.viewCount)} views · {new Date(v.publishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    {v.transcriptStatus === "unavailable" && " · no transcript available"}
                  </div>
                  {analysis && (
                    <div style={{ fontSize: 12, color: "var(--color-text)", marginTop: 2 }}>
                      <div>
                        <strong>Why it worked:</strong> {analysis.why}
                      </div>
                      <div>
                        <strong>What to borrow:</strong> {analysis.borrow}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          <button style={secondaryBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function YoutubePanel({ insp }: { insp: Inspiration }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const videos = insp.youtubeVideos || [];
  const { outliers } = computeOutliers(videos);

  return (
    <div style={{ borderTop: `1px solid ${muted(25)}`, marginTop: 4, paddingTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span style={{ fontSize: 11, color: muted(55) }}>
        {videos.length > 0 ? `${videos.length} videos loaded · ${outliers.length} outlier${outliers.length === 1 ? "" : "s"}` : "No videos fetched yet"}
      </span>
      <button
        onClick={() => setDialogOpen(true)}
        style={{ border: "1px solid var(--color-divider)", background: "transparent", color: "var(--color-text)", padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
      >
        {videos.length > 0 ? "View videos" : "Fetch videos"}
      </button>
      {dialogOpen && <YoutubeVideosDialog insp={insp} onClose={() => setDialogOpen(false)} />}
    </div>
  );
}

export function InspirationTab() {
  const app = useApp();
  const inspirations = app.data.inspirations;

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 26 }}>
        <div>
          <h1 style={pageTitle}>Inspiration</h1>
          <p style={{ ...pageSubtitle, margin: 0 }}>
            Pages, creators, or competitors worth tracking. Tag them by category so the generator can borrow their angle. For YouTube channels, pull
            recent videos and flag which ones outperformed the channel&apos;s own baseline.
          </p>
        </div>
        <button onClick={app.addInspiration} style={{ flexShrink: 0, ...primaryBtn, padding: "11px 18px", fontSize: 13 }}>
          + Add
        </button>
      </div>

      {inspirations.length === 0 && (
        <div style={{ fontSize: 14, color: muted(50), padding: 32, textAlign: "center", border: "1px solid var(--color-divider)" }}>
          No inspiration saved yet — add a page or creator you admire.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {inspirations.map((insp) => (
          <div key={insp.id} style={{ background: "var(--color-surface)", padding: 18, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={insp.name}
                onChange={(e) => app.updateInspiration(insp.id, "name", e.target.value)}
                placeholder="Name / page"
                style={{ flex: 1, border: "none", borderBottom: "1px solid transparent", background: "transparent", fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 800, color: "var(--color-text)", padding: "2px 0" }}
              />
              <button onClick={() => app.removeInspiration(insp.id)} style={{ ...removeBtn, fontSize: 17 }}>
                ×
              </button>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={insp.handle}
                onChange={(e) => app.updateInspiration(insp.id, "handle", e.target.value)}
                placeholder="@handle"
                style={{ flex: 1, border: `1px solid ${muted(25)}`, background: "var(--color-bg)", fontSize: 12, color: "var(--color-text)", padding: "6px 8px" }}
              />
              <select
                value={insp.platform}
                onChange={(e) => app.updateInspiration(insp.id, "platform", e.target.value as Inspiration["platform"])}
                style={{ border: `1px solid ${muted(25)}`, background: "var(--color-bg)", fontSize: 12, color: "var(--color-text)", padding: "6px 8px" }}
              >
                <option value="Instagram">Instagram</option>
                <option value="TikTok">TikTok</option>
                <option value="YouTube">YouTube</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <input
              value={insp.link}
              onChange={(e) => app.updateInspiration(insp.id, "link", e.target.value)}
              placeholder="https://..."
              style={{ border: `1px solid ${muted(25)}`, background: "var(--color-bg)", fontSize: 12, color: "var(--color-text)", padding: "6px 8px" }}
            />
            {insp.link && (
              <a href={insp.link} target="_blank" rel="noopener" style={{ fontSize: 12 }}>
                Open ↗
              </a>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
              {app.data.categories.map((c) => {
                const active = insp.tags.includes(c.id);
                return (
                  <button key={c.id} style={chipStyle(active)} onClick={() => app.toggleInspirationTag(insp.id, c.id)}>
                    {c.name}
                  </button>
                );
              })}
            </div>
            <textarea
              value={insp.notes}
              onChange={(e) => app.updateInspiration(insp.id, "notes", e.target.value)}
              placeholder="What do you like about their content?"
              rows={2}
              style={{ border: `1px solid ${muted(25)}`, background: "var(--color-bg)", fontSize: 12, color: "var(--color-text)", padding: "6px 8px", width: "100%" }}
            />

            {insp.platform === "YouTube" && <YoutubePanel insp={insp} />}
          </div>
        ))}
      </div>
    </div>
  );
}
