"use client";

import { Component, type ReactNode } from "react";
import { muted, secondaryBtn } from "@/lib/styles";

interface Props {
  children: ReactNode;
  /** Shown above the reset button — should say what broke and what resetting will do. */
  fallbackTitle: string;
  /** Called when the user clicks "Reset" — should clear whatever data likely caused the crash. */
  onReset: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time exceptions from a subtree so one bad record (e.g. malformed data from an
 * external API) can't take down the whole page. React error boundaries must be class components —
 * there's no hooks equivalent.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("ErrorBoundary caught:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, border: "1px solid var(--color-accent-800)", background: "var(--color-surface)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{this.props.fallbackTitle}</div>
          <div style={{ fontSize: 11, color: muted(55), fontFamily: "monospace" }}>{this.state.error.message}</div>
          <button
            style={{ ...secondaryBtn, alignSelf: "flex-start" }}
            onClick={() => {
              this.props.onReset();
              this.setState({ error: null });
            }}
          >
            Reset this data
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
