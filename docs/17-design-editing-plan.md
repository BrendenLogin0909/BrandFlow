# BrandFlow — Design Editing & AI-Directed Modification Plan

**Version:** 1.0 · **Date:** 2026-07-07  
**Status:** Approved direction — custom in-app editor (no Polotno dependency)  
**Agent prompts:** [17a-design-editing-agent-prompts.md](17a-design-editing-agent-prompts.md)

---

## 1. Purpose

Enable users to get **90–95% of a visual design finished inside BrandFlow** — via direct manipulation and surgical AI edits — then optionally polish the last 5–10% in PowerPoint/Figma and **re-import** to continue the approval pipeline.

This plan replaces Polotno as the *design direction*. The existing Polotno adapter and `EditorPage.tsx` stub remain in the repo as placeholders only; **do not extend or depend on them** for this work.

---

## 2. Problem statement

| Today | Gap |
|---|---|
| Recipe Playground (`/playground`): slot + brand controls | No element-level move / resize / recolour / layers |
| Freeform AI compose: rich multi-element layouts | View-only after compose (brand retint only) |
| PPTX/SVG export | Works for external polish |
| Import back | Does not exist |
| `DesignDraft` save/reopen | Works, but no edit session |

Users currently accept, deny, restart, or export-out — not a Canva-like loop.

---

## 3. Success criteria

1. **Direct edit:** move, resize, rotate, recolour, edit text, swap image/icon, reorder layers, group/ungroup, lock elements — on any page.
2. **AI-directed edit:** select element(s) or a page; give natural-language instruction; AI applies a **scoped patch**, not a full redesign.
3. **Save & resume:** Design Library and Content Manager reopen the exact edited state with revision history.
4. **Export:** PPTX/SVG for external polish (already built).
5. **Re-import:** edited SVG (v1) and PPTX (beta) → `InternalDesignDocument` → validate → continue pipeline.

### Non-negotiable invariants

1. `InternalDesignDocument` (`packages/design-schema`) is authoritative.
2. Everything passes `validateDesignDocument` before approve/export (human saves may carry fixable warnings).
3. Locked elements survive AI edits (server byte-identity check on save).
4. Tenant isolation; assets from licence-aware whitelist only.
5. Editable layered output only (`no-raster-only` rule).

---

## 4. Design direction — native BrandFlow editor

Build a **Design Studio** inside `apps/web` that edits `InternalDesignDocument` directly.

### 4.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Design Studio (/playground evolves, or /studio alias)      │
├──────────────────┬──────────────────────────────────────────┤
│  Generation panel │  DesignCanvas (native React)            │
│  - Recipe slots   │  - SVG/Konva render from internal doc   │
│  - Compose w/ AI  │  - Selection + transform handles        │
│  - AI edit prompt │  - Snap guides, z-order                 │
│  - Validation     │  - Page tabs (carousel)                 │
├──────────────────┴──────────────────────────────────────────┤
│  LayersPanel │ PropertyInspector │ AssetPicker (slide-over)  │
└─────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
   buildRecipeDocument()          PUT design-drafts / design-documents
   compose-sync API               DesignRevision history
   POST .../patch                 validateDesignDocument (client + server)
```

### 4.2 Rendering strategy

**Recommended:** `react-konva` canvas that maps each `InternalDesignDocument` element type to Konva nodes:

| Element type | Konva node |
|---|---|
| text | `Text` (with wrapping) |
| shape | `Rect` / `Ellipse` / `Line` / custom `Shape` |
| icon | `Image` or inline SVG group |
| image | `Image` with crop/fit |
| group | `Group` |
| chart | `Group` of shapes (mirror exporter logic) |

**Alternative (Phase 1 shortcut):** interactive SVG overlay on top of `exportPageSvg` output — faster to ship selection/move, harder for text editing. Prefer Konva for text-in-place editing.

Reuse colour resolution, font stacks, and icon loading from `packages/exporters` and `packages/design-schema` — do not duplicate render logic long-term; extract shared `renderElement()` into `packages/design-schema` or new `packages/design-renderer` if needed.

### 4.3 Editing modes

| Mode | When | Behaviour |
|---|---|---|
| `recipe` | User has not manually changed geometry | Slot edits regenerate layout deterministically |
| `freeform` | After AI compose | All edits are direct or AI-patched |
| `hybrid` | User manually moved/resized anything on a recipe doc | Slot text updates bound elements (`recipeSlotId`); geometry is manual/AI only |

Set `playgroundSource.mode` accordingly on first manual geometry change.

### 4.4 Explicitly out of scope (v1)

- Polotno SDK integration (placeholder code stays, untouched)
- Pixel-perfect parity with Canva/Figma
- Full PPTX import fidelity (beta only; SVG import is v1 target)
- Video/animation editing

---

## 5. New schema concepts

Add to `packages/design-schema` (agent-owned):

### 5.1 `DesignPatch` (AI scoped-edit output)

```typescript
{
  patchVersion: 1;
  scope: 'element' | 'page' | 'document';
  targetIds: string[];
  operations: PatchOperation[];
  lockedElementIds: string[];
  rationale: string;
}
```

`PatchOperation` union: `updateText`, `updateFrame`, `updateColour`, `replaceIcon`, `replaceImage`, `addElement`, `removeElement`, `reorderZ`, `updateBackground`, `updateOpacity`.

Pure function: `applyDesignPatch(doc, patch) → doc` with unit tests.

### 5.2 `ImportReport`

```typescript
{
  sourceFormat: 'svg' | 'pptx';
  matchedElements: number;
  unmatchedElements: number;
  warnings: string[];
  lostEditability: string[];
}
```

---

## 6. Phased delivery

### Phase 0 — Foundations

| ID | Task | Primary paths |
|---|---|---|
| P0-1 | Design Studio shell (split layout, deep links) | `apps/web/src/pages/PlaygroundPage.tsx` or new `DesignStudioPage.tsx` |
| P0-2 | Unify `DesignDraft` ↔ `DesignDocument` persistence | `apps/api/src/routes/design-drafts.ts`, `design-documents.ts`, Prisma |
| P0-3 | Extract `buildRecipeDocument()` from playground | `apps/web/src/lib/` or `packages/layout-recipes/` |
| P0-4 | `hybrid` mode contract on `playgroundSource` | `packages/design-schema`, draft save payload |

**Exit:** Studio shell loads saved draft; recipe regen works; first manual move flips to `hybrid`.

---

### Phase 1 — Native canvas & direct manipulation

| ID | Task | Primary paths |
|---|---|---|
| P1-A | `DesignCanvas` component (Konva, renders all element types) | `apps/web/src/components/design-studio/` |
| P1-B | Selection + transform handles (move, resize, rotate) | same |
| P1-C | Page tabs for multi-page documents | studio shell |
| P1-D | Save/load wiring to design-drafts API | `apps/web`, `apps/api` |
| P1-E | Lock toggle UI; server enforcement (existing PUT logic) | studio + API |
| P1-F | Live validation sidebar (client-side `validateDesignDocument`) | studio |
| P1-G | Snap guides + canvas zoom/pan | DesignCanvas |

**Exit:** Move headline, change position, save, reopen — geometry preserved ±0.5px.

---

### Phase 2 — Property editing & assets

| ID | Task | Primary paths |
|---|---|---|
| P2-A | `PropertyInspector` panel (text, font, size, weight, align, opacity) | `apps/web` |
| P2-B | Brand-constrained colour picker (tokens + flagged raw override) | `apps/web` |
| P2-C | Image replace via asset library | `apps/web`, asset routes |
| P2-D | Icon swap (Lucide / Iconify search) | `apps/web`, `apps/api/src/assets/` |
| P2-E | Manual asset insert (click-to-place on canvas) | studio (backlog 4e) |
| P2-F | Layers panel (reorder, visibility, select) | `apps/web` |
| P2-G | Group / ungroup / duplicate / delete | DesignCanvas |
| P2-H | Chart data editor (values + palette tokens) | PropertyInspector |

**Exit:** Replace photo, swap icon, resize shape, insert library image — saved and exported with attributions.

---

### Phase 3 — AI-directed modification

| ID | Task | Primary paths |
|---|---|---|
| P3-A | `DesignPatch` Zod schema + `applyDesignPatch()` | `packages/design-schema` |
| P3-B | AI prompt `design_patch@1` | `apps/api/src/ai/prompts/` |
| P3-C | `POST /design-documents/:id/patch` (or `/design-drafts/:id/patch`) | `apps/api/src/routes/` |
| P3-D | Patch repair loop (max 2 attempts, same as freeform) | `apps/api/src/services/` |
| P3-E | Studio “Edit with AI” UI (selection-aware + preset chips) | `apps/web` |
| P3-F | Page-scoped regen (one carousel slide, others locked) | API + prompt |
| P3-G | Visual direction in draft stage (backlog #1) | `apps/api`, Content Manager |

**Exit:** Select headline → “make two-tone with accent on first three words” → preview diff → accept → locked logo unchanged.

---

### Phase 4 — External round-trip import

| ID | Task | Primary paths |
|---|---|---|
| P4-A | SVG importer | `packages/importers/src/svg.ts` (new package) |
| P4-B | Import API + upload UI + `ImportReport` | `apps/api`, `apps/web` |
| P4-C | Re-tokenise imported hex → brand tokens | importer |
| P4-D | Reconciliation UI (imported vs last-saved) | `apps/web` |
| P4-E | PPTX importer (beta) | `packages/importers/src/pptx.ts` |
| P4-F | `DesignRevision.reason = 'EXTERNAL_IMPORT'` | API |

**Exit:** Export SVG → edit in Figma/Inkscape → re-import → changes reflected, validation runs.

---

### Phase 5 — Pipeline integration & polish

| ID | Task | Primary paths |
|---|---|---|
| P5-A | Content Manager → Studio (not view-only playground) | `ContentManagerPage.tsx` |
| P5-B | Revision history UI (list, preview, revert) | `apps/web`, API |
| P5-C | Element-anchored review comments | review queue |
| P5-D | Gate 3 blocks on validation errors | approval flow |
| P5-E | Keep zero-setup recipe demo (logged-out) | studio |
| P5-F | Update `docs/00-project-status.md` | docs |

---

## 7. API surface

| Method | Route | Status |
|---|---|---|
| `GET` | `/design-drafts/:id` | exists |
| `PUT` | `/design-drafts/:id` | exists — extend for revisions |
| `GET` | `/design-documents/:id` | exists |
| `PUT` | `/design-documents/:id` | exists — locked-element enforcement |
| `POST` | `/design-documents/:id/patch` | **new** |
| `POST` | `/design-documents/:id/import` | **new** |
| `GET` | `/design-documents/:id/revisions` | **new** |
| `POST` | `/design-documents/:id/revisions/:v/revert` | **new** |
| `POST` | `/design-documents/:id/lock-elements` | exists |
| `POST` | `/design-documents/:id/validate` | exists |

---

## 8. Agent assignment & model guidance

Use the tier that matches task complexity. When running outside Cursor, pick the closest model you have on subscription.

| Tier | When to use | Claude (Anthropic) | OpenAI Codex / GPT |
|---|---|---|---|
| **High** | Architecture, new packages, AI prompts, import parsers, patch applicator | Opus 4.6 or Sonnet 4.6 with extended thinking | GPT-5.5-high / Codex high reasoning |
| **Medium** | Feature UI panels, API routes, Konva interactions, tests | Sonnet 4.6 | GPT-5.3-codex / Codex medium |
| **Low** | Docs updates, small fixes, test fixtures, status doc | Haiku 4.5 or Sonnet 4.6 | Codex fast / lighter model |

| Agent | Tasks | Model tier | Branch prefix |
|---|---|---|---|
| **Agent 1 — Studio shell** | P0-1, P0-3, P1-C, P5-E | Medium | `feat/design-studio-shell` |
| **Agent 2 — Persistence** | P0-2, P0-4, P1-D, P1-E, P5-D | High | `feat/design-persistence` |
| **Agent 3 — DesignCanvas** | P1-A, P1-B, P1-G | High | `feat/design-canvas` |
| **Agent 4 — Validation UX** | P1-F | Medium | `feat/design-validation-ui` |
| **Agent 5 — Property & layers** | P2-A, P2-B, P2-F, P2-G | Medium | `feat/design-inspector` |
| **Agent 6 — Assets on canvas** | P2-C, P2-D, P2-E | Medium | `feat/design-asset-insert` |
| **Agent 7 — AI patch pipeline** | P3-A, P3-B, P3-C, P3-D, P3-F | High | `feat/design-ai-patch` |
| **Agent 8 — AI patch UI** | P3-E | Medium | `feat/design-ai-patch-ui` |
| **Agent 9 — Draft visual direction** | P3-G | Medium | `feat/draft-visual-direction` |
| **Agent 10 — SVG import** | P4-A, P4-B, P4-C, P4-D, P4-F | High | `feat/design-svg-import` |
| **Agent 11 — PPTX import beta** | P4-E | High | `feat/design-pptx-import` |
| **Agent 12 — Pipeline integration** | P5-A, P5-B, P5-C, P5-F | Medium | `feat/design-pipeline` |

**Dependency order:** Agent 2 + 3 can start immediately. Agent 1 shell should land first or in parallel with 3. Agents 5–6 need DesignCanvas selection API. Agent 8 needs Agent 7's API contract. Agent 10 can start after Phase 1 canvas tests exist. Agent 11 after Agent 10.

Full copy-paste prompts: **[17a-design-editing-agent-prompts.md](17a-design-editing-agent-prompts.md)**

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Custom editor takes longer than Polotno | Scope v1 to core verbs (move/resize/text/colour/layers); no pixel-perfect polish |
| Recipe vs manual geometry conflict | `hybrid` mode |
| AI patch breaks layout | Patch applicator + validation + 1 repair round |
| SVG/PPTX import incomplete | `ImportReport.lostEditability`; SVG v1, PPTX beta |
| Duplicate render logic | Extract shared renderer from exporters over time |
| Text editing complexity on Konva | Fallback: double-click opens inspector textarea sync |

---

## 10. Acceptance tests (by phase)

| Phase | Test |
|---|---|
| P0 | Save draft → reopen studio → controls restored |
| P1 | Move element 40px → save → reopen ±0.5px; locked element immovable |
| P2 | Replace image → attribution on doc + export credits |
| P3 | AI patch on selection only; locked elements identical JSON |
| P4 | SVG export → external edit → import → text updated |
| P5 | Idea → Draft → Studio → edit → Save → Review → Approve |

---

## 11. Related docs

- [00-project-status.md](00-project-status.md) — living status
- [08-ai-workflow-design.md](08-ai-workflow-design.md) — part-level regeneration (§4)
- [09-design-generation-schema.md](09-design-generation-schema.md) — InternalDesignDocument
- [11-validation-rules.md](11-validation-rules.md) — validation catalogue
- [16-backlog.md](16-backlog.md) — items 1, 4e, 6 (Polotno → superseded by this plan)

---

## 12. Polotno placeholder policy

- **Do not delete** `apps/api/src/adapters/polotno-adapter.ts` or `EditorPage.tsx`.
- **Do not import Polotno** in new Design Studio code.
- **Do not wire** the placeholder editor into the main user flow.
- Future commercial editor decision is deferred; this plan is the primary path.
