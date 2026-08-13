import type { AiModel } from "./types";

const MODEL_IDS: Record<AiModel, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-5",
};

export function modelIdFor(model: AiModel): string {
  return MODEL_IDS[model];
}

/**
 * Calls the Anthropic Messages API directly from the browser using the
 * user's own API key (stored client-side in Settings). Anthropic supports
 * this for prototyping via the "anthropic-dangerous-direct-browser-access"
 * header — the key is visible in the browser's network requests, which is
 * an accepted tradeoff for this single-user, no-backend app.
 */
export async function claudeComplete(opts: {
  apiKey: string;
  model: AiModel;
  prompt: string;
  maxTokens?: number;
}): Promise<string> {
  const { apiKey, model, prompt, maxTokens = 1200 } = opts;
  if (!apiKey) {
    throw new Error("Add your Anthropic API key in Settings first.");
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: modelIdFor(model),
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    let message = `Anthropic API error (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error?.message) message = data.error.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (typeof text !== "string") throw new Error("Unexpected response format from Anthropic.");
  return text;
}

/** Parses a JSON array out of a model response, tolerating stray prose or markdown fences. */
export function parseJsonArray(text: string): unknown[] | null {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}
