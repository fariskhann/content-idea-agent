"use client";

import { useApp } from "@/lib/AppContext";
import { input, inputSm, kicker, muted, pageSubtitle, pageTitle, removeBtn, ghostAddBtn, textarea } from "@/lib/styles";

export function AboutTab() {
  const app = useApp();
  const d = app.data;

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={pageTitle}>About</h1>
      <p style={pageSubtitle}>
        What the agent knows before it writes anything — the brand, and you as a personal creator. Edit either any time; every content type is tagged
        Personal or Brand, and generation reads the matching outline.
      </p>

      <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, margin: "0 0 18px" }}>Brand outline</h2>

      <div style={{ marginBottom: 20 }}>
        <div style={kicker}>Brand name</div>
        <input
          value={d.brandName}
          onChange={(e) => app.setBrandField("brandName")(e.target.value)}
          placeholder="Your brand"
          style={{ ...input, fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18 }}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={kicker}>One-liner</div>
        <input value={d.brandOneLiner} onChange={(e) => app.setBrandField("brandOneLiner")(e.target.value)} placeholder="What is it, in one line?" style={input} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={kicker}>Target audience</div>
        <textarea value={d.brandAudience} onChange={(e) => app.setBrandField("brandAudience")(e.target.value)} placeholder="Who this is for" rows={2} style={textarea} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={kicker}>Voice &amp; tone</div>
        <textarea
          value={d.brandVoice}
          onChange={(e) => app.setBrandField("brandVoice")(e.target.value)}
          placeholder="How the brand sounds — direct, funny, no-BS..."
          rows={2}
          style={textarea}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ ...kicker, marginBottom: 10 }}>Key differentiators</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {d.brandPillars.map((p) => (
            <div key={p.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input value={p.text} onChange={(e) => app.updateBrandPillar(p.id, e.target.value)} placeholder="What sets you apart" style={inputSm} />
              <button onClick={() => app.removeBrandPillar(p.id)} style={removeBtn}>
                ×
              </button>
            </div>
          ))}
        </div>
        <button onClick={app.addBrandPillar} style={ghostAddBtn}>
          + Add differentiator
        </button>
      </div>

      <div style={{ marginBottom: 32 }}>
        <div style={kicker}>Anything else the AI should know</div>
        <textarea
          value={d.brandNotes}
          onChange={(e) => app.setBrandField("brandNotes")(e.target.value)}
          placeholder="Rules, things to avoid, past wins, house style..."
          rows={3}
          style={textarea}
        />
      </div>

      <div style={{ borderTop: "2px solid var(--color-divider)", paddingTop: 24 }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, margin: "0 0 4px" }}>Personal outline</h2>
        <p style={{ fontSize: 13, color: muted(60), margin: "0 0 18px" }}>You, as the creator. Used for content types tagged Personal.</p>

        <div style={{ marginBottom: 20 }}>
          <div style={kicker}>Your name</div>
          <input
            value={d.personalName}
            onChange={(e) => app.setBrandField("personalName")(e.target.value)}
            placeholder="Your name"
            style={{ ...input, fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18 }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={kicker}>One-liner</div>
          <input value={d.personalOneLiner} onChange={(e) => app.setBrandField("personalOneLiner")(e.target.value)} placeholder="Who are you, in one line?" style={input} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={kicker}>Voice &amp; tone</div>
          <textarea
            value={d.personalVoice}
            onChange={(e) => app.setBrandField("personalVoice")(e.target.value)}
            placeholder="How you sound — direct, funny, no-BS..."
            rows={2}
            style={textarea}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ ...kicker, marginBottom: 10 }}>Known for</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {d.personalTraits.map((p) => (
              <div key={p.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input value={p.text} onChange={(e) => app.updatePersonalTrait(p.id, e.target.value)} placeholder="A trait, belief, or thing people know you for" style={inputSm} />
                <button onClick={() => app.removePersonalTrait(p.id)} style={removeBtn}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <button onClick={app.addPersonalTrait} style={ghostAddBtn}>
            + Add trait
          </button>
        </div>

        <div>
          <div style={kicker}>Anything else the AI should know</div>
          <textarea
            value={d.personalNotes}
            onChange={(e) => app.setBrandField("personalNotes")(e.target.value)}
            placeholder="Rules, things to avoid, past wins, personal style..."
            rows={3}
            style={textarea}
          />
        </div>
      </div>
    </div>
  );
}
