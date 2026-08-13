"use client";

import { useApp } from "@/lib/AppContext";
import { ghostAddBtn, inputSm, kicker, muted, pageSubtitle, pageTitle, removeBtn } from "@/lib/styles";
import type { Category, Owner, Stage } from "@/lib/types";

function CategoryCard({ cat }: { cat: Category }) {
  const app = useApp();
  const expanded = !!app.expandedCategoryIds[cat.id];

  return (
    <div style={{ background: "var(--color-surface)", padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, borderBottom: `1px solid ${muted(30)}`, paddingBottom: 12 }}>
        <button onClick={() => app.toggleCategoryExpand(cat.id)} style={{ border: "none", background: "transparent", color: muted(60), cursor: "pointer", fontSize: 13, padding: "0 2px", flexShrink: 0 }}>
          {expanded ? "▾" : "▸"}
        </button>
        <input
          value={cat.name}
          onChange={(e) => app.updateCategoryField(cat.id, "name", e.target.value)}
          style={{ flex: 1, border: "none", borderBottom: "1px solid transparent", background: "transparent", fontFamily: "var(--font-heading)", fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em", color: "var(--color-text)", padding: "2px 0" }}
        />
        <select
          value={cat.stage}
          onChange={(e) => app.updateCategoryField(cat.id, "stage", e.target.value as Stage)}
          style={{ fontSize: 12, padding: "5px 8px", border: "1px solid var(--color-divider)", background: "var(--color-bg)", color: "var(--color-text)" }}
        >
          <option value="TOF">TOF</option>
          <option value="MOF">MOF</option>
          <option value="BOF">BOF</option>
        </select>
        <select
          key={`${cat.id}-${cat.owner}`}
          value={cat.owner || "brand"}
          onChange={(e) => app.updateCategoryField(cat.id, "owner", e.target.value as Owner)}
          style={{ fontSize: 12, padding: "5px 8px", border: "1px solid var(--color-divider)", background: "var(--color-bg)", color: "var(--color-text)" }}
        >
          <option value="brand">Brand</option>
          <option value="personal">Personal</option>
        </select>
        <button onClick={() => app.removeCategory(cat.id)} style={{ ...removeBtn, fontSize: 17 }}>
          ×
        </button>
      </div>

      {!expanded && (
        <div style={{ fontSize: 13, color: muted(60) }}>
          {cat.angles.length} formats · {cat.structures.length} structures · {cat.owner === "personal" ? "Personal" : "Brand"}
        </div>
      )}

      {expanded && (
        <>
          <textarea
            value={cat.desc}
            onChange={(e) => app.updateCategoryField(cat.id, "desc", e.target.value)}
            placeholder="What is this content type for?"
            rows={2}
            style={{ width: "100%", border: `1px solid ${muted(25)}`, background: "var(--color-bg)", fontSize: 13, color: "var(--color-text)", padding: "8px 10px", marginBottom: 14 }}
          />

          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: muted(60), marginBottom: 8 }}>
            Structures{" "}
            <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: muted(50) }}>
              — every idea generated here produces one variant per structure below; formats can layer their own note on top
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {cat.structures.map((st) => (
              <div key={st.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  value={st.text}
                  onChange={(e) => app.updateStructure(cat.id, st.id, e.target.value)}
                  placeholder="e.g. Hook with the take → back it with a reason or story → land the point"
                  style={inputSm}
                />
                <button onClick={() => app.removeStructure(cat.id, st.id)} style={removeBtn}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => app.addStructure(cat.id)} style={{ ...ghostAddBtn, marginBottom: 16 }}>
            + Add structure
          </button>

          <div style={{ ...kicker, marginBottom: 10 }}>Formats</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {cat.angles.map((angle) => (
              <div key={angle.id} style={{ border: `1px solid ${muted(25)}`, background: "var(--color-bg)", padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    value={angle.name}
                    onChange={(e) => app.updateAngleField(cat.id, angle.id, "name", e.target.value)}
                    placeholder="Format name"
                    style={{ flex: 1, border: "none", background: "transparent", fontSize: 13, fontWeight: 700, color: "var(--color-text)", padding: "2px 0" }}
                  />
                  <button onClick={() => app.removeAngle(cat.id, angle.id)} style={removeBtn}>
                    ×
                  </button>
                </div>
                <textarea
                  value={angle.structure}
                  onChange={(e) => app.updateAngleField(cat.id, angle.id, "structure", e.target.value)}
                  placeholder="Extra notes on top of the default structure (optional)"
                  rows={2}
                  style={{ border: `1px solid ${muted(20)}`, background: "var(--color-surface)", fontSize: 12, color: "var(--color-text)", padding: "6px 8px", width: "100%" }}
                />
              </div>
            ))}
          </div>
          <button onClick={() => app.addAngle(cat.id)} style={ghostAddBtn}>
            + Add format
          </button>
        </>
      )}
    </div>
  );
}

export function FrameworksTab() {
  const app = useApp();
  const d = app.data;

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={pageTitle}>Your content framework</h1>
      <p style={pageSubtitle}>Content types, their formats, and the structure that makes each one work. Edit any of it — the generator reads straight from here.</p>

      {d.categories.map((cat) => (
        <CategoryCard key={cat.id} cat={cat} />
      ))}
      <button onClick={app.addCategory} style={{ ...ghostAddBtn, padding: 12, fontSize: 13, width: "100%", marginBottom: 32 }}>
        + Add content type
      </button>

      <div style={{ borderTop: "2px solid var(--color-divider)", paddingTop: 24 }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, margin: "0 0 4px" }}>Hook formulas</h2>
        <p style={{ fontSize: 13, color: muted(60), margin: "0 0 16px" }}>Fed into every generated idea.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, maxWidth: 480 }}>
          {d.hooks.map((h) => (
            <div key={h.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input value={h.text} onChange={(e) => app.updateHook(h.id, e.target.value)} style={inputSm} />
              <button onClick={() => app.removeHook(h.id)} style={removeBtn}>
                ×
              </button>
            </div>
          ))}
        </div>
        <button onClick={app.addHook} style={{ ...ghostAddBtn, maxWidth: 480, width: "100%" }}>
          + Add hook formula
        </button>
      </div>
    </div>
  );
}
