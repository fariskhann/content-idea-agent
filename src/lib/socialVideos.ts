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

/** A killed/timed-out connection (e.g. the route's 300s ceiling) returns no valid JSON body at all, so res.json() itself throws — surface that as the same friendly message a slow account would otherwise get, rather than a raw parse error. */
async function parseSocialVideosResponse(res: Response, label: string): Promise<FetchSocialVideosResponse> {
  let data: { error?: string } & Partial<FetchSocialVideosResponse>;
  try {
    data = await res.json();
  } catch {
    throw new Error(`This is taking unusually long for ${label} — try again with fewer videos, or in a bit.`);
  }
  if (!res.ok) throw new Error(data?.error || `Failed to fetch ${label} videos (${res.status})`);
  return data as FetchSocialVideosResponse;
}

export async function fetchTikTokVideos(opts: { apiKey: string; ref: string; maxResults: number }): Promise<FetchSocialVideosResponse> {
  const params = new URLSearchParams({ apiKey: opts.apiKey, ref: opts.ref, maxResults: String(opts.maxResults) });
  const res = await fetch(`/api/tiktok/videos?${params.toString()}`);
  return parseSocialVideosResponse(res, "TikTok");
}

export async function fetchInstagramVideos(opts: { apiKey: string; ref: string; maxResults: number }): Promise<FetchSocialVideosResponse> {
  const params = new URLSearchParams({ apiKey: opts.apiKey, ref: opts.ref, maxResults: String(opts.maxResults) });
  const res = await fetch(`/api/instagram/videos?${params.toString()}`);
  return parseSocialVideosResponse(res, "Instagram");
}
