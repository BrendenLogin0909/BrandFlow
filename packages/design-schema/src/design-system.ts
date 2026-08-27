/**
 * Design tokens — the constrained vocabulary every composed page is built
 * from, plus the AI-facing contracts for stages 1 and 2 of the pipeline.
 * See docs/18-design-system-and-pipeline.md §3 and §4.
 *
 * The point of this module is that a language model never emits a pixel, a
 * font size or a colour: it names a grid cell, an emphasis step and a brand
 * token, and the compositor turns those names into geometry. Everything here
 * is pure and derived from the canvas — there are no per-canvas constants, so
 * 1080×1350, 1080×1080 and 1200×627 all work from the same maths.
 */
import { z } from 'zod';
import { BrandColourToken } from './schema.js';
import { measureText } from './measure.js';

// ---------- baseline ----------

/** The vertical rhythm unit. Every emitted coordinate is a multiple of this. */
export const BASELINE = 8;

export const snapTo8 = (n: number): number => Math.round(n / BASELINE) * BASELINE;
export const floorTo8 = (n: number): number => Math.floor(n / BASELINE) * BASELINE;
export const ceilTo8 = (n: number): number => Math.ceil(n / BASELINE) * BASELINE;

/** Spacing scale — docs §3. Nothing between these values is ever emitted. */
export const SPACING = [8, 16, 24, 32, 48, 64, 96] as const;
export type SpacingStep = (typeof SPACING)[number];

/** Nearest spacing step at or below `n` (never returns 0). */
export function spacing(n: number): SpacingStep {
  let best: SpacingStep = SPACING[0];
  for (const s of SPACING) if (s <= n) best = s;
  return best;
}

// ---------- canvas ----------

export interface CanvasSize {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The canvas the token values are quoted against (docs §3: "values are for the
 * 1080-wide LinkedIn canvases; the compositor derives them for other sizes").
 */
export const REFERENCE_CANVAS_WIDTH = 1080;

/** Ratio of a canvas dimension used for the safe margin — 90px at 1080 wide. */
export const SAFE_MARGIN_RATIO = 90 / REFERENCE_CANVAS_WIDTH;
/** Ratio used for the column gutter — 24px at 1080 wide. */
export const GUTTER_RATIO = 24 / REFERENCE_CANVAS_WIDTH;

/** Scale factor from the reference canvas; matches the validator's own scaling. */
export const canvasScale = (canvas: CanvasSize): number => canvas.width / REFERENCE_CANVAS_WIDTH;

// ---------- grid ----------

export const GRID_COLUMNS = 12;
export const GRID_ROWS = 16;

/**
 * Docs §6: every page must use at least this fraction of the canvas height.
 * The failure it exists to prevent is the accidental dead band at the bottom
 * of a page, which reads as unfinished.
 */
export const COVERAGE_TARGET = 0.75;

export interface GridMetrics {
  columns: number;
  rows: number;
  /**
   * Safe-area insets written onto the page (90 at 1080 wide). Content never
   * reaches them: the grid margins below are the rounded-up, baseline-aligned
   * versions, so the grid always sits a few pixels inside the safe area.
   */
  safeMarginX: number;
  safeMarginY: number;
  /** The grid's own margins — the safe margins rounded up to the baseline. */
  marginX: number;
  marginY: number;
  gutter: number;
  colWidth: number;
  rowHeight: number;
  /** Outer grid lines. */
  left: number;
  top: number;
  right: number;
  bottom: number;
  contentWidth: number;
  contentHeight: number;
}

/**
 * All grid geometry for a canvas. Derived, never tabulated per canvas.
 *
 * Two derivations are worth stating explicitly:
 *
 * - The margin is rounded UP to the baseline (90 → 96) so the outer grid lines
 *   are themselves multiples of 8. That is what lets column 1 and column 12
 *   land exactly on both the margin and the 8px grid at the same time — with a
 *   raw 90px margin one of the two has to give. The result is a 6px inset from
 *   the spec's 90, i.e. strictly safer, never tighter.
 * - The vertical margin is proportional to the SHORTER canvas dimension, so a
 *   wide, short canvas (1200×627) does not lose two thirds of its height to
 *   margins and become unable to reach the 75% coverage target. On every
 *   1080-wide LinkedIn canvas the two margins are identical (90 → 96), which
 *   is the case the spec quotes.
 */
export function gridMetrics(canvas: CanvasSize): GridMetrics {
  const safeMarginX = Math.round(canvas.width * SAFE_MARGIN_RATIO);
  const safeMarginY = Math.round(Math.min(canvas.width, canvas.height) * SAFE_MARGIN_RATIO);
  const marginX = ceilTo8(safeMarginX);
  const marginY = ceilTo8(safeMarginY);
  const gutter = Math.max(BASELINE, snapTo8(canvas.width * GUTTER_RATIO));
  const contentWidth = canvas.width - 2 * marginX;
  const contentHeight = canvas.height - 2 * marginY;
  return {
    columns: GRID_COLUMNS,
    rows: GRID_ROWS,
    safeMarginX,
    safeMarginY,
    marginX,
    marginY,
    gutter,
    colWidth: (contentWidth - (GRID_COLUMNS - 1) * gutter) / GRID_COLUMNS,
    rowHeight: contentHeight / GRID_ROWS,
    left: marginX,
    top: marginY,
    right: canvas.width - marginX,
    bottom: canvas.height - marginY,
    contentWidth,
    contentHeight,
  };
}

export interface GridSpan {
  start: number;
  span: number;
}

export const clampSpan = (s: GridSpan, max: number): GridSpan => {
  const start = Math.min(Math.max(Math.round(s.start), 1), max);
  const span = Math.min(Math.max(Math.round(s.span), 1), max - start + 1);
  return { start, span };
};

/**
 * Exact (unsnapped) geometry of a grid cell range. Columns are separated by one
 * gutter; rows tile edge to edge. Column 1 starts on the left margin and column
 * 12 ends on the right margin, by construction.
 */
export function gridRect(canvas: CanvasSize, col: GridSpan, row: GridSpan): Rect {
  const g = gridMetrics(canvas);
  const c = clampSpan(col, g.columns);
  const r = clampSpan(row, g.rows);
  return {
    x: g.left + (c.start - 1) * (g.colWidth + g.gutter),
    y: g.top + (r.start - 1) * g.rowHeight,
    width: c.span * g.colWidth + (c.span - 1) * g.gutter,
    height: r.span * g.rowHeight,
  };
}

/**
 * Snap a rect to the 8px baseline, keeping it inside the grid bounds. Edges are
 * snapped independently (so width/height follow from the snapped edges) and the
 * outer edges snap inwards, which is what keeps a bled-in canvas dimension such
 * as 1350 from pushing an element past the safe area.
 */
export function snapRectToGrid(rect: Rect, canvas: CanvasSize): Rect {
  const g = gridMetrics(canvas);
  const minX = ceilTo8(g.left);
  const maxX = floorTo8(g.right);
  const minY = ceilTo8(g.top);
  const maxY = floorTo8(g.bottom);
  const x1 = Math.min(Math.max(snapTo8(rect.x), minX), maxX - BASELINE);
  const y1 = Math.min(Math.max(snapTo8(rect.y), minY), maxY - BASELINE);
  const x2 = Math.max(Math.min(snapTo8(rect.x + rect.width), maxX), x1 + BASELINE);
  const y2 = Math.max(Math.min(snapTo8(rect.y + rect.height), maxY), y1 + BASELINE);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Grid cell resolved to final, baseline-snapped, safe-area-legal geometry. */
export function gridFrame(canvas: CanvasSize, col: GridSpan, row: GridSpan): Rect {
  return snapRectToGrid(gridRect(canvas, col, row), canvas);
}

// ---------- type scale ----------

export const TYPE_SCALE = [
  { step: 1, name: 'display', size: 96 },
  { step: 2, name: 'headline', size: 68 },
  { step: 3, name: 'subhead', size: 44 },
  { step: 4, name: 'bodyLarge', size: 30 },
  { step: 5, name: 'body', size: 22 },
  { step: 6, name: 'caption', size: 16 },
] as const;

export type TypeStepName = (typeof TYPE_SCALE)[number]['name'];
export type TypeEmphasis = 1 | 2 | 3 | 4 | 5 | 6;

export const TYPE_EMPHASES: readonly TypeEmphasis[] = [1, 2, 3, 4, 5, 6];

/** Docs §3: a page may use at most 4 of the 6 steps. */
export const MAX_TYPE_STEPS_PER_PAGE = 4;
/** Docs §5: `oversized-numeral` renders a stat at display × 2. */
export const OVERSIZED_NUMERAL_MULTIPLIER = 2;

/**
 * Font size for an emphasis step, scaled to the canvas. `canvas` is optional so
 * the token value can be read directly; omitting it returns the reference size.
 */
export function typeSize(emphasis: TypeEmphasis, canvas?: CanvasSize): number {
  const base = TYPE_SCALE[emphasis - 1]?.size ?? TYPE_SCALE[TYPE_SCALE.length - 1]!.size;
  return canvas ? Math.round(base * canvasScale(canvas)) : base;
}

/** Every legal font size for a canvas — the closed set the compositor draws from. */
export function typeScaleFor(canvas?: CanvasSize): number[] {
  return TYPE_EMPHASES.map((e) => typeSize(e, canvas));
}

/** The one sanctioned size outside the scale, used only by `oversized-numeral`. */
export function oversizedNumeralSize(canvas?: CanvasSize): number {
  return typeSize(1, canvas) * OVERSIZED_NUMERAL_MULTIPLIER;
}

/**
 * Line height chosen so the line box is an exact multiple of the baseline —
 * real baseline-grid typography rather than a decimal that drifts.
 */
export function lineHeightFor(fontSize: number): number {
  const preferred = fontSize >= 60 ? 1.08 : fontSize >= 40 ? 1.15 : fontSize >= 26 ? 1.3 : 1.4;
  return ceilTo8(fontSize * preferred) / fontSize;
}

// ---------- emphasis-fits-cell (docs/20 §B, P2.A) ----------
//
// The law-firm defect: a plan asked for `hero-headline` at emphasis 2 (68px)
// but allocated it a 6-column x 2-row cell. 68px copy does not fit there, so
// the compositor silently stepped the type down to 30px, and nothing anywhere
// said hierarchy had been lost. The fix is one predicate, "does this copy fit
// this cell at this emphasis", called by both sides that used to guess at it
// independently: the stage-2 reviewer (`reviewLayoutPlan`, which flags a plan
// that cannot honour its own emphasis) and the compositor (`fitText`, which
// grows the region before it ever shrinks the type). Two modules holding the
// same judgement separately is exactly the drift docs/20 §A rule 4 warns
// about, so it lives here once and both import it.
//
// Deliberately POSITION-independent: only the span counts are asked for, not
// `col.start`/`row.start`, because a cell's pixel size never depends on where
// it sits on the grid (`gridRect`'s width/height are a pure function of the
// span). That is what lets the reviewer judge a plan's cells before the
// compositor has decided where anything finally lands. `gridRect` (unsnapped)
// is used rather than `gridFrame` (baseline-snapped, position-aware) for the
// same reason; the few-px rounding `snapRectToGrid` can add is never enough
// to flip a real fit/no-fit verdict, and the compositor's actual geometry is
// still produced by `gridFrame` regardless — this predicate only informs the
// decision to grow, it is never mistaken for the final layout.

/**
 * Does `text`, set at `emphasis`, fit a cell spanning `colSpan` columns by
 * `rowSpan` rows on `canvas` — the same width-then-height question `fitText`
 * asks of the frame it is actually given. THE shared judgement: nothing else
 * in the pipeline re-decides this independently.
 */
export function emphasisFitsCell(
  text: string,
  emphasis: TypeEmphasis,
  colSpan: number,
  rowSpan: number,
  canvas: CanvasSize,
  letterSpacing = 0,
): boolean {
  const fontSize = typeSize(emphasis, canvas);
  const lineHeight = lineHeightFor(fontSize);
  const rect = gridRect(canvas, { start: 1, span: colSpan }, { start: 1, span: rowSpan });
  const m = measureText(text, fontSize, lineHeight, rect.width, letterSpacing);
  return m.height <= rect.height && m.widestLine <= rect.width;
}

/**
 * How many more rows and/or columns — grown in that order, mirroring the
 * compositor's own growth preference — `text` at `emphasis` needs beyond
 * `colSpan`x`rowSpan` before `emphasisFitsCell` is satisfied. `null` means it
 * does not fit even filling the rest of the grid. Ignores every other region
 * on the page (the reviewer has no layout to check collisions against; it is
 * advising the art director, not placing anything), so it is a lower bound —
 * the compositor's collision-aware growth may need more room than this on a
 * crowded page, never less.
 */
export function emphasisCellDeficit(
  text: string,
  emphasis: TypeEmphasis,
  colSpan: number,
  rowSpan: number,
  canvas: CanvasSize,
  letterSpacing = 0,
): { extraCols: number; extraRows: number } | null {
  if (emphasisFitsCell(text, emphasis, colSpan, rowSpan, canvas, letterSpacing))
    return { extraCols: 0, extraRows: 0 };
  for (let rows = rowSpan + 1; rows <= GRID_ROWS; rows++)
    if (emphasisFitsCell(text, emphasis, colSpan, rows, canvas, letterSpacing))
      return { extraCols: 0, extraRows: rows - rowSpan };
  for (let cols = colSpan + 1; cols <= GRID_COLUMNS; cols++)
    for (let rows = rowSpan; rows <= GRID_ROWS; rows++)
      if (emphasisFitsCell(text, emphasis, cols, rows, canvas, letterSpacing))
        return { extraCols: cols - colSpan, extraRows: Math.max(0, rows - rowSpan) };
  return null;
}

// ---------- AI-facing contracts (docs §4) ----------

/** Regions per page. 14 is roomy on a 12x16 grid and keeps pages under the
 *  document schema's 60-element ceiling once signature elements are added. */
export const MAX_PLAN_REGIONS = 14;
/** Pages per plan — matches MAX_CAROUSEL_SLIDES. */
export const MAX_PLAN_PAGES = 20;

/**
 * The six type-scale steps referenced by name — §3's "referenced by name only".
 * This is what a concept tags each piece of copy with; it is deliberately NOT
 * the semantic `RegionRole` list, which is stage 2's vocabulary.
 */
export const TypeRole = z.enum(['display', 'headline', 'subhead', 'bodyLarge', 'body', 'caption']);
export type TypeRole = z.infer<typeof TypeRole>;

export const RegionRole = z.enum([
  'kicker',
  'headline',
  'subhead',
  'body',
  'stat',
  'cta',
  'image',
  'chart',
  'icon',
  'block',
]);
export type RegionRole = z.infer<typeof RegionRole>;

/** The `RegionRole`s that resolve to a text element. */
export const TEXT_REGION_ROLES = [
  'kicker',
  'headline',
  'subhead',
  'body',
  'stat',
  'cta',
] as const satisfies readonly RegionRole[];
export type TextRegionRole = (typeof TEXT_REGION_ROLES)[number];

export const isTextRole = (role: RegionRole): role is TextRegionRole =>
  (TEXT_REGION_ROLES as readonly string[]).includes(role);

/** Docs §5 — enumerated so the compositor can execute each one precisely. */
export const SignatureMove = z.enum([
  'bleed-edge',
  'oversized-numeral',
  'overlap',
  'full-bleed-block',
  'crop-circle',
  'rule-accent',
]);
export type SignatureMove = z.infer<typeof SignatureMove>;

export const Register = z.enum(['bold', 'calm', 'urgent', 'playful', 'authoritative']);
export type Register = z.infer<typeof Register>;

/**
 * Stage 1 output — the idea, with no geometry anywhere in it.
 *
 * Every object is `.strict()` deliberately. There is no `x`, `width` or
 * `fontSize` field to constrain here, so "the model cannot emit a pixel value"
 * is guaranteed by unknown-key REJECTION and by nothing else. Relaxing these
 * schemas silently removes the guarantee the whole pipeline is built on.
 */
export const ConceptOutput = z
  .object({
    bigIdea: z.string().min(1).max(400),
    metaphor: z.string().min(1).max(400),
    focalPoint: z.string().min(1).max(200),
    register: Register,
    signatureMove: SignatureMove,
    pages: z
      .array(
        z
          .object({
            purpose: z.string().min(1).max(300),
            copy: z
              .array(z.object({ role: TypeRole, text: z.string().min(1).max(600) }).strict())
              .min(1)
              .max(20),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_PLAN_PAGES),
  })
  .strict();
export type ConceptOutput = z.infer<typeof ConceptOutput>;

export const Emphasis = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

export const LayoutRegion = z
  .object({
    id: z.string().min(1).max(60),
    role: RegionRole,
    col: z
      .object({
        start: z.number().int().min(1).max(GRID_COLUMNS),
        span: z.number().int().min(1).max(GRID_COLUMNS),
      })
      .strict(),
    row: z
      .object({
        start: z.number().int().min(1).max(GRID_ROWS),
        span: z.number().int().min(1).max(GRID_ROWS),
      })
      .strict(),
    emphasis: Emphasis,
    colour: BrandColourToken.optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
    /**
     * The 0-based index into THIS page's `copy` array, as a decimal string.
     * The compositor resolves it by index lookup and never by matching roles —
     * role matching silently mis-places copy when a page repeats a role.
     */
    contentRef: z.string().min(1).max(120).optional(),
    imageQuery: z.string().min(1).max(200).optional(),
  })
  .strict();
export type LayoutRegion = z.infer<typeof LayoutRegion>;

/** Stage 2 output — structure on the grid, still no pixels. See the note on
 *  `ConceptOutput` for why every object here is `.strict()`. */
export const LayoutPlan = z
  .object({
    pages: z
      .array(
        z
          .object({
            background: z.enum(['background', 'primary', 'accent', 'text']),
            regions: z.array(LayoutRegion).min(1).max(MAX_PLAN_REGIONS),
            signatureRegionId: z.string().min(1).max(60),
            /**
             * Set ONLY when a page is deliberately type-only. Every page must
             * carry an image or chart region (P2.B) — a page of type alone can
             * be the right call, but it has to be a decision with a reason, not
             * imagery that never occurred to the model. Absent means "imagery
             * required"; present means "chosen, and here is why".
             */
            typeOnlyReason: z.string().min(3).max(160).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_PLAN_PAGES),
  })
  .strict();
export type LayoutPlan = z.infer<typeof LayoutPlan>;

// ---------- hierarchy rule (docs §3) ----------

export interface HierarchyCoercion {
  /** Emphasis actually used for each region id after coercion. */
  emphasis: Map<string, TypeEmphasis>;
  /** Human-readable record of what was changed and why. */
  notes: string[];
}

/**
 * Enforce the two hierarchy rules deterministically, without throwing:
 *
 *  1. **At least one step-1-or-2 element.** If the page's largest type is step
 *     3 or smaller, the single largest text region is promoted to step 2
 *     (ties broken by plan order). Promotion runs first so the merge below can
 *     never undo it.
 *  2. **At most 4 distinct steps.** The smallest step index present (the focal
 *     point) is always kept; the remaining slots go to the steps used by the
 *     most regions, ties broken towards larger type. Every dropped step is
 *     remapped to the nearest kept step, ties again towards larger type.
 *
 * Because rule 1 runs first and rule 2 always keeps the smallest step present,
 * the result satisfies both in a single pass.
 */
export function coerceHierarchy(
  regions: readonly { id: string; role: RegionRole; emphasis: TypeEmphasis }[],
): HierarchyCoercion {
  const notes: string[] = [];
  const emphasis = new Map<string, TypeEmphasis>();
  const textRegions = regions.filter((r) => isTextRole(r.role));
  for (const r of regions) emphasis.set(r.id, r.emphasis);
  if (textRegions.length === 0) return { emphasis, notes };

  // --- rule 1: at least one step-1-or-2 element ---
  const smallestStep = Math.min(...textRegions.map((r) => emphasis.get(r.id)!)) as TypeEmphasis;
  if (smallestStep > 2) {
    const target = textRegions.find((r) => emphasis.get(r.id) === smallestStep)!;
    emphasis.set(target.id, 2);
    notes.push(
      `hierarchy: no step-1-or-2 element; promoted region "${target.id}" from step ${smallestStep} to step 2`,
    );
  }

  // --- rule 2: at most 4 distinct steps ---
  const counts = new Map<TypeEmphasis, number>();
  for (const r of textRegions) {
    const e = emphasis.get(r.id)!;
    counts.set(e, (counts.get(e) ?? 0) + 1);
  }
  const present = [...counts.keys()].sort((a, b) => a - b);
  if (present.length > MAX_TYPE_STEPS_PER_PAGE) {
    const focal = present[0]!;
    const rest = present
      .slice(1)
      .sort((a, b) => counts.get(b)! - counts.get(a)! || a - b)
      .slice(0, MAX_TYPE_STEPS_PER_PAGE - 1);
    const kept = [focal, ...rest].sort((a, b) => a - b);
    const dropped = present.filter((s) => !kept.includes(s));
    for (const r of textRegions) {
      const e = emphasis.get(r.id)!;
      if (kept.includes(e)) continue;
      // nearest kept step; a tie goes to the larger type (lower index)
      const to = kept.reduce((best, k) =>
        Math.abs(k - e) < Math.abs(best - e) || (Math.abs(k - e) === Math.abs(best - e) && k < best)
          ? k
          : best,
      );
      emphasis.set(r.id, to);
    }
    notes.push(
      `hierarchy: ${present.length} type steps exceeded the limit of ${MAX_TYPE_STEPS_PER_PAGE}; kept [${kept.join(', ')}], remapped [${dropped.join(', ')}] to the nearest kept step`,
    );
  }
  return { emphasis, notes };
}

// ---------- deterministic variation ----------

/**
 * FNV-1a over a string. The only source of "randomness" in the pipeline: every
 * variation is seeded from the plan itself, so the same plan always composes to
 * the same document.
 */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}


// ---------------------------------------------------------------------------
// Plan helpers used by the stage-4 critic when it applies region adjustments.
//
// These arrived with the critic in a parallel module that re-declared the whole
// LayoutPlan schema. Two transcriptions of one contract is exactly the drift the
// spec exists to prevent, so the schema lives here only and the critic's unique
// helpers were folded in. `PlanRegion`/`PlanPage` are aliases for the canonical
// names so the critic's imports keep reading naturally.
// ---------------------------------------------------------------------------

export const EMPHASIS_MIN = 1;
export const EMPHASIS_MAX = 6;
export const MAX_DISTINCT_EMPHASIS_PER_PAGE = MAX_TYPE_STEPS_PER_PAGE;

export type PlanRegion = LayoutRegion;
export type PlanPage = LayoutPlan['pages'][number];

export function clampCol(span: GridSpan): GridSpan {
  return clampSpan(span, GRID_COLUMNS);
}

export function clampRow(span: GridSpan): GridSpan {
  return clampSpan(span, GRID_ROWS);
}

export function clampEmphasis(value: number): TypeEmphasis {
  return Math.min(Math.max(Math.round(value), EMPHASIS_MIN), EMPHASIS_MAX) as TypeEmphasis;
}
