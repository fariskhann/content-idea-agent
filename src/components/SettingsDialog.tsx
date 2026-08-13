"use client";

import { useApp } from "@/lib/AppContext";
import { input, kicker, muted, primaryBtn, secondaryBtn } from "@/lib/styles";
import { MODELS, providerLabel } from "@/lib/models";
import { computeSupadataUsage } from "@/lib/transcriptUsage";

function SupadataKeyField({
  label,
  hint,
  value,
  resetDay,
  log,
  onChangeKey,
  onChangeResetDay,
  inputId,
}: {
  label: string;
  hint: string;
  value: string;
  resetDay: number;
  log: number[];
  onChangeKey: (v: string) => void;
  onChangeResetDay: (v: number) => void;
  inputId: string;
}) {
  const usage = computeSupadataUsage(log, resetDay);
  return (
    <div>
      <div style={kicker}>{label}</div>
      <input type="password" value={value} onChange={(e) => onChangeKey(e.target.value)} placeholder="sd_..." style={input} />
      <div style={{ fontSize: 12, color: muted(55), marginTop: 6 }}>{hint}</div>
      {value && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 8, padding: "8px 10px", background: "var(--color-surface)" }}>
          <div style={{ fontSize: 12 }}>
            <strong>
              {usage.used} / {usage.limit}
            </strong>{" "}
            transcripts used this cycle · resets in {usage.daysUntilReset}d ({usage.resetDate.toLocaleDateString()})
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            <label htmlFor={inputId} style={{ fontSize: 11, color: muted(55) }}>
              Renews on day
            </label>
            <input
              id={inputId}
              type="number"
              min={1}
              max={28}
              value={resetDay || 1}
              onChange={(e) => onChangeResetDay(Math.min(Math.max(Number(e.target.value) || 1, 1), 28))}
              style={{ ...input, width: 56, padding: "4px 6px" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsDialog() {
  const app = useApp();
  if (!app.settingsOpen) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", padding: 16, background: "color-mix(in srgb, var(--color-neutral-900) 50%, transparent)", zIndex: 50 }}
      onClick={() => app.setSettingsOpen(false)}
    >
      <div
        style={{
          width: "min(480px, 100%)",
          maxHeight: "85vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          padding: 24,
          background: "var(--color-bg)",
          border: "2px solid var(--color-divider)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, margin: "0 0 4px" }}>Settings</h2>
          <p style={{ fontSize: 13, color: muted(60), margin: 0 }}>
            Stored only in this browser&apos;s local storage. Anthropic and YouTube calls go straight from your browser; DeepSeek and Supadata calls route
            through this app&apos;s own server (their APIs don&apos;t support direct browser requests) but the key never touches anywhere else.
          </p>
        </div>

        <div>
          <div style={kicker}>AI model</div>
          <select value={app.data.aiModel} onChange={(e) => app.setAiModel(e.target.value)} style={{ ...input, cursor: "pointer" }}>
            {(["anthropic", "deepseek"] as const).map((provider) => (
              <optgroup key={provider} label={providerLabel(provider)}>
                {MODELS.filter((m) => m.provider === provider).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} — ${m.inputPricePerM}/${m.outputPricePerM} per 1M
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <div style={{ fontSize: 12, color: muted(55), marginTop: 6 }}>
            Controls every AI call in the app — Generate and Inspiration&apos;s video analysis both use this model.
          </div>
        </div>

        <div>
          <div style={kicker}>Anthropic API key</div>
          <input
            type="password"
            value={app.settings.anthropicApiKey}
            onChange={(e) => app.updateSettings({ anthropicApiKey: e.target.value })}
            placeholder="sk-ant-..."
            style={input}
          />
          <div style={{ fontSize: 12, color: muted(55), marginTop: 6 }}>Used when a Claude model is selected in Generate.</div>
        </div>

        <div>
          <div style={kicker}>DeepSeek API key</div>
          <input
            type="password"
            value={app.settings.deepseekApiKey}
            onChange={(e) => app.updateSettings({ deepseekApiKey: e.target.value })}
            placeholder="sk-..."
            style={input}
          />
          <div style={{ fontSize: 12, color: muted(55), marginTop: 6 }}>Used when a DeepSeek model is selected in Generate — the cheapest option.</div>
        </div>

        <div>
          <div style={kicker}>YouTube Data API key</div>
          <input
            type="password"
            value={app.settings.youtubeApiKey}
            onChange={(e) => app.updateSettings({ youtubeApiKey: e.target.value })}
            placeholder="AIza..."
            style={input}
          />
          <div style={{ fontSize: 12, color: muted(55), marginTop: 6 }}>
            API-key-only credential from Google Cloud Console (no OAuth needed) — used to pull channel video lists in Inspiration.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, border: `1px solid ${muted(20)}` }}>
          <SupadataKeyField
            label="Supadata API key (primary)"
            hint="Used to fetch video transcripts for analysis in Inspiration — only this key is ever called."
            value={app.settings.supadataApiKey}
            resetDay={app.settings.supadataResetDay}
            log={app.transcriptLog}
            onChangeKey={(v) => app.updateSettings({ supadataApiKey: v })}
            onChangeResetDay={(v) => app.updateSettings({ supadataResetDay: v })}
            inputId="supadata-reset-day"
          />

          <button
            onClick={app.swapSupadataKeys}
            title="Swaps the primary and backup keys, along with each one's own usage tracking"
            style={{ ...secondaryBtn, alignSelf: "flex-start", fontSize: 12, padding: "6px 12px" }}
          >
            ⇄ Swap primary / backup
          </button>

          <SupadataKeyField
            label="Supadata API key (backup)"
            hint="A second account kept on standby. Not used for calls until you swap it into the primary slot above."
            value={app.settings.supadataBackupApiKey}
            resetDay={app.settings.supadataBackupResetDay}
            log={app.transcriptBackupLog}
            onChangeKey={(v) => app.updateSettings({ supadataBackupApiKey: v })}
            onChangeResetDay={(v) => app.updateSettings({ supadataBackupResetDay: v })}
            inputId="supadata-backup-reset-day"
          />

          <div style={{ fontSize: 11, color: muted(50) }}>
            Usage counts are tracked locally as an estimate — Supadata doesn&apos;t expose a usage API. Set &quot;renews on day&quot; to match each
            account&apos;s actual billing date for accuracy.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <button style={secondaryBtn} onClick={() => app.setSettingsOpen(false)}>
            Close
          </button>
          <button style={primaryBtn} onClick={() => app.setSettingsOpen(false)}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
