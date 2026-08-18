export type Platform = "Any" | "YouTube" | "Instagram" | "TikTok";
/** The platform group a Category belongs to — Instagram and TikTok are merged into one group for content-type/format purposes. */
export type PlatformGroup = "YouTube" | "IGTikTok";
/** Inspiration's real platform — unlike PlatformGroup, IG and TikTok are kept distinct here since fetching a creator's videos needs to know which literal platform they're on. See lib/platform.ts's toPlatformGroup() for mapping back to PlatformGroup where content-type/library matching needs it. */
export type InspirationPlatform = "YouTube" | "Instagram" | "TikTok";
export type SocialPlatformKind = "TikTok" | "Instagram";
export type Stage = "TOF" | "MOF" | "BOF";
export type Owner = "brand" | "personal";
export type IdeaStatus = "idea" | "scripted" | "posted";

export interface TextItem {
  id: string;
  text: string;
}

export interface Angle {
  id: string;
  name: string;
  structure: string;
}

export interface Category {
  id: string;
  name: string;
  platform: PlatformGroup;
  stage: Stage;
  owner: Owner;
  desc: string;
  structures: TextItem[];
  angles: Angle[];
}

export interface Idea {
  id: string;
  title: string;
  hook: string;
  platform: Platform;
  categoryId: string;
  status: IdeaStatus;
  notes: string;
  link: string;
  script: string;
  isDraft: boolean;
  createdAt: number;
  /** Board sort position within its status column — lower sorts first. New ideas get Date.now()-scale values; legacy rows are backfilled from createdAt on load (see normalizePlatformGroups in AppContext.tsx). */
  order: number;
  /** The format the AI chose for this idea during generation. Undefined for manually created ideas. */
  format?: string;
  /** The structure the AI chose for this idea during generation. */
  structure?: string;
  /** LibraryEntry.id[] the AI cited as informing this idea — may point at a since-deleted entry, resolve defensively wherever displayed. */
  libraryEntryIds?: string[];
  /** GenerationBatch.id this idea was approved from, for "generated with N others" traceability. */
  batchId?: string;
  /** AI critique — from either the free inline critique during generation review, or the standalone "Evaluate idea" action. Never touched by updateIdea's generic field setter. */
  evaluation?: IdeaEvaluation;
  /** AI critique of idea.script's actual content — from the standalone "Evaluate script" action. Separate from `evaluation`, which judges title/hook only. Never touched by updateIdea's generic field setter. */
  scriptEvaluation?: IdeaEvaluation;
}

export interface IdeaEvaluation {
  /** Qualitative critique prose only — never a numeric score or tier label. */
  reasoning: string;
  /** LibraryEntry.id[] this evaluation judged the idea against — may point at a since-deleted entry, resolve defensively wherever displayed. */
  libraryEntryIds?: string[];
  generatedAt: number;
}

export type TranscriptStatus = "not_fetched" | "fetching" | "ok" | "unavailable";

export interface YoutubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  viewCount: number;
  publishedAt: string;
  transcript?: string;
  transcriptStatus: TranscriptStatus;
}

/** A plain string, or a structured breakdown (e.g. {titleBreakdown, structuralMap, verdict}) when custom Analysis instructions ask for one. */
export type AnalysisField = string | Record<string, unknown>;

export interface YoutubeOutlierResult {
  videoId: string;
  /** Arbitrary key -> analysis content, shaped entirely by the user's custom Analysis instructions (no fixed "why"/"borrow" schema). */
  fields: Record<string, AnalysisField>;
}

export interface YoutubeAnalysis {
  generatedAt: number;
  avgViews: number;
  results: YoutubeOutlierResult[];
}

export interface SocialVideo {
  id: string;
  platform: SocialPlatformKind;
  thumbnail: string;
  caption: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  /** TikTok only. */
  shareCount?: number;
  publishedAt: string;
  /** TikTok/IG URLs aren't reconstructable from id alone the way a YouTube URL is, so store it directly. */
  url: string;
  transcript?: string;
  transcriptStatus: TranscriptStatus;
}

export interface SocialOutlierResult {
  videoId: string;
  /** Arbitrary key -> analysis content, shaped entirely by the user's custom Analysis instructions (no fixed "why"/"borrow" schema). */
  fields: Record<string, AnalysisField>;
}

export interface SocialAnalysis {
  generatedAt: number;
  avgViews: number;
  results: SocialOutlierResult[];
}

export interface Inspiration {
  id: string;
  name: string;
  handle: string;
  platform: InspirationPlatform;
  link: string;
  tags: string[];
  notes: string;
  youtubeVideos?: YoutubeVideo[];
  youtubeLastFetched?: number;
  youtubeAnalysis?: YoutubeAnalysis;
  tiktokVideos?: SocialVideo[];
  tiktokLastFetched?: number;
  tiktokAnalysis?: SocialAnalysis;
  instagramVideos?: SocialVideo[];
  instagramLastFetched?: number;
  instagramAnalysis?: SocialAnalysis;
}

export interface LibraryEntry {
  id: string;
  /** Category.id[] this learning is scoped to for prompt retrieval. Empty = unscoped/"General". */
  categoryIds: string[];
  platform: PlatformGroup;
  /** The distilled, durable learning — compact and reusable, not raw analysis output. */
  text: string;
  /** Distinguishes how this entry was produced. Absent (legacy rows, and all rows from inspiration distillation) behaves as "inspiration". */
  sourceKind?: "inspiration" | "evaluation";
  /** Present for sourceKind "inspiration" (or legacy rows). Absent for "evaluation" entries — there's no inspiration source to denormalize. */
  sourceInspirationId?: string;
  /** Denormalized snapshot so the entry still reads sensibly if the Inspiration is later renamed or deleted. */
  sourceInspirationName?: string;
  sourceVideoIds: string[];
  /** Idea.id[] whose evaluation critiques this learning was distilled from — present only for sourceKind "evaluation". May point at a since-deleted idea; resolve defensively wherever displayed. */
  sourceIdeaIds?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface GenerationBatch {
  id: string;
  /** AI-written short name summarizing the batch, from the same API call that produced the ideas. */
  name: string;
  createdAt: number;
  /** Category.id the batch was scoped to; "" when generated across all categories (generic smart mode). */
  categoryId: string;
  platformGroup: PlatformGroup;
  /** Snapshot of the user context text used to generate this batch. */
  context: string;
}

export interface AppData {
  brandName: string;
  brandOneLiner: string;
  brandAudience: string;
  brandVoice: string;
  brandPillars: TextItem[];
  brandNotes: string;
  personalName: string;
  personalOneLiner: string;
  personalVoice: string;
  personalTraits: TextItem[];
  personalNotes: string;
  /** References a ModelInfo.id from lib/models.ts */
  aiModel: string;
  genBatchSize: number;
  /** Editable instructions sent to the AI when analyzing YouTube inspiration videos — see Frameworks. */
  youtubeAnalysisInstructions: string;
  /** Editable instructions sent to the AI when analyzing Instagram/TikTok inspiration videos — see Frameworks. */
  igTiktokAnalysisInstructions: string;
  /** Editable instructions sent to the AI when critiquing an idea's title/hook via "Evaluate idea" — see Frameworks. */
  ideaEvaluationInstructions: string;
  /** Editable instructions sent to the AI when critiquing an idea's script via "Evaluate script" — see Frameworks. */
  scriptEvaluationInstructions: string;
  categories: Category[];
  hooks: TextItem[];
  ideas: Idea[];
  inspirations: Inspiration[];
  library: LibraryEntry[];
  generationBatches: GenerationBatch[];
}

export type TabId = "brand" | "generate" | "ideas" | "frameworks" | "inspiration" | "library";
