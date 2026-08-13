# Brand outline editing and idea generation updates

_Started 2026-08-12 15:59 UTC_

---

## User

just like frameworks, should be ability to see brand outline so we can also change or edit everything, and change the brain if we need to

in the generate ideas tab add the ai model choice, ideas to generate slider and just make all categories the default.

when idea is in idea board make it so the card just shows the title, platform, category and once expanded shows more / all details

frameworks, it should be split into content types and structure. For example Audience hacking is the vlog type and anchor to a known person/format, place your bet, live it out, compare, give your take is the structure of the video. 
Strong take is the yap type, but we need to add a structure of this yap type or have a universal yap structure.

## Assistant

We built a Content Idea Agent for your YouTube/Instagram/TikTok strategy. It takes your framework (categories like Yap, Storytelling, Vlog, Brand/Drop; funnel stages; hook formulas) plus inspiration accounts you admire, and generates tailored content ideas you can edit, move through status stages, and export.

We decided early on: skip live competitor research for now and focus on idea generation; keep the Inspiration tab (notes + tags) even without active monitoring, since it anchors your voice; drop F.U.E.L entirely as out of scope; use your Modernist design system (Archivo, flat red/white, zero radius) as the visual foundation.

The agent has four main tabs. Generate offers two modes—Quick Spin (instant random combo of your framework + hook + platform) and Generate with AI (sends Claude your full framework, hooks, inspiration accounts, and context to write fresh ideas). Ideas board is a kanban by status (idea → scripted → filmed → posted). Frameworks tab lets you edit categories, angles, and hook formulas. Inspiration holds your three seeded accounts with notes and category tags.

Each idea card has: Platform, Funnel stage, Status, Hook/opening line, and Notes/links fields—all editable inline. Data exports/imports so you own it.

The build is complete and styled. The component is live as Content Idea Agent.dc.html with support.js handling the generate logic. You can now add your own inspiration accounts, tweak the framework to fit your voice, and start spinning or AI-generating ideas.

Next steps: test both generate modes, refine the hook library if any formulas aren't landing, and add more inspiration accounts as you discover creators you want to emulate.

## User

just like frameworks, should be ability to see brand outline so we can also change or edit everything, and change the brain if we need to

in the generate ideas tab add the ai model choice, ideas to generate slider and just make all categories the default.

when idea is in idea board make it so the card just shows the title, platform, category and once expanded shows more / all details

frameworks, it should be split into content types and structure. For example Audience hacking is the vlog type and anchor to a known person/format, place your bet, live it out, compare, give your take is the structure of the video. 
Strong take is the yap type, but we need to add a structure of this yap type or have a universal yap structure.

## Assistant

_[tool: read_file]_

_[tool: dc_write]_

_[tool: ready_for_verification]_

Added a Brand tab (name, one-liner, audience, voice, differentiators, notes — all fed into AI generation), moved AI model + ideas-count slider into the Generate tab itself, collapsed idea cards to title/platform/category with an expand toggle for full details, and split Frameworks into content types with a default structure plus per-format structure overrides (Audience Hacking etc. now carry their own steps, Yap gets a universal fallback structure).

## User

can u make it an option that formats can follow the default structure but also take in note from their box

## Assistant

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

Done — a format's own note now layers on top of its category's default structure (combined with " + ") instead of replacing it, both in Quick Spin and AI generation.

## User

i want to change things up, allow for multiple structures and every idea that is generated automatically generates for each structure and if i up ideas to generate it will generate 1 more, so lets say i have 3 structures, i have an idea, it will generate 3 ideas, if i up it to generate 2 ideas it will generate 6, one for each framework

## Assistant

_[tool: read_file]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

Now the quickSpin/aiGenerate multiplier logic and renderVals wiring.

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

Categories now hold a list of "Structures" (add/remove freely) instead of one default. Quick Spin and AI Generate both multiply: "Concepts to generate" (renamed, min 1) × the chosen category's structure count = total ideas, each variant labeled and carrying its own structure in Notes. Formats' own note still layers on top of every structure.

## User

Found issues — fixing…

## Assistant

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

Fixed — bumped the placeholder count so it no longer collides with the seeded array length.

## User

can we do it that if there is not structure then it will generate for each format instead?

## Assistant

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

Done — when a category has no structures, Quick Spin and AI Generate now produce one idea per format instead (only falling into the structure-multiplier path when structures exist).

## User

can we do it so when we click generate we can select with a tick box what structures and/or formats we want it to generate with/of

## Assistant

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

Now the renderVals additions and the template checkbox UI.

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

Picking a specific category on Generate now reveals checkboxes for its formats and (if any) structures — unchecked ones are excluded from both Quick Spin and AI Generate. "All categories" mode ignores the filters and uses everything, as before.

## User

ok for the idea board cards, we need an option that allows you to generate the script based on the notes, once done it moves to scripted.

also add titles to show what each smaller box is about, for example Notes above notes box.

## Assistant

_[tool: dc_html_str_replace]_

Now the logic: script generation method, state, addIdea default, and enrichIdea wiring.

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

Expanded idea cards now show a field label above every box (Title, Hook, Platform, Status, Category, Notes, Reference link), plus a Script field with a "Generate script" button that writes a script from the idea's notes/hook/structure and moves the card to Scripted automatically.

## User

can we make it so both frameworks and ideas on ideas board start minimised and can be maximised

## Assistant

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: read_file]_

_[tool: grep]_

Looks syntactically correct. Verifying now.

_[tool: ready_for_verification]_

Frameworks content types now start collapsed (showing just name, stage, format/structure counts) with a ▸/▾ toggle to expand full editing. Ideas board cards were already collapsed by default, so no change needed there.

## User

do the same for cards on ideas board, start minimised but can be maximised. Also for scripts when regenerating, allow a way that when regenerate is selected it allows for you to say what you want to change.

## Assistant

_[tool: grep]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

Now the template for the regenerate panel.

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

Ideas board cards already start minimised (that was already in place). For scripts: clicking "Regenerate script" (when one exists) now opens a note field to say what to change before it regenerates — plain "Generate script" for a first script still runs immediately.

## User

frameworks can we add an option next to the TOF/MOF/BOF selection which you can choose Personal or Brand. Then in brand tab, call it about and have brand outline and personal outline, and these will provide added context to frameworks and idea generation

## Assistant

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

Now persist/export, addCategory default owner, personal trait CRUD, prompt updates, and renderVals wiring.

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

Now the AI prompt logic (aiGenerate + generateScript) and renderVals/categoriesEnriched wiring.

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

Now categoriesEnriched (owner field/setter/label) and renderVals for personal outline + About tab labels.

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

Frameworks now has a Personal/Brand selector next to TOF/MOF/BOF (seeded: Yap, Storytelling, Vlog = Personal; Brand/Drop = Brand), shown in the collapsed summary too. The Brand tab is renamed "About" and split into Brand outline + Personal outline sections — both feed AI Generate and Script generation, which now write in the matching voice per content type's owner tag.

## User

Found issues — fixing…

## Assistant

_[tool: grep]_

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

Fixed by keying the owner `<select>` on `{catId}-{owner}` so it fully remounts with the correct selection once real data resolves, plus a defensive `owner || 'brand'` fallback for any pre-existing saved categories without the field.

## User

concepts to generate should be for every format * structure * amount i choose on slider

## Assistant

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

Both Quick Spin and AI Generate now cross every included format × every included structure, repeated for the slider's round count (relabeled "Rounds to generate × formats × structures") — no more random single-format pick.

## User

make it so the formats actually influence each idea made e.g. if i select founder log, make the sure the idea is slightly different and more suited as opposed to if i selected another format. each one should be custom, even the title

## Assistant

_[tool: read_file]_

_[tool: read_file]_

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

When a specific category is selected, AI Generate now sends Claude an explicit numbered list of every format+structure slot and asks for a genuinely tailored title/hook/notes per slot (e.g. Founder Log reads like a build update, Hero's Journey like a struggle-to-breakthrough arc) instead of one generic idea relabeled per format. "All categories" mode keeps the simpler one-idea-per-AI-concept flow.

