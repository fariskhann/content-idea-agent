import { NextRequest, NextResponse } from "next/server";
import { parseProfileHandle } from "@/lib/socialHandle";
import type { SocialVideo } from "@/lib/types";

export const runtime = "nodejs";

const ACTOR_ID = "apify~instagram-reel-scraper";

// NOTE: field names below are the actor's commonly-documented shape as of writing, not independently
// verified against a live run — check the actor's "Input"/output tabs on Apify if fields come back empty.
interface RawInstagramItem {
  id?: string;
  shortCode?: string;
  caption?: string;
  url?: string;
  displayUrl?: string;
  thumbnailUrl?: string;
  videoViewCount?: number;
  videoPlayCount?: number;
  likesCount?: number;
  commentsCount?: number;
  timestamp?: string;
}

function normalize(item: RawInstagramItem): SocialVideo {
  return {
    id: item.id || item.shortCode || "",
    platform: "Instagram",
    thumbnail: item.displayUrl || item.thumbnailUrl || "",
    caption: item.caption || "",
    viewCount: item.videoViewCount ?? item.videoPlayCount ?? 0,
    likeCount: item.likesCount ?? 0,
    commentCount: item.commentsCount ?? 0,
    publishedAt: item.timestamp || "",
    url: item.url || (item.shortCode ? `https://www.instagram.com/reel/${item.shortCode}/` : ""),
  };
}

export async function GET(req: NextRequest) {
  const apiKey = req.nextUrl.searchParams.get("apiKey") || "";
  const ref = req.nextUrl.searchParams.get("ref") || "";
  const maxResults = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get("maxResults") || "10", 10) || 10));

  if (!apiKey) return NextResponse.json({ error: "Missing Apify API token. Add it in Settings." }, { status: 400 });
  if (!ref) return NextResponse.json({ error: "Missing profile link or handle." }, { status: 400 });

  try {
    const profileHandle = parseProfileHandle(ref);
    const res = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: [profileHandle],
        resultsLimit: maxResults,
      }),
    });

    if (res.status === 401) return NextResponse.json({ error: "Invalid Apify API token." }, { status: 401 });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({ error: data?.error?.message || `Apify error (${res.status}).` }, { status: 502 });
    }

    const items = (await res.json()) as RawInstagramItem[];
    if (!Array.isArray(items) || !items.length) {
      return NextResponse.json({ error: "Couldn't find that Instagram profile, or it has no reels." }, { status: 404 });
    }

    const videos = items.slice(0, maxResults).map(normalize);
    return NextResponse.json({ profileHandle, videos });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to fetch Instagram videos." }, { status: 500 });
  }
}
