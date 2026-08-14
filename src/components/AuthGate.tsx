"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { input, kicker, muted, pageSubtitle, pageTitle, primaryBtn } from "@/lib/styles";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signedUpMessage, setSignedUpMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;

  if (session) return <>{children}</>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSignedUpMessage("");
    setSubmitting(true);
    try {
      if (mode === "sign-in") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else {
        const { error: err, data } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        if (!data.session) setSignedUpMessage("Account created — check your email to confirm, then sign in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-heading)" }}>
      <form onSubmit={handleSubmit} style={{ width: 340 }}>
        <h1 style={pageTitle}>Content idea agent</h1>
        <p style={pageSubtitle}>{mode === "sign-in" ? "Sign in to continue." : "Create your account."}</p>

        <div style={{ ...kicker, marginBottom: 6 }}>Email</div>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...input, marginBottom: 14 }} autoFocus />

        <div style={{ ...kicker, marginBottom: 6 }}>Password</div>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ ...input, marginBottom: 20 }}
        />

        <button type="submit" disabled={submitting} style={{ ...primaryBtn, width: "100%", marginBottom: 14 }}>
          {submitting ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Sign up"}
        </button>

        {error && (
          <div style={{ padding: "10px 12px", borderLeft: "2px solid var(--color-accent)", background: "var(--color-accent-100)", color: "var(--color-accent-800)", fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}
        {signedUpMessage && (
          <div style={{ padding: "10px 12px", border: "1px solid var(--color-divider)", fontSize: 13, marginBottom: 14 }}>{signedUpMessage}</div>
        )}

        <button
          type="button"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError("");
            setSignedUpMessage("");
          }}
          style={{ border: "none", background: "transparent", color: muted(60), cursor: "pointer", fontSize: 13, textDecoration: "underline", padding: 0 }}
        >
          {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
