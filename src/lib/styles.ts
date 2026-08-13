import type { CSSProperties } from "react";

export const muted = (pct: number): string => `color-mix(in srgb, var(--color-text) ${pct}%, transparent)`;

export const kicker: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: muted(60),
  marginBottom: 8,
};

export const fieldLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: muted(50),
};

export const input: CSSProperties = {
  width: "100%",
  border: "1px solid var(--color-divider)",
  background: "var(--color-surface)",
  fontSize: 14,
  color: "var(--color-text)",
  padding: "10px 12px",
};

export const inputSm: CSSProperties = {
  flex: 1,
  border: `1px solid ${muted(25)}`,
  background: "var(--color-surface)",
  fontSize: 13,
  color: "var(--color-text)",
  padding: "7px 10px",
};

export const textarea: CSSProperties = { ...input, resize: "vertical" };

export const removeBtn: CSSProperties = {
  border: "none",
  background: "transparent",
  color: muted(50),
  cursor: "pointer",
  fontSize: 15,
  lineHeight: 1,
};

export const ghostAddBtn: CSSProperties = {
  border: "1px solid var(--color-divider)",
  background: "transparent",
  color: "var(--color-text)",
  padding: "7px 12px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  textAlign: "left",
};

export const secondaryBtn: CSSProperties = {
  padding: "11px 20px",
  border: "1px solid var(--color-divider)",
  background: "transparent",
  color: "var(--color-text)",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
};

export const primaryBtn: CSSProperties = {
  padding: "11px 22px",
  border: "1px solid var(--color-accent)",
  background: "var(--color-accent)",
  color: "var(--color-bg)",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
};

export function chipStyle(active: boolean): CSSProperties {
  if (active) {
    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "7px 14px",
      border: "1px solid var(--color-accent)",
      background: "var(--color-accent)",
      color: "var(--color-bg)",
      fontSize: 13,
      fontWeight: 800,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  }
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 14px",
    border: "1px solid var(--color-divider)",
    background: "transparent",
    color: "var(--color-text)",
    fontSize: 13,
    fontWeight: 400,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

export const pageTitle: CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontWeight: 800,
  fontSize: 38,
  letterSpacing: "-0.015em",
  margin: "0 0 8px",
};

export const pageSubtitle: CSSProperties = {
  fontSize: 15,
  color: muted(65),
  margin: "0 0 28px",
  maxWidth: 600,
};
