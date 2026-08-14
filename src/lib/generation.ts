import type { AppData, Angle, Category, Idea, TextItem, Platform } from "./types";

export interface GenerationPools {
  angles: Angle[];
  structures: TextItem[];
}

/** When a specific category is selected, format/structure checkboxes can narrow what's used. */
export function getGenerationPools(
  cat: Category,
  scoped: boolean,
  formatChecks: Record<string, boolean>,
  structureChecks: Record<string, boolean>
): GenerationPools {
  const isFormatChecked = (id: string) => formatChecks[id] !== false;
  const isStructureChecked = (id: string) => structureChecks[id] !== false;
  const angles = scoped ? cat.angles.filter((a) => isFormatChecked(a.id)) : cat.angles;
  const structures = scoped ? cat.structures.filter((st) => isStructureChecked(st.id)) : cat.structures;
  return { angles, structures };
}

export interface ExpandedIdeaDraft {
  title: string;
  hook: string;
  platform: Platform;
  categoryId: string;
  notes: string;
}

/** Crosses every included format × every included structure into one draft idea each. */
export function expandIdeas(
  cat: Category,
  baseTitle: string,
  baseHook: string,
  platform: Platform,
  baseNotes: string,
  pools: GenerationPools
): ExpandedIdeaDraft[] {
  const { angles, structures } = pools;
  const out: ExpandedIdeaDraft[] = [];
  if (!angles.length) return out;
  const multiFormat = angles.length > 1;
  if (structures.length) {
    const multiStruct = structures.length > 1;
    angles.forEach((angle) => {
      structures.forEach((st, idx) => {
        const structureText = [st.text, angle.structure].filter(Boolean).join(" + ");
        const notes = [baseNotes, structureText ? "Structure: " + structureText : ""].filter(Boolean).join(" — ");
        let title = baseTitle && multiFormat ? baseTitle + " — " + angle.name : baseTitle || angle.name;
        if (multiStruct) title += " — variant " + (idx + 1);
        out.push({ title, hook: baseHook, platform, categoryId: cat.id, notes });
      });
    });
  } else {
    angles.forEach((angle) => {
      const notes = [baseNotes, angle.structure ? "Structure: " + angle.structure : ""].filter(Boolean).join(" — ");
      const title = baseTitle && multiFormat ? baseTitle + " — " + angle.name : baseTitle || angle.name;
      out.push({ title, hook: baseHook, platform, categoryId: cat.id, notes });
    });
  }
  return out;
}

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

interface Slot {
  formatName: string;
  formatHint: string;
  structureText: string;
}

function buildSlots(cat: Category, pools: GenerationPools, rounds: number): Slot[] {
  const effStructures = pools.structures.length ? pools.structures : [null];
  const oneRound: Slot[] = [];
  pools.angles.forEach((angle) => {
    effStructures.forEach((st) => {
      const structureText = [st?.text, angle.structure].filter(Boolean).join(" + ");
      oneRound.push({ formatName: angle.name, formatHint: angle.structure || "", structureText });
    });
  });
  const slots: Slot[] = [];
  for (let r = 0; r < rounds; r++) slots.push(...oneRound);
  return slots;
}

export function buildAiGeneratePromptForCategory(
  data: AppData,
  cat: Category,
  pools: GenerationPools,
  platform: string,
  context: string,
  rounds: number
): { prompt: string; slots: Slot[] } {
  if (!pools.angles.length) throw new Error(`Select at least one format to include for "${cat.name}".`);
  const slots = buildSlots(cat, pools, rounds);
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
    .slice(0, 8);
  if (libraryEntries.length)
    prompt += "Things we've learned from analysing inspiration for this content type:\n" + libraryEntries.map((e) => "- " + e.text).join("\n") + "\n\n";
  if (existing) prompt += "Ideas already logged (avoid repeating):\n" + existing + "\n\n";
  if (context) prompt += "Context from the user right now: " + context + "\n\n";
  prompt += "Generate exactly " + slots.length + " distinct video ideas, one for each numbered slot below, IN ORDER (do not skip, merge, or reorder):\n";
  slots.forEach((slot, i) => {
    prompt += i + 1 + '. Format: "' + slot.formatName + '"' + (slot.structureText ? " — follow this structure: " + slot.structureText : "") + "\n";
  });
  prompt +=
    "\nEach idea must be genuinely shaped by its format, not a generic idea with the format name tacked on — the title, hook, and notes should reflect what makes that specific format work (e.g. a \"Founder Log\" idea should read like a build update, while a \"Hero's Journey\" idea should read like a struggle-to-breakthrough arc). Two slots on the same underlying topic but different formats should produce visibly different ideas." +
    (platform ? " Ideas are for " + platform + "." : "") +
    " Respond ONLY with a raw JSON array (no markdown fences, no commentary) of exactly " +
    slots.length +
    ' objects, in the same order as the numbered list, shaped like: {"title": short idea title tailored to its format, "hook": one opening line, "notes": one sentence on how to shoot it, referencing the structure}.';

  return { prompt, slots };
}

export function buildAiGeneratePromptGeneric(
  data: AppData,
  categories: Category[],
  getPoolsForCat: (cat: Category) => GenerationPools,
  platformLabel: string,
  context: string,
  rounds: number
): string {
  const frameworkText = categories
    .map((c) => {
      const pools = getPoolsForCat(c);
      const structuresText = pools.structures.map((st) => st.text).filter(Boolean).join(" | ");
      const angleLines = pools.angles
        .map((a) => {
          const struct = [structuresText, a.structure].filter(Boolean).join(" + ");
          return a.name + (struct ? " [structure: " + struct + "]" : "");
        })
        .join("; ");
      const libText = data.library
        .filter((e) => e.categoryIds.includes(c.id))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5)
        .map((e) => e.text)
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
        (libText ? " Learnings: " + libText : "")
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
  const count = rounds;

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
  if (context) prompt += "Context from the user right now: " + context + "\n\n";
  prompt +=
    "Generate " +
    count +
    " new, specific, non-generic content ideas" +
    (platformLabel ? " for " + platformLabel : "") +
    ". Each idea must be genuinely shaped by its chosen format, not generic — the title, hook, and notes should reflect what makes that specific format distinct. Respond ONLY with a raw JSON array (no markdown fences, no commentary) of " +
    count +
    ' objects shaped like: {"title": short idea title, "hook": one opening line, "category": one of [' +
    categories.map((c) => c.name).join(", ") +
    '], "platform": ' +
    platformOptionsText +
    ', "notes": one sentence on why or how to shoot it, including which structure to follow}.';

  return prompt;
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
