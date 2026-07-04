# BrandFlow — Design Generation Schema (InternalDesignDocument)

**Version:** 1.0 · **Date:** 2026-07-04
**Implementation:** [packages/design-schema/src](../packages/design-schema/src) (Zod schemas are the single source of truth)

---

## 1. Purpose

A vendor-neutral, structured, validated design document. It is:

- the **authoritative stored format** (JSONB in Postgres, versioned via DesignRevision);
- what the AI pipeline produces (via recipe fill — see [08-ai-workflow-design.md](08-ai-workflow-design.md));
- what the validation engine checks ([11-validation-rules.md](11-validation-rules.md));
- converted to/from the editor's native format (Polotno scene JSON) by the DesignEnginePort adapter.

This decouples the product from any design vendor: switching editors means writing one converter.

## 2. Document structure

```
InternalDesignDocument
├─ id, version, schemaVersion
├─ brandProfileId, layoutRecipeRef { recipeId, recipeVersion, variant }
├─ format (e.g. "carousel", "single_image", dimensions preset)
├─ canvas { width, height, unit: "px", dpi }
├─ brandTokens { colours{}, fonts{}, logoAssetIds[] }   // resolved snapshot
└─ pages: Page[]
   └─ Page { id, name, background: Fill, safeArea: Insets, elements: Element[] }
```

### Element (discriminated union on `type`)

Common fields (`ElementBase`):

```
id            stable UUID (comment anchors, locks, diffing)
name          human label shown in layers panel
frame         { x, y, width, height, rotation }   // px, page coordinates
opacity       0–1
locked        boolean          // survives regeneration; editor enforces
visible       boolean
zIndex        number           // explicit layer order within page
roleHint      "headline" | "subheadline" | "body" | "caption" | "logo" |
              "icon" | "badge" | "decoration" | "background" | "cta" |
              "attribution" | "data" | "divider" | "image" | null
tokenRefs     BrandTokenReference[]   // which brand tokens style this element
recipeSlotId  string | null    // which recipe slot produced it
meta          record<string, json>    // adapter round-trip storage
```

Variants:

| Type | Specific fields |
|---|---|
| **TextElement** | text, fontFamily, fontSize, fontWeight, fontStyle, lineHeight, letterSpacing, align, verticalAlign, colour (Colour), maxLines?, autoFit? |
| **ImageElement** | assetId? \| src?, fit ("cover"\|"contain"\|"fill"), cropRect?, cornerRadius, borderColour?, borderWidth, isPlaceholder |
| **IconElement** | iconRef { provider: "lucide"\|"tabler"\|"internal"\|"custom", name, svg? }, colour, strokeWidth |
| **ShapeElement** | shape ("rect"\|"ellipse"\|"line"\|"triangle"\|"arrow"\|"polygon"), fill (Colour\|Gradient), stroke?, strokeWidth, cornerRadius, points? |
| **GroupElement** | children: Element[] (nested; groups can be locked/moved as one) |
| **ChartElement** | chartType ("bar"\|"donut"\|"progress"\|"stat"), data (small series), palette: tokenRefs — rendered as grouped vector shapes on export so it stays editable |

### Supporting types

```
Colour     { kind: "token", token: "primary"|"secondary"|"accent"|"neutral"|
             "background"|"text"|"custom:<name>" }
           | { kind: "raw", hex, allowedOverride: boolean }
Fill       Colour | Gradient { stops[], angle } | ImageFill { assetId }
BrandTokenReference { category: "colour"|"font"|"logo"|"spacing", token }
Insets     { top, right, bottom, left }
```

**Colour is token-first.** Elements reference brand tokens (`primary`, `accent`…), so re-branding restyles a document, and validation trivially detects off-palette colours (`kind: "raw"` without `allowedOverride` fails validation).

## 3. Rules baked into the schema

- `schemaVersion` gates migrations; unknown element `type` fails parsing → "AI invented unsupported element type" is impossible to store.
- Every page must contain ≥1 element; element count ≤ 60/page (sanity bound).
- Frames are finite numbers; negative width/height rejected at parse time.
- Text elements: non-empty `text`, fontSize within [8, 400] at parse; *readability* minimums (14px body etc.) are validation-engine rules, not parse rules, so humans can see and fix violations in the editor.
- Group nesting depth ≤ 4.
- `locked` and element `id` are preserved verbatim through the Polotno adapter round-trip (stored in Polotno `custom` field).

## 4. Conversion to Polotno scene JSON

`PolotnoAdapter` maps: page → page; TextElement → `text`; ImageElement → `image`; IconElement → `svg`; ShapeElement → `figure`/`line`; GroupElement → `group`; ChartElement → pre-rendered SVG group with a `custom.chart` payload for re-editing. Token colours are resolved to hex at conversion time; the token reference is retained in `custom.tokenRefs` so edits map back. The reverse conversion re-tokenises exact-match brand hexes and marks others `raw`.

**Round-trip contract (tested):** `fromPolotno(toPolotno(doc))` preserves ids, locks, geometry (±0.5px), text, tokenRefs, and z-order.

## 5. Versioning & revisions

Every persisted change (AI generation, AI part-regeneration, human save, revert) creates a `DesignRevision` snapshot with `reason`. Reverting creates a *new* revision (history is never rewritten). Locked-element state lives on the document and is enforced at save time by the API, not just the UI.
