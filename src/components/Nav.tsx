"use client";

import { useRef, useState } from "react";
import { useApp } from "@/lib/AppContext";
import { muted } from "@/lib/styles";
import type { TabId } from "@/lib/types";

const TABS: { id: TabId; label: string; short: string; count?: (n: ReturnType<typeof useApp>) => number }[] = [
  { id: "brand", label: "About", short: "Ab" },
  { id: "generate", label: "Generate", short: "Ge" },
  { id: "ideas", label: "Ideas board", short: "Id", count: (app) => app.data.ideas.length },
  { id: "frameworks", label: "Frameworks", short: "Fr" },
  { id: "inspiration", label: "Inspiration", short: "In", count: (app) => app.data.inspirations.length },
];

const COLLAPSED_KEY = "cia_sidebar_collapsed_v1";

export function Nav() {
  const app = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  return (
    <nav
      style={{
        width: collapsed ? 56 : 250,
        flexShrink: 0,
        borderRight: "2px solid var(--color-divider)",
        padding: collapsed ? "16px 8px" : "32px 24px",
        display: "flex",
        flexDirection: "column",
        gap: collapsed ? 14 : 28,
        position: "sticky",
        top: 0,
        height: "100vh",
        overflowY: "auto",
        overflowX: "hidden",
        background: "var(--color-bg)",
      }}
    >
      <button
        onClick={toggleCollapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        style={{
          alignSelf: collapsed ? "center" : "flex-end",
          border: `1px solid ${muted(25)}`,
          background: "transparent",
          color: muted(70),
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          padding: collapsed ? "5px 8px" : "4px 10px",
        }}
      >
        {collapsed ? "»" : "« Collapse"}
      </button>

      {!collapsed && (
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
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: collapsed ? 6 : 0 }}>
        {TABS.map((tab) => {
          const active = app.activeTab === tab.id;
          const count = tab.count ? tab.count(app) : undefined;
          return (
            <button
              key={tab.id}
              onClick={() => app.setActiveTab(tab.id)}
              title={tab.label}
              style={{
                textAlign: collapsed ? "center" : "left",
                padding: collapsed ? "10px 4px" : "10px 12px",
                borderLeft: collapsed ? "none" : `2px solid ${active ? "var(--color-accent)" : "transparent"}`,
                borderBottom: collapsed ? `2px solid ${active ? "var(--color-accent)" : "transparent"}` : "none",
                background: active ? "var(--color-surface)" : "transparent",
                color: active ? "var(--color-accent-700)" : "var(--color-text)",
                cursor: active ? "default" : "pointer",
                fontSize: collapsed ? 12 : 15,
                fontWeight: active ? 800 : 400,
                display: "flex",
                alignItems: "center",
                justifyContent: collapsed ? "center" : "space-between",
                gap: 8,
              }}
            >
              <span>{collapsed ? tab.short : tab.label}</span>
              {count !== undefined && !collapsed && (
                <span style={{ fontSize: 11, background: "var(--color-neutral-100)", color: "var(--color-neutral-800)", padding: "2px 8px" }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      {!collapsed && (
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
      )}
    </nav>
  );
}
