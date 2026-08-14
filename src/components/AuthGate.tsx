"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { input, kicker, muted, pageSubtitle, pageTitle, primaryBtn } from "@/lib/styles";

type Mode = "sign-in" | "sign-up" | "forgot";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(false);
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;

  if (session && !recovering) return <>{children}</>;

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setRecovering(false);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      if (mode === "sign-in") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else if (mode === "sign-up") {
        const { error: err, data } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        if (!data.session) setMessage("Account created — check your email to confirm, then sign in.");
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        });
        if (err) throw err;
        setMessage("Check your email for a link to set a new password.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  if (recovering) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-heading)" }}>
        <form onSubmit={handleSetNewPassword} style={{ width: 340 }}>
          <h1 style={pageTitle}>Content idea agent</h1>
          <p style={pageSubtitle}>Set a new password.</p>

          <div style={{ ...kicker, marginBottom: 6 }}>New password</div>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...input, marginBottom: 20 }}
            autoFocus
          />

          <button type="submit" disabled={submitting} style={{ ...primaryBtn, width: "100%", marginBottom: 14 }}>
            {submitting ? "Please wait…" : "Set password"}
          </button>

          {error && (
            <div style={{ padding: "10px 12px", borderLeft: "2px solid var(--color-accent)", background: "var(--color-accent-100)", color: "var(--color-accent-800)", fontSize: 13 }}>
              {error}
            </div>
          )}
        </form>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-heading)" }}>
      <form onSubmit={handleSubmit} style={{ width: 340 }}>
        <h1 style={pageTitle}>Content idea agent</h1>
        <p style={pageSubtitle}>{mode === "sign-in" ? "Sign in to continue." : mode === "sign-up" ? "Create your account." : "Reset your password."}</p>

        <div style={{ ...kicker, marginBottom: 6 }}>Email</div>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...input, marginBottom: 14 }} autoFocus />

        {mode !== "forgot" && (
          <>
            <div style={{ ...kicker, marginBottom: 6 }}>Password</div>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...input, marginBottom: 20 }}
            />
          </>
        )}

        <button type="submit" disabled={submitting} style={{ ...primaryBtn, width: "100%", marginBottom: 14 }}>
          {submitting ? "Please wait…" : mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Sign up" : "Send reset link"}
        </button>

        {error && (
          <div style={{ padding: "10px 12px", borderLeft: "2px solid var(--color-accent)", background: "var(--color-accent-100)", color: "var(--color-accent-800)", fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}
        {message && (
          <div style={{ padding: "10px 12px", border: "1px solid var(--color-divider)", fontSize: 13, marginBottom: 14 }}>{message}</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(mode === "sign-in" || mode === "sign-up") && (
            <button
              type="button"
              onClick={() => {
                setMode(mode === "sign-in" ? "sign-up" : "sign-in");
                setError("");
                setMessage("");
              }}
              style={{ border: "none", background: "transparent", color: muted(60), cursor: "pointer", fontSize: 13, textDecoration: "underline", padding: 0, textAlign: "left" }}
            >
              {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </button>
          )}
          {mode === "sign-in" && (
            <button
              type="button"
              onClick={() => {
                setMode("forgot");
                setError("");
                setMessage("");
              }}
              style={{ border: "none", background: "transparent", color: muted(60), cursor: "pointer", fontSize: 13, textDecoration: "underline", padding: 0, textAlign: "left" }}
            >
              Forgot password?
            </button>
          )}
          {mode === "forgot" && (
            <button
              type="button"
              onClick={() => {
                setMode("sign-in");
                setError("");
                setMessage("");
              }}
              style={{ border: "none", background: "transparent", color: muted(60), cursor: "pointer", fontSize: 13, textDecoration: "underline", padding: 0, textAlign: "left" }}
            >
              Back to sign in
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
