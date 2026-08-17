import { NextRequest, NextResponse } from "next/server";
import { parseProfileHandle } from "@/lib/socialHandle";
import type { SocialVideo } from "@/lib/types";

export const runtime = "nodejs";
// Apify's run-sync-get-dataset-items call blocks for the whole scrape — observed up to ~2 minutes on a
// mixed-content profile (the scraper has to check every post to find the ones that are actually videos,
// so duration scales with the account's content mix, not just how many results were requested). 300s is
// Vercel Fluid Compute's Hobby-tier ceiling (default since Apr 2025) — set explicitly so it's a deliberate
// choice, not an implicit default that could change.
export const maxDuration = 300;

const ACTOR_ID = "clockworks~tiktok-scraper";

// NOTE: field names below are the actor's commonly-documented shape as of writing, not independently
// verified against a live run — check the actor's "Input"/output tabs on Apify if fields come back empty.
interface RawTikTokItem {
  id?: string;
  text?: string;
  desc?: string;
  createTime?: number;
  createTimeISO?: string;
  webVideoUrl?: string;
  videoUrl?: string;
  playCount?: number;
  diggCount?: number;
  shareCount?: number;
  commentCount?: number;
  videoMeta?: { coverUrl?: string; playCount?: number };
  covers?: string[];
  cover?: string;
}

function normalize(item: RawTikTokItem): SocialVideo {
  const publishedAt = item.createTimeISO || (item.createTime ? new Date(item.createTime * 1000).toISOString() : "");
  return {
    id: item.id || "",
    platform: "TikTok",
    thumbnail: item.videoMeta?.coverUrl || item.covers?.[0] || item.cover || "",
    caption: item.text || item.desc || "",
    viewCount: item.playCount ?? item.videoMeta?.playCount ?? 0,
    likeCount: item.diggCount ?? 0,
    commentCount: item.commentCount ?? 0,
    shareCount: item.shareCount,
    publishedAt,
    url: item.webVideoUrl || item.videoUrl || "",
    transcriptStatus: "not_fetched",
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
        profiles: [profileHandle],
        resultsPerPage: maxResults,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
      }),
    });

    if (res.status === 401) return NextResponse.json({ error: "Invalid Apify API token." }, { status: 401 });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({ error: data?.error?.message || `Apify error (${res.status}).` }, { status: 502 });
    }

    const items = (await res.json()) as RawTikTokItem[];
    if (!Array.isArray(items) || !items.length) {
      return NextResponse.json({ error: "Couldn't find that TikTok profile, or it has no videos." }, { status: 404 });
    }

    const videos = items.slice(0, maxResults).map(normalize);
    return NextResponse.json({ profileHandle, videos });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to fetch TikTok videos." }, { status: 500 });
  }
}
