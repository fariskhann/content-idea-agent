"use client";

import { useState } from "react";
import { useApp } from "@/lib/AppContext";
import { kicker, muted, pageSubtitle, pageTitle, removeBtn } from "@/lib/styles";
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
          from {entry.sourceInspirationName || "an inspiration creator"} ·{" "}
          {new Date(entry.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        </span>
        <button onClick={() => app.removeLibraryEntry(entry.id)} style={removeBtn}>
          ×
        </button>
      </div>
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

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={pageTitle}>Library</h1>
      <p style={pageSubtitle}>
        Durable learnings distilled from analysed inspiration videos, scoped by content type and fed into idea and script generation. Add to it from a
        creator&apos;s analysed videos in Inspiration.
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

      {catsInGroup.map((cat) => {
        const entries = libraryInGroup.filter((e) => e.categoryIds.includes(cat.id));
        return (
          <div key={cat.id} style={{ background: "var(--color-surface)", padding: 20, marginBottom: 16 }}>
            <div style={{ ...kicker, marginBottom: 10 }}>
              {cat.name} {entries.length > 0 && `(${entries.length})`}
            </div>
            {entries.length === 0 ? (
              <div style={{ fontSize: 12, color: muted(50) }}>
                Nothing distilled into this content type yet — use &quot;Add to library&quot; on an analysed Inspiration video.
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
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, margin: "0 0 4px" }}>General</h2>
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
