"use client";

import { useApp } from "@/lib/AppContext";
import { chipStyle, kicker, muted, pageSubtitle, pageTitle, primaryBtn, secondaryBtn, textarea } from "@/lib/styles";
import type { PlatformGroup } from "@/lib/types";

const PLATFORM_GROUPS: { value: PlatformGroup; label: string }[] = [
  { value: "YouTube", label: "YouTube" },
  { value: "IGTikTok", label: "Instagram + TikTok" },
];

export function GenerateTab() {
  const app = useApp();
  const d = app.data;
  const catsInGroup = d.categories.filter((c) => c.platform === app.genPlatformGroup);
  const activeCat = app.genCategory !== "all" ? d.categories.find((c) => c.id === app.genCategory) : null;

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={pageTitle}>Generate ideas</h1>
      <p style={pageSubtitle}>
        Pick a platform, then a category and context if you&apos;ve got it, then spin up ideas — quick combinatorial spins, or AI-written concepts using your
        framework and inspiration board.
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
        <div style={{ marginBottom: 24 }}>
          <div style={{ ...kicker, marginBottom: 10 }}>Formats to include</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
            {activeCat.angles.map((a) => (
              <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--color-text)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={app.isFormatChecked(a.id)}
                  onChange={() => app.toggleFormatCheck(a.id)}
                  style={{ accentColor: "var(--color-accent)", width: 15, height: 15 }}
                />
                {a.name}
              </label>
            ))}
          </div>
          {activeCat.structures.length > 0 && (
            <>
              <div style={{ ...kicker, marginBottom: 10 }}>Structures to include</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {activeCat.structures.map((st) => (
                  <label key={st.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "var(--color-text)", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={app.isStructureChecked(st.id)}
                      onChange={() => app.toggleStructureCheck(st.id)}
                      style={{ accentColor: "var(--color-accent)", width: 15, height: 15, marginTop: 2, flexShrink: 0 }}
                    />
                    <span>{st.text || "(untitled structure)"}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ ...kicker, marginBottom: 10 }}>Context (optional)</div>
      <textarea
        value={app.genContext}
        onChange={(e) => app.setGenContext(e.target.value)}
        placeholder="What happened today, a comment someone made, a decision you're wrestling with..."
        rows={3}
        style={{ ...textarea, marginBottom: 22 }}
      />

      <div style={{ marginBottom: 24 }}>
        <div style={{ ...kicker, marginBottom: 10 }}>
          Rounds to generate: {d.genBatchSize}{" "}
          <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: muted(50) }}>× formats × structures</span>
        </div>
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
        <button style={secondaryBtn} onClick={app.quickSpin}>
          Quick spin
        </button>
        <button style={primaryBtn} onClick={app.aiGenerate} disabled={app.generating}>
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
