"use client";

import { useState } from "react";
import { useApp } from "@/lib/AppContext";
import { input, kicker, muted, primaryBtn, secondaryBtn } from "@/lib/styles";
import { MODELS, providerLabel } from "@/lib/models";
import { computeSupadataUsage } from "@/lib/transcriptUsage";
import { computeApifyUsage, type ApifyLogEntry } from "@/lib/apifyUsage";

/** "sk-ant-a1b2c3...9xYz" — never the full key, just enough to confirm you pasted the right one. */
function maskKeyPreview(key: string): string {
  if (key.length <= 8) return key.length <= 2 ? key : key[0] + "…" + key[key.length - 1];
  return key.slice(0, 6) + "…" + key.slice(-4);
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {open ? (
        <>
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a20.3 20.3 0 0 1-3.22 4.28" />
          <path d="M1 1l22 22" />
        </>
      )}
    </svg>
  );
}

function KeyInput({
  value,
  onChange,
  placeholder,
  revealed,
  onToggleReveal,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  revealed: boolean;
  onToggleReveal: () => void;
}) {
  return (
    <div style={{ position: "relative" }}>
      <input
        type={revealed ? "text" : "password"}
        value={revealed ? maskKeyPreview(value) : value}
        onChange={(e) => !revealed && onChange(e.target.value)}
        readOnly={revealed}
        placeholder={placeholder}
        style={{ ...input, paddingRight: 34 }}
      />
      <button
        type="button"
        onClick={onToggleReveal}
        disabled={!value}
        title={revealed ? "Hide key" : "View key"}
        style={{
          position: "absolute",
          right: 4,
          top: "50%",
          transform: "translateY(-50%)",
          border: "none",
          background: "none",
          padding: 4,
          display: "flex",
          color: muted(60),
          cursor: value ? "pointer" : "default",
          opacity: value ? 1 : 0.4,
        }}
      >
        <EyeIcon open={revealed} />
      </button>
    </div>
  );
}

function SupadataKeyField({
  label,
  hint,
  value,
  resetDay,
  log,
  onChangeKey,
  onChangeResetDay,
  inputId,
  revealed,
  onToggleReveal,
}: {
  label: string;
  hint: string;
  value: string;
  resetDay: number;
  log: number[];
  onChangeKey: (v: string) => void;
  onChangeResetDay: (v: number) => void;
  inputId: string;
  revealed: boolean;
  onToggleReveal: () => void;
}) {
  const usage = computeSupadataUsage(log, resetDay);
  return (
    <div>
      <div style={kicker}>{label}</div>
      <KeyInput value={value} onChange={onChangeKey} placeholder="sd_..." revealed={revealed} onToggleReveal={onToggleReveal} />
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

function ApifyKeyField({
  label,
  hint,
  value,
  resetDay,
  log,
  onChangeKey,
  onChangeResetDay,
  inputId,
  revealed,
  onToggleReveal,
}: {
  label: string;
  hint: string;
  value: string;
  resetDay: number;
  log: ApifyLogEntry[];
  onChangeKey: (v: string) => void;
  onChangeResetDay: (v: number) => void;
  inputId: string;
  revealed: boolean;
  onToggleReveal: () => void;
}) {
  const usage = computeApifyUsage(log, resetDay);
  return (
    <div>
      <div style={kicker}>{label}</div>
      <KeyInput value={value} onChange={onChangeKey} placeholder="apify_api_..." revealed={revealed} onToggleReveal={onToggleReveal} />
      <div style={{ fontSize: 12, color: muted(55), marginTop: 6 }}>{hint}</div>
      {value && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 8, padding: "8px 10px", background: "var(--color-surface)" }}>
          <div style={{ fontSize: 12 }}>
            <strong>
              ${usage.usedUsd.toFixed(2)} / ${usage.limitUsd.toFixed(2)}
            </strong>{" "}
            spent this cycle · resets in {usage.daysUntilReset}d ({usage.resetDate.toLocaleDateString()})
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
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  if (!app.settingsOpen) return null;

  const toggleReveal = (key: string) => setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));

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
            Synced to your account, so these carry over across devices. Anthropic and YouTube calls go straight from your browser (so those keys are
            visible in that request); DeepSeek, Supadata, and Apify calls route through this app&apos;s own server instead, since their APIs
            don&apos;t support direct browser requests.
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
          <KeyInput
            value={app.settings.anthropicApiKey}
            onChange={(v) => app.updateSettings({ anthropicApiKey: v })}
            placeholder="sk-ant-..."
            revealed={!!revealed.anthropic}
            onToggleReveal={() => toggleReveal("anthropic")}
          />
          <div style={{ fontSize: 12, color: muted(55), marginTop: 6 }}>Used when a Claude model is selected in Generate.</div>
        </div>

        <div>
          <div style={kicker}>DeepSeek API key</div>
          <KeyInput
            value={app.settings.deepseekApiKey}
            onChange={(v) => app.updateSettings({ deepseekApiKey: v })}
            placeholder="sk-..."
            revealed={!!revealed.deepseek}
            onToggleReveal={() => toggleReveal("deepseek")}
          />
          <div style={{ fontSize: 12, color: muted(55), marginTop: 6 }}>Used when a DeepSeek model is selected in Generate — the cheapest option.</div>
        </div>

        <div>
          <div style={kicker}>YouTube Data API key</div>
          <KeyInput
            value={app.settings.youtubeApiKey}
            onChange={(v) => app.updateSettings({ youtubeApiKey: v })}
            placeholder="AIza..."
            revealed={!!revealed.youtube}
            onToggleReveal={() => toggleReveal("youtube")}
          />
          <div style={{ fontSize: 12, color: muted(55), marginTop: 6 }}>
            API-key-only credential from Google Cloud Console (no OAuth needed) — used to pull channel video lists in Inspiration.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, border: `1px solid ${muted(20)}` }}>
          <ApifyKeyField
            label="Apify API token (primary)"
            hint="Used to pull TikTok and Instagram video lists in Inspiration — only this token is ever called."
            value={app.settings.apifyApiKey}
            resetDay={app.settings.apifyResetDay}
            log={app.apifyLog}
            onChangeKey={(v) => app.updateSettings({ apifyApiKey: v })}
            onChangeResetDay={(v) => app.updateSettings({ apifyResetDay: v })}
            inputId="apify-reset-day"
            revealed={!!revealed.apifyPrimary}
            onToggleReveal={() => toggleReveal("apifyPrimary")}
          />

          <button
            onClick={app.swapApifyKeys}
            title="Swaps the primary and backup tokens, along with each one's own spend tracking"
            style={{ ...secondaryBtn, alignSelf: "flex-start", fontSize: 12, padding: "6px 12px" }}
          >
            ⇄ Swap primary / backup
          </button>

          <ApifyKeyField
            label="Apify API token (backup)"
            hint="A second account kept on standby. Not used for calls until you swap it into the primary slot above."
            value={app.settings.apifyBackupApiKey}
            resetDay={app.settings.apifyBackupResetDay}
            log={app.apifyBackupLog}
            onChangeKey={(v) => app.updateSettings({ apifyBackupApiKey: v })}
            onChangeResetDay={(v) => app.updateSettings({ apifyBackupResetDay: v })}
            inputId="apify-backup-reset-day"
            revealed={!!revealed.apifyBackup}
            onToggleReveal={() => toggleReveal("apifyBackup")}
          />

          <div style={{ fontSize: 11, color: muted(50) }}>
            Spend is estimated locally from each fetch&apos;s per-result pricing, not Apify&apos;s live invoice — set &quot;renews on day&quot; to match
            each account&apos;s actual billing date for accuracy.
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
            revealed={!!revealed.supadataPrimary}
            onToggleReveal={() => toggleReveal("supadataPrimary")}
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
            revealed={!!revealed.supadataBackup}
            onToggleReveal={() => toggleReveal("supadataBackup")}
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
