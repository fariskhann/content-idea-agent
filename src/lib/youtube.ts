import type { AppData, Category, YoutubeOutlierResult, YoutubeVideo } from "./types";
import { buildVoiceAndBrandBlocks } from "./generation";

export const DEFAULT_VIDEO_COUNT = 10;
export const MAX_VIDEO_COUNT = 50;

/** A video counts as an outlier once it clears this multiple of the channel's own recent average. */
const OUTLIER_MULTIPLIER = 1.5;

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function computeOutliers(videos: YoutubeVideo[]): { avgViews: number; outliers: YoutubeVideo[] } {
  const avgViews = average(videos.map((v) => v.viewCount));
  const threshold = avgViews * OUTLIER_MULTIPLIER;
  const outliers = avgViews > 0 ? videos.filter((v) => v.viewCount >= threshold) : [];
  return { avgViews, outliers };
}

export interface FetchVideosResponse {
  channelId: string;
  channelTitle: string;
  videos: { id: string; title: string; thumbnail: string; viewCount: number; publishedAt: string }[];
}

export async function fetchChannelVideos(opts: { apiKey: string; ref: string; maxResults: number }): Promise<FetchVideosResponse> {
  const params = new URLSearchParams({ apiKey: opts.apiKey, ref: opts.ref, maxResults: String(opts.maxResults) });
  const res = await fetch(`/api/youtube/videos?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Failed to fetch channel videos (${res.status})`);
  return data;
}

export type TranscriptFetchStatus = "ok" | "unavailable" | "no_key" | "invalid_key" | "quota_exceeded" | "error";

export interface TranscriptFetchResult {
  status: TranscriptFetchStatus;
  text?: string;
  error?: string;
}

export async function fetchTranscript(videoId: string, apiKey: string): Promise<TranscriptFetchResult> {
  if (!apiKey) return { status: "no_key" };
  const params = new URLSearchParams({ videoId, apiKey });
  const res = await fetch(`/api/youtube/transcript?${params.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) return { status: "invalid_key", error: data?.error };
  if (res.status === 429) return { status: "quota_exceeded", error: data?.error };
  if (!res.ok) return { status: "error", error: data?.error || `Failed to fetch transcript (${res.status}).` };
  return { status: data.status === "ok" ? "ok" : "unavailable", text: data.text };
}

export const DEFAULT_YOUTUBE_ANALYSIS_INSTRUCTIONS =
  "For each video, explain why it likely worked — or, if it's near or below the channel's average, what might be holding it back — pulling from the transcript where available (hook, structure, pacing) and the title framing. Then state specifically what we could borrow or adapt into our own content, not a generic takeaway.";

export function buildYoutubeAnalysisPrompt(
  data: AppData,
  channelName: string,
  avgViews: number,
  videos: YoutubeVideo[],
  taggedCategories: Category[]
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
  prompt += `You're analyzing recent videos from the YouTube channel "${channelName}" to find what's working and what we could apply to our own content.\n\n`;
  prompt += `Our content framework (content type — stage — owner — formats and structures):\n${frameworkText}\n\n`;
  if (hooksText) prompt += `Our hook formulas: ${hooksText}\n\n`;
  prompt += `This channel's average view count across its last pulled batch is ${avgViews.toLocaleString()}. Analyze the following hand-picked videos:\n\n`;
  videos.forEach((v, i) => {
    prompt += `${i + 1}. Video ID: ${v.id}\nTitle: "${v.title}"\nViews: ${v.viewCount.toLocaleString()} (${(v.viewCount / (avgViews || 1)).toFixed(1)}x the channel's average)\n`;
    prompt += v.transcriptStatus === "ok" && v.transcript ? `Transcript:\n${v.transcript.slice(0, 4000)}\n` : "Transcript: not available — infer from the title alone.\n";
    prompt += "\n";
  });
  prompt += (data.youtubeAnalysisInstructions || DEFAULT_YOUTUBE_ANALYSIS_INSTRUCTIONS) + "\n\n";
  if (taggedCategories.length) {
    const names = taggedCategories.map((c) => c.name).join(", ");
    const formats = taggedCategories.flatMap((c) => c.angles.map((a) => a.name)).filter(Boolean).join(", ");
    prompt += `This creator is tagged under our "${names}" content type${taggedCategories.length > 1 ? "s" : ""} here.${
      formats ? ` Default any "what to borrow/adapt" guidance to one of that type's formats (${formats})` : ` Default any "what to borrow/adapt" guidance to that content type`
    } unless another of our content types is a clearly better fit for a specific video.\n\n`;
  }
  if (hooksText) prompt += `Where a video's hook style maps onto one of our own hook formulas above, name that formula specifically wherever you describe what to borrow/adapt, instead of describing it generically.\n\n`;
  prompt +=
    'Respond ONLY with a raw JSON array (no markdown fences, no commentary) of exactly ' +
    videos.length +
    ' objects, one per video above in the same order. Each object must have a "videoId" key (the Video ID given above) plus whatever additional keys best capture the analysis called for in the instructions above — choose short, descriptive camelCase key names yourself; do not default to "why"/"borrow" unless the instructions above actually describe that as the structure. Each additional key\'s value can be a plain string, or a JSON object with descriptive sub-keys for a multi-part breakdown.';

  return prompt;
}

export interface DistillationTarget {
  video: YoutubeVideo;
  result: YoutubeOutlierResult;
}

/** Turns a batch of already-analysed videos into compact, durable "learning" entries for the knowledge library — distillation, not a restatement of the raw per-video analysis. */
export function buildDistillationPrompt(
  data: AppData,
  creatorName: string,
  platformCategories: Category[],
  targets: DistillationTarget[]
): string {
  const { brandBlock, personalBlock } = buildVoiceAndBrandBlocks(data);
  const categoryNames = [...platformCategories.map((c) => c.name), "General"];
  const categoryText = platformCategories.map((c) => `- ${c.name}: ${c.desc}`).join("\n") + "\n- General: doesn't cleanly fit one content type, or applies broadly.";

  let prompt = brandBlock + (personalBlock ? "\n" + personalBlock : "") + "\n";
  prompt += `You're distilling durable, reusable lessons from analysed videos on the YouTube channel "${creatorName}" into a permanent knowledge library that will be fed into future content-idea and script generation for our own content.\n\n`;
  prompt += `Our content types, to classify each learning against:\n${categoryText}\n\n`;
  prompt += `Analysed videos:\n\n`;
  targets.forEach(({ video, result }, i) => {
    prompt += `${i + 1}. Video ID: ${video.id}\nTitle: "${video.title}"\nAnalysis: ${JSON.stringify(result.fields)}\n\n`;
  });
  prompt +=
    "Extract the durable, reusable *pattern* from this analysis — something a content strategist could apply to a totally different video idea next month — not a restatement of the analysis above. Keep each learning compact (1-3 sentences). If multiple videos share the same underlying pattern, consolidate them into a single learning rather than repeating near-duplicates — the number of learnings you return does not need to match the number of videos.\n\n";
  prompt +=
    'Respond ONLY with a raw JSON array (no markdown fences, no commentary) of objects shaped like: {"text": the distilled learning, "categoryNames": array of one or more of [' +
    categoryNames.map((n) => `"${n}"`).join(", ") +
    '] that this learning applies to, "videoIds": array of Video ID(s) from above that this learning draws from}.';

  return prompt;
}
