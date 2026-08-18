"use client";

import { useState } from "react";
import { useApp } from "@/lib/AppContext";
import { kicker, muted, pageSubtitle, pageTitle, primaryBtn, removeBtn, secondaryBtn } from "@/lib/styles";
import type { LibraryEntry, PlatformGroup } from "@/lib/types";

const LIBRARY_GROUPS: { value: PlatformGroup; label: string }[] = [
  { value: "YouTube", label: "YouTube" },
  { value: "IGTikTok", label: "Instagram + TikTok" },
];

function LibraryEntryCard({ entry }: { entry: LibraryEntry }) {
  const app = useApp();
  return (
    <div style={{ border: `1px solid ${muted(25)}`, background: "var(--color-bg)", padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      <textarea
        value={entry.text}
        onChange={(e) => app.updateLibraryEntryText(entry.id, e.target.value)}
        rows={2}
        style={{ border: "none", background: "transparent", fontSize: 13, color: "var(--color-text)", padding: 0, width: "100%", resize: "vertical" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: muted(50) }}>
        <span>
          {entry.sourceKind === "evaluation" ? "Distilled from evaluation patterns" : `from ${entry.sourceInspirationName || "an inspiration creator"}`} ·{" "}
          {new Date(entry.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        </span>
        <button onClick={() => app.removeLibraryEntry(entry.id)} style={removeBtn}>
          ×
        </button>
      </div>
    </div>
  );
}

/** Review checklist for a "Distill patterns" run — unlike the idea-generation review panel, candidate text is directly editable, since a claimed recurring pattern deserves more scrutiny before it's saved than a one-off idea suggestion. */
function DistillReviewPanel() {
  const app = useApp();
  const batch = app.distillPendingBatch;
  if (!batch) return null;

  const scopeName = batch.categoryId ? app.data.categories.find((c) => c.id === batch.categoryId)?.name : null;
  const approvedCount = batch.candidates.filter((c) => c.approved).length;

  return (
    <div>
      <h1 style={pageTitle}>Distill patterns</h1>
      <p style={{ ...pageSubtitle, marginBottom: 24 }}>
        {scopeName || "All categories"} · {batch.platformGroup === "YouTube" ? "YouTube" : "IG + TikTok"}
      </p>

      {batch.candidates.length === 0 ? (
        <div>
          <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: muted(50), border: `1px solid ${muted(15)}`, marginBottom: 16 }}>
            No recurring pattern found across these critiques yet — evaluate more ideas/scripts and try again.
          </div>
          <button style={secondaryBtn} onClick={app.discardDistillBatch}>
            Back
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <button style={secondaryBtn} onClick={() => app.setAllDistillCandidatesApproved(true)}>
              Approve all
            </button>
            <button style={secondaryBtn} onClick={() => app.setAllDistillCandidatesApproved(false)}>
              Decline all
            </button>
            <span style={{ fontSize: 12, color: muted(55) }}>
              {approvedCount} of {batch.candidates.length} selected
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            {batch.candidates.map((c) => {
              const categoryNames = c.categoryIds.map((id) => app.data.categories.find((cat) => cat.id === id)?.name).filter((n): n is string => !!n);
              return (
                <div
                  key={c.tempId}
                  style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "var(--color-surface)", padding: 14, border: c.approved ? "1px solid var(--color-accent)" : `1px solid ${muted(15)}` }}
                >
                  <input
                    type="checkbox"
                    checked={c.approved}
                    onChange={() => app.toggleDistillCandidateApproval(c.tempId)}
                    style={{ accentColor: "var(--color-accent)", width: 16, height: 16, marginTop: 3, flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                    <textarea
                      value={c.text}
                      onChange={(e) => app.updateDistillCandidateText(c.tempId, e.target.value)}
                      rows={2}
                      style={{ border: `1px solid ${muted(20)}`, background: "var(--color-bg)", fontSize: 13, color: "var(--color-text)", padding: "6px 8px", width: "100%", resize: "vertical" }}
                    />
                    <div style={{ fontSize: 11, color: muted(55) }}>
                      {(categoryNames.length ? categoryNames.join(", ") : "General")} · drawn from {c.sourceIdeaIds.length} idea{c.sourceIdeaIds.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button style={primaryBtn} onClick={app.commitDistillBatch} disabled={approvedCount === 0}>
              Add {approvedCount} to library
            </button>
            <button style={secondaryBtn} onClick={app.discardDistillBatch}>
              Discard
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function LibraryTab() {
  const app = useApp();
  const d = app.data;
  const [platform, setPlatform] = useState<PlatformGroup>("YouTube");
  const catsInGroup = d.categories.filter((c) => c.platform === platform);
  const libraryInGroup = d.library.filter((e) => e.platform === platform);
  const generalEntries = libraryInGroup.filter((e) => e.categoryIds.length === 0);

  if (app.distillPendingBatch) {
    return (
      <div style={{ maxWidth: 760 }}>
        <DistillReviewPanel />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={pageTitle}>Library</h1>
      <p style={pageSubtitle}>
        Durable learnings distilled from analysed inspiration videos, or from recurring patterns across AI evaluation critiques — scoped by content type
        and fed into idea and script generation. Add to it from a creator&apos;s analysed videos in Inspiration, or with &quot;Distill patterns&quot; below
        once you&apos;ve evaluated a few ideas.
      </p>

      <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${muted(25)}`, marginBottom: 24 }}>
        {LIBRARY_GROUPS.map((g) => {
          const active = platform === g.value;
          return (
            <button
              key={g.value}
              onClick={() => setPlatform(g.value)}
              style={{
                padding: "9px 12px",
                borderBottom: `2px solid ${active ? "var(--color-accent)" : "transparent"}`,
                background: active ? "var(--color-surface)" : "transparent",
                color: active ? "var(--color-accent-700)" : "var(--color-text)",
                cursor: active ? "default" : "pointer",
                fontSize: 13,
                fontWeight: active ? 800 : 400,
              }}
            >
              {g.label}
            </button>
          );
        })}
      </div>

      {app.distillError && <div style={{ fontSize: 12, color: "var(--color-accent-800)", marginBottom: 16 }}>{app.distillError}</div>}

      {catsInGroup.map((cat) => {
        const entries = libraryInGroup.filter((e) => e.categoryIds.includes(cat.id));
        return (
          <div key={cat.id} style={{ background: "var(--color-surface)", padding: 20, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
              <div style={kicker}>
                {cat.name} {entries.length > 0 && `(${entries.length})`}
              </div>
              <button
                onClick={() => app.distillEvaluations(cat.id, platform)}
                disabled={app.distilling}
                style={{ border: `1px solid ${muted(35)}`, background: "transparent", color: "var(--color-text)", padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                {app.distilling ? "Distilling…" : "Distill patterns"}
              </button>
            </div>
            {entries.length === 0 ? (
              <div style={{ fontSize: 12, color: muted(50) }}>
                Nothing distilled into this content type yet — use &quot;Add to library&quot; on an analysed Inspiration video, or &quot;Distill
                patterns&quot; once you&apos;ve evaluated a few ideas here.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {entries.map((e) => (
                  <LibraryEntryCard key={e.id} entry={e} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ borderTop: "2px solid var(--color-divider)", paddingTop: 24, marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, margin: 0 }}>General</h2>
          <button
            onClick={() => app.distillEvaluations("", platform)}
            disabled={app.distilling}
            style={{ border: `1px solid ${muted(35)}`, background: "transparent", color: "var(--color-text)", padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            {app.distilling ? "Distilling…" : "Distill patterns (all categories)"}
          </button>
        </div>
        <p style={{ fontSize: 13, color: muted(60), margin: "0 0 16px" }}>Learnings that didn&apos;t cleanly map to one content type.</p>
        {generalEntries.length === 0 ? (
          <div style={{ fontSize: 12, color: muted(50) }}>Nothing here yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 640 }}>
            {generalEntries.map((e) => (
              <LibraryEntryCard key={e.id} entry={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
