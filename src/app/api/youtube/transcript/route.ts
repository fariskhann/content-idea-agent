import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Public InnerTube API key shipped in every YouTube client bundle (not a secret) — the same one
// yt-dlp / youtubei.js / NewPipe use. The ANDROID client context returns caption URLs directly,
// without the throttling/signature games the WEB client sometimes applies.
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

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

async function textFromTrack(track: CaptionTrack): Promise<string | null> {
  const trackRes = await fetch(track.baseUrl, { headers: { "User-Agent": UA } });
  if (!trackRes.ok) return null;
  const xml = await trackRes.text();
  const lines = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => decodeEntities(m[1].replace(/\n/g, " ")).trim());
  const text = lines.filter(Boolean).join(" ");
  return text || null;
}

/** Primary technique: InnerTube's player endpoint returns caption tracks directly as structured JSON — no HTML scraping, no consent-wall risk. */
async function fetchTracksViaInnerTube(videoId: string): Promise<CaptionTrack[] | null> {
  const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({
      videoId,
      context: {
        client: {
          clientName: "ANDROID",
          clientVersion: "19.09.37",
          androidSdkVersion: 30,
          hl: "en",
          gl: "US",
        },
      },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  return Array.isArray(tracks) && tracks.length ? tracks : null;
}

/**
 * Fallback technique: scrape the watch page for its embedded caption track list. Kept as a
 * second attempt in case InnerTube ever rejects the request — this is the same unofficial
 * approach tools like youtube-transcript-api rely on, and can break if YouTube changes markup
 * or serves a cookie-consent page instead of the real watch page.
 */
async function fetchTracksViaWatchPage(videoId: string): Promise<CaptionTrack[] | null> {
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Cookie: "CONSENT=YES+1" },
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

  try {
    const raw = html.slice(arrayStart, arrayEnd);
    const tracks: CaptionTrack[] = JSON.parse(raw.replace(/\\u0026/g, "&"));
    return tracks.length ? tracks : null;
  } catch {
    return null;
  }
}

async function scrapeTranscript(videoId: string): Promise<string | null> {
  const tracks = (await fetchTracksViaInnerTube(videoId)) || (await fetchTracksViaWatchPage(videoId));
  const track = tracks ? pickTrack(tracks) : null;
  if (!track?.baseUrl) return null;
  return textFromTrack(track);
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
