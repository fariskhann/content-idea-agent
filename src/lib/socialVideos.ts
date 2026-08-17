import type { SocialPlatformKind, SocialVideo } from "./types";

/** $ per result for each Apify actor, from verified pricing at time of writing — an estimate, not a live balance check, same framing as AI cost tracking. */
export const SOCIAL_FETCH_RATES: Record<SocialPlatformKind, number> = {
  TikTok: 1.7 / 1000,
  Instagram: 2.6 / 1000,
};

export interface FetchSocialVideosResponse {
  profileHandle: string;
  videos: SocialVideo[];
}

export async function fetchTikTokVideos(opts: { apiKey: string; ref: string; maxResults: number }): Promise<FetchSocialVideosResponse> {
  const params = new URLSearchParams({ apiKey: opts.apiKey, ref: opts.ref, maxResults: String(opts.maxResults) });
  const res = await fetch(`/api/tiktok/videos?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Failed to fetch TikTok videos (${res.status})`);
  return data;
}

export async function fetchInstagramVideos(opts: { apiKey: string; ref: string; maxResults: number }): Promise<FetchSocialVideosResponse> {
  const params = new URLSearchParams({ apiKey: opts.apiKey, ref: opts.ref, maxResults: String(opts.maxResults) });
  const res = await fetch(`/api/instagram/videos?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Failed to fetch Instagram videos (${res.status})`);
  return data;
}
