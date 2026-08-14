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
}

export type TabId = "brand" | "generate" | "ideas" | "frameworks" | "inspiration";
