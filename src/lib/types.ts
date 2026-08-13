export type Platform = "Any" | "YouTube" | "Instagram" | "TikTok";
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

export interface YoutubeOutlierResult {
  videoId: string;
  why: string;
  borrow: string;
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
  platform: "Instagram" | "TikTok" | "YouTube" | "Other";
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
  categories: Category[];
  hooks: TextItem[];
  ideas: Idea[];
  inspirations: Inspiration[];
}

export type TabId = "brand" | "generate" | "ideas" | "frameworks" | "inspiration";
