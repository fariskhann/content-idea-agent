import type { AppData, Category, SocialOutlierResult, SocialPlatformKind, SocialVideo } from "./types";
import { buildVoiceAndBrandBlocks } from "./generation";
import { fetchUrlTranscript, type TranscriptFetchResult } from "./youtube";

/** $ per result for each Apify actor, from verified pricing at time of writing — an estimate, not a live balance check, same framing as AI cost tracking. */
export const SOCIAL_FETCH_RATES: Record<SocialPlatformKind, number> = {
  TikTok: 1.7 / 1000,
  Instagram: 2.6 / 1000,
};

export async function fetchSocialTranscript(url: string, apiKey: string): Promise<TranscriptFetchResult> {
  return fetchUrlTranscript(url, apiKey);
}

export const DEFAULT_IGTIKTOK_ANALYSIS_INSTRUCTIONS =
  "For each video, explain why it likely worked — or, if it's near or below the account's average, what might be holding it back — pulling from the transcript where available (hook, structure, pacing) and the caption framing. Then state specifically what we could borrow or adapt into our own content, not a generic takeaway.";

export function buildSocialAnalysisPrompt(
  data: AppData,
  creatorName: string,
  platform: SocialPlatformKind,
  avgViews: number,
  videos: SocialVideo[]
): string {
  const { brandBlock, personalBlock } = buildVoiceAndBrandBlocks(data);
  const frameworkText = data.categories
    .map((c: Category) => {
      const structuresText = c.structures.map((st) => st.text).filter(Boolean).join(" | ");
      const angleLines = c.angles.map((a) => a.name + (a.structure ? " [" + a.structure + "]" : "")).join("; ");
      return `${c.name} (${c.stage}, ${c.owner === "personal" ? "Personal" : "Brand"})${structuresText ? ", structures: " + structuresText : ""}: ${c.desc} Formats: ${angleLines}`;
    })
    .join("\n");
  const hooksText = data.hooks.map((h) => h.text).filter(Boolean).join(", ");

  let prompt = brandBlock + (personalBlock ? "\n" + personalBlock : "") + "\n";
  prompt += `You're analyzing recent ${platform} posts from the account "${creatorName}" to find what's working and what we could apply to our own content.\n\n`;
  prompt += `Our content framework (content type — stage — owner — formats and structures):\n${frameworkText}\n\n`;
  if (hooksText) prompt += `Our hook formulas: ${hooksText}\n\n`;
  prompt += `This account's average view count across its last pulled batch is ${avgViews.toLocaleString()}. Analyze the following hand-picked posts:\n\n`;
  videos.forEach((v, i) => {
    prompt += `${i + 1}. Post ID: ${v.id}\nCaption: "${v.caption}"\nViews: ${v.viewCount.toLocaleString()} (${(v.viewCount / (avgViews || 1)).toFixed(1)}x the account's average)\n`;
    prompt += v.transcriptStatus === "ok" && v.transcript ? `Transcript:\n${v.transcript.slice(0, 4000)}\n` : "Transcript: not available — infer from the caption alone.\n";
    prompt += "\n";
  });
  prompt += (data.igTiktokAnalysisInstructions || DEFAULT_IGTIKTOK_ANALYSIS_INSTRUCTIONS) + "\n\n";
  if (hooksText) prompt += `Where a post's hook style maps onto one of our own hook formulas above, name that formula specifically wherever you describe what to borrow/adapt, instead of describing it generically.\n\n`;
  prompt +=
    'Respond ONLY with a raw JSON array (no markdown fences, no commentary) of exactly ' +
    videos.length +
    ' objects, one per post above in the same order. Each object must have a "videoId" key (the Post ID given above) plus whatever additional keys best capture the analysis called for in the instructions above — choose short, descriptive camelCase key names yourself; do not default to "why"/"borrow" unless the instructions above actually describe that as the structure. Each additional key\'s value can be a plain string, or a JSON object with descriptive sub-keys for a multi-part breakdown.';

  return prompt;
}

export interface SocialDistillationTarget {
  video: SocialVideo;
  result: SocialOutlierResult;
}

/** Turns a batch of already-analysed posts into compact, durable "learning" entries for the knowledge library — distillation, not a restatement of the raw per-post analysis. */
export function buildSocialDistillationPrompt(
  data: AppData,
  creatorName: string,
  platform: SocialPlatformKind,
  platformCategories: Category[],
  targets: SocialDistillationTarget[]
): string {
  const { brandBlock, personalBlock } = buildVoiceAndBrandBlocks(data);
  const categoryNames = [...platformCategories.map((c) => c.name), "General"];
  const categoryText = platformCategories.map((c) => `- ${c.name}: ${c.desc}`).join("\n") + "\n- General: doesn't cleanly fit one content type, or applies broadly.";

  let prompt = brandBlock + (personalBlock ? "\n" + personalBlock : "") + "\n";
  prompt += `You're distilling durable, reusable lessons from analysed posts on the ${platform} account "${creatorName}" into a permanent knowledge library that will be fed into future content-idea and script generation for our own content.\n\n`;
  prompt += `Our content types, to classify each learning against:\n${categoryText}\n\n`;
  prompt += `Analysed posts:\n\n`;
  targets.forEach(({ video, result }, i) => {
    prompt += `${i + 1}. Post ID: ${video.id}\nCaption: "${video.caption}"\nAnalysis: ${JSON.stringify(result.fields)}\n\n`;
  });
  prompt +=
    "Extract the durable, reusable *pattern* from this analysis — something a content strategist could apply to a totally different video idea next month — not a restatement of the analysis above. Keep each learning compact (1-3 sentences). If multiple posts share the same underlying pattern, consolidate them into a single learning rather than repeating near-duplicates — the number of learnings you return does not need to match the number of posts.\n\n";
  prompt +=
    'Respond ONLY with a raw JSON array (no markdown fences, no commentary) of objects shaped like: {"text": the distilled learning, "categoryNames": array of one or more of [' +
    categoryNames.map((n) => `"${n}"`).join(", ") +
    '] that this learning applies to, "videoIds": array of Post ID(s) from above that this learning draws from}.';

  return prompt;
}

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
