import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { apiKey, model, prompt, maxTokens } = body || {};

  if (!apiKey) return NextResponse.json({ error: "Missing DeepSeek API key." }, { status: 400 });
  if (!model || !prompt) return NextResponse.json({ error: "Missing model or prompt." }, { status: 400 });

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens ?? 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      const message = data?.error?.message || `DeepSeek API error (${res.status})`;
      return NextResponse.json({ error: message }, { status: res.status });
    }

    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      return NextResponse.json({ error: "Unexpected response format from DeepSeek." }, { status: 502 });
    }

    return NextResponse.json({
      text,
      usage: {
        inputTokens: data?.usage?.prompt_tokens ?? 0,
        outputTokens: data?.usage?.completion_tokens ?? 0,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to reach DeepSeek." }, { status: 500 });
  }
}
