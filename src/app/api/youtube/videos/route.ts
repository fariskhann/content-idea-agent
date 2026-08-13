import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface ChannelRef {
  kind: "id" | "handle" | "username";
  value: string;
}

/** Pulls a channel ID, @handle, or legacy /user/ name out of a pasted link or handle string. */
function parseChannelRef(input: string): ChannelRef {
  const trimmed = input.trim();
  const channelMatch = trimmed.match(/channel\/(UC[\w-]{10,})/);
  if (channelMatch) return { kind: "id", value: channelMatch[1] };
  const handleMatch = trimmed.match(/@([\w.-]+)/);
  if (handleMatch) return { kind: "handle", value: "@" + handleMatch[1] };
  const userMatch = trimmed.match(/user\/([\w-]+)/);
  if (userMatch) return { kind: "username", value: userMatch[1] };
  if (trimmed.startsWith("UC") && trimmed.length >= 12) return { kind: "id", value: trimmed };
  if (trimmed.startsWith("@")) return { kind: "handle", value: trimmed };
  return { kind: "handle", value: "@" + trimmed.replace(/^@/, "") };
}

async function googleGet(path: string, params: Record<string, string>) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok) {
    const message = data?.error?.message || `YouTube API error (${res.status})`;
    throw new Error(message);
  }
  return data;
}

// Shorts have no dedicated Data API flag. YouTube caps Shorts at 3 minutes, so anything longer
// is definitely a regular upload; anything at or under that gets a real check below.
const SHORTS_DURATION_CEILING = 200;
const SHORTS_DURATION_FALLBACK = 60;

function parseDurationSeconds(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || "0", 10);
  const m = parseInt(match[2] || "0", 10);
  const s = parseInt(match[3] || "0", 10);
  return h * 3600 + m * 60 + s;
}

/** A real Short stays on /shorts/{id} (200); YouTube 303-redirects a regular video ID to /watch. No API quota used. */
async function isShort(videoId: string, durationSeconds: number): Promise<boolean> {
  if (durationSeconds > SHORTS_DURATION_CEILING) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`https://www.youtube.com/shorts/${videoId}`, { method: "HEAD", redirect: "manual", signal: controller.signal });
    clearTimeout(timeout);
    return res.status >= 200 && res.status < 300;
  } catch {
    return durationSeconds <= SHORTS_DURATION_FALLBACK;
  }
}

export async function GET(req: NextRequest) {
  const apiKey = req.nextUrl.searchParams.get("apiKey") || "";
  const ref = req.nextUrl.searchParams.get("ref") || "";
  const maxResults = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get("maxResults") || "10", 10) || 10));

  if (!apiKey) return NextResponse.json({ error: "Missing YouTube API key. Add it in Settings." }, { status: 400 });
  if (!ref) return NextResponse.json({ error: "Missing channel link or handle." }, { status: 400 });

  try {
    const parsed = parseChannelRef(ref);

    let channelId: string | null = null;
    let channelTitle = "";
    let uploadsPlaylistId: string | null = null;

    const partsParams = { part: "contentDetails,snippet", key: apiKey };

    if (parsed.kind === "id") {
      const data = await googleGet("channels", { ...partsParams, id: parsed.value });
      const item = data.items?.[0];
      if (item) {
        channelId = item.id;
        channelTitle = item.snippet?.title || "";
        uploadsPlaylistId = item.contentDetails?.relatedPlaylists?.uploads || null;
      }
    } else if (parsed.kind === "handle") {
      const data = await googleGet("channels", { ...partsParams, forHandle: parsed.value });
      const item = data.items?.[0];
      if (item) {
        channelId = item.id;
        channelTitle = item.snippet?.title || "";
        uploadsPlaylistId = item.contentDetails?.relatedPlaylists?.uploads || null;
      }
    } else {
      const data = await googleGet("channels", { ...partsParams, forUsername: parsed.value });
      const item = data.items?.[0];
      if (item) {
        channelId = item.id;
        channelTitle = item.snippet?.title || "";
        uploadsPlaylistId = item.contentDetails?.relatedPlaylists?.uploads || null;
      }
    }

    // Last-resort fallback for custom URLs / names channels.list can't resolve directly.
    if (!channelId) {
      const searchValue = parsed.value.replace(/^@/, "");
      const data = await googleGet("search", { part: "snippet", type: "channel", q: searchValue, maxResults: "1", key: apiKey });
      const item = data.items?.[0];
      if (item?.id?.channelId) {
        const chData = await googleGet("channels", { ...partsParams, id: item.id.channelId });
        const chItem = chData.items?.[0];
        if (chItem) {
          channelId = chItem.id;
          channelTitle = chItem.snippet?.title || "";
          uploadsPlaylistId = chItem.contentDetails?.relatedPlaylists?.uploads || null;
        }
      }
    }

    if (!channelId || !uploadsPlaylistId) {
      return NextResponse.json({ error: "Couldn't find that YouTube channel. Check the link or handle." }, { status: 404 });
    }

    const PLAYLIST_PAGE_SIZE = 50;
    const MAX_PAGES = 5; // bounds quota usage on channels that are mostly Shorts

    const videos: { id: string; title: string; thumbnail: string; viewCount: number; publishedAt: string }[] = [];
    let pageToken: string | undefined;
    let pages = 0;

    while (videos.length < maxResults && pages < MAX_PAGES) {
      const playlistData: { items?: { contentDetails: { videoId: string } }[]; nextPageToken?: string } = await googleGet("playlistItems", {
        part: "contentDetails",
        playlistId: uploadsPlaylistId,
        maxResults: String(PLAYLIST_PAGE_SIZE),
        key: apiKey,
        ...(pageToken ? { pageToken } : {}),
      });
      pages++;

      const pageVideoIds: string[] = (playlistData.items || []).map((it) => it.contentDetails.videoId).filter(Boolean);
      if (!pageVideoIds.length) break;

      const videosData = await googleGet("videos", { part: "snippet,statistics,contentDetails", id: pageVideoIds.join(","), key: apiKey });
      const byId = new Map<string, { id: string; title: string; thumbnail: string; viewCount: number; publishedAt: string; durationSeconds: number }>();
      (videosData.items || []).forEach(
        (item: {
          id: string;
          snippet: { title: string; publishedAt: string; thumbnails?: { medium?: { url: string }; default?: { url: string } } };
          statistics?: { viewCount?: string };
          contentDetails?: { duration?: string };
        }) => {
          byId.set(item.id, {
            id: item.id,
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || "",
            viewCount: parseInt(item.statistics?.viewCount || "0", 10),
            publishedAt: item.snippet.publishedAt,
            durationSeconds: parseDurationSeconds(item.contentDetails?.duration || "PT0S"),
          });
        }
      );
      // Preserve upload order (most recent first), not the videos.list response order.
      const orderedBatch = pageVideoIds.map((id) => byId.get(id)).filter((v): v is NonNullable<typeof v> => !!v);
      const shortFlags = await Promise.all(orderedBatch.map((v) => isShort(v.id, v.durationSeconds)));
      orderedBatch.forEach((v, i) => {
        if (!shortFlags[i]) videos.push({ id: v.id, title: v.title, thumbnail: v.thumbnail, viewCount: v.viewCount, publishedAt: v.publishedAt });
      });

      pageToken = playlistData.nextPageToken;
      if (!pageToken) break;
    }

    return NextResponse.json({ channelId, channelTitle, videos: videos.slice(0, maxResults) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to fetch channel videos." }, { status: 500 });
  }
}
