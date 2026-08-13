import type { AppData, Category, YoutubeVideo } from "./types";
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

export async function fetchTranscript(videoId: string): Promise<{ status: "ok" | "unavailable"; text?: string }> {
  const res = await fetch(`/api/youtube/transcript?videoId=${encodeURIComponent(videoId)}`);
  const data = await res.json();
  if (!res.ok) return { status: "unavailable" };
  return data;
}

export function buildYoutubeAnalysisPrompt(
  data: AppData,
  channelName: string,
  avgViews: number,
  videos: YoutubeVideo[]
): string {
  const { brandBlock, personalBlock } = buildVoiceAndBrandBlocks(data);
  const frameworkText = data.categories
    .map((c: Category) => {
      const structuresText = c.structures.map((st) => st.text).filter(Boolean).join(" | ");
      const angleLines = c.angles.map((a) => a.name + (a.structure ? " [" + a.structure + "]" : "")).join("; ");
      return `${c.name} (${c.stage}, ${c.owner === "personal" ? "Personal" : "Brand"})${structuresText ? ", structures: " + structuresText : ""}: ${c.desc} Formats: ${angleLines}`;
    })
    .join("\n");

  let prompt = brandBlock + (personalBlock ? "\n" + personalBlock : "") + "\n";
  prompt += `You're analyzing recent videos from the YouTube channel "${channelName}" to find what's working and what we could apply to our own content.\n\n`;
  prompt += `Our content framework (content type — stage — owner — formats and structures):\n${frameworkText}\n\n`;
  prompt += `This channel's average view count across its last pulled batch is ${avgViews.toLocaleString()}. Analyze the following hand-picked videos:\n\n`;
  videos.forEach((v, i) => {
    prompt += `${i + 1}. Video ID: ${v.id}\nTitle: "${v.title}"\nViews: ${v.viewCount.toLocaleString()} (${(v.viewCount / (avgViews || 1)).toFixed(1)}x the channel's average)\n`;
    prompt += v.transcriptStatus === "ok" && v.transcript ? `Transcript:\n${v.transcript.slice(0, 4000)}\n` : "Transcript: not available — infer from the title alone.\n";
    prompt += "\n";
  });
  prompt +=
    "For each video, explain why it likely worked — or, if it's near or below the channel's average, what might be holding it back — pulling from the transcript where available (hook, structure, pacing) and the title framing. Then state specifically what we could borrow or adapt into our own content types (Yap / Storytelling / Vlog / Brand — or whichever of our formats above fit), not a generic takeaway.\n\n";
  prompt +=
    'Respond ONLY with a raw JSON array (no markdown fences, no commentary) of exactly ' +
    videos.length +
    ' objects, one per video above in the same order, shaped like: {"videoId": the Video ID given above, "why": 2-3 sentences on why it likely worked (or underperformed), "borrow": 1-2 sentences on what to adapt into which of our content types}.';

  return prompt;
}
