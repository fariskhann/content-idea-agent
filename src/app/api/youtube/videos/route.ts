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

export async function GET(req: NextRequest) {
  const apiKey = req.nextUrl.searchParams.get("apiKey") || "";
  const ref = req.nextUrl.searchParams.get("ref") || "";
  const maxResults = Math.min(30, Math.max(1, parseInt(req.nextUrl.searchParams.get("maxResults") || "10", 10) || 10));

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

    const playlistData = await googleGet("playlistItems", {
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: String(maxResults),
      key: apiKey,
    });
    const videoIds: string[] = (playlistData.items || []).map((it: { contentDetails: { videoId: string } }) => it.contentDetails.videoId).filter(Boolean);

    if (!videoIds.length) {
      return NextResponse.json({ channelId, channelTitle, videos: [] });
    }

    const videosData = await googleGet("videos", { part: "snippet,statistics", id: videoIds.join(","), key: apiKey });
    const byId = new Map<string, { id: string; title: string; thumbnail: string; viewCount: number; publishedAt: string }>();
    (videosData.items || []).forEach(
      (item: {
        id: string;
        snippet: { title: string; publishedAt: string; thumbnails?: { medium?: { url: string }; default?: { url: string } } };
        statistics?: { viewCount?: string };
      }) => {
        byId.set(item.id, {
          id: item.id,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || "",
          viewCount: parseInt(item.statistics?.viewCount || "0", 10),
          publishedAt: item.snippet.publishedAt,
        });
      }
    );
    // Preserve upload order (most recent first), not the videos.list response order.
    const videos = videoIds.map((id) => byId.get(id)).filter((v): v is NonNullable<typeof v> => !!v);

    return NextResponse.json({ channelId, channelTitle, videos });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to fetch channel videos." }, { status: 500 });
  }
}
