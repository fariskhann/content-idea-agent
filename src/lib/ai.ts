import type { ModelInfo } from "./models";

export interface CompletionResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface ApiKeys {
  anthropicApiKey: string;
  deepseekApiKey: string;
}

/**
 * Calls the Anthropic Messages API directly from the browser using the
 * user's own API key (stored client-side in Settings), via the documented
 * "anthropic-dangerous-direct-browser-access" header. The key is visible in
 * the browser's network requests — an accepted tradeoff for this
 * single-user, no-backend app.
 */
async function completeAnthropic(apiKey: string, apiModelId: string, prompt: string, maxTokens: number): Promise<CompletionResult> {
  if (!apiKey) throw new Error("Add your Anthropic API key in Settings first.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: apiModelId,
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
  return {
    text,
    usage: { inputTokens: data?.usage?.input_tokens ?? 0, outputTokens: data?.usage?.output_tokens ?? 0 },
  };
}

/**
 * DeepSeek's OpenAI-compatible endpoint doesn't document browser-CORS support
 * the way Anthropic's does, so this routes through our own Next.js API route
 * instead of guessing — the key still lives only in the browser (localStorage)
 * and is sent per-request, it just transits our own server on the way out.
 */
async function completeDeepSeek(apiKey: string, apiModelId: string, prompt: string, maxTokens: number): Promise<CompletionResult> {
  if (!apiKey) throw new Error("Add your DeepSeek API key in Settings first.");
  const res = await fetch("/api/deepseek/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apiKey, model: apiModelId, prompt, maxTokens }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `DeepSeek API error (${res.status})`);
  if (typeof data.text !== "string") throw new Error("Unexpected response format from DeepSeek.");
  return { text: data.text, usage: { inputTokens: data.usage?.inputTokens ?? 0, outputTokens: data.usage?.outputTokens ?? 0 } };
}

export async function complete(opts: { model: ModelInfo; apiKeys: ApiKeys; prompt: string; maxTokens?: number }): Promise<CompletionResult> {
  const maxTokens = opts.maxTokens ?? 1200;
  if (opts.model.provider === "anthropic") {
    return completeAnthropic(opts.apiKeys.anthropicApiKey, opts.model.apiModelId, opts.prompt, maxTokens);
  }
  return completeDeepSeek(opts.apiKeys.deepseekApiKey, opts.model.apiModelId, opts.prompt, maxTokens);
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
