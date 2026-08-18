"use client";

import { useState } from "react";
import { useApp } from "@/lib/AppContext";
import { chipStyle, fieldLabel, muted, pageTitle, removeBtn } from "@/lib/styles";
import type { Idea, IdeaStatus } from "@/lib/types";
import { closestCenter, DndContext, KeyboardSensor, pointerWithin, PointerSensor, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const COLUMNS: { status: IdeaStatus; label: string }[] = [
  { status: "idea", label: "Idea" },
  { status: "scripted", label: "Scripted" },
  { status: "posted", label: "Posted" },
];

const BOARD_FILTERS: { value: "All" | "YouTube" | "IGTikTok"; label: string }[] = [
  { value: "All", label: "All" },
  { value: "YouTube", label: "YouTube" },
  { value: "IGTikTok", label: "IG + TikTok" },
];

/** closestCenter alone picks the nearest droppable RECT CENTER, which misbehaves for a Kanban board: an empty (or tall) column's droppable spans the whole column height, so its center can sit far below where the pointer actually is, losing out to a nearby card in the wrong column. Check literal pointer containment first, falling back to closestCenter only when the pointer briefly isn't over anything measurable (e.g. a very fast drag). */
const collisionDetectionStrategy: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
};

function IdeaCard({ idea }: { idea: Idea }) {
  const app = useApp();
  const cat = app.data.categories.find((c) => c.id === idea.categoryId);
  const expanded = !!app.expandedIds[idea.id];
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [evaluationCollapsed, setEvaluationCollapsed] = useState(false);
  const scriptGenerating = !!app.scriptGeneratingIds[idea.id];
  const showRegenPanel = !!app.scriptRegenOpenIds[idea.id];
  const regenNote = app.scriptRegenNotes[idea.id] || "";
  const scriptButtonLabel = scriptGenerating ? "Generating…" : idea.script ? "Regenerate script" : "Generate script";
  const created = idea.createdAt ? new Date(idea.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

  const citedEntries = (idea.libraryEntryIds || []).map((id) => app.data.library.find((e) => e.id === id)).filter((e): e is NonNullable<typeof e> => !!e);
  const batch = idea.batchId ? app.data.generationBatches.find((b) => b.id === idea.batchId) : undefined;
  const siblings = batch ? app.data.ideas.filter((i) => i.batchId === batch.id && i.id !== idea.id) : [];
  const siblingsExpanded = !!app.expandedSiblingIds[idea.id];

  const evaluating = !!app.evaluatingIds[idea.id];
  const evaluationError = app.evaluationErrors[idea.id] || "";
  const evaluateButtonLabel = evaluating ? "Evaluating…" : idea.evaluation ? "Re-evaluate idea" : "Evaluate idea";
  const evaluationCitedEntries = (idea.evaluation?.libraryEntryIds || [])
    .map((id) => app.data.library.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => !!e);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: idea.id });
  const [scriptEvaluationCollapsed, setScriptEvaluationCollapsed] = useState(false);
  const scriptEvaluating = !!app.scriptEvaluatingIds[idea.id];
  const scriptEvaluationError = app.scriptEvaluationErrors[idea.id] || "";
  const scriptEvaluateButtonLabel = scriptEvaluating ? "Evaluating…" : idea.scriptEvaluation ? "Re-evaluate script" : "Evaluate script";
  const scriptEvaluationCitedEntries = (idea.scriptEvaluation?.libraryEntryIds || [])
    .map((id) => app.data.library.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => !!e);

  const showIdeaRegenPanel = !!app.ideaRegenOpenIds[idea.id];
  const ideaRegenNote = app.ideaRegenNotes[idea.id] || "";
  const revisingIdea = !!app.revisingIdeaIds[idea.id];
  const ideaRevisionError = app.ideaRevisionErrors[idea.id] || "";

  return (
    <div
      ref={setNodeRef}
      style={{
        background: "var(--color-surface)",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span {...attributes} {...listeners} title="Drag to reorder or move columns" style={{ cursor: "grab", color: muted(45), fontSize: 13, padding: "0 2px", touchAction: "none" }}>
          ⠿
        </span>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>
          {cat ? cat.name : "Uncategorized"}
        </span>
        <span style={{ fontSize: 10, background: "var(--color-neutral-100)", color: "var(--color-neutral-800)", padding: "2px 6px" }}>{idea.platform}</span>
        <div style={{ flex: 1 }} />
        {idea.evaluation && <span style={{ fontSize: 10, background: "var(--color-neutral-100)", color: "var(--color-neutral-800)", padding: "2px 6px" }}>Evaluated</span>}
        {idea.scriptEvaluation && <span style={{ fontSize: 10, background: "var(--color-neutral-100)", color: "var(--color-neutral-800)", padding: "2px 6px" }}>Script evaluated</span>}
        {idea.isDraft && <span style={{ fontSize: 10, background: "var(--color-accent-100)", color: "var(--color-accent-800)", padding: "2px 6px" }}>Draft</span>}
        <button onClick={() => app.deleteIdea(idea.id)} style={{ ...removeBtn, padding: "0 2px" }}>
          ×
        </button>
      </div>

      <button onClick={() => app.toggleIdeaExpand(idea.id)} style={{ textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em", color: "var(--color-text)" }}>
          {idea.title || "Untitled idea"}
        </div>
      </button>

      {!expanded && (
        <button onClick={() => app.toggleIdeaExpand(idea.id)} style={{ textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, fontWeight: 600, color: muted(55) }}>
          + Show details
        </button>
      )}

      {expanded && (
        <>
          <div style={fieldLabel}>Title</div>
          <input
            value={idea.title}
            onChange={(e) => app.updateIdea(idea.id, "title", e.target.value)}
            placeholder="Idea title"
            style={{ border: `1px solid ${muted(25)}`, background: "var(--color-bg)", fontFamily: "var(--font-heading)", fontSize: 14, fontWeight: 800, color: "var(--color-text)", padding: "6px 8px", width: "100%" }}
          />
          <div style={fieldLabel}>Hook / opening line</div>
          <textarea
            value={idea.hook}
            onChange={(e) => app.updateIdea(idea.id, "hook", e.target.value)}
            placeholder="Hook / opening line"
            rows={2}
            style={{ border: `1px solid ${muted(25)}`, background: "var(--color-bg)", fontSize: 13, color: "var(--color-text)", padding: "6px 8px", width: "100%" }}
          />
          {(idea.format || idea.structure) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {idea.format && (
                <div style={{ fontSize: 12, color: muted(65) }}>
                  <strong style={{ color: "var(--color-text)" }}>Format:</strong> {idea.format}
                </div>
              )}
              {idea.structure && (
                <div style={{ fontSize: 12, color: muted(65) }}>
                  <strong style={{ color: "var(--color-text)" }}>Structure:</strong> {idea.structure}
                </div>
              )}
            </div>
          )}
          {citedEntries.length > 0 && (
            <div>
              <button
                onClick={() => setLibraryCollapsed((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, cursor: "pointer", marginBottom: libraryCollapsed ? 0 : 4 }}
              >
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: muted(55) }}>
                  {libraryCollapsed ? "+" : "−"} Drew from library
                </span>
              </button>
              {!libraryCollapsed &&
                citedEntries.map((e) => (
                  <div key={e.id} style={{ fontSize: 11, color: muted(60), borderLeft: `2px solid ${muted(25)}`, paddingLeft: 6, marginTop: 4 }}>
                    {e.text}
                  </div>
                ))}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderTop: `1px solid ${muted(25)}`, paddingTop: 8, marginTop: 2 }}>
            {idea.evaluation ? (
              <button
                onClick={() => setEvaluationCollapsed((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, cursor: "pointer" }}
              >
                <span style={fieldLabel}>{evaluationCollapsed ? "+" : "−"} Evaluation</span>
              </button>
            ) : (
              <div style={fieldLabel}>Evaluation</div>
            )}
            <button
              onClick={() => app.evaluateIdea(idea.id)}
              disabled={evaluating}
              style={{ border: "1px solid var(--color-accent)", background: "transparent", color: "var(--color-accent-700)", padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              {evaluateButtonLabel}
            </button>
          </div>
          {idea.evaluation && !evaluationCollapsed && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 12, color: muted(75) }}>{idea.evaluation.reasoning}</div>
              {evaluationCitedEntries.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: muted(55), marginTop: 4 }}>
                    Judged against
                  </div>
                  {evaluationCitedEntries.map((e) => (
                    <div key={e.id} style={{ fontSize: 11, color: muted(60), borderLeft: `2px solid ${muted(25)}`, paddingLeft: 6, marginTop: 4 }}>
                      {e.text}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: 10, color: muted(45) }}>
                  Evaluated {new Date(idea.evaluation.generatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </div>
                <button
                  onClick={() => {
                    app.setIdeaRegenNote(idea.id, idea.evaluation!.reasoning);
                    app.openIdeaRegenPanel(idea.id);
                  }}
                  style={{ border: `1px solid ${muted(35)}`, background: "transparent", color: "var(--color-text)", padding: "3px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  Apply feedback
                </button>
              </div>
            </div>
          )}
          {evaluationError && <div style={{ fontSize: 11, color: "var(--color-accent-800)" }}>{evaluationError}</div>}
          {showIdeaRegenPanel && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--color-bg)", border: `1px solid ${muted(25)}`, padding: 8 }}>
              <input
                value={ideaRegenNote}
                onChange={(e) => app.setIdeaRegenNote(idea.id, e.target.value)}
                placeholder="What should change? e.g. sharper hook, less generic title"
                style={{ border: `1px solid ${muted(25)}`, background: "var(--color-surface)", fontSize: 12, color: "var(--color-text)", padding: "6px 8px", width: "100%" }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => app.reviseIdea(idea.id, ideaRegenNote)}
                  disabled={revisingIdea || !ideaRegenNote.trim()}
                  style={{ flex: 1, border: "1px solid var(--color-accent)", background: "var(--color-accent)", color: "var(--color-bg)", padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                >
                  {revisingIdea ? "Revising…" : "Revise idea"}
                </button>
                <button
                  onClick={() => app.closeIdeaRegenPanel(idea.id)}
                  style={{ border: "1px solid var(--color-divider)", background: "transparent", color: "var(--color-text)", padding: "6px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
              {ideaRevisionError && <div style={{ fontSize: 11, color: "var(--color-accent-800)" }}>{ideaRevisionError}</div>}
            </div>
          )}

          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={fieldLabel}>Platform</div>
              <select
                value={idea.platform}
                onChange={(e) => app.updateIdea(idea.id, "platform", e.target.value as Idea["platform"])}
                style={{ fontSize: 12, padding: "5px 6px", border: "1px solid var(--color-divider)", background: "var(--color-bg)", color: "var(--color-text)" }}
              >
                <option value="Any">Any</option>
                <option value="YouTube">YouTube</option>
                <option value="Instagram">Instagram</option>
                <option value="TikTok">TikTok</option>
              </select>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={fieldLabel}>Status</div>
              <select
                value={idea.status}
                onChange={(e) => app.setIdeaStatus(idea.id, e.target.value as IdeaStatus)}
                style={{ fontSize: 12, padding: "5px 6px", border: "1px solid var(--color-divider)", background: "var(--color-bg)", color: "var(--color-text)" }}
              >
                <option value="idea">Idea</option>
                <option value="scripted">Scripted</option>
                <option value="posted">Posted</option>
              </select>
            </div>
          </div>
          <div style={fieldLabel}>Category</div>
          <select
            value={idea.categoryId}
            onChange={(e) => app.updateIdea(idea.id, "categoryId", e.target.value)}
            style={{ fontSize: 12, padding: "5px 6px", border: "1px solid var(--color-divider)", background: "var(--color-bg)", color: "var(--color-text)" }}
          >
            <option value="">Uncategorized</option>
            {app.data.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div style={fieldLabel}>Notes</div>
          <textarea
            value={idea.notes}
            onChange={(e) => app.updateIdea(idea.id, "notes", e.target.value)}
            placeholder="Notes"
            rows={2}
            style={{ border: `1px solid ${muted(25)}`, background: "var(--color-bg)", fontSize: 12, color: "var(--color-text)", padding: "6px 8px", width: "100%" }}
          />
          <div style={fieldLabel}>Reference link</div>
          <input
            value={idea.link}
            onChange={(e) => app.updateIdea(idea.id, "link", e.target.value)}
            placeholder="Reference link (optional)"
            style={{ border: `1px solid ${muted(25)}`, background: "var(--color-bg)", fontSize: 12, color: "var(--color-text)", padding: "6px 8px", width: "100%" }}
          />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderTop: `1px solid ${muted(25)}`, paddingTop: 8, marginTop: 2 }}>
            <div style={fieldLabel}>Script</div>
            <button
              onClick={() => (idea.script ? app.openRegenPanel(idea.id) : app.generateScript(idea.id))}
              disabled={scriptGenerating}
              style={{ border: "1px solid var(--color-accent)", background: "transparent", color: "var(--color-accent-700)", padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              {scriptButtonLabel}
            </button>
          </div>
          {showRegenPanel && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--color-bg)", border: `1px solid ${muted(25)}`, padding: 8 }}>
              <input
                value={regenNote}
                onChange={(e) => app.setRegenNote(idea.id, e.target.value)}
                placeholder="What should change? e.g. punchier hook, shorter, add a CTA"
                style={{ border: `1px solid ${muted(25)}`, background: "var(--color-surface)", fontSize: 12, color: "var(--color-text)", padding: "6px 8px", width: "100%" }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => app.generateScript(idea.id, regenNote)}
                  style={{ flex: 1, border: "1px solid var(--color-accent)", background: "var(--color-accent)", color: "var(--color-bg)", padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                >
                  {scriptButtonLabel}
                </button>
                <button
                  onClick={() => app.closeRegenPanel(idea.id)}
                  style={{ border: "1px solid var(--color-divider)", background: "transparent", color: "var(--color-text)", padding: "6px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <textarea
            value={idea.script}
            onChange={(e) => app.updateIdea(idea.id, "script", e.target.value)}
            placeholder="Generate a script from the notes above, or write your own"
            rows={6}
            style={{ border: `1px solid ${muted(25)}`, background: "var(--color-bg)", fontSize: 12, color: "var(--color-text)", padding: "6px 8px", width: "100%" }}
          />

          {idea.script && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderTop: `1px solid ${muted(25)}`, paddingTop: 8, marginTop: 2 }}>
                {idea.scriptEvaluation ? (
                  <button
                    onClick={() => setScriptEvaluationCollapsed((v) => !v)}
                    style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, cursor: "pointer" }}
                  >
                    <span style={fieldLabel}>{scriptEvaluationCollapsed ? "+" : "−"} Script evaluation</span>
                  </button>
                ) : (
                  <div style={fieldLabel}>Script evaluation</div>
                )}
                <button
                  onClick={() => app.evaluateScript(idea.id)}
                  disabled={scriptEvaluating}
                  style={{ border: "1px solid var(--color-accent)", background: "transparent", color: "var(--color-accent-700)", padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  {scriptEvaluateButtonLabel}
                </button>
              </div>
              {idea.scriptEvaluation && !scriptEvaluationCollapsed && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 12, color: muted(75) }}>{idea.scriptEvaluation.reasoning}</div>
                  {scriptEvaluationCitedEntries.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: muted(55), marginTop: 4 }}>
                        Judged against
                      </div>
                      {scriptEvaluationCitedEntries.map((e) => (
                        <div key={e.id} style={{ fontSize: 11, color: muted(60), borderLeft: `2px solid ${muted(25)}`, paddingLeft: 6, marginTop: 4 }}>
                          {e.text}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontSize: 10, color: muted(45) }}>
                      Evaluated {new Date(idea.scriptEvaluation.generatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </div>
                    <button
                      onClick={() => {
                        app.setRegenNote(idea.id, idea.scriptEvaluation!.reasoning);
                        app.openRegenPanel(idea.id);
                      }}
                      style={{ border: `1px solid ${muted(35)}`, background: "transparent", color: "var(--color-text)", padding: "3px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                      Apply feedback
                    </button>
                  </div>
                </div>
              )}
              {scriptEvaluationError && <div style={{ fontSize: 11, color: "var(--color-accent-800)" }}>{scriptEvaluationError}</div>}
            </>
          )}

          <div style={{ fontSize: 11, color: muted(50), borderTop: `1px solid ${muted(25)}`, paddingTop: 6 }}>{created}</div>
          {batch && siblings.length > 0 && (
            <div>
              <button
                onClick={() => app.toggleSiblingsExpand(idea.id)}
                style={{ textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, fontWeight: 600, color: muted(55) }}
              >
                {siblingsExpanded ? "− " : "+ "}Generated with {siblings.length} other{siblings.length === 1 ? "" : "s"} ({batch.name})
              </button>
              {siblingsExpanded && (
                <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6 }}>
                  {siblings.map((s) => (
                    <div key={s.id} style={{ fontSize: 11, color: muted(60), display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span>{s.title || "Untitled idea"}</span>
                      <span style={{ textTransform: "capitalize", flexShrink: 0 }}>{s.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <button onClick={() => app.toggleIdeaExpand(idea.id)} style={{ textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, fontWeight: 600, color: muted(55) }}>
            − Hide details
          </button>
        </>
      )}
    </div>
  );
}

/** One board column — its own useDroppable target (for dropping into empty space) wrapping a SortableContext of its cards, so hooks aren't called inside the parent's .map(). */
function BoardColumn({ col, items, boardPlatform }: { col: { status: IdeaStatus; label: string }; items: Idea[]; boardPlatform: "All" | "YouTube" | "IGTikTok" }) {
  const app = useApp();
  const { setNodeRef } = useDroppable({ id: col.status });
  return (
    <div ref={setNodeRef} style={{ flex: "1 1 380px", minWidth: 320, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid var(--color-divider)", paddingBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text)" }}>{col.label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "var(--color-neutral-800)", background: "var(--color-neutral-100)", padding: "2px 8px" }}>{items.length}</span>
          <ClearControl label={col.label} count={items.length} onConfirm={() => app.clearIdeas(col.status, boardPlatform)} small />
        </div>
      </div>
      {items.length === 0 && (
        <div style={{ fontSize: 13, color: muted(50), padding: 18, textAlign: "center", border: "1px solid var(--color-divider)" }}>No ideas here yet</div>
      )}
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <IdeaCard key={item.id} idea={item} />
        ))}
      </SortableContext>
    </div>
  );
}

/** Small inline "Clear N? Yes / Cancel" control, replacing a plain trigger button while armed — avoids native window.confirm(), which this app's fully custom-themed UI otherwise never uses. */
function ClearControl({ label, count, onConfirm, small }: { label: string; count: number; onConfirm: () => void; small?: boolean }) {
  const [armed, setArmed] = useState(false);
  if (!count) return null;
  if (!armed) {
    return (
      <button
        onClick={() => setArmed(true)}
        title={`Clear ${label}`}
        style={small
          ? { ...removeBtn, fontSize: 11, fontWeight: 700, padding: "2px 4px" }
          : { border: `1px solid ${muted(35)}`, background: "transparent", color: muted(70), padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
      >
        Clear{!small ? " board" : ""}
      </button>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: small ? 11 : 12 }}>
      <span style={{ color: muted(65) }}>
        Clear {count}?
      </span>
      <button
        onClick={() => {
          onConfirm();
          setArmed(false);
        }}
        style={{ border: "1px solid var(--color-accent)", background: "var(--color-accent)", color: "var(--color-bg)", padding: small ? "2px 6px" : "5px 10px", fontSize: small ? 11 : 12, fontWeight: 700, cursor: "pointer" }}
      >
        Yes
      </button>
      <button
        onClick={() => setArmed(false)}
        style={{ border: "1px solid var(--color-divider)", background: "transparent", color: "var(--color-text)", padding: small ? "2px 6px" : "5px 10px", fontSize: small ? 11 : 12, fontWeight: 600, cursor: "pointer" }}
      >
        Cancel
      </button>
    </div>
  );
}

export function IdeasBoardTab() {
  const app = useApp();
  const ideas = app.data.ideas.filter((i) => {
    if (app.activeBoardPlatform === "All") return true;
    if (app.activeBoardPlatform === "YouTube") return i.platform === "YouTube";
    return i.platform === "Instagram" || i.platform === "TikTok";
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const dragged = app.data.ideas.find((i) => i.id === activeId);
    if (!dragged) return;
    const overId = String(over.id);

    const targetStatus: IdeaStatus = COLUMNS.some((c) => c.status === overId)
      ? (overId as IdeaStatus)
      : app.data.ideas.find((i) => i.id === overId)?.status ?? dragged.status;
    const sourceStatus = dragged.status;

    // Resolve the drop position within the VISIBLE (platform-filtered) list the user actually
    // dragged within, then apply that position when renumbering the FULL (unfiltered) column, so
    // ideas hidden by the current platform filter keep a consistent order scale instead of always
    // sorting after freshly-renumbered 0..n-1 values once the filter switches back to "All".
    const visibleDest = (sourceStatus === targetStatus ? ideas.filter((i) => i.status === sourceStatus) : ideas.filter((i) => i.status === targetStatus))
      .sort((a, b) => a.order - b.order)
      .filter((i) => i.id !== activeId);
    const overVisibleIdx = visibleDest.findIndex((i) => i.id === overId);
    const insertBeforeId = overVisibleIdx >= 0 ? visibleDest[overVisibleIdx].id : null;

    const fullSource = app.data.ideas.filter((i) => i.status === sourceStatus).sort((a, b) => a.order - b.order).filter((i) => i.id !== activeId);
    const fullDest = sourceStatus === targetStatus ? fullSource : app.data.ideas.filter((i) => i.status === targetStatus).sort((a, b) => a.order - b.order);
    const insertAt = insertBeforeId ? fullDest.findIndex((i) => i.id === insertBeforeId) : fullDest.length;
    const newFullDest = [...fullDest.slice(0, insertAt), dragged, ...fullDest.slice(insertAt)];

    const updates =
      sourceStatus === targetStatus
        ? newFullDest.map((i, idx) => ({ id: i.id, status: sourceStatus, order: idx }))
        : [
            ...fullSource.map((i, idx) => ({ id: i.id, status: sourceStatus, order: idx })),
            ...newFullDest.map((i, idx) => ({ id: i.id, status: targetStatus, order: idx })),
          ];

    app.reorderIdeas(updates);
  }

  return (
    <div>
      <h1 style={pageTitle}>Ideas board</h1>
      <p style={{ fontSize: 15, color: muted(65), margin: "0 0 20px" }}>{ideas.length} ideas total. Click a title to open the full card and edit anything.</p>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {BOARD_FILTERS.map((f) => (
            <button key={f.value} style={chipStyle(app.activeBoardPlatform === f.value)} onClick={() => app.setActiveBoardPlatform(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
        <ClearControl label="board" count={ideas.length} onConfirm={() => app.clearIdeas("all", app.activeBoardPlatform)} />
      </div>
      <DndContext sensors={sensors} collisionDetection={collisionDetectionStrategy} onDragEnd={handleDragEnd}>
        <div style={{ display: "flex", gap: 24, overflowX: "auto", paddingBottom: 12 }}>
          {COLUMNS.map((col) => {
            const items = ideas.filter((i) => i.status === col.status).sort((a, b) => a.order - b.order);
            return <BoardColumn key={col.status} col={col} items={items} boardPlatform={app.activeBoardPlatform} />;
          })}
        </div>
      </DndContext>
    </div>
  );
}
