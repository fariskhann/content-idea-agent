import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface SupadataContentSegment {
  text?: string;
}

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId") || "";
  const rawUrl = req.nextUrl.searchParams.get("url") || "";
  const apiKey = req.nextUrl.searchParams.get("apiKey") || "";
  const url = videoId ? `https://www.youtube.com/watch?v=${videoId}` : rawUrl;
  if (!url) return NextResponse.json({ error: "Missing videoId or url." }, { status: 400 });
  if (!apiKey) return NextResponse.json({ error: "Missing Supadata API key." }, { status: 400 });

  try {
    const res = await fetch(`https://api.supadata.ai/v1/transcript?url=${encodeURIComponent(url)}`, {
      headers: { "x-api-key": apiKey },
    });

    if (res.status === 401) return NextResponse.json({ error: "Invalid Supadata API key." }, { status: 401 });
    if (res.status === 402 || res.status === 429) {
      return NextResponse.json({ error: "Supadata free-tier limit reached for this billing cycle." }, { status: 429 });
    }
    if (res.status === 404) return NextResponse.json({ status: "unavailable" });
    if (!res.ok) return NextResponse.json({ error: `Supadata error (${res.status}).` }, { status: 502 });

    const data = await res.json();
    const segments: SupadataContentSegment[] = Array.isArray(data?.content) ? data.content : [];
    const text = segments.map((s) => s.text || "").join(" ").replace(/\s+/g, " ").trim();
    if (!text) return NextResponse.json({ status: "unavailable" });
    return NextResponse.json({ status: "ok", text });
  } catch {
    return NextResponse.json({ error: "Failed to reach Supadata." }, { status: 502 });
  }
}
