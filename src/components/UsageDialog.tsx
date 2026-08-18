"use client";

import { useMemo } from "react";
import { useApp } from "@/lib/AppContext";
import { muted, primaryBtn, secondaryBtn } from "@/lib/styles";
import { computeTotals, formatCost } from "@/lib/usage";
import { providerLabel } from "@/lib/models";

const FEATURE_LABEL: Record<string, string> = {
  generate: "Generate",
  script: "Script",
  "evaluate-idea": "Evaluate idea",
  "evaluate-script": "Evaluate script",
  "youtube-analysis": "YouTube analysis",
  "library-distill": "Library distill",
  "tiktok-fetch": "TikTok fetch",
  "instagram-fetch": "Instagram fetch",
  "tiktok-analysis": "TikTok analysis",
  "instagram-analysis": "Instagram analysis",
};

export function UsageDialog() {
  const app = useApp();
  const totals = useMemo(() => computeTotals(app.usageLog), [app.usageLog]);

  if (!app.usageDialogOpen) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", padding: 16, background: "color-mix(in srgb, var(--color-neutral-900) 50%, transparent)", zIndex: 50 }}
      onClick={() => app.setUsageDialogOpen(false)}
    >
      <div
        style={{ width: "min(680px, 100%)", maxHeight: "85vh", display: "flex", flexDirection: "column", gap: 16, padding: 24, background: "var(--color-bg)", border: "2px solid var(--color-divider)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, margin: "0 0 4px" }}>Usage &amp; costs</h2>
          <p style={{ fontSize: 13, color: muted(60), margin: 0 }}>
            Estimated from each response&apos;s reported token usage and this model&apos;s list price. Tracked locally in this browser only.
          </p>
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 140, background: "var(--color-surface)", padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: muted(55) }}>All-time</div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 24 }}>{formatCost(totals.allTimeCostUsd)}</div>
          </div>
          <div style={{ flex: 1, minWidth: 140, background: "var(--color-surface)", padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: muted(55) }}>Today</div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 24 }}>{formatCost(totals.todayCostUsd)}</div>
          </div>
          <div style={{ flex: 1, minWidth: 140, background: "var(--color-surface)", padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: muted(55) }}>Calls logged</div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 24 }}>{totals.callCount}</div>
          </div>
        </div>

        {totals.byModel.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: muted(55), marginBottom: 8 }}>By model</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {totals.byModel.map((m) => (
                <div key={m.modelId} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: `1px solid ${muted(15)}` }}>
                  <span>
                    {m.modelLabel} <span style={{ color: muted(50) }}>({providerLabel(m.provider)})</span>
                  </span>
                  <span>
                    {m.calls} call{m.calls === 1 ? "" : "s"} · {formatCost(m.costUsd)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", border: `1px solid ${muted(15)}` }}>
          {app.usageLog.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: muted(50) }}>No calls logged yet.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid var(--color-divider)`, textAlign: "left" }}>
                  <th style={{ padding: 8 }}>When</th>
                  <th style={{ padding: 8 }}>Feature</th>
                  <th style={{ padding: 8 }}>Model</th>
                  <th style={{ padding: 8, textAlign: "right" }}>Tokens</th>
                  <th style={{ padding: 8, textAlign: "right" }}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {app.usageLog.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: `1px solid ${muted(10)}` }}>
                    <td style={{ padding: 8, color: muted(55) }}>{new Date(entry.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                    <td style={{ padding: 8 }}>{FEATURE_LABEL[entry.feature] || entry.feature}</td>
                    <td style={{ padding: 8 }}>{entry.modelLabel}</td>
                    <td style={{ padding: 8, textAlign: "right", color: muted(55) }}>
                      {entry.inputTokens.toLocaleString()} in / {entry.outputTokens.toLocaleString()} out
                    </td>
                    <td style={{ padding: 8, textAlign: "right", fontWeight: 700 }}>{formatCost(entry.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
          <button style={secondaryBtn} onClick={app.clearUsage} disabled={app.usageLog.length === 0}>
            Clear log
          </button>
          <button style={primaryBtn} onClick={() => app.setUsageDialogOpen(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
