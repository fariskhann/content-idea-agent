"use client";

import { useApp } from "@/lib/AppContext";
import { chipStyle, kicker, muted, pageSubtitle, pageTitle, primaryBtn, secondaryBtn, textarea } from "@/lib/styles";
import type { PlatformGroup } from "@/lib/types";

const PLATFORM_GROUPS: { value: PlatformGroup; label: string }[] = [
  { value: "YouTube", label: "YouTube" },
  { value: "IGTikTok", label: "Instagram + TikTok" },
];

function PendingBatchReview() {
  const app = useApp();
  const batch = app.genPendingBatch;
  if (!batch) return null;

  const approvedCount = batch.candidates.filter((c) => c.approved).length;
  const categoryName = batch.categoryId ? app.data.categories.find((c) => c.id === batch.categoryId)?.name : null;

  return (
    <div>
      <h1 style={pageTitle}>{batch.batchName}</h1>
      <p style={{ ...pageSubtitle, marginBottom: 4 }}>
        {categoryName || "All categories"} · {batch.platformGroup === "YouTube" ? "YouTube" : "IG + TikTok"}
      </p>
      <p style={{ fontSize: 13, color: muted(55), marginBottom: 24 }}>&quot;{batch.context}&quot;</p>

      {batch.candidates.length === 0 ? (
        <div>
          <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: muted(50), border: `1px solid ${muted(15)}`, marginBottom: 16 }}>
            Couldn&apos;t find a strong fit for this context — try adding more detail, or a different category.
          </div>
          <button style={secondaryBtn} onClick={app.discardPendingBatch}>
            Back
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <button style={secondaryBtn} onClick={() => app.setAllCandidatesApproved(true)}>
              Approve all
            </button>
            <button style={secondaryBtn} onClick={() => app.setAllCandidatesApproved(false)}>
              Decline all
            </button>
            <span style={{ fontSize: 12, color: muted(55) }}>
              {approvedCount} of {batch.candidates.length} selected
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            {batch.candidates.map((c) => {
              const citedEntries = c.libraryEntryIds.map((id) => app.data.library.find((e) => e.id === id)).filter((e): e is NonNullable<typeof e> => !!e);
              return (
                <div key={c.tempId} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "var(--color-surface)", padding: 14, border: c.approved ? "1px solid var(--color-accent)" : `1px solid ${muted(15)}` }}>
                  <input
                    type="checkbox"
                    checked={c.approved}
                    onChange={() => app.toggleCandidateApproval(c.tempId)}
                    style={{ accentColor: "var(--color-accent)", width: 16, height: 16, marginTop: 3, flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontFamily: "var(--font-heading)", fontSize: 15, fontWeight: 800, color: "var(--color-text)" }}>{c.title}</div>
                    {c.hook && <div style={{ fontSize: 13, color: muted(70) }}>{c.hook}</div>}
                    {(c.format || c.structure) && (
                      <div style={{ fontSize: 12, color: muted(60) }}>
                        {c.format && <div>Format: {c.format}</div>}
                        {c.structure && <div>Structure: {c.structure}</div>}
                      </div>
                    )}
                    {c.notes && <div style={{ fontSize: 12, color: muted(60) }}>{c.notes}</div>}
                    {citedEntries.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: muted(55), marginTop: 4 }}>
                          Drew from library
                        </div>
                        {citedEntries.map((e) => (
                          <div key={e.id} style={{ fontSize: 11, color: muted(60), borderLeft: `2px solid ${muted(25)}`, paddingLeft: 6, marginTop: 4 }}>
                            {e.text}
                          </div>
                        ))}
                      </div>
                    )}
                    {c.concerns && (
                      <div style={{ fontSize: 12, color: muted(65), fontStyle: "italic", borderTop: `1px solid ${muted(15)}`, paddingTop: 6, marginTop: 2 }}>
                        {c.concerns}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button style={primaryBtn} onClick={app.commitGenerationBatch} disabled={approvedCount === 0}>
              Add {approvedCount} to board
            </button>
            <button style={secondaryBtn} onClick={app.discardPendingBatch}>
              Discard batch
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function GenerateTab() {
  const app = useApp();
  const d = app.data;
  const catsInGroup = d.categories.filter((c) => c.platform === app.genPlatformGroup);
  const activeCat = app.genCategory !== "all" ? d.categories.find((c) => c.id === app.genCategory) : null;

  if (app.genPendingBatch) {
    return (
      <div style={{ maxWidth: 760 }}>
        <PendingBatchReview />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={pageTitle}>Generate ideas</h1>
      <p style={pageSubtitle}>
        Pick a platform, then a category and context if you&apos;ve got it, then generate AI-written concepts using your framework, inspiration, and library.
      </p>

      <div style={{ ...kicker, marginBottom: 10 }}>Platform</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
        {PLATFORM_GROUPS.map((g) => (
          <button key={g.value} style={chipStyle(app.genPlatformGroup === g.value)} onClick={() => app.setGenPlatformGroup(g.value)}>
            {g.label}
          </button>
        ))}
      </div>

      <div style={{ ...kicker, marginBottom: 10 }}>Category</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
        <button style={chipStyle(app.genCategory === "all")} onClick={() => app.setGenCategory("all")}>
          All categories
        </button>
        {catsInGroup.map((c) => (
          <button key={c.id} style={chipStyle(app.genCategory === c.id)} onClick={() => app.setGenCategory(c.id)}>
            {c.name}
          </button>
        ))}
      </div>

      {activeCat && (
        <div style={{ marginBottom: 24, fontSize: 13, color: muted(60) }}>
          The AI will choose the best-fitting format and structure for each idea from {activeCat.name}&apos;s available options.
        </div>
      )}

      <div style={{ ...kicker, marginBottom: 10 }}>Context (required)</div>
      <textarea
        value={app.genContext}
        onChange={(e) => app.setGenContext(e.target.value)}
        placeholder="What happened today, a comment someone made, a decision you're wrestling with..."
        rows={3}
        style={{ ...textarea, marginBottom: !app.genContext.trim() ? 8 : 22 }}
      />
      {!app.genContext.trim() && (
        <div style={{ marginBottom: 22, fontSize: 12, color: "var(--color-accent-700)" }}>
          Add a bit of context — rough is fine — so the AI can pick the right fit.
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <div style={{ ...kicker, marginBottom: 10 }}>Up to {d.genBatchSize} ideas</div>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={d.genBatchSize}
          onChange={(e) => app.setGenBatchSize(parseInt(e.target.value, 10))}
          style={{ width: 220, accentColor: "var(--color-accent)" }}
        />
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button style={primaryBtn} onClick={app.aiGenerate} disabled={app.generating || !app.genContext.trim()}>
          {app.generating ? "Generating…" : "Generate with AI"}
        </button>
      </div>

      {app.genError && (
        <div style={{ marginTop: 20, padding: "12px 14px", borderLeft: "2px solid var(--color-accent)", background: "var(--color-accent-100)", color: "var(--color-accent-800)", fontSize: 13 }}>
          {app.genError}
        </div>
      )}
      {app.justGenerated && (
        <div
          style={{
            marginTop: 20,
            padding: "12px 14px",
            borderLeft: "2px solid var(--color-text)",
            background: "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>New idea(s) added to the board.</span>
          <button onClick={app.goToBoard} style={{ border: "none", background: "transparent", color: "var(--color-accent-700)", fontWeight: 800, cursor: "pointer", fontSize: 13 }}>
            View board →
          </button>
        </div>
      )}
    </div>
  );
}
