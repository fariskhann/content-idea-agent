"use client";

import { useState } from "react";
import { useApp } from "@/lib/AppContext";
import { chipStyle, fieldLabel, muted, pageTitle, removeBtn } from "@/lib/styles";
import type { Idea, IdeaStatus } from "@/lib/types";

const COLUMNS: { status: IdeaStatus; label: string }[] = [
  { status: "idea", label: "Idea" },
  { status: "scripted", label: "Scripted" },
  { status: "filmed", label: "Filmed" },
  { status: "posted", label: "Posted" },
];

const BOARD_FILTERS: { value: "All" | "YouTube" | "IGTikTok"; label: string }[] = [
  { value: "All", label: "All" },
  { value: "YouTube", label: "YouTube" },
  { value: "IGTikTok", label: "IG + TikTok" },
];

function IdeaCard({ idea }: { idea: Idea }) {
  const app = useApp();
  const cat = app.data.categories.find((c) => c.id === idea.categoryId);
  const expanded = !!app.expandedIds[idea.id];
  const scriptGenerating = !!app.scriptGeneratingIds[idea.id];
  const showRegenPanel = !!app.scriptRegenOpenIds[idea.id];
  const regenNote = app.scriptRegenNotes[idea.id] || "";
  const scriptButtonLabel = scriptGenerating ? "Generating…" : idea.script ? "Regenerate script" : "Generate script";
  const created = idea.createdAt ? new Date(idea.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

  return (
    <div style={{ background: "var(--color-surface)", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>
          {cat ? cat.name : "Uncategorized"}
        </span>
        <span style={{ fontSize: 10, background: "var(--color-neutral-100)", color: "var(--color-neutral-800)", padding: "2px 6px" }}>{idea.platform}</span>
        <div style={{ flex: 1 }} />
        {idea.isDraft && <span style={{ fontSize: 10, background: "var(--color-accent-100)", color: "var(--color-accent-800)", padding: "2px 6px" }}>Draft</span>}
        <button onClick={() => app.deleteIdea(idea.id)} style={{ ...removeBtn, padding: "0 2px" }}>
          ×
        </button>
      </div>

      <button onClick={() => app.toggleIdeaExpand(idea.id)} style={{ textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em", color: "var(--color-text)" }}>
          {idea.title || "Untitled idea"}
        </div>
      </button>

      {!expanded && (
        <button onClick={() => app.toggleIdeaExpand(idea.id)} style={{ textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, fontWeight: 600, color: muted(55) }}>
          + Show details
        </button>
      )}

      {expanded && (
        <>
          <div style={fieldLabel}>Title</div>
          <input
            value={idea.title}
            onChange={(e) => app.updateIdea(idea.id, "title", e.target.value)}
            placeholder="Idea title"
            style={{ border: `1px solid ${muted(25)}`, background: "var(--color-bg)", fontFamily: "var(--font-heading)", fontSize: 14, fontWeight: 800, color: "var(--color-text)", padding: "6px 8px", width: "100%" }}
          />
          <div style={fieldLabel}>Hook / opening line</div>
          <textarea
            value={idea.hook}
            onChange={(e) => app.updateIdea(idea.id, "hook", e.target.value)}
            placeholder="Hook / opening line"
            rows={2}
            style={{ border: `1px solid ${muted(25)}`, background: "var(--color-bg)", fontSize: 13, color: "var(--color-text)", padding: "6px 8px", width: "100%" }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={fieldLabel}>Platform</div>
              <select
                value={idea.platform}
                onChange={(e) => app.updateIdea(idea.id, "platform", e.target.value as Idea["platform"])}
                style={{ fontSize: 12, padding: "5px 6px", border: "1px solid var(--color-divider)", background: "var(--color-bg)", color: "var(--color-text)" }}
              >
                <option value="Any">Any</option>
                <option value="YouTube">YouTube</option>
                <option value="Instagram">Instagram</option>
                <option value="TikTok">TikTok</option>
              </select>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={fieldLabel}>Status</div>
              <select
                value={idea.status}
                onChange={(e) => app.setIdeaStatus(idea.id, e.target.value as IdeaStatus)}
                style={{ fontSize: 12, padding: "5px 6px", border: "1px solid var(--color-divider)", background: "var(--color-bg)", color: "var(--color-text)" }}
              >
                <option value="idea">Idea</option>
                <option value="scripted">Scripted</option>
                <option value="filmed">Filmed</option>
                <option value="posted">Posted</option>
              </select>
            </div>
          </div>
          <div style={fieldLabel}>Category</div>
          <select
            value={idea.categoryId}
            onChange={(e) => app.updateIdea(idea.id, "categoryId", e.target.value)}
            style={{ fontSize: 12, padding: "5px 6px", border: "1px solid var(--color-divider)", background: "var(--color-bg)", color: "var(--color-text)" }}
          >
            <option value="">Uncategorized</option>
            {app.data.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div style={fieldLabel}>Notes</div>
          <textarea
            value={idea.notes}
            onChange={(e) => app.updateIdea(idea.id, "notes", e.target.value)}
            placeholder="Notes"
            rows={2}
            style={{ border: `1px solid ${muted(25)}`, background: "var(--color-bg)", fontSize: 12, color: "var(--color-text)", padding: "6px 8px", width: "100%" }}
          />
          <div style={fieldLabel}>Reference link</div>
          <input
            value={idea.link}
            onChange={(e) => app.updateIdea(idea.id, "link", e.target.value)}
            placeholder="Reference link (optional)"
            style={{ border: `1px solid ${muted(25)}`, background: "var(--color-bg)", fontSize: 12, color: "var(--color-text)", padding: "6px 8px", width: "100%" }}
          />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderTop: `1px solid ${muted(25)}`, paddingTop: 8, marginTop: 2 }}>
            <div style={fieldLabel}>Script</div>
            <button
              onClick={() => (idea.script ? app.openRegenPanel(idea.id) : app.generateScript(idea.id))}
              disabled={scriptGenerating}
              style={{ border: "1px solid var(--color-accent)", background: "transparent", color: "var(--color-accent-700)", padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              {scriptButtonLabel}
            </button>
          </div>
          {showRegenPanel && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--color-bg)", border: `1px solid ${muted(25)}`, padding: 8 }}>
              <input
                value={regenNote}
                onChange={(e) => app.setRegenNote(idea.id, e.target.value)}
                placeholder="What should change? e.g. punchier hook, shorter, add a CTA"
                style={{ border: `1px solid ${muted(25)}`, background: "var(--color-surface)", fontSize: 12, color: "var(--color-text)", padding: "6px 8px", width: "100%" }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => app.generateScript(idea.id, regenNote)}
                  style={{ flex: 1, border: "1px solid var(--color-accent)", background: "var(--color-accent)", color: "var(--color-bg)", padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                >
                  {scriptButtonLabel}
                </button>
                <button
                  onClick={() => app.closeRegenPanel(idea.id)}
                  style={{ border: "1px solid var(--color-divider)", background: "transparent", color: "var(--color-text)", padding: "6px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <textarea
            value={idea.script}
            onChange={(e) => app.updateIdea(idea.id, "script", e.target.value)}
            placeholder="Generate a script from the notes above, or write your own"
            rows={6}
            style={{ border: `1px solid ${muted(25)}`, background: "var(--color-bg)", fontSize: 12, color: "var(--color-text)", padding: "6px 8px", width: "100%" }}
          />

          <div style={{ fontSize: 11, color: muted(50), borderTop: `1px solid ${muted(25)}`, paddingTop: 6 }}>{created}</div>
          <button onClick={() => app.toggleIdeaExpand(idea.id)} style={{ textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, fontWeight: 600, color: muted(55) }}>
            − Hide details
          </button>
        </>
      )}
    </div>
  );
}

/** Small inline "Clear N? Yes / Cancel" control, replacing a plain trigger button while armed — avoids native window.confirm(), which this app's fully custom-themed UI otherwise never uses. */
function ClearControl({ label, count, onConfirm, small }: { label: string; count: number; onConfirm: () => void; small?: boolean }) {
  const [armed, setArmed] = useState(false);
  if (!count) return null;
  if (!armed) {
    return (
      <button
        onClick={() => setArmed(true)}
        title={`Clear ${label}`}
        style={small
          ? { ...removeBtn, fontSize: 11, fontWeight: 700, padding: "2px 4px" }
          : { border: `1px solid ${muted(35)}`, background: "transparent", color: muted(70), padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
      >
        Clear{!small ? " board" : ""}
      </button>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: small ? 11 : 12 }}>
      <span style={{ color: muted(65) }}>
        Clear {count}?
      </span>
      <button
        onClick={() => {
          onConfirm();
          setArmed(false);
        }}
        style={{ border: "1px solid var(--color-accent)", background: "var(--color-accent)", color: "var(--color-bg)", padding: small ? "2px 6px" : "5px 10px", fontSize: small ? 11 : 12, fontWeight: 700, cursor: "pointer" }}
      >
        Yes
      </button>
      <button
        onClick={() => setArmed(false)}
        style={{ border: "1px solid var(--color-divider)", background: "transparent", color: "var(--color-text)", padding: small ? "2px 6px" : "5px 10px", fontSize: small ? 11 : 12, fontWeight: 600, cursor: "pointer" }}
      >
        Cancel
      </button>
    </div>
  );
}

export function IdeasBoardTab() {
  const app = useApp();
  const ideas = app.data.ideas.filter((i) => {
    if (app.activeBoardPlatform === "All") return true;
    if (app.activeBoardPlatform === "YouTube") return i.platform === "YouTube";
    return i.platform === "Instagram" || i.platform === "TikTok";
  });

  return (
    <div>
      <h1 style={pageTitle}>Ideas board</h1>
      <p style={{ fontSize: 15, color: muted(65), margin: "0 0 20px" }}>{ideas.length} ideas total. Click a title to open the full card and edit anything.</p>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {BOARD_FILTERS.map((f) => (
            <button key={f.value} style={chipStyle(app.activeBoardPlatform === f.value)} onClick={() => app.setActiveBoardPlatform(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
        <ClearControl label="board" count={ideas.length} onConfirm={() => app.clearIdeas("all", app.activeBoardPlatform)} />
      </div>
      <div style={{ display: "flex", gap: 24, overflowX: "auto", paddingBottom: 12 }}>
        {COLUMNS.map((col) => {
          const items = ideas.filter((i) => i.status === col.status);
          return (
            <div key={col.status} style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid var(--color-divider)", paddingBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text)" }}>{col.label}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "var(--color-neutral-800)", background: "var(--color-neutral-100)", padding: "2px 8px" }}>{items.length}</span>
                  <ClearControl label={col.label} count={items.length} onConfirm={() => app.clearIdeas(col.status, app.activeBoardPlatform)} small />
                </div>
              </div>
              {items.length === 0 && (
                <div style={{ fontSize: 13, color: muted(50), padding: 18, textAlign: "center", border: "1px solid var(--color-divider)" }}>No ideas here yet</div>
              )}
              {items.map((item) => (
                <IdeaCard key={item.id} idea={item} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
