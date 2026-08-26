# 19 — Getting to professional grade

**Status:** active plan. Written 2026-08-26 after the first four-stage pipeline run
hit every measurable target in `18-design-system-and-pipeline.md` and still produced
pages no one would sell. This document says what is actually missing and in what
order to fix it.

## 0. Where we actually are

Two of the three ingredients of good design are now solved and should not be
re-litigated:

- **Discipline** — 100% grid alignment, 6 on-scale font sizes, zero validation
  errors, zero illegible-text findings. Mechanically guaranteed by the compositor.
- **Craft inputs** — real brand typography renders, illustrations recolour to the
  brand, characters have correct skin tones, licences are clean.

The third is missing, and it is the one a designer would notice first:

- **Placement judgement.** The engine has no model of *what sits on what*. It
  places a text region and an image region in overlapping cells and renders both,
  so copy lands on artwork. It bleeds an element off the canvas without asking
  whether the part it cut was load-bearing — "82%" became "32%".

Everything below follows from that. The honest framing: we built a typesetter,
not a layout engine. A typesetter positions things correctly; a layout engine
understands the relationships between them.

## 1. Principles for this phase

1. **Deterministic beats prompted.** Anything that can be a rule in the compositor
   should be, because the model cannot be relied on and the compositor cannot fail.
2. **Every fix needs a measurement that would have caught the defect.** The last
   round passed because the metrics measured discipline, not legibility or balance.
   A fix without a new measurement is a fix we cannot defend.
3. **Look at the output every round.** Three of the last five real defects were
   invisible to tests and to the vision critic, and obvious in a rendered PNG.
4. **Never trade one error for another.** Fixes that clear a rule by weakening it
   are rejected — the corner-ring motif was fixed, not the contrast rule relaxed.

## 2. Phase 1 — make every page usable (deterministic)

The bar: nothing on the page is unreadable, cropped or orphaned. This is the
difference between "imperfect" and "unusable", and it is all compositor work.

| ID | Item | Definition of done |
|---|---|---|
| P1.1 | **Occlusion model.** Image, chart and filled block regions are opaque. Text may not render on one unless the compositor places a scrim (a brand-token panel at a legible contrast) behind it, or the text is moved to a free cell. | No text renders on artwork without a scrim; a regression test builds a plan with text over an image and asserts either a scrim exists or the text was relocated |
| P1.2 | **Safe bleeds.** A bleed extends a region past the safe area; it must never truncate meaning. Numerals keep every glyph (bleed the backdrop, not the digits); images bleed on the axis that preserves their subject. | "82%" renders as "82%" at any bleed; test asserts no text glyph box crosses the canvas edge |
| P1.3 | **Minimum footprints, no orphans.** An image region below a sensible minimum area is dropped rather than rendered at icon size; an illustration that resolves to a fragment (a lone ground-shadow) is rejected. | No image element under the minimum; test covers the fragment case |
| P1.4 | **Contrast covers artwork.** The contrast rule samples shapes only, so text-over-image is invisible to it. Treat an image/chart under text as unknown-luminance: fail unless a scrim is present. | A document with text on an image produces a contrast violation |
| P1.5 | **Two-axis coverage + balance.** Coverage is measured vertically only, so a narrow content strip with dead space left and right scores 100%. Add horizontal coverage and a centroid-vs-centre balance check. | The metric flags the pages from the 2026-08-26 run that it previously passed |

## 3. Phase 2 — make pages look designed

The bar: a designer would call it competent. Composition, not correctness.

| ID | Item | Why |
|---|---|---|
| P2.1 | **Density floor per format.** Single-image posts dropped to 5–7 elements and read as under-designed. Set a minimum region count and supporting-element budget per format, enforced on the plan. | Sparse ≠ restrained |
| P2.2 | **Image treatment vocabulary.** Images are dropped in raw. Give art direction a small set of treatments — hero, inset, masked circle, full-bleed background with scrim, silhouette — that the compositor executes consistently. | Professional work treats images deliberately; this also feeds the brand style packs (A5) |
| P2.3 | **Optical balance rules.** Content centroid should sit deliberately, not accidentally; enforce optical margins and prevent one-sided drift. | Fixes the "everything crammed centre-right" look |
| P2.4 | **Concept quality audit.** Stage 1 has never been assessed on whether its ideas are *distinctive* rather than merely valid. Sample its output across briefs and judge the metaphors. | The grid cannot fix a boring idea |

## 2b. Concept audit (P2.4) — done 2026-08-26, and the answer is good

Stage 1 has never been assessed on whether its ideas are *distinctive* rather than
merely valid. Reading the copy from all ten posts of the 2026-08-26 run: it is
genuinely good, and this stage is not the bottleneck.

Representative lines, none of which are stock phrasing:

- "Blaming the tester is easy. Fixing the pipeline is hard." / "We map the leaks,
  not the scapegoats."
- "It's not one weak link — it's a failed process." / "Blame is a bandage."
- "Read the dashboard, not just the crash."
- "Three strong opinions beat thirty updates." / "Volume without a point of view
  is just static."

The banned-phrase and banned-metaphor lists in `design_concept@1` are doing their
job. **Conclusion: do not spend effort on the concept stage. The gap is entirely
in execution.**

The audit did expose two execution defects, both in the compositor:

| ID | Item | Severity |
|---|---|---|
| P1.2b | **`oversized-numeral` crops WORDS, silently.** Applied to non-numeric text it produced "Slow d" (from "Slow down") and "10 day" (from "10 days") — the compositor's own notes record it as "cropped by the right edge", and nothing sets `meta.truncated`, so a page validates cleanly while saying the wrong thing. The move must apply only to actual numerals/short stats and degrade safely otherwise; any path that mutates copy must flag it. Folded into P1.2. | HIGH |
| P2.5 | **The signature move repeats on every page of a carousel.** All four recruitment pages used `oversized-numeral`, which is exactly the cookie-cutter failure the owner warned about. **This is a contradiction in this spec's own parent:** `18` §2 criterion 7 requires that no two pages in a carousel share a structure, while `18` §4 puts `signatureMove` on `ConceptOutput` — one per SET, so by construction every page gets the same one. Resolve by letting a page choose its own move (the concept nominating a default), which touches the stage-2 contract, the prompt and the compositor. Deferred to Phase 2 rather than destabilising Phase 1 mid-build. | MEDIUM-HIGH |

## 4. Phase 3 — judgement loop

| ID | Item | Why |
|---|---|---|
| P3.1 | **Re-enable stage 4 with anchored facts.** The critic rationalises what it sees; give it measured occupancy, balance and collision counts as facts, as we did for whitespace (4/5 → 2/5 on the worst page). | Proven to work; it is the only thing that catches what rules cannot |
| P3.2 | **Gate per criterion, never on the total.** Observed totals cluster 26–30 of 35 and do not discriminate; a page with illegible text scored higher than the best-composed one. | Stops a meaningless number becoming a quality gate |
| P3.3 | **Keep legibility and asset relevance deterministic.** The critic is blind to both. | Known limit, documented in 18 §5a |

## 5. Phase 4 — benchmark and iterate

Re-run the same ten briefs after each phase and compare like for like. The
commercial bar stays **8 of 10 posts needing no manual edit**. Add to the existing
metrics: zero text-on-artwork, zero cropped glyphs, two-axis coverage, balance,
and a human look at every page — the look is not optional, it has caught more real
defects than every automated check combined.

## 6. Sequencing

Phase 1 is the only phase that blocks the others: there is no point tuning
composition while copy is landing on artwork. Phases 2 and 3 can overlap. Phase 4
runs after each.

Deliberately **not** in this plan: publish integration (owner parked it), brand
style packs (A5) and the multi-style asset library (A6). Those are differentiation;
this document is about making the core output good enough to differentiate.
