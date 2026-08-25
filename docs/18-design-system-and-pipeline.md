# 18 — Design system + the four-stage composition pipeline

**Status:** spec / active initiative. Supersedes the single-call `design_freeform`
path for new work; that path stays until this one beats it on the measured targets.

## 1. Why

The 10-post assessment (2026-08-25, see `16-backlog.md`) measured the real output of
27 AI-composed pages:

| Signal | Measured | Target |
|---|---|---|
| Distinct font sizes | **21** | ≤ 6, all drawn from a scale |
| Element positions on an 8px grid | **25% vertical, 42% horizontal** | ≥ 95% |
| Pages using < 75% of canvas height | **15 of 27** | ≤ 2 |

That is a precise description of amateur design, and it is not an art problem — it is
the absence of a design system. A language model emitting raw x/y/width/height for up
to 85 elements can have good ideas but cannot be consistent, because nothing constrains
it. The good posts are luck; the bad ones come from the same process.

**The fix is to constrain the vocabulary, not the composition.** A grid and a type
scale do not make designs similar — they make them correct. Fixing the *composition*
(headline top-left, image right) is what produces cookie-cutter output, and this design
deliberately does not do that: every stage below is free to put anything anywhere on
the grid.

## 2. What makes a design good — and separately, not generic

This is the critic's rubric (stage 4) and the art director's brief (stage 2).

**Good** (all four are gradeable):

1. **Hierarchy** — one unmistakable focal point; the eye knows what to read first,
   second, third. Comes from *dramatic* size contrast, not many gradual steps.
2. **Alignment** — everything relates to a shared structure, visible or not.
3. **Active whitespace** — generous, *deliberate* emptiness. Note the distinction: the
   failure in the assessed posts was accidental empty space at the bottom, which reads
   as unfinished. Intentional negative space around a focal point is the opposite, and
   is good.
4. **Restraint** — few sizes, few colours, consistent spacing.

**Distinctive** (what stops it being generic):

5. **A concept** — a visual idea carrying the message, not decoration beside it.
6. **Exactly one signature move per page** — an oversized numeral cropped by the edge,
   type overlapping an image, a colour block running off-canvas. One. Two is noise.
7. **Variety across a set** — no two pages in a carousel, and no two posts in a brand's
   feed, structured alike.

Generic = restraint without concept or signature move. Amateur = concept without
restraint. The current output is the second.

## 3. Design tokens (the constrained vocabulary)

Lives in `packages/design-schema/src/design-system.ts`. Values are for the 1080-wide
LinkedIn canvases; the compositor derives them for other canvas sizes.

**Grid** — 12 columns × 16 rows inside the safe area.

- margin 90 (matches the existing `safeArea`), gutter 24
- column width and row height are derived, never hardcoded:
  `(canvas.width - 2*margin - 11*gutter) / 12` and `(canvas.height - 2*margin) / 16`
- every emitted x/y/width/height snaps to the grid, then to the 8px baseline

**Type scale** — 6 steps, ratio ≈ 1.4, referenced by name only. The AI never emits a
font size.

| Step | Name | Size | Typical use |
|---|---|---|---|
| 1 | `display` | 96 | one-word statement, oversized numeral |
| 2 | `headline` | 68 | the main hook |
| 3 | `subhead` | 44 | secondary line, slide titles |
| 4 | `bodyLarge` | 30 | lead paragraph, pull quote |
| 5 | `body` | 22 | supporting copy, list items |
| 6 | `caption` | 16 | source, footnote, label |

**Spacing scale** — 8, 16, 24, 32, 48, 64, 96. Nothing else.

**Rule:** a page may use at most 4 of the 6 type steps, and must include at least one
step-1-or-2 element. This is what forces hierarchy.

## 4. The pipeline

Four stages. Stages 1, 2 and 4 are AI; **stage 3 is pure deterministic code** — that is
where the guarantees come from.

### Stage 1 — Concept (AI, cheap tier)

Input: brief, brand tokens, visual direction, format. Output has no geometry.

```ts
interface ConceptOutput {
  bigIdea: string;          // the single message, one sentence
  metaphor: string;         // the visual idea carrying it
  focalPoint: string;       // what must dominate the page
  register: 'bold' | 'calm' | 'urgent' | 'playful' | 'authoritative';
  signatureMove: SignatureMove;  // exactly one, see section 5
  pages: { purpose: string; copy: { role: TypeRole; text: string }[] }[];
}
```

### Stage 2 — Art direction (AI, strong tier)

Input: the concept + design tokens as names, not numbers. Output is structure on the
grid, still no pixels.

```ts
interface LayoutPlan {
  pages: {
    background: 'background' | 'primary' | 'accent' | 'text';
    regions: {
      id: string;
      role: 'kicker' | 'headline' | 'subhead' | 'body' | 'stat' | 'cta'
          | 'image' | 'chart' | 'icon' | 'block';
      col: { start: number; span: number };  // 1-12
      row: { start: number; span: number };  // 1-16
      emphasis: 1 | 2 | 3 | 4 | 5 | 6;       // maps to the type scale
      colour?: 'text' | 'primary' | 'secondary' | 'accent' | 'neutral' | 'background';
      align?: 'left' | 'center' | 'right';
      contentRef?: string;   // which copy item from the concept
      imageQuery?: string;   // for image regions
    }[];
    signatureRegionId: string;  // which region carries the signature move
  }[];
}
```

The model may place any region in any cell. It cannot emit a pixel value, a font size,
or an off-scale colour — so it cannot break the grid.

### Stage 3 — Compositor (deterministic code, no AI)

`packages/layout-recipes/src/compositor.ts`. `LayoutPlan` → `InternalDesignDocument`:
resolves grid cells to exact geometry, emphasis to type-scale sizes, colour names to
brand tokens, applies the signature move, snaps everything to the 8px baseline, then
runs the existing `autoFixFreeform` as a safety net. **This is where ≥95% alignment and
≤6 font sizes come from — guaranteed mechanically, not requested politely.**

### Stage 4 — Critic (vision AI)

Renders the page to PNG (`@resvg/resvg-js` over the existing SVG exporter), scores it
against the section 2 rubric 1–5 per criterion, and returns *region-level* adjustments
(move / resize / re-emphasise / recolour) — never raw geometry. Adjustments feed back
into stage 3. Loop at most twice; keep the highest-scoring version.

## 4a. Contract clarifications (binding, added 2026-08-25)

Gaps found by Agent 17 while implementing stages 1-2, arbitrated by the coordinator.
These are part of the contract; the compositor and the critic must follow them.

1. **`TypeRole`** (in `ConceptOutput.pages[].copy[].role`) is the set of six **type-scale
   step names** — `display | headline | subhead | bodyLarge | body | caption` — not the
   semantic region roles. Section 3 says the scale is referenced by name only; this is that.
2. **`contentRef`** is the **0-based index into the same page's `copy` array, as a decimal
   string** (`"0"`, `"1"`). The compositor resolves copy by **index lookup, never by role
   matching** — role matching silently mis-places copy when a page has two items sharing a
   role.
3. **`decoration` and `background` in section 5 are roleHints the COMPOSITOR assigns in
   stage 3.** They are not stage-2 region roles and never appear in a `LayoutPlan`. The
   compositor must map bleeding regions (and `block` regions acting as full-bleed
   backgrounds) onto those roleHints, or the safe-area exemption never applies and every
   signature move that bleeds fails validation.
4. **Counts:** 1-14 regions per page, 1-20 pages (matching `MAX_CAROUSEL_SLIDES`).
5. **Schemas must be `.strict()`.** There is no `x` or `fontSize` field to constrain, so
   "the AI cannot emit a pixel value" is enforced *only* by unknown-key rejection. A
   non-strict schema silently removes the central guarantee of stage 2.

## 5. Signature moves

Enumerated so the compositor can execute them precisely, chosen freely by stage 1.

| Move | Effect |
|---|---|
| `bleed-edge` | the region extends past the safe area to the canvas edge |
| `oversized-numeral` | a stat rendered at `display` × 2, cropped by the canvas |
| `overlap` | the region overlaps an adjacent image/block by one gutter |
| `full-bleed-block` | a colour block spans the full canvas width behind content |
| `crop-circle` | image masked to a circle that exceeds its column span |
| `rule-accent` | a heavy accent rule anchored to the headline baseline |

`decoration` and `background` roles are exempt from the safe-area clamp, so bleeds are
legal by construction rather than by exception.

## 6. Measurable targets (how we know it worked)

Re-run the same 10 briefs and require:

- ≤ 6 distinct font sizes across a post, all from the scale
- ≥ 95% of element x/y on the 8px grid
- ≥ 75% canvas coverage on every page, no accidental dead bands
- 0 validation errors before any human touches it
- **8 of 10 posts need no manual edit** — the commercial bar

The measurement harness already exists (`gen-posts.mjs` + `render-posts.mts` in the
session scratchpad); the metrics above are the same ones used to diagnose the problem.

## 7. Cost (measured 2026-08-25, from real runs)

Today: 2,986 input + 5,817 output tokens per post ≈ **$0.06** on gpt-5.1. Four-stage:
~9,000 input + ~4,200 output ≈ **$0.05**, because stage 3 computes the geometry instead
of the model emitting it. Mixed tiers (concept + critic cheap, art direction strong)
≈ **$0.03**. Reasoning tokens are billed as output and are not in these figures — assume
up to 2×. Latency, not money, is the real cost: three sequential calls ≈ 3–4 minutes per
post, which is an argument for the queued workers already in the backlog.
