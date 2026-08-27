# 20 — Handoff + Phase 2 (evidence-led)

**Purpose.** Two jobs in one document: (a) enough state for a fresh session to pick
this up cold, and (b) the Phase 2 plan, rewritten from measurement rather than from
the guesses in `19` §3.

Read `18` (design system + pipeline) and `19` (route to professional grade) first;
this supersedes `19` §3 where they disagree.

---

## A. State as of 2026-08-26

`origin/main` = `4e7acbe`. 509 tests green, root typecheck clean, tree clean, no
agent worktrees outstanding.

**The pipeline** (`apps/api/src/services/pipeline.ts`, `composePipeline`):
concept (AI) → art direction (AI) → compositor (deterministic) → critic (vision AI,
opt-in). Stage 3 is where every guarantee lives.

**Phase 1 is complete.** Across the same ten briefs, findings went 43 → 28 → **7**,
and every *error* class is zero: text-on-artwork 14→0, cropped glyphs 6→0, contrast
10→0, overflow 4→0, safe-margins 3→0. The 7 remaining are warnings (5 coverage,
2 balance). Type discipline holds: 100% on the 8px grid, sizes drawn from the scale.

**What the pages look like:** usable, not designed. Nothing unreadable or cropped;
large empty regions, timid type, missing imagery.

**Known caveats, do not overstate:**
- `INK_CONFIDENCE` — the validator judges the middle 65% of each text line. "Zero
  text on artwork" means confidently-placed ink, not every pixel.
- The critic (stage 4) is strong on spatial composition and **blind to legibility
  and asset relevance**; never gate on its total score (`18` §5a).
- `@resvg/resvg-js` is MPL-2.0, contained to one module by an enforced test (`18` §5a).

**Standing rules learned the hard way** (each cost a real defect):
1. Every fix needs a measurement that would have caught the defect.
2. Look at rendered PNGs every round — metrics have passed pages that look broken.
3. Never clear a rule by weakening it; fix the source.
4. **One model, one place.** Four separate defects this session came from a
   duplicated model drifting: the contrast background model written independently
   three times, `LayoutPlan` twice, `verticalCoverage` twice, the occlusion sampler
   once. If two modules need the same judgement, one owns it.
5. Fast-forward local `main` before creating agent worktrees, or the spec you just
   committed will be missing from them (made twice).

---

## B. What the evidence says to do next

Measured across the ten Phase-1 posts (25 pages):

| Signal | Measured | Reading |
|---|---|---|
| Posts with **zero image or chart regions** | **5 of 10** | The art director simply is not asking for imagery |
| Largest text element, law-firm post | **30px** on a 1080×1350 canvas | Its plan asked for emphasis 2 (68px) |
| Focal element share of canvas | **5–15%** | No page has a dominant element |
| Coverage warnings | 5/25 pages | Horizontal dead space |

### The finding that reframes Phase 2

The law post's plan asked for `hero-headline` at **emphasis 2 (68px)** but gave it a
**6-column × 2-row** cell. 68px copy does not fit there, so the compositor stepped
the type down — to **30px**. The page then has no dominant element at all, and
nothing anywhere reports that hierarchy was lost.

**Art direction's emphasis and its cell allocation are inconsistent, and the
compositor silently resolves the conflict by shrinking type.** That single mechanism
explains the timid look far better than "density" does. `19` §3 proposed a density
floor and optical-balance rules — compositor polish. The real defects are upstream,
in the stage-2 contract.

### Phase 2, rewritten

| ID | Item | Why it is the right thing | Owner |
|---|---|---|---|
| **P2.A** | **Emphasis must fit its cell.** A region at emphasis N must be allocated enough cells to hold its copy at that size. Enforce in `reviewLayoutPlan` (repair round) so the art director fixes it, and in the compositor prefer **growing the region** over stepping type down. Any step-down that survives is a note *and* a reported metric. | Restores hierarchy at the source. A 68px headline rendering at 30px is the single biggest cause of the timid look | stage 2 + compositor |
| **P2.B** | **Every page gets deliberate imagery.** Five of ten posts have no image or chart region. Require art direction to place at least one image/chart per page unless the page is a deliberate type-only statement, and make that choice explicit rather than accidental. | The pages with imagery read as designed; the ones without read as documents | stage 2 |
| **P2.C** | **Image treatment vocabulary + aspect-aware fitting.** Treatments (hero, inset, masked circle, full-bleed-with-scrim, silhouette) executed by the compositor, and fitting that respects the asset's own aspect ratio. A 400×300 illustration cover-cropped into a 0.54:1 frame is what manufactures the stray ground-shadows and slivers — confirmed as an asset problem, not a compositor one. | Fixes the visible artefacts and makes images look placed rather than dropped in | compositor + assets |
| **P2.D** | **Focal dominance.** Require the focal element to occupy a meaningful share of the canvas; measure it. Today the maximum across 25 pages is 15%. | "One unmistakable focal point" (`18` §2.1) is currently unenforced | compositor + metric |
| **P2.E** | **Signature move per page.** `18` §2 criterion 7 forbids two pages in a carousel sharing a structure, while `18` §4 puts `signatureMove` on the concept — one per set. All four recruitment pages used the same move. Let a page choose, with the concept nominating a default. | Contradiction in our own spec; it is the cookie-cutter failure the owner warned about | stage 1+2 contract |
| **P2.F** | Horizontal coverage / optical balance (was P2.3). | Now the smallest of the five | compositor |

**Sequence:** P2.A and P2.B first — both upstream, both cheap, and between them they
account for most of what is visibly wrong. P2.C next. P2.D/E/F after, then re-run the
ten and look.

**Phase 3 (judgement loop) is unchanged** and still gated behind Phase 2: anchor the
critic on measured facts, gate per criterion, keep legibility deterministic.

---

### Debt created by P2.B — replace before it sets

`LayoutPage` has no field for "this page is deliberately type-only", and the agent
implementing P2.B could not edit `design-system.ts` (another agent held it). It
therefore used the one free-text channel a region already has — its `id` — as the
declaration channel: an id prefixed `type-only:` plus a reason.

It works, it is tested, and the agent flagged it rather than letting it pass as
design. **Replace it with a proper optional `typeOnlyReason?: string` on `LayoutPage`**
as soon as that file is free, and switch the reviewer and prompt to it. Overloading an
identifier is exactly the kind of shortcut that becomes permanent because everything
around it keeps working.

## C. Deliberately not being done

- **Publish / Buffer integration** — owner parked it until the core is good.
- **Brand style packs (A5) and the multi-style asset library (A6)** — differentiation,
  not quality. After the output is worth differentiating.
- **The stubbed pages** (Calendar, Brand-profile editor, Dashboard, Review queue) —
  real product gaps, backend mostly present. Worth revisiting once quality lands,
  because a good engine behind a stubbed workflow still is not a sellable product.

## D. How to verify anything here

Harnesses live in the session scratchpad (not committed): `gen-v3.mts` runs the ten
briefs through the pipeline (`OUTDIR=posts-vN`), `metrics2.mts` prints the full
quality report per directory, `shots.mts` rasterises pages to PNG for review, and
`brands.json` holds the ten briefs. Fonts: `npm run fonts` in `apps/api`.
The commercial bar remains **8 of 10 posts needing no manual edit**.
