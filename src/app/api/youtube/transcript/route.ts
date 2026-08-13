import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

function pickTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (!tracks.length) return null;
  const english = tracks.find((t) => t.languageCode?.startsWith("en"));
  return english || tracks[0];
}

/**
 * Best-effort transcript fetch using the same unofficial technique tools like
 * youtube-transcript-api rely on: scrape the watch page for its caption track
 * list, then fetch that track's XML directly. No official API for this exists
 * for videos we don't own, and YouTube can change this markup at any time —
 * callers must treat "unavailable" as a normal, expected outcome.
 */
async function scrapeTranscript(videoId: string): Promise<string | null> {
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
  });
  if (!pageRes.ok) return null;
  const html = await pageRes.text();

  const marker = '"captionTracks":';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const arrayStart = html.indexOf("[", idx);
  if (arrayStart === -1) return null;
  let depth = 0;
  let arrayEnd = -1;
  for (let i = arrayStart; i < html.length; i++) {
    if (html[i] === "[") depth++;
    else if (html[i] === "]") {
      depth--;
      if (depth === 0) {
        arrayEnd = i + 1;
        break;
      }
    }
  }
  if (arrayEnd === -1) return null;

  let tracks: CaptionTrack[];
  try {
    const raw = html.slice(arrayStart, arrayEnd);
    tracks = JSON.parse(raw.replace(/\\u0026/g, "&"));
  } catch {
    return null;
  }

  const track = pickTrack(tracks);
  if (!track?.baseUrl) return null;

  const trackRes = await fetch(track.baseUrl, { headers: { "User-Agent": UA } });
  if (!trackRes.ok) return null;
  const xml = await trackRes.text();

  const lines = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => decodeEntities(m[1].replace(/\n/g, " ")).trim());
  const text = lines.filter(Boolean).join(" ");
  return text || null;
}

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId") || "";
  if (!videoId) return NextResponse.json({ error: "Missing videoId." }, { status: 400 });

  try {
    const text = await scrapeTranscript(videoId);
    if (!text) return NextResponse.json({ status: "unavailable" });
    return NextResponse.json({ status: "ok", text });
  } catch {
    return NextResponse.json({ status: "unavailable" });
  }
}
