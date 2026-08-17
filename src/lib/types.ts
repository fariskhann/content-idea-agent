export type Platform = "Any" | "YouTube" | "Instagram" | "TikTok";
/** The platform group a Category belongs to — Instagram and TikTok are merged into one group for content-type/format purposes. */
export type PlatformGroup = "YouTube" | "IGTikTok";
export type Stage = "TOF" | "MOF" | "BOF";
export type Owner = "brand" | "personal";
export type IdeaStatus = "idea" | "scripted" | "filmed" | "posted";

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
  /** Smart-mode only: the format the AI chose for this idea. Undefined for rigid-mode/manually created ideas. */
  format?: string;
  /** Smart-mode only: the structure the AI chose for this idea. */
  structure?: string;
  /** LibraryEntry.id[] the AI cited as informing this idea — may point at a since-deleted entry, resolve defensively wherever displayed. */
  libraryEntryIds?: string[];
  /** GenerationBatch.id this idea was approved from (smart mode only), for "generated with N others" traceability. */
  batchId?: string;
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

export interface Inspiration {
  id: string;
  name: string;
  handle: string;
  platform: PlatformGroup;
  link: string;
  tags: string[];
  notes: string;
  youtubeVideos?: YoutubeVideo[];
  youtubeLastFetched?: number;
  youtubeAnalysis?: YoutubeAnalysis;
}

export interface LibraryEntry {
  id: string;
  /** Category.id[] this learning is scoped to for prompt retrieval. Empty = unscoped/"General". */
  categoryIds: string[];
  platform: PlatformGroup;
  /** The distilled, durable learning — compact and reusable, not raw analysis output. */
  text: string;
  sourceInspirationId: string;
  /** Denormalized snapshot so the entry still reads sensibly if the Inspiration is later renamed or deleted. */
  sourceInspirationName: string;
  sourceVideoIds: string[];
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
  /** Editable instructions for Instagram/TikTok inspiration analysis — not wired into a live AI call yet (no public fetch API for either). */
  igTiktokAnalysisInstructions: string;
  categories: Category[];
  hooks: TextItem[];
  ideas: Idea[];
  inspirations: Inspiration[];
  library: LibraryEntry[];
  generationBatches: GenerationBatch[];
}

export type TabId = "brand" | "generate" | "ideas" | "frameworks" | "inspiration" | "library";
