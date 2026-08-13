"use client";

import { useRef } from "react";
import { useApp } from "@/lib/AppContext";
import { muted } from "@/lib/styles";
import type { TabId } from "@/lib/types";

const TABS: { id: TabId; label: string; count?: (n: ReturnType<typeof useApp>) => number }[] = [
  { id: "brand", label: "About" },
  { id: "generate", label: "Generate" },
  { id: "ideas", label: "Ideas board", count: (app) => app.data.ideas.length },
  { id: "frameworks", label: "Frameworks" },
  { id: "inspiration", label: "Inspiration", count: (app) => app.data.inspirations.length },
];

export function Nav() {
  const app = useApp();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <nav
      style={{
        width: 250,
        flexShrink: 0,
        borderRight: "2px solid var(--color-divider)",
        padding: "32px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 28,
        position: "sticky",
        top: 0,
        height: "100vh",
        overflowY: "auto",
        background: "var(--color-bg)",
      }}
    >
      <div>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: muted(55), marginBottom: 6 }}>Brand</div>
        <input
          value={app.data.brandName}
          onChange={(e) => app.setBrandField("brandName")(e.target.value)}
          placeholder="Your brand"
          style={{
            width: "100%",
            border: "none",
            borderBottom: "2px solid transparent",
            background: "transparent",
            fontFamily: "var(--font-heading)",
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: "-0.015em",
            color: "var(--color-text)",
            padding: "2px 0",
          }}
          onFocus={(e) => (e.currentTarget.style.borderBottom = "2px solid var(--color-accent)")}
          onBlur={(e) => (e.currentTarget.style.borderBottom = "2px solid transparent")}
        />
        <div style={{ fontSize: 12, color: muted(55), marginTop: 4 }}>Content idea agent</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {TABS.map((tab) => {
          const active = app.activeTab === tab.id;
          const count = tab.count ? tab.count(app) : undefined;
          return (
            <button
              key={tab.id}
              onClick={() => app.setActiveTab(tab.id)}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderLeft: `2px solid ${active ? "var(--color-accent)" : "transparent"}`,
                background: active ? "var(--color-surface)" : "transparent",
                color: active ? "var(--color-accent-700)" : "var(--color-text)",
                cursor: active ? "default" : "pointer",
                fontSize: 15,
                fontWeight: active ? 800 : 400,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span>{tab.label}</span>
              {count !== undefined && (
                <span style={{ fontSize: 11, background: "var(--color-neutral-100)", color: "var(--color-neutral-800)", padding: "2px 8px" }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "2px solid var(--color-divider)", paddingTop: 16 }}>
        <button
          onClick={() => app.setSettingsOpen(true)}
          style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--color-divider)", background: "transparent", color: "var(--color-text)", cursor: "pointer", fontSize: 13, fontWeight: 600, textAlign: "left" }}
        >
          API keys / Settings
        </button>
        <button
          onClick={() => app.setUsageDialogOpen(true)}
          style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--color-divider)", background: "transparent", color: "var(--color-text)", cursor: "pointer", fontSize: 13, fontWeight: 600, textAlign: "left" }}
        >
          Usage &amp; costs
        </button>
        <button
          onClick={app.exportJSON}
          style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--color-divider)", background: "transparent", color: "var(--color-text)", cursor: "pointer", fontSize: 13, fontWeight: 600, textAlign: "left" }}
        >
          Export data (.json)
        </button>
        <label
          style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--color-divider)", background: "transparent", color: "var(--color-text)", cursor: "pointer", fontSize: 13, fontWeight: 600, textAlign: "left", display: "block" }}
        >
          Import data
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) app.importJSON(file);
              e.target.value = "";
            }}
            style={{ display: "none" }}
          />
        </label>
        <div style={{ fontSize: 11, color: muted(55) }}>Saved locally in this browser</div>
      </div>
    </nav>
  );
}
