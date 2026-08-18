import { genId } from "./id";
import { DEFAULT_MODEL_ID } from "./models";
import { DEFAULT_YOUTUBE_ANALYSIS_INSTRUCTIONS } from "./youtube";
import { DEFAULT_IGTIKTOK_ANALYSIS_INSTRUCTIONS } from "./socialVideos";
import { DEFAULT_IDEA_EVALUATION_INSTRUCTIONS, DEFAULT_SCRIPT_EVALUATION_INSTRUCTIONS } from "./generation";
import type { AppData } from "./types";

export function defaultSeed(): AppData {
  const g = () => genId();
  return {
    brandName: "arysk",
    brandOneLiner: "",
    brandAudience: "",
    brandVoice: "",
    brandPillars: [],
    brandNotes: "",
    personalName: "",
    personalOneLiner: "",
    personalVoice: "",
    personalTraits: [],
    personalNotes: "",
    aiModel: DEFAULT_MODEL_ID,
    genBatchSize: 5,
    youtubeAnalysisInstructions: DEFAULT_YOUTUBE_ANALYSIS_INSTRUCTIONS,
    igTiktokAnalysisInstructions: DEFAULT_IGTIKTOK_ANALYSIS_INSTRUCTIONS,
    ideaEvaluationInstructions: DEFAULT_IDEA_EVALUATION_INSTRUCTIONS,
    scriptEvaluationInstructions: DEFAULT_SCRIPT_EVALUATION_INSTRUCTIONS,
    categories: [
      {
        id: "yap",
        name: "Yap",
        platform: "IGTikTok",
        stage: "TOF",
        owner: "personal",
        desc: "Raw, direct-to-camera. Builds reach and trust — no hard CTA, just posted.",
        structures: [
          {
            id: g(),
            text: "Hook with the take → back it with one quick reason or story → land the point (or leave it open).",
          },
        ],
        angles: [
          { id: g(), name: "Strong take", structure: "" },
          {
            id: g(),
            name: "Strong take → education",
            structure: "State the take → pivot into teaching the underlying lesson",
          },
          { id: g(), name: "Small epiphany", structure: "" },
          { id: g(), name: "Humour yap", structure: "" },
          { id: g(), name: "Storytime", structure: "" },
        ],
      },
      {
        id: "storytelling",
        name: "Storytelling",
        platform: "IGTikTok",
        stage: "MOF",
        owner: "personal",
        desc: "Longer-form personal storytelling. Alternate between two formats.",
        structures: [],
        angles: [
          {
            id: g(),
            name: "Narrative",
            structure: "Set the scene → the risk or decision → what happened → what you learned",
          },
          {
            id: g(),
            name: "Decision BTS",
            structure: "Name the decision → what led to it → the tradeoffs weighed → the outcome so far",
          },
        ],
      },
      {
        id: "vlog",
        name: "Vlog",
        platform: "YouTube",
        stage: "MOF",
        owner: "personal",
        desc: "Day-in-the-life documentation. Reveal the setup early, withhold the outcome.",
        structures: [],
        angles: [
          {
            id: g(),
            name: "Audience Hacking",
            structure: "Anchor to a known person/format → place your bet → live it out → compare → give your take",
          },
          {
            id: g(),
            name: "Hero's Journey",
            structure: "Problem → backstory → attempt → setback → epiphany → resolution",
          },
          {
            id: g(),
            name: "How-to / Educational",
            structure: "Name the process → the stakes → the steps → the snag → the takeaway",
          },
          {
            id: g(),
            name: "Founder Log",
            structure: "Episode theme → where things stand → this stretch's build → life thread → what's next",
          },
        ],
      },
      {
        id: "brand",
        name: "Brand / Drop",
        platform: "YouTube",
        stage: "BOF",
        owner: "brand",
        desc: "Product-focused. The actual conversion destination.",
        structures: [],
        angles: [
          { id: g(), name: "Concept/product video", structure: "Viral-ish, interesting angle, not polished" },
          { id: g(), name: "Why the brand exists", structure: "Short doc format" },
          { id: g(), name: "Detail/flatlay reveal", structure: "" },
          { id: g(), name: "Launch post", structure: "" },
          { id: g(), name: "Post-sellout proof", structure: "Sold out in X hours → show the waitlist" },
        ],
      },
    ],
    hooks: [
      { id: g(), text: "Contrarian statement" },
      { id: g(), text: "Direct question" },
      { id: g(), text: "Story cold-open" },
      { id: g(), text: "Myth-bust" },
    ],
    ideas: [],
    inspirations: [
      {
        id: g(),
        name: "Austin Georgas",
        handle: "@austingeorgas",
        platform: "Instagram",
        link: "https://www.instagram.com/austingeorgas/",
        tags: ["yap"],
        notes: "Yap content — raw, direct-to-camera reference.",
      },
      {
        id: g(),
        name: "Ross Mackay",
        handle: "@RossMackay1",
        platform: "YouTube",
        link: "https://www.youtube.com/@RossMackay1",
        tags: ["vlog"],
        notes: "Founder vlog reference.",
      },
      {
        id: g(),
        name: "George Heaton",
        handle: "@George.Heaton",
        platform: "YouTube",
        link: "https://www.youtube.com/@George.Heaton/videos",
        tags: ["vlog"],
        notes: "",
      },
    ],
    library: [],
    generationBatches: [],
  };
}
