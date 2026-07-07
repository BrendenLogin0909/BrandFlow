# BrandFlow — Design Editing Agent Prompts

**Plan:** [17-design-editing-plan.md](17-design-editing-plan.md)  
**Read first:** [00-project-status.md](00-project-status.md), [CLAUDE.md](../CLAUDE.md)

Each prompt below is **self-contained**. Copy one prompt per session. Every agent **must**:

1. Create and work on **its own git branch** (name given in prompt).
2. Read the plan section for its tasks before coding.
3. **Not** use or extend Polotno — native BrandFlow editor only (Polotno placeholder code stays untouched).
4. Keep `InternalDesignDocument` authoritative; gate saves with `validateDesignDocument`.
5. Update `docs/00-project-status.md` when done.
6. **Do not push** unless explicitly asked.

---

## Agent 1 — Design Studio shell

**Branch:** `feat/design-studio-shell`  
**Model tier:** Medium (Claude Sonnet 4.6 / Codex medium)  
**Tasks:** P0-1, P0-3, P1-C, P5-E

```
You are implementing BrandFlow's Design Studio shell.

READ FIRST (in order):
- docs/00-project-status.md
- docs/17-design-editing-plan.md (sections 4, 6 Phase 0, 8 Agent 1)
- apps/web/src/pages/PlaygroundPage.tsx

GIT: Create branch feat/design-studio-shell from main. All work on this branch only.

GOAL: Evolve /playground into a Design Studio split layout without breaking the zero-setup demo.

DELIVER:
1. Split UI: left = generation panel (existing recipe/compose controls), right = canvas area (placeholder div for DesignCanvas until Agent 3 lands).
2. Preserve deep links: ?package=, ?draft=, ?idea=
3. Extract buildRecipeDocument() (or equivalent) from PlaygroundPage into apps/web/src/lib/buildRecipeDocument.ts — shared, tested import.
4. Multi-page tabs above canvas when document.pages.length > 1.
5. Logged-out users still get recipe preview; direct-edit affordances hidden until auth (P5-E).

DO NOT: Import Polotno. Do not remove existing export/validation panels.

WHEN DONE: Update docs/00-project-status.md. Run npm test if you touch shared packages.
```

---

## Agent 2 — Persistence & hybrid mode

**Branch:** `feat/design-persistence`  
**Model tier:** High (Claude Opus 4.6 / GPT-5.5-high)  
**Tasks:** P0-2, P0-4, P1-D, P1-E, P5-D

```
You are implementing BrandFlow design persistence for the Design Studio.

READ FIRST:
- docs/17-design-editing-plan.md (sections 5, 6 Phase 0, 7, 8 Agent 2)
- docs/09-design-generation-schema.md
- apps/api/src/routes/design-drafts.ts
- apps/api/src/routes/design-documents.ts

GIT: Create branch feat/design-persistence from main.

GOAL: Unify DesignDraft and DesignDocument save paths; support hybrid mode; wire studio save/load.

DELIVER:
1. playgroundSource.mode: 'recipe' | 'freeform' | 'hybrid' — Zod + save payload on design-drafts.
2. When studio saves internalDoc, create/update DesignDocument linked to draft where appropriate; write DesignRevision with reason HUMAN_EDIT.
3. GET endpoint or extend design-drafts to hydrate full studio session (internalDoc + playgroundSource + linked post package id).
4. PUT save from studio: server validates, enforces locked-element byte-identity (existing logic in design-documents.ts).
5. POST lock-elements wired for studio (toggle lock on element ids).
6. Gate 3 / approve flow: block approval when validationReport has errors (P5-D) — integrate with existing review flow.

DO NOT: Use Polotno adapter for new code.

WHEN DONE: Integration test or route test for save + lock enforcement. Update docs/00-project-status.md.
```

---

## Agent 3 — DesignCanvas (Konva)

**Branch:** `feat/design-canvas`  
**Model tier:** High (Claude Opus 4.6 / GPT-5.5-high)  
**Tasks:** P1-A, P1-B, P1-G

```
You are building BrandFlow's native DesignCanvas editor component.

READ FIRST:
- docs/17-design-editing-plan.md (sections 4.2, 6 Phase 1, 8 Agent 3)
- packages/design-schema/src/schema.ts
- packages/exporters/src/svg.ts (reference rendering behaviour)
- apps/web/src/pages/PlaygroundPage.tsx

GIT: Create branch feat/design-canvas from main.

GOAL: Konva-based canvas that renders InternalDesignDocument and supports direct manipulation.

DELIVER in apps/web/src/components/design-studio/:
1. DesignCanvas.tsx — renders all element types: text, shape, icon, image, group, chart.
2. Selection model: click to select, shift-click multi-select, bounding box.
3. Transform handles: move, resize, rotate (update element.frame in doc state).
4. Snap guides (align to canvas centre, edges, other elements) + zoom/pan.
5. Expose React API: document, activePageId, selectedIds, onDocumentChange, onSelectionChange.
6. Add react-konva dependency if not present.

On first manual frame change, caller should set playgroundSource.mode to 'hybrid' (document the contract in a code comment).

DO NOT: Use Polotno. Do not duplicate entire exporter — reuse colour/font helpers from design-schema where possible.

TESTS: Unit test for frame update helpers; manual test instructions in PR description.

WHEN DONE: Update docs/00-project-status.md.
```

---

## Agent 4 — Validation sidebar

**Branch:** `feat/design-validation-ui`  
**Model tier:** Medium (Claude Sonnet 4.6 / Codex medium)  
**Tasks:** P1-F

```
You are building the live validation panel for BrandFlow Design Studio.

READ FIRST:
- docs/17-design-editing-plan.md (Phase 1, Agent 4)
- packages/design-schema/src/validate.ts
- docs/11-validation-rules.md

GIT: Create branch feat/design-validation-ui from main.

GOAL: Debounced client-side validation with element-anchored error list.

DELIVER:
1. ValidationPanel component in apps/web/src/components/design-studio/
2. Runs validateDesignDocument(doc) on debounced document changes (300ms) and on explicit Save.
3. Lists errors/warnings with element id links — clicking selects that element on canvas (via callback prop).
4. Distinguish blocking errors vs warnings (contrast warn mode).
5. Integrate into Design Studio shell (depends on Agent 1 layout — merge main or feat/design-studio-shell first if available).

WHEN DONE: Update docs/00-project-status.md.
```

---

## Agent 5 — Property inspector & layers

**Branch:** `feat/design-inspector`  
**Model tier:** Medium (Claude Sonnet 4.6 / Codex medium)  
**Tasks:** P2-A, P2-B, P2-F, P2-G

```
You are building property and layers panels for BrandFlow Design Studio.

READ FIRST:
- docs/17-design-editing-plan.md (Phase 2, Agent 5)
- packages/design-schema/src/schema.ts

GIT: Create branch feat/design-inspector from main.

GOAL: Edit element properties and layer order from side panels.

DELIVER in apps/web/src/components/design-studio/:
1. PropertyInspector — for selected element(s): text content, fontFamily (brand kit list), fontSize, fontWeight, align, opacity, cornerRadius where applicable.
2. BrandColourPicker — token swatches (primary, secondary, accent, etc.) + raw hex with allowedOverride flag for managers.
3. LayersPanel — page elements sorted by zIndex desc; click to select; drag to reorder zIndex; visibility toggle.
4. Group/ungroup/duplicate/delete actions (update document immutably).

Wire to DesignCanvas selection API. Merge feat/design-canvas first if available.

WHEN DONE: Update docs/00-project-status.md.
```

---

## Agent 6 — Asset insert & swap

**Branch:** `feat/design-asset-insert`  
**Model tier:** Medium (Claude Sonnet 4.6 / Codex medium)  
**Tasks:** P2-C, P2-D, P2-E, P2-H (chart editor optional if time)

```
You are implementing asset and icon editing on the BrandFlow design canvas.

READ FIRST:
- docs/17-design-editing-plan.md (Phase 2, Agent 6)
- docs/16-backlog.md (item 4e)
- apps/api/src/assets/registry.ts
- apps/web asset library UI (search existing pages)

GIT: Create branch feat/design-asset-insert from main.

GOAL: Replace images/icons and insert new assets onto the canvas.

DELIVER:
1. Image replace: select image element → asset library slide-over → set assetId/src, provenance, update attributions on doc.
2. Icon swap: Lucide/Iconify search → update iconRef on selected element.
3. Insert asset: pick from library → click canvas to place new ImageElement at coordinates.
4. (Optional) Chart data editor in PropertyInspector for chart elements.

Assets must come from licence-aware whitelist only. Merge feat/design-canvas and feat/design-inspector if available.

WHEN DONE: Update docs/00-project-status.md.
```

---

## Agent 7 — AI patch pipeline (backend)

**Branch:** `feat/design-ai-patch`  
**Model tier:** High (Claude Opus 4.6 / GPT-5.5-high)  
**Tasks:** P3-A, P3-B, P3-C, P3-D, P3-F

```
You are implementing AI-directed scoped edits for BrandFlow designs.

READ FIRST:
- docs/17-design-editing-plan.md (sections 5.1, 6 Phase 3, 8 Agent 7)
- docs/08-ai-workflow-design.md (section 4 Part-level regeneration)
- apps/api/src/services/freeform.ts (repair loop pattern)
- apps/api/src/ai/prompts/

GIT: Create branch feat/design-ai-patch from main.

GOAL: AI returns DesignPatch operations, not a full new document.

DELIVER:
1. packages/design-schema/src/patch.ts — DesignPatch Zod schema, PatchOperation union, applyDesignPatch(doc, patch) pure function + unit tests.
2. AI prompt design_patch@1 in apps/api/src/ai/prompts/ — inputs: instruction, scope, targetIds, lockedElementIds, document excerpt, BrandContext via buildBrandContext.
3. POST /design-documents/:id/patch (or /design-drafts/:id/patch) — tenant guard, apply patch, validate, up to 2 repair attempts, persist DesignRevision reason AI_PATCH.
4. Page-scoped mode: regenerate one page only; other pages and locked elements byte-identical after apply.

DO NOT: Regenerate full document. DO NOT: Use Polotno.

WHEN DONE: Tests for applyDesignPatch and route with mock AI adapter. Update docs/00-project-status.md.
```

---

## Agent 8 — AI patch UI

**Branch:** `feat/design-ai-patch-ui`  
**Model tier:** Medium (Claude Sonnet 4.6 / Codex medium)  
**Tasks:** P3-E

```
You are building the "Edit with AI" UI for BrandFlow Design Studio.

READ FIRST:
- docs/17-design-editing-plan.md (Phase 3, Agent 8)
- docs/17a-design-editing-agent-prompts.md (Agent 7 — know the API contract)

GIT: Create branch feat/design-ai-patch-ui from main. Merge feat/design-ai-patch first.

GOAL: Selection-aware AI edit with preview before apply.

DELIVER in Design Studio generation panel:
1. Text area for natural-language instruction.
2. Scope auto-detected: selected elements → element; no selection + active page → page; with "Keep locked" always on.
3. Preset chips: "Simplify", "More contrast", "Two-tone headline", "More whitespace".
4. Call POST .../patch → show diff summary (what changed) → Accept applies to local doc / Reject discards.
5. Loading and error states; show AI rationale from response.

Requires auth. Merge feat/design-studio-shell and feat/design-canvas if available.

WHEN DONE: Update docs/00-project-status.md.
```

---

## Agent 9 — Draft visual direction

**Branch:** `feat/draft-visual-direction`  
**Model tier:** Medium (Claude Sonnet 4.6 / Codex medium)  
**Tasks:** P3-G (backlog #1)

```
You are improving draft-stage visual direction for BrandFlow compose.

READ FIRST:
- docs/17-design-editing-plan.md (Phase 3, Agent 9)
- docs/16-backlog.md (item 1)
- docs/08-ai-workflow-design.md
- apps/api/src/routes/post-packages.ts
- apps/api/src/ai/prompts/ (post_copy)
- apps/web/src/pages/ContentManagerPage.tsx (storyboard)

GIT: Create branch feat/draft-visual-direction from main.

GOAL: Draft copy includes rich visual-direction fields that feed freeform compose and AI patch prompts.

DELIVER:
1. Extend DraftCopy schema: visualDirection { scene, metaphor, mood, compositionHints, colourMood, illustrationStyle } (Zod, clamp strings).
2. Update post_copy AI prompt to populate visual direction with craft (benchmark: bold LinkedIn carousels, flat illustrations).
3. Storyboard UI: optional collapsible "Visual direction" section per draft (editable before compose).
4. Wire visual direction into compose-sync and design_patch brief assembly (buildBrandContext or compose request body).

Independent of DesignCanvas — can merge anytime.

WHEN DONE: Update docs/00-project-status.md and docs/16-backlog.md item 1 note.
```

---

## Agent 10 — SVG import

**Branch:** `feat/design-svg-import`  
**Model tier:** High (Claude Opus 4.6 / GPT-5.5-high)  
**Tasks:** P4-A, P4-B, P4-C, P4-D, P4-F

```
You are implementing SVG import back into BrandFlow InternalDesignDocument.

READ FIRST:
- docs/17-design-editing-plan.md (sections 5.2, 6 Phase 4, 8 Agent 10)
- packages/exporters/src/svg.ts (know export shape — ids, attributes)
- packages/design-schema/src/schema.ts

GIT: Create branch feat/design-svg-import from main.

GOAL: User exports SVG from BrandFlow, edits in Figma/Inkscape, re-imports.

DELIVER:
1. New package packages/importers/ with svg.ts — parse layered SVG → InternalDesignDocument (text, rect/ellipse/path→shape, image, groups).
2. Re-tokenise: exact hex match → brand token; else raw with allowedOverride false.
3. POST /design-documents/:id/import — multipart SVG, returns { document, importReport }.
4. ImportReport UI: matched/unmatched counts, warnings, lostEditability list; user confirms before save.
5. DesignRevision reason EXTERNAL_IMPORT.

Target: recover text content and positions from BrandFlow-exported SVG reliably. General SVG is best-effort.

TESTS: Round-trip test — export sample recipe SVG → import → key elements preserved.

WHEN DONE: Update docs/00-project-status.md.
```

---

## Agent 11 — PPTX import (beta)

**Branch:** `feat/design-pptx-import`  
**Model tier:** High (Claude Opus 4.6 / GPT-5.5-high)  
**Tasks:** P4-E

```
You are implementing PPTX import (beta) for BrandFlow.

READ FIRST:
- docs/17-design-editing-plan.md (Phase 4, Agent 11)
- packages/exporters/src/pptx.ts
- packages/importers/ (merge feat/design-svg-import first)

GIT: Create branch feat/design-pptx-import from main. Merge feat/design-svg-import first.

GOAL: Basic PPTX → InternalDesignDocument for PowerPoint-edited exports.

DELIVER:
1. packages/importers/src/pptx.ts — text boxes, shapes, images; charts as grouped shapes or flagged lostEditability.
2. Extend POST import to accept .pptx.
3. ImportReport marks beta limitations clearly in UI.

Honest scope: 80% element recovery on BrandFlow-exported PPTX; arbitrary PPTX best-effort.

WHEN DONE: Update docs/00-project-status.md.
```

---

## Agent 12 — Pipeline integration

**Branch:** `feat/design-pipeline`  
**Model tier:** Medium (Claude Sonnet 4.6 / Codex medium)  
**Tasks:** P5-A, P5-B, P5-C, P5-F

```
You are integrating Design Studio into BrandFlow's content pipeline.

READ FIRST:
- docs/17-design-editing-plan.md (Phase 5, Agent 12)
- docs/06-user-journeys.md (Journey 3, 4, 5)
- apps/web/src/pages/ContentManagerPage.tsx
- apps/web/src/pages/DesignLibraryPage.tsx

GIT: Create branch feat/design-pipeline from main. Merge studio + persistence branches when available.

GOAL: Content Manager and Design Library open Design Studio for editing, not view-only playground.

DELIVER:
1. "Open design" → studio with draft loaded (Content Manager + Design Library).
2. Revision history panel: list DesignRevisions, preview thumbnail, revert action.
3. Element-anchored review comments: store comment.elementId, highlight on canvas when viewing review.
4. docs/00-project-status.md fully updated for design editing feature set.

DO NOT: Wire Polotno EditorPage into main flow.

WHEN DONE: Manual test checklist in commit message or PR description.
```

---

## Suggested merge order

1. `feat/design-studio-shell` + `feat/design-persistence` + `feat/design-canvas` (parallel, then merge)
2. `feat/design-validation-ui` + `feat/design-inspector` + `feat/design-asset-insert`
3. `feat/design-ai-patch` → `feat/design-ai-patch-ui`
4. `feat/draft-visual-direction` (anytime)
5. `feat/design-svg-import` → `feat/design-pptx-import`
6. `feat/design-pipeline` (last)

After all merges: run full `npm test`, smoke-test `/playground` logged-out and logged-in.
