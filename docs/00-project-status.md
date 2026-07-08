# BrandFlow — Project Status & Handoff

**Living document. Update this at the end of every work session.**
Last updated: 2026-07-07

This is the single source of truth for *current state*. The numbered docs
(01–16) are the *design/spec*; this file records what is actually built,
what is stubbed, the known gotchas, and what to do next.

---

## 1. What BrandFlow is (one paragraph)

A multi-tenant SaaS that turns a content idea into a finished, on-brand
LinkedIn post — AI writes the copy, an AI/recipe engine composes a **fully
editable layered visual** (never a flat image), a human reviews and approves,
and it exports to PPTX/SVG (Canva/PowerPoint/Figma editable) with LinkedIn/
Buffer publishing as a future integration. The differentiators: editable
layered output, brand governance, human-in-the-loop gates, tenant isolation,
vendor-neutral internal design schema, and a licence-aware free-asset stack.

## 2. Repository & environment

- **Local path:** `C:\Documents\Application Data\Developments\Brandflow`
- **GitHub:** https://github.com/BrendenLogin0909/BrandFlow (branch `main`)
- **Monorepo (npm workspaces):**
  - `apps/api` — Fastify + Prisma + Postgres; ports/adapters; AI + asset providers
  - `apps/web` — React + Vite + Tailwind; the whole UI
  - `packages/design-schema` — InternalDesignDocument (Zod) + validation engine + text measurement
  - `packages/layout-recipes` — 8 recipes + variants + style directives + variety guard
  - `packages/exporters` — SVG + PPTX exporters, real Lucide icon artwork, charts
  - `packages/shared` — roles/capabilities, workflow state machine, LinkedIn presets
- **Dev stack:** Docker `postgres` (host port **5433**, not 5432) + `redis`; MinIO defined but storage not wired.
- **Run:** `docker compose up -d postgres redis` → `npm run dev:api` (:3001) → `npm run dev:web` (:5173).
  Test login: `alex@acme.test` / `supersecret123` (client "Acme Robotics", id `e3933542-…`).
- **Zero-setup demo:** `/playground` runs the whole design engine in the browser, no backend/keys.

## 3. AI providers (see apps/api/src/ai/)

- `AI_PROVIDER=anthropic|openai|mock` or auto-detect from keys; falls back to a **mock adapter** (labelled sample output) when no key — so every AI feature is testable offline.
- Currently the owner runs on an **OpenAI key** (in `apps/api/.env`, do not read/print it).
- Per-stage models via `ai/models.ts` + `AI_MODEL_IDEATION/DRAFT/FINAL/REVIEW`; OpenAI reasoning effort `low` (`AI_OPENAI_REASONING`) — gpt-5-class at default effort takes minutes.
- **Gotcha:** providers ignore `maxLength` in tool JSON-schemas → clamp AI string outputs in Zod (`.transform`), never hard-reject. And each prompt template needs a REAL JSON schema (empty placeholder → OpenAI returns empty args).

## 4. Current status by area

| Area | Status |
|---|---|
| Auth, multi-tenant routing, capability guard, audit | ✅ built, verified |
| Content-manager board (Buffer-style) | ✅ Ideas → Drafts → Review&planned → Approved → Rejected; items MOVE between columns; collapsible columns |
| Idea stage | ✅ AI batch suggest (tick-to-keep), expand-into-2-directions (grouped modal), inline edit, delete, brand-topic chips |
| Draft stage | ✅ one AI draft per idea; edit modal; directions (radio); **Storyboard** slide editor; **Visual direction** fields (scene, metaphor, mood, composition, colour, illustration style) feed compose + AI patch; original idea preserved as reference |
| Design stage (Recipe Playground) | ✅ 8 recipes×variants + style directives; brand colour/font pickers; Surprise-me; Save draft; **✨ Compose with AI**; **Design Studio shell** (split layout, page tabs, canvas placeholder — Agent 1 on `feat/design-studio-shell`) |
| Freeform compose | ✅ AI invents full layout (icons/scenes/charts/arrows/colour-blocks); `autoFixFreeform` guarantees contrast+overflow; validation-gated with repair loop |
| Native DesignCanvas (Design Studio, P1-A/B/G) | ✅ `apps/web/src/components/design-studio/DesignCanvas.tsx` — Konva render of every element type (text/shape/icon/image/group/chart), click/shift-click selection + move/resize/rotate transform handles, snap guides (canvas centre/edges + neighbour edges/centres), zoom/pan, controlled React API. Reuses `resolveColour`/`fontStack`/icon resolver (no exporter duplication). First manual edit fires the `hybrid`-mode contract. Demo route `/studio-canvas-demo`. Studio-shell wiring + property/layers panels (Phase 2) pending. |
| AI-directed scoped edits (Design Studio, P3-A/B/C/D/F) | ✅ backend: `packages/design-schema/src/patch.ts` — `DesignPatch` schema + pure `applyDesignPatch` (locked-safe, scope-enforced, re-parsed); `design_patch@1` prompt; `POST /design-documents/:id/patch` (buildBrandContext, ≤2 repair rounds, server-side locked byte-check via `findLockedElementViolation`, `DesignRevision` reason `AI_PATCH`); page-scoped mode leaves other pages byte-identical. AI returns operations only (server owns scope/locks). |
| "Edit with AI" Studio UI (P3-E) | ✅ `AiEditPanel` in Design Studio generation panel — selection-aware scope (element/page/document), preset chips, locked elements always protected, calls patch endpoint, diff summary + Accept/Reject preview (`feat/design-ai-patch-ui`). Requires package-linked save for `DesignDocument` id. |
| Review & planned | ✅ Assign date (next-available / specific), Approve (Gate 3), both-set → Approved column |
| Design persistence (studio ↔ pipeline) | ✅ unified save: a linked studio save materialises the authoritative DesignDocument on the package's VisualPackage, writes a HUMAN_EDIT revision, enforces locked-element byte-identity, and hydrates the full session on load (`playgroundSource.mode` recipe/freeform/hybrid). Gate 3 now genuinely blocks approval while that design has validation errors (P5-D). Integration-tested. |
| Design library | ✅ saved designs, filmstrip thumbnails, reopen exact in **Design Studio** |
| Pipeline ↔ Studio (P5-A/B/C) | ✅ Content Manager + Design Library **Open in studio**; `RevisionHistoryPanel` (list + revert); `ReviewCommentsPanel` (element-anchored comments, highlight on canvas); `GET/POST /design-documents/:id/revisions|revert`; `GET/POST/PATCH /comments` |
| Export | ✅ PPTX (Canva-friendly) + SVG (zip for carousels), in-browser |
| Asset library | ✅ licence-aware search (icons/figures/photos/**flat illustrations**/AI-gen), save to library/shared pool, approve/tier gate |
| Assets used by AI tool | ✅ compose auto-fills image placeholders from licensed providers; attributions travel on the document and **render as a credits line on SVG + PPTX export** (and in the playground) |
| Dashboard, Calendar, Brand-profile UI, Review-queue page | ⏳ nav placeholders (data model + APIs mostly exist) |
| Object storage / customer upload (logos, photos) | ⏳ stubbed (StoragePort not wired to MinIO) |
| Polotno embedded editor | ⏳ needs free trial key `VITE_POLOTNO_KEY`; adapter + round-trip already built |
| Publish integration (LinkedIn/Buffer) | ⏳ not started (Approved cards say "integration TBC") |
| BullMQ queue workers | ⏳ AI runs synchronously; fine for single-user |

## 5. Free asset stack (licence-aware whitelist — NOT web search)

`apps/api/src/assets/registry.ts` (`PROVIDERS`, tiers 1/2/3, `AVOID_BY_DEFAULT`)
+ `providers.ts` (adapters). **Live with no keys:** Lucide (bundled icons),
Iconify (icon search), DiceBear (figures), **flat illustration pack**
(22 bundled recolourable scenes, `undraw-manifest.ts`), **Openverse** (CC0/PDM
photos), Wikimedia (PD, review-tier), **Pollinations** (free AI image gen).
**Key-gated (light up when env key set):** Unsplash/Pexels/Pixabay stock,
OpenAI images. Every asset stores full provenance; tier-1 auto-usable,
tier 2–3 need a human tick. `AssetLibraryItem.clientCompanyId = null` = shared
pool reusable across clients.

## 6. Key architectural invariants (do not break)

1. **InternalDesignDocument is authoritative** (`packages/design-schema`). Polotno/PPTX/SVG are derived. Never let a vendor format become the source of truth.
2. **Validation gates everything visual** — nothing renders/exports with unresolved errors; recipes and freeform both pass through `validateDesignDocument`.
3. **Tenant isolation** — all content queries scoped by `clientCompanyId`; AI prompts assembled only via `buildBrandContext`; 404 (never 403) across tenants.
4. **Assets never used without provenance** — source whitelist only; tier gate before generation use.
5. **Editable layered output only** — the `no-raster-only` validation rule forbids flat-image designs.

## 7. Known gotchas (bit us before)

- After `prisma migrate`, the running API holds the old client → **stop API, `prisma generate`, restart** (Windows DLL lock otherwise).
- PowerShell here-string commit messages break on embedded double-quotes — use `git commit` via a bash heredoc, or avoid `"` in the message.
- JWT access token defaults to 15 min; dev `.env` sets `JWT_EXPIRY=12h`.
- Lucide-static roots carry the stroke/fill their paths inherit — icon paint attrs must live on the wrapper `<svg>`, or icons render invisible.
- tsx-watch restarts kill in-flight AI requests — check the pid in the API log when debugging a hang.
- `DesignDraft` now carries `postPackageId` + `visualPackageId` (migration `20260707131152_design_draft_pipeline_link`). A studio save with a `postPackageId` (or an `ideaId` whose package exists) syncs the authoritative `DesignDocument`; a standalone save (no package) only writes the draft. Locked-element enforcement runs on every resave path (POST-by-idea and PUT), not just PUT.

## 8. Backlog / next steps

**Active plan:** **[docs/17-design-editing-plan.md](17-design-editing-plan.md)** — native Design Studio (direct edit + AI patches + SVG re-import). Copy-paste agent prompts: **[docs/17a-design-editing-agent-prompts.md](17a-design-editing-agent-prompts.md)**. Polotno placeholder code stays; not in design direction.

**Native DesignCanvas (Agent 3, `feat/design-canvas`) — DONE (P1-A/B/G):**
- `apps/web/src/components/design-studio/`:
  - `DesignCanvas.tsx` — Konva `<Stage>` editor. **Controlled** component: props `document`, `activePageId`, `selectedIds`, `onDocumentChange`, `onSelectionChange` (+ `onFirstManualEdit`, `onRequestTextEdit`). Renders one page; selection (click / shift-click multi-select) drives a Konva `Transformer` (move/resize/rotate); snap guides on drag (canvas centre/edges + every neighbour's edges/centres); wheel-zoom-to-pointer + drag-to-pan + Fit/±. Locked elements are non-draggable, excluded from the transformer, drawn with a red dashed outline.
  - `ElementNode.tsx` — maps each element type to Konva nodes in **local coords**; wrapper group positioned by frame *centre* (offset) so rotation matches the schema + SVG exporter. Group children render with an `origin` offset (they carry absolute page coords per the exporter) and move as a unit.
  - `frame.ts` — **pure**, unit-tested frame math (`normaliseFrame`, `updateElementFrame`, `translateElement` [group-subtree aware], `boundingBox`, structural-sharing `mapElement`). `frame.test.ts` — 17 tests.
  - `snapping.ts` — pure snap-guide computation; `paint.ts` — `Fill`→Konva props (reuses `resolveColour`, gradients handled); `useAssetImage.ts` — image/icon loading (reuses exporter `resolveIconSvg`/`styleIconSvg` via new `@brandflow/exporters/icons` subpath export).
- **Reuse, not duplication:** colour/font/icon helpers come from `design-schema` + `exporters`; the canvas mirrors exporter geometry only for live rendering.
- **hybrid-mode contract:** first manual geometry edit fires `onFirstManualEdit`; the Studio shell must then set `playgroundSource.mode = 'hybrid'` (plan §4.3). Documented in `DesignCanvas.tsx`.
- **Deps:** `konva` + `react-konva`, pinned to konva **^10.3.0** to share the single hoisted copy polotno already pulls in (a `^9` pin created a duplicate install → TS type-identity errors). `vitest` added to `apps/web`.
- **Verify:** `npm run dev:web` → **`/studio-canvas-demo`** (works logged-out). Verified in-browser: renders the recipe doc, select→transform, drag flips mode to `hybrid`, lock detaches the transformer, zero console errors.
- **Not in this slice:** in-place text editing (double-click emits `onRequestTextEdit` for the Phase-2 inspector), save/load wiring (P1-D, Agent 2), layers/property panels (Phase 2). Group *resize* is intentionally disabled (rotate/move only) — the schema doesn't scale group children by the group frame. **Approved** — merged into `feat/design-validation-ui` via `feat/design-studio-shell`.

**ValidationPanel (Agent 4, `feat/design-validation-ui`) — DONE (P1-F):**
- `ValidationPanel.tsx` — debounced (300ms) client-side `validateDesignDocument`; errors vs warnings; element-id links call `onSelectElement` → canvas selection on `/playground` when signed in.
- Playground wired: `DesignCanvas` when authed, `ValidationPanel` in generation panel; canvas edits flow through `displayDoc` + hybrid save mode.

**Property inspector & layers (Agent 5, `feat/design-inspector`) — DONE (P2-A/B/F/G):**
- `PropertyInspector` — text, font, size, weight, align, opacity, corner radius, brand token colours; duplicate/group/ungroup/delete.
- `LayersPanel` — z-order list (front-first), drag reorder, visibility + lock toggles, click to select.
- `BrandColourPicker`, `document-mutations.ts`, `element-tree.ts`, `studio-props.ts` — shared bindings contract.
- Right sidebar on `/playground` when signed in.

**Asset insert & swap (Agent 6, `feat/design-asset-insert`) — DONE (P2-C/D/E):**
- `AssetPicker` slide-over — search whitelisted providers + saved library; tier hints.
- Replace image on selected image element; insert-at-coordinates (pick asset → click canvas).
- `IconSwapPanel` — Lucide search when an icon is selected.
- Attributions merged onto `InternalDesignDocument` when required.
- Requires sign-in (uses `/assets/search`).

**AI patch pipeline (Agent 7, `feat/design-ai-patch`) — DONE (P3-A/B/C/D/F):**
- `packages/design-schema/src/patch.ts`: `DesignPatch` Zod schema + `PatchOperation` union (updateText/Frame/Colour, replaceIcon/Image, add/removeElement, reorderZ, updateBackground, updateOpacity) + pure `applyDesignPatch(doc, patch)` — deep-copies, **refuses locked + out-of-scope ops** (reported, not thrown), re-parses the result so a patch can never corrupt structure — plus `reimposeLocked` (defence-in-depth) and `patchTouchedPageIds`. `patch.test.ts` — 24 tests. (Complements Agent 2's `locking.ts`: the route's server-side byte-check reuses `findLockedElementViolation`.)
- Prompt `design_patch@1` (`apps/api/src/ai/prompts/index.ts`) with a **real** JSON schema; `MockAiAdapter` has canned patch output; step wired into `ports` + `models.ts` (final tier). The AI returns **operations only** — the trusted server owns `scope`/`targetIds`/`lockedElementIds`, so a model can't widen its own edit scope.
- `apps/api/src/services/design-patch.ts`: `patchDesign()` repair loop (≤2 attempts, rule errors + rejected-op reasons fed back), scope-limited prompt excerpt. `design-patch.test.ts` — 10 tests (page-scope byte-identity, locked preservation, repair-then-succeed, both-fail-flagged).
- `POST /clients/:clientId/design-documents/:id/patch` (`design:edit`): buildBrandContext → patch → validate → server-side locked byte-check (409 on drift) → persist `DesignRevision` reason **`AI_PATCH`** + bump version.
- **TO RUN:** migration `20260707140000_revision_reason_ai_patch` applied on shared dev DB; restart API after `prisma generate` if enum was stale.

**AI patch UI (Agent 8, `feat/design-ai-patch-ui`) — DONE (P3-E):**
- `AiEditPanel` in the Design Studio left panel (auth only): natural-language instruction, preset chips (Simplify / More contrast / Two-tone headline / More whitespace), auto scope from selection → active page → document, locked elements always sent to API.
- Flow: sync local doc → `POST /design-documents/:id/patch` → fetch result → diff summary (`patchDiffSummary.ts`) + AI rationale → Accept updates canvas / Reject reverts server doc.
- `linkedDesignDocumentId` wired from package-linked draft save + draft reopen (`GET /design-drafts/:id` → `designDocument.id`).
- Tests: `patchDiffSummary.test.ts` (2).

**Next:** SVG import (Agent 10), PPTX import (Agent 11), publish integration.

**Draft visual direction (Agent 9, `feat/design-pipeline`) — DONE (P3-G / backlog #1):**
- `packages/shared/src/visual-direction.ts` — `VisualDirection` Zod schema + `formatVisualDirectionBrief()`.
- `PostPackage.visualDirection` JSON column; `post_copy@3` prompt populates it; mock adapter includes sample direction.
- `VisualDirectionEditor` in Content Manager edit modal + storyboard modal (editable before compose).
- Wired into `POST /compose-sync` (brief enrichment) and `POST /design-documents/:id/patch` (AI edit context).

**Pipeline integration (Agent 12, `feat/design-pipeline`) — DONE (P5-A/B/C/F):**
- Content Manager + Design Library: **Open in studio** (`?package=` / `?draft=`).
- `RevisionHistoryPanel` — lists `DesignRevision` rows, hover SVG thumb, revert → new `REVERT` revision.
- `ReviewCommentsPanel` — `Comment` model routes; element-anchored comments; click selects + highlights on canvas.
- API: `GET /design-documents/:id/revisions`, `POST /design-documents/:id/revert`, `/comments` CRUD.

See **[docs/16-backlog.md](16-backlog.md)** for the full parked list. Highest-value next:
1. ✅ **Google Fonts** in the playground — DONE. 30-family curated catalog in `packages/design-schema/src/fonts.ts` (shared source of truth), grouped picker (system + sans/serif/display/mono), selected families live-loaded via an injected `<link>`, and the SVG exporter embeds a portable `@import` so standalone `.svg` files render in-font. Free, no key. **PPTX caveat:** PowerPoint substitutes the family name if the font isn't installed locally (webfonts can't embed into PPTX without the binary).
2. ✅ **Flat illustration pack** — DONE (backlog item 4). 22 bundled recolourable flat scene illustrations in `apps/api/src/assets/undraw-manifest.ts`, served by the `searchUndraw` adapter (tier 1, no key, `#6c63ff`→brand-hue recolour, data-URI delivery). **Honest caveat:** the agent could NOT fetch real unDraw art (its CDN URLs are hashed/unstable), so these are **original hand-authored** scenes in the unDraw style — unencumbered, no attribution. Registry `undraw` entry relabelled "Flat illustrations" to reflect this; real unDraw SVGs can be dropped into the same manifest later.
3. ✅ **Attribution rendering on export** — DONE (backlog item 4c). `attributions` is now an optional field on `InternalDesignDocument`; `resolveImages` attaches credits to the doc so they persist through save/reopen/export; SVG + PPTX exporters render a credits line, and the playground shows an "Asset credits" panel.
4. **Customer logo/photo upload** → StoragePort/MinIO → feeds logo-top-left motif.
5. ✅ **Manual asset insert in playground** — DONE (Agent 6). AssetPicker + insert/replace + icon swap on `/playground` when signed in.
6. Calendar page, Brand-profile editor UI, publish integration, queue workers.

## 9. Product-owner working style (important)

- Wants to **iterate in loops** (generate → critique → refine), not one-shot — especially on visual quality (benchmark: the **29FORWARD Australia** LinkedIn page — bold two-tone headlines, flat character illustrations, dynamic layered composition).
- Thinks in **Buffer.com** terms for the pipeline.
- Values: things actually *used* end-to-end (not just built), free/no-subscription where possible, and clear honesty about what's stubbed vs working.
