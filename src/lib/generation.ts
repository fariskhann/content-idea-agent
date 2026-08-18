import type { AppData, Category, Idea, LibraryEntry } from "./types";

/** Library candidate caps for "smart" (AI-picks-format) generation — wide, since the model is trusted to select relevance itself rather than being handed a pre-filtered top-N. */
const SMART_SINGLE_LIBRARY_CAP = 18;
const SMART_MULTI_LIBRARY_CAP_PER_CAT = 8;

export const DEFAULT_IDEA_EVALUATION_INSTRUCTIONS =
  "Judge this idea primarily on whether the title and hook actually work together — does the hook deliver on or sharpen the title's promise, or does one undercut the other — and whether it applies a pattern from the library learnings above (if any) rather than being generic filler that ignores them. " +
  "Only mention format/structure or voice fit if there's a real problem worth flagging. " +
  "Cite library learnings by their bracketed number when they inform your judgment. " +
  'Respond ONLY with a raw JSON object (no markdown fences, no commentary) shaped like: {"reasoning": one or two short, direct sentences — the single sharpest point, no throat-clearing or compound sub-clauses (not a numeric score or tier label), "libraryRefs": array of the bracketed learning numbers your reasoning actually references, or [] if none}.';

export const DEFAULT_SCRIPT_EVALUATION_INSTRUCTIONS =
  "Judge this script primarily on whether it actually delivers on the title and hook's promise — does the opening line match what's written on the card, does the middle follow through, does it land — and whether it applies a pattern from the library learnings above (if any) rather than being generic filler that ignores them. " +
  "Be specific about which lines or beats are weak and why, not a general pacing/structure comment. " +
  "Cite library learnings by their bracketed number when they inform your judgment. " +
  'Respond ONLY with a raw JSON object (no markdown fences, no commentary) shaped like: {"reasoning": one or two short, direct sentences — the single sharpest point, no throat-clearing or compound sub-clauses (not a numeric score or tier label), "libraryRefs": array of the bracketed learning numbers your reasoning actually references, or [] if none}.';

export function buildVoiceAndBrandBlocks(data: AppData): { brandBlock: string; personalBlock: string } {
  const pillars = data.brandPillars.map((p) => p.text).filter(Boolean);
  const traits = data.personalTraits.map((p) => p.text).filter(Boolean);
  let brandBlock = "Brand: " + data.brandName + (data.brandOneLiner ? " — " + data.brandOneLiner : "") + "\n";
  if (data.brandAudience) brandBlock += "Audience: " + data.brandAudience + "\n";
  if (data.brandVoice) brandBlock += "Brand voice & tone: " + data.brandVoice + "\n";
  if (pillars.length) brandBlock += "Key differentiators: " + pillars.join("; ") + "\n";
  if (data.brandNotes) brandBlock += "Other brand context: " + data.brandNotes + "\n";

  let personalBlock = "";
  if (data.personalName || data.personalOneLiner || data.personalVoice || traits.length || data.personalNotes) {
    personalBlock +=
      "Personal creator: " + (data.personalName || "(unnamed)") + (data.personalOneLiner ? " — " + data.personalOneLiner : "") + "\n";
    if (data.personalVoice) personalBlock += "Personal voice & tone: " + data.personalVoice + "\n";
    if (traits.length) personalBlock += "Known for: " + traits.join("; ") + "\n";
    if (data.personalNotes) personalBlock += "Other personal context: " + data.personalNotes + "\n";
  }
  return { brandBlock, personalBlock };
}

/** The AI picks its own format+structure fit per idea, draws on a wide pool of library learnings (citing which ones it actually used), and returns as many well-fitting ideas as the context supports rather than a fixed count — plus a short AI-written name for the batch. */
export function buildSmartAiGeneratePromptForCategory(
  data: AppData,
  cat: Category,
  platform: string,
  context: string,
  maxCount: number
): { prompt: string; libraryEntries: LibraryEntry[] } {
  const hooksText = data.hooks.map((h) => h.text).join(", ");
  const existing = data.ideas
    .slice(0, 10)
    .map((i) => i.title)
    .filter(Boolean)
    .join("; ");
  const inspo = data.inspirations
    .filter((i) => i.name)
    .map((p) => p.name + " (" + p.platform + ")" + (p.notes ? " — " + p.notes : ""))
    .join("\n");
  const { brandBlock, personalBlock } = buildVoiceAndBrandBlocks(data);

  const ownerLine =
    cat.owner === "personal"
      ? "Write in the personal voice of " + (data.personalName || "the creator") + (data.personalVoice ? " — voice: " + data.personalVoice : "")
      : `Write in the "${data.brandName}" brand voice` + (data.brandVoice ? " — voice: " + data.brandVoice : "");

  let prompt = brandBlock + (personalBlock ? "\n" + personalBlock : "") + "\n" + ownerLine + ".\n\n";
  prompt += "Content type: " + cat.name + " (" + cat.stage + "). " + cat.desc + "\n\n";
  if (hooksText) prompt += "Hook formulas available: " + hooksText + "\n\n";
  if (inspo) prompt += "Creators/pages they like for inspiration:\n" + inspo + "\n\n";
  const libraryEntries = data.library
    .filter((e) => e.categoryIds.includes(cat.id))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, SMART_SINGLE_LIBRARY_CAP);
  if (libraryEntries.length)
    prompt +=
      "Things we've learned from analysing inspiration for this content type (use only what's genuinely relevant to this specific idea — it's completely fine to use none of these, don't force a tenuous connection just to reference one; if you do use one, cite its number in libraryRefs):\n" +
      libraryEntries.map((e, i) => "[" + (i + 1) + "] " + e.text).join("\n") +
      "\n\n";
  if (existing) prompt += "Ideas already logged (avoid repeating):\n" + existing + "\n\n";
  prompt += "Context from the user right now: " + context + "\n\n";

  prompt += "Available formats for this content type (pick whichever genuinely fits each idea):\n";
  prompt += cat.angles.map((a) => '- "' + a.name + '"' + (a.structure ? " — structure hint: " + a.structure : "")).join("\n") + "\n";
  if (cat.structures.length) {
    prompt += "Available structures:\n";
    prompt += cat.structures.map((st) => "- " + st.text).join("\n") + "\n";
  }
  prompt += "\n";

  prompt +=
    "Pick whichever format (and structure, if any apply) genuinely suits each idea — different ideas may use different formats if that's a better fit, but don't force variety for its own sake; it's fine for several ideas to share the same format if that's what actually fits the context. " +
    "Only generate as many genuinely distinct, well-fitting ideas as this context actually supports, up to " +
    maxCount +
    " — do not pad to reach that number. If nothing here fits the context well, it's fine to return fewer, or none at all." +
    (platform ? " Ideas are for " + platform + "." : "") +
    ' Respond ONLY with a raw JSON object (no markdown fences, no commentary) shaped like: {"batchName": a short 3-6 word name capturing the shared theme of this batch based on the context, "ideas": array of 0 to ' +
    maxCount +
    ' objects, each shaped like: {"title": short idea title, "hook": one opening line, "format": the exact name of the format you chose from the list above, "structure": the structure you followed (empty string if none applicable), "notes": one sentence on how to shoot it, "libraryRefs": array of the bracketed learning numbers you genuinely drew from for this specific idea, or [] if none, "concerns": one terse, direct sentence critiquing this specific idea — primarily whether the title and hook actually work together (does the hook deliver on what the title promises) and whether it applies a library learning above rather than being generic filler, only secondarily format/structure or voice fit; qualitative and blunt, never a score or tier label}}. If nothing fits well, "ideas" should be [].';

  return { prompt, libraryEntries };
}

/** The AI picks its own format+structure fit per idea, draws on a wider per-category pool of library learnings (citing which ones it actually used), and returns as many well-fitting ideas as the context supports rather than a fixed count — plus a short AI-written name for the batch. */
export function buildSmartAiGeneratePromptGeneric(
  data: AppData,
  categories: Category[],
  platformLabel: string,
  context: string,
  maxCount: number
): { prompt: string; libraryEntries: LibraryEntry[] } {
  const libraryEntries: LibraryEntry[] = [];
  const frameworkText = categories
    .map((c) => {
      const structuresText = c.structures.map((st) => st.text).filter(Boolean).join(" | ");
      const angleLines = c.angles
        .map((a) => {
          const struct = [structuresText, a.structure].filter(Boolean).join(" + ");
          return a.name + (struct ? " [structure: " + struct + "]" : "");
        })
        .join("; ");
      const catLibraryEntries = data.library
        .filter((e) => e.categoryIds.includes(c.id))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, SMART_MULTI_LIBRARY_CAP_PER_CAT);
      const libText = catLibraryEntries
        .map((e) => {
          libraryEntries.push(e);
          return "[" + libraryEntries.length + "] " + e.text;
        })
        .join(" | ");
      return (
        c.name +
        " (" +
        c.stage +
        ", " +
        (c.owner === "personal" ? "Personal" : "Brand") +
        ")" +
        (structuresText ? ", structures: " + structuresText : "") +
        ": " +
        c.desc +
        " Formats: " +
        angleLines +
        (libText ? " Learnings (use only if genuinely relevant to the idea, fine to use none; cite numbers in libraryRefs if used): " + libText : "")
      );
    })
    .join("\n");

  const hooksText = data.hooks.map((h) => h.text).join(", ");
  const existing = data.ideas
    .slice(0, 10)
    .map((i) => i.title)
    .filter(Boolean)
    .join("; ");
  const inspo = data.inspirations
    .filter((i) => i.name)
    .map((p) => p.name + " (" + p.platform + ")" + (p.notes ? " — " + p.notes : ""))
    .join("\n");
  const { brandBlock, personalBlock } = buildVoiceAndBrandBlocks(data);

  const platformOptionsText = platformLabel === "YouTube" ? '"YouTube"' : '"Instagram" or "TikTok"';

  let prompt =
    brandBlock +
    (personalBlock ? "\n" + personalBlock : "") +
    "\nYou are a content strategist helping generate short-form video content ideas. Each content type below is tagged Personal or Brand — write Personal-tagged ideas in the personal creator's voice, and Brand-tagged ideas in the brand voice.\n\nContent framework (content type — stage — owner — formats, each with its structure):\n" +
    frameworkText +
    "\n\nHook formulas: " +
    hooksText +
    "\n\n";
  if (inspo) prompt += "Creators/pages they like for inspiration:\n" + inspo + "\n\n";
  if (existing) prompt += "Ideas already logged (avoid repeating):\n" + existing + "\n\n";
  prompt += "Context from the user right now: " + context + "\n\n";

  prompt +=
    "For each idea, pick whichever content type and format genuinely suits it — don't force variety for its own sake. Only generate as many genuinely distinct, well-fitting ideas as this context actually supports" +
    (platformLabel ? " for " + platformLabel : "") +
    ", up to " +
    maxCount +
    " — do not pad to reach that number. If nothing fits the context well, it's fine to return fewer, or none at all." +
    ' Respond ONLY with a raw JSON object (no markdown fences, no commentary) shaped like: {"batchName": a short 3-6 word name capturing the shared theme of this batch based on the context, "ideas": array of 0 to ' +
    maxCount +
    ' objects, each shaped like: {"title": short idea title, "hook": one opening line, "category": one of [' +
    categories.map((c) => c.name).join(", ") +
    '], "platform": ' +
    platformOptionsText +
    ', "format": the format name you chose from that category\'s list, "structure": the structure you followed (empty string if none applicable), "notes": one sentence on why or how to shoot it, "libraryRefs": array of the bracketed learning numbers you genuinely drew from for this specific idea, or [] if none, "concerns": one terse, direct sentence critiquing this specific idea — primarily whether the title and hook actually work together (does the hook deliver on what the title promises) and whether it applies a library learning above rather than being generic filler, only secondarily format/structure or voice fit; qualitative and blunt, never a score or tier label}}. If nothing fits well, "ideas" should be [].';

  return { prompt, libraryEntries };
}

export function buildScriptPrompt(data: AppData, idea: Idea, cat: Category | undefined, instruction: string): string {
  let prompt =
    'Write a short-form video script for the brand "' +
    data.brandName +
    '"' +
    (data.brandOneLiner ? " — " + data.brandOneLiner : "") +
    ".\n\n";
  prompt += "Idea title: " + (idea.title || "Untitled") + "\n";
  if (cat) {
    prompt += "Content type: " + cat.name + " (" + cat.stage + ")\n";
    const libraryEntries = data.library
      .filter((e) => e.categoryIds.includes(cat.id))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 6);
    if (libraryEntries.length) prompt += "Things we've learned works for this content type:\n" + libraryEntries.map((e) => "- " + e.text).join("\n") + "\n";
  }
  if (idea.platform && idea.platform !== "Any") prompt += "Platform: " + idea.platform + "\n";
  if (idea.hook) prompt += "Hook / opening line: " + idea.hook + "\n";
  if (idea.notes) prompt += "Notes / structure to follow: " + idea.notes + "\n";
  const owner = cat ? cat.owner : "brand";
  if (owner === "personal") {
    prompt += "Write this in the personal voice of " + (data.personalName || "the creator") + (data.personalOneLiner ? " — " + data.personalOneLiner : "") + ".\n";
    if (data.personalVoice) prompt += "Voice & tone: " + data.personalVoice + "\n";
  } else {
    prompt += `Write this in the "${data.brandName}" brand voice.\n`;
    if (data.brandVoice) prompt += "Voice & tone: " + data.brandVoice + "\n";
  }
  if (idea.script) {
    prompt += "\nExisting script:\n" + idea.script + "\n";
    prompt += instruction ? "\nRevise it with this specific change: " + instruction + "\n" : "\nWrite a fresh alternate take on it.\n";
  }
  prompt +=
    "\nWrite the actual script — what to say on camera, beat by beat, following the structure in the notes if one is given. Keep it tight for a short-form video. Respond with the script only, no commentary, no markdown headers.";
  return prompt;
}

/** Critiques a single idea already on the board — judged primarily on whether it actually applies a distilled Library learning or is generic filler that ignores one, secondarily on framework/voice/specificity fit. Grounds its judgment by citing which Library entries it's referencing, same numbered-citation pattern as generation. */
export function buildEvaluatePrompt(data: AppData, idea: Idea, cat: Category | undefined): { prompt: string; libraryEntries: LibraryEntry[] } {
  const { brandBlock, personalBlock } = buildVoiceAndBrandBlocks(data);
  const owner = cat ? cat.owner : "brand";
  const ownerLine =
    owner === "personal"
      ? "This idea is meant to be in the personal voice of " + (data.personalName || "the creator") + (data.personalVoice ? " — voice: " + data.personalVoice : "")
      : `This idea is meant to be in the "${data.brandName}" brand voice` + (data.brandVoice ? " — voice: " + data.brandVoice : "");

  let prompt = brandBlock + (personalBlock ? "\n" + personalBlock : "") + "\n" + ownerLine + ".\n\n";
  prompt += "You are critiquing a single content idea already on the board. Be direct and specific — this is an internal quality check, not encouragement.\n\n";
  prompt += "Idea title: " + (idea.title || "Untitled") + "\n";
  if (idea.hook) prompt += "Hook: " + idea.hook + "\n";
  if (idea.platform && idea.platform !== "Any") prompt += "Platform: " + idea.platform + "\n";
  if (idea.notes) prompt += "Notes: " + idea.notes + "\n";
  if (idea.format) prompt += "Chosen format: " + idea.format + "\n";
  if (idea.structure) prompt += "Chosen structure: " + idea.structure + "\n";

  let libraryEntries: LibraryEntry[] = [];
  if (cat) {
    prompt += "\nContent type: " + cat.name + " (" + cat.stage + "). " + cat.desc + "\n";
    if (cat.angles.length)
      prompt += "Formats actually available for this content type: " + cat.angles.map((a) => '"' + a.name + '"' + (a.structure ? " (" + a.structure + ")" : "")).join(", ") + "\n";
    if (cat.structures.length)
      prompt += "Structures actually available: " + cat.structures.map((st) => st.text).filter(Boolean).join(" | ") + "\n";

    libraryEntries = data.library
      .filter((e) => e.categoryIds.includes(cat.id))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, SMART_SINGLE_LIBRARY_CAP);
    if (libraryEntries.length)
      prompt += "\nThings we've learned from analysing inspiration for this content type:\n" + libraryEntries.map((e, i) => "[" + (i + 1) + "] " + e.text).join("\n") + "\n";
    else prompt += "\nNo library learnings are logged yet for this content type — say so plainly rather than inventing a pattern fit.\n";
  } else {
    prompt += "\nThis idea has no content type assigned, so there's no framework or library learnings to check it against — say so plainly and judge only on hook strength, specificity, and general voice fit.\n";
  }

  prompt += "\n" + (data.ideaEvaluationInstructions || DEFAULT_IDEA_EVALUATION_INSTRUCTIONS);

  return { prompt, libraryEntries };
}

/** Critiques the actual generated script content of a single idea already on the board — distinct from buildEvaluatePrompt's title/hook-only critique. Same numbered-citation pattern; caps script length like the transcript caps used elsewhere in analysis prompts. */
export function buildScriptEvaluatePrompt(data: AppData, idea: Idea, cat: Category | undefined): { prompt: string; libraryEntries: LibraryEntry[] } {
  const { brandBlock, personalBlock } = buildVoiceAndBrandBlocks(data);
  const owner = cat ? cat.owner : "brand";
  const ownerLine =
    owner === "personal"
      ? "This idea is meant to be in the personal voice of " + (data.personalName || "the creator") + (data.personalVoice ? " — voice: " + data.personalVoice : "")
      : `This idea is meant to be in the "${data.brandName}" brand voice` + (data.brandVoice ? " — voice: " + data.brandVoice : "");

  let prompt = brandBlock + (personalBlock ? "\n" + personalBlock : "") + "\n" + ownerLine + ".\n\n";
  prompt += "You are critiquing the actual script written for a content idea already on the board. Be direct and specific — this is an internal quality check, not encouragement.\n\n";
  prompt += "Idea title: " + (idea.title || "Untitled") + "\n";
  if (idea.hook) prompt += "Hook: " + idea.hook + "\n";
  if (idea.platform && idea.platform !== "Any") prompt += "Platform: " + idea.platform + "\n";
  if (idea.notes) prompt += "Notes: " + idea.notes + "\n";
  if (idea.format) prompt += "Chosen format: " + idea.format + "\n";
  if (idea.structure) prompt += "Chosen structure: " + idea.structure + "\n";

  let libraryEntries: LibraryEntry[] = [];
  if (cat) {
    prompt += "\nContent type: " + cat.name + " (" + cat.stage + "). " + cat.desc + "\n";
    if (cat.angles.length)
      prompt += "Formats actually available for this content type: " + cat.angles.map((a) => '"' + a.name + '"' + (a.structure ? " (" + a.structure + ")" : "")).join(", ") + "\n";
    if (cat.structures.length)
      prompt += "Structures actually available: " + cat.structures.map((st) => st.text).filter(Boolean).join(" | ") + "\n";

    libraryEntries = data.library
      .filter((e) => e.categoryIds.includes(cat.id))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, SMART_SINGLE_LIBRARY_CAP);
    if (libraryEntries.length)
      prompt += "\nThings we've learned from analysing inspiration for this content type:\n" + libraryEntries.map((e, i) => "[" + (i + 1) + "] " + e.text).join("\n") + "\n";
    else prompt += "\nNo library learnings are logged yet for this content type — say so plainly rather than inventing a pattern fit.\n";
  } else {
    prompt += "\nThis idea has no content type assigned, so there's no framework or library learnings to check it against — say so plainly and judge only on whether the script itself works.\n";
  }

  prompt += "\nScript being judged:\n" + idea.script.slice(0, 3000) + (idea.script.length > 3000 ? "\n[...truncated]" : "") + "\n";
  prompt += "\n" + (data.scriptEvaluationInstructions || DEFAULT_SCRIPT_EVALUATION_INSTRUCTIONS);

  return { prompt, libraryEntries };
}
