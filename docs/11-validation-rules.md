# BrandFlow — Design Validation Rules

**Version:** 1.0 · **Date:** 2026-07-04
**Implementation:** [packages/design-schema/src/validate.ts](../packages/design-schema/src/validate.ts)

---

## 1. Where validation runs

1. **Parse time (hard):** Zod schema — malformed documents, unknown element types, invalid values can never be stored. AI output failing here triggers the repair loop.
2. **Rule time (report):** the validation engine produces a `ValidationReport` of `violations[]`, each `{ ruleId, severity: "error" | "warning", pageId?, elementId?, message, autoFixApplied? }`.
   - **Generation path:** any `error` blocks display → repair loop → deterministic fallback.
   - **Human-edit path:** errors block *approval/export* but not saving — designers see inline flags and fix them (or use permitted overrides, which are recorded in the report).
3. **Pre-export:** re-validated; export refuses on unresolved errors.

## 2. Rules

### Structure (severity: error)

| Rule | Check |
|---|---|
| `required-fields` | Document has brandProfileId, recipeRef, canvas, ≥1 page; every element has id/frame/zIndex |
| `required-elements` | All recipe-required slots present (`recipeSlotId` coverage vs recipe contract) |
| `element-types` | Only supported element types (enforced at parse; re-asserted) |
| `slide-count` | Carousel page count within recipe `slideRange` and LinkedIn limit (≤ 20 slides for document posts) |
| `dimensions` | Canvas matches a LinkedIn preset: 1080×1080, 1080×1350, 1200×627 (single), 1080×1080/1080×1350 (carousel PDF) |
| `element-count` | ≤ 60 elements/page (reasonableness bound) |

### Geometry (severity: error unless noted)

| Rule | Check |
|---|---|
| `within-canvas` | Every element's rotated bounding box intersects the canvas; nothing fully outside |
| `safe-margins` | Required content (roleHint ≠ decoration/background) inside the page safeArea; decorative bleed allowed |
| `text-overflow` | Measured text (real font metrics, line height, maxLines) fits its frame — no clipped text |
| `overlap-collision` (warning) | Text elements with roleHint headline/body must not overlap other text or icons > 5% area |
| `logo-rules` | Logo elements respect brand kit clear-space and minimum size; at most one primary logo per page unless recipe allows |

### Readability & accessibility

| Rule | Severity | Check |
|---|---|---|
| `min-font-size` | error | body ≥ 14px, caption ≥ 12px, headline ≥ 24px (at 1080px canvas; scaled otherwise) |
| `contrast` | error | Text vs effective background ≥ 4.5:1 (≥ 3:1 for text ≥ 32px bold), WCAG-formula on resolved token colours; gradient/image backgrounds use worst-case sampled luminance |
| `line-length` | warning | Body text ≤ ~55 chars/line at rendered size |
| `alt-text-present` | error | VisualPackage carries non-empty alt text before approval |
| `no-hidden-content` | error | No element with visible=false or opacity < 0.05 containing text; nothing fully covered by an opaque higher-z element |

### Brand (severity: error unless the override flag is set and permitted)

| Rule | Check |
|---|---|
| `palette-only` | Every colour is `kind: "token"`, or `raw` with `allowedOverride` (requires `brand:manage`, always reported) |
| `approved-fonts` | fontFamily ∈ brand kit fonts (+ fallback stack) |
| `approved-assets` | Every assetId references an `approved=true` asset in the same tenant |
| `banned-phrases` | On-image text contains no style-guide banned phrases |
| `no-raster-only` | Document must contain editable elements; a single full-canvas image with no text/shape layers fails ("no raster-only final design") |

### Provenance (severity: error)

| Rule | Check |
|---|---|
| `tenant-scope` | brandProfileId and all assetIds belong to the document's clientCompanyId |
| `recipe-pin` | recipeId/version exists; slot fills within recipe constraints (char limits re-checked) |
| `locked-integrity` | Elements marked locked are byte-identical to the lock store after any AI regeneration |

## 3. Auto-fixes (applied before reporting, always logged in the report)

- Font step-down within recipe-defined min/max to resolve `text-overflow` (never below `min-font-size`).
- Snap near-miss elements (≤ 8px) back inside safe area.
- Re-tokenise raw colours that exactly match a brand token hex.
- Reassign colliding zIndex values preserving order.

## 4. Report shape

```ts
interface ValidationReport {
  documentId: string; version: number; validatedAt: string;
  passed: boolean;              // no errors
  errors: Violation[]; warnings: Violation[];
  autoFixes: AutoFix[];
  overrides: Override[];        // permitted rule bypasses, with userId + reason
}
```

The report is stored on the DesignDocument, shown in the review UI beside previews, and included in the audit trail.
