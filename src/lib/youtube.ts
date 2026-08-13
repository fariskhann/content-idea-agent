import type { AppData, Category, YoutubeVideo } from "./types";
import { buildVoiceAndBrandBlocks } from "./generation";

export const DEFAULT_VIDEO_COUNT = 10;
export const MAX_VIDEO_COUNT = 30;

/** A video counts as an outlier once it clears this multiple of the channel's own recent median. */
const OUTLIER_MULTIPLIER = 1.75;

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeOutliers(videos: YoutubeVideo[]): { medianViews: number; outliers: YoutubeVideo[] } {
  const medianViews = median(videos.map((v) => v.viewCount));
  const threshold = medianViews * OUTLIER_MULTIPLIER;
  const outliers = medianViews > 0 ? videos.filter((v) => v.viewCount >= threshold) : [];
  return { medianViews, outliers };
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
  medianViews: number,
  outliers: YoutubeVideo[]
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
  prompt += `This channel's median view count across its last pulled batch is ${medianViews.toLocaleString()}. The following videos performed meaningfully above that baseline (outliers):\n\n`;
  outliers.forEach((v, i) => {
    prompt += `${i + 1}. Video ID: ${v.id}\nTitle: "${v.title}"\nViews: ${v.viewCount.toLocaleString()} (${(v.viewCount / (medianViews || 1)).toFixed(1)}x the channel's median)\n`;
    prompt += v.transcriptStatus === "ok" && v.transcript ? `Transcript:\n${v.transcript.slice(0, 4000)}\n` : "Transcript: not available — infer from the title alone.\n";
    prompt += "\n";
  });
  prompt +=
    "For each outlier video, explain why it likely worked — pull from the transcript where available (hook, structure, pacing) and the title framing. Then state specifically what we could borrow or adapt into our own content types (Yap / Storytelling / Vlog / Brand — or whichever of our formats above fit), not a generic takeaway.\n\n";
  prompt +=
    'Respond ONLY with a raw JSON array (no markdown fences, no commentary) of exactly ' +
    outliers.length +
    ' objects, one per outlier above in the same order, shaped like: {"videoId": the Video ID given above, "why": 2-3 sentences on why it likely worked, "borrow": 1-2 sentences on what to adapt into which of our content types}.';

  return prompt;
}
