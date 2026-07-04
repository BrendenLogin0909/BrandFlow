# BrandFlow — Layout Recipe System

**Version:** 1.0 · **Date:** 2026-07-04
**Implementation:** [packages/layout-recipes/src](../packages/layout-recipes/src)

---

## 1. Concept

A **layout recipe** is a parameterised, versioned layout program — not a static template. It defines the structure and rules of a design; the AI fills its **slots** with content and picks from its allowed **variation axes**; deterministic application code assembles the final InternalDesignDocument. One recipe therefore produces many visibly different but structurally sound, on-brand designs.

```
Recipe = contract (what the AI may decide)
       + layout logic (how code positions everything)
       + validation hints (what must hold afterwards)
```

## 2. Recipe definition

```ts
interface LayoutRecipe {
  id: string;                 // "quote-card", "numbered-list-carousel"
  version: number;
  name: string;
  formats: VisualFormat[];    // which visual formats it can serve
  kind: "single" | "carousel";
  canvas: { width: number; height: number };        // LinkedIn presets
  safeArea: Insets;                                  // margins nothing may cross
  slideRange?: { min: number; max: number };         // carousels
  slots: RecipeSlot[];        // what the AI fills
  variants: RecipeVariant[];  // named layout permutations (≥2 per recipe)
  layout: (fill: RecipeFill, ctx: LayoutContext) => InternalDesignDocument;
  constraints: RecipeConstraints;   // text limits, required/optional elements
}

interface RecipeSlot {
  id: string;                 // "headline", "items[]", "authorName", "icon"
  kind: "text" | "icon" | "image" | "colourTreatment" | "list";
  required: boolean;
  maxChars?: number; maxItems?: number; maxLines?: number;
  guidance: string;           // injected into the step-7 prompt
}

interface RecipeVariant {
  id: string;                 // "icon-left", "icon-top", "split-diagonal"
  description: string;
  weight: number;             // selection weighting
}
```

Each recipe therefore defines, per the requirements: canvas size, safe areas, element hierarchy (via `roleHint` + zIndex assignment in `layout()`), required/optional elements, text length limits, positioning logic, layering rules, brand token usage (all colours/fonts assigned as token refs), icon/image placement rules, and responsive variants (portrait 1080×1350 and square 1080×1080 presets where applicable).

## 3. MVP recipe library

**Single-image (≥3 required, 5 shipped):**

| Recipe | Density | Slots | Variants |
|---|---|---|---|
| `big-headline-icons` — big headline + supporting text + icon cluster | text+icon | headline (≤80), support (≤140), icons[3–5] | icons-bottom-row, icons-right-column |
| `quote-card` — quote + author attribution | text | quote (≤220), authorName, authorTitle, treatment | serif-centered, left-bar-accent |
| `stat-card` — data point/statistic | data | statValue (≤12), statLabel (≤60), context (≤120) | number-hero, donut-side |
| `photo-hero-card` — layered photo composition (image-led) | **image-heavy** | photo (asset), headline (≤90), kicker (≤30), badge (≤20) | full-bleed-scrim, split-top-image |
| `icon-grid-card` — dense icon tile/chip grid (icon-led) | **icon-heavy** | headline (≤70), items[4–8] | tiles, chips |

Roadmap single-image: `announcement-card` (kicker/headline/detail/ctaBadge/logoPlacement — banner-top, corner-badge).

**Carousel (≥3 required, 4 shipped):**

| Recipe | Structure | Variants |
|---|---|---|
| `numbered-list-carousel` | cover (hook) + N item slides (number, title ≤60, body ≤180) + CTA slide | left-number-rail, top-number-chip |
| `problem-insight-recommendation` | cover + problem + insight + recommendation + CTA | icon-anchored, colour-block |
| `myth-vs-reality` | cover + N myth/reality pair slides + CTA | split-horizontal, card-flip |
| `checklist-carousel` | cover + checklist slides (✓ items) + CTA | one-per-slide, grouped-3 |

Roadmap recipes: timeline, before/after split, framework diagram, three-column comparison, event speaker card, case-study result card, photo-collage carousel (image-heavy), mascot/illustration-led story card (reusing approved brand illustrations from the asset library).

**Density coverage note:** the schema imposes no per-recipe composition — pages allow up to 60 mixed elements, images layered over images, repeated icons/illustrations, and nested groups. Recipes are deliberately typed across densities (text-, data-, icon- and image-heavy) so the AI's concept step can match density to content; brands can down-weight or ban densities via `layoutPreferences`.

## 4. Assembly pipeline

1. **Recipe selection** (application code + variety guard — see below).
2. **Slot fill** (AI step 7): returns `RecipeFill` validated against slot constraints (char limits enforced by schema, then re-checked after text measurement).
3. **Variant + treatment selection:** seeded-random weighted pick among variants and allowed token treatments (e.g. background = `background` token vs `primary` at 8% tint), seed recorded for reproducibility.
4. **`layout()` execution:** deterministic positioning — computes text boxes from measured text (server-side text measurement with the actual brand font), places icons/logos per rules, assigns zIndex, applies safe areas, generates stable element ids and `recipeSlotId` links.
5. **Validation** ([11-validation-rules.md](11-validation-rules.md)); overflow triggers font-step-down within recipe bounds, then re-fill repair, then fallback copy truncation with `needsAttention` flag.

## 4b. Creative variance layers (style directives)

Deterministic recipes alone read as templated. Variance is layered on top, each layer AI-choosable and human-overridable, and **every layer's output still passes the full validation engine**:

| Layer | Owner | Examples |
|---|---|---|
| Recipe | variety guard (code) | 8 recipes across text/data/icon/image densities |
| Variant | weighted seeded pick | 2+ per recipe |
| Colour treatment | AI (slot) | light / dark / accent |
| **Headline treatment** | AI (directive) | plain / **two-tone** (black phrase + display-colour phrase, split across wrapped lines; display colour auto-selected as the highest-priority brand token that passes the same WCAG threshold the validator applies) |
| **Brand motif** | AI (directive) | dot-grid, corner-ring, diagonal-band, underline-accent, oversized line icon anchored to the headline |
| Slot content | AI (step 7) | text, icon choices, image choices |

Implemented in `packages/layout-recipes/src/directives.ts` as a post-layout decorator (`applyStyleDirectives`), so every current and future recipe gets all treatments and motifs for free. Locked elements are never restyled. Directive combinations are covered by an exhaustive recipe × treatment × motif validation test.

**Roadmap — increasing creative freedom, same validation boundary:**

1. **Brand illustration packs** (AssetProviderPort): licensed flat-illustration libraries (e.g. unDraw-style, brand-colour-tintable SVGs) and customer-uploaded character/mascot sets, so designs can feature scene illustrations, not just icons — reused consistently across posts.
2. **Freeform compose mode** (step 7b): the AI emits InternalDesignDocument elements directly — constrained to brand tokens, licensed icon/illustration refs, and the schema's element types — validated and repaired by the same engine. Recipes become the safe default; freeform becomes the creative mode per post or per brand ("creative range" setting: conservative → experimental).
3. **Recipe induction from existing posts**: brand onboarding analyses the customer's real published visuals (layout, headline treatments, motif habits) and drafts brand-specific recipes/motifs for human approval — the brand's own past output becomes its layout vocabulary.

## 5. Brand family variety test (mechanical guarantee)

Requirement: in any batch of ≥5 visuals for one brand, all look like one family, **no two use the exact same layout**.

- **Family cohesion** comes from brand tokens: same palette, fonts, logo rules, icon style, density across all recipes.
- **Layout distinctness** is enforced by the **variety guard** in recipe selection: the `(recipeId, variantId)` pair of each generated visual is recorded per brand; selection excludes any pair used in the brand's last 6 visuals (window configurable). With 8 recipes × ≥2 variants = ≥16 pairs, a 5-batch always has distinct layouts; if the exclusion set ever exhausts candidates, the guard relaxes to distinct `recipeId` only and flags the batch.
- **Automated check:** `checkBatchVariety(documents[])` (in `packages/layout-recipes`) asserts pairwise distinct `(recipeId, variantId)` and shared brand token usage; runs in CI acceptance tests and as a pre-display batch check in the product.

## 6. Recipe governance

- Recipes are versioned; a generated document pins `{ recipeId, recipeVersion, variant }`, so old documents re-render identically after recipe upgrades.
- New recipes require: slot contract, ≥2 variants, layout function with property-based overflow tests, and a fixture set passing validation for 3 sample brands (dark/light/high-contrast).
- Per-brand `layoutPreferences` can down-weight or ban specific recipes/variants.
