/**
 * Stage 3 of the composition pipeline — pure, deterministic, no AI.
 * See docs/18-design-system-and-pipeline.md §4.
 *
 * `LayoutPlan` → `InternalDesignDocument`: grid cells become geometry, emphasis
 * steps become font sizes, colour names become brand tokens, and one signature
 * move is executed precisely. Everything lands on the 8px baseline.
 *
 * The contract this module owes the rest of the pipeline is absolute:
 * `validateDesignDocument(composeFromPlan(plan, ctx))` returns zero errors for
 * every plan that parses as a `LayoutPlan`. That is why the guarantees in the
 * spec are mechanical rather than requested politely — nothing here asks a
 * model to be careful, and `autoFixFreeform` should find nothing left to fix.
 *
 * No `Date.now()`, no `Math.random()`: the only variation is hashed out of the
 * plan itself, so the same plan always composes to the same document.
 */
import type {
  BrandTokensSnapshot,
  CanvasSize,
  ChartElement,
  ConceptOutput,
  Element,
  ImageElement,
  InternalDesignDocument,
  LayoutPlan,
  LayoutRegion,
  Page,
  Rect,
  RegionRole,
  RoleHint,
  ShapeElement,
  SignatureMove,
  TextElement,
  TypeEmphasis,
} from '@brandflow/design-schema';
import {
  BASELINE,
  OVERSIZED_NUMERAL_MULTIPLIER,
  COVERAGE_TARGET,
  GRID_COLUMNS,
  GRID_ROWS,
  LayoutPlan as LayoutPlanSchema,
  MIN_FONT_SIZES,
  SCHEMA_VERSION,
  artworkUnder,
  ceilTo8,
  contrastRatio,
  backgroundHexesUnder,
  floorTo8,
  glyphLines,
  gridFrame,
  gridMetrics,
  hashSeed,
  isTextRole,
  lineHeightFor,
  measureText,
  requiredContrastRatio,
  resolveColour,
  snapRectToGrid,
  snapTo8,
  typeSize,
  wrapText,
  coerceHierarchy,
} from '@brandflow/design-schema';
import { icon as iconEl, image as imageEl, shape as shapeEl, token } from './helpers.js';
import type { LayoutContext } from './types.js';

export const COMPOSED_RECIPE_ID = 'composed';
export const COMPOSED_RECIPE_VERSION = 1;

/** Everything the compositor needs that is not in the plan. */
export interface CompositionContext extends LayoutContext {
  canvas: CanvasSize;
  format: string;
  /** Stage 1's output — supplies the copy and the one signature move. */
  concept: ConceptOutput;
}

export interface CompositionResult {
  document: InternalDesignDocument;
  /** Every deterministic coercion applied, for the critic and for debugging. */
  notes: string[];
}

// ---------- role mapping ----------

const ROLE_HINTS: Record<RegionRole, RoleHint> = {
  kicker: 'caption',
  headline: 'headline',
  subhead: 'subheadline',
  body: 'body',
  stat: 'data',
  cta: 'cta',
  image: 'image',
  chart: 'data',
  icon: 'icon',
  block: 'decoration',
};

/** Sparse, even z bands so a decoration can always slot in just below (z-1). */
const Z_BASE: Record<RegionRole, number> = {
  block: 100,
  image: 200,
  chart: 300,
  icon: 400,
  kicker: 500,
  headline: 500,
  subhead: 500,
  body: 500,
  stat: 500,
  cta: 500,
};

const FONT_WEIGHTS: Record<string, number> = {
  kicker: 700,
  headline: 800,
  subhead: 700,
  body: 400,
  stat: 800,
  cta: 700,
};

const ICON_NAMES = [
  'sparkles',
  'target',
  'trending-up',
  'shield',
  'zap',
  'compass',
  'layers',
  'route',
  'gauge',
  'lightbulb',
] as const;

// ---------- placement judgement (docs/19 §2) ----------
//
// The three rules below are the compositor's model of WHAT SITS ON WHAT. Every
// value is a ratio of the canvas, never a pixel count, so they hold on every
// preset.

// P1.1 has no tolerance of its own any more. Whether a run of glyphs is on
// artwork is `artworkUnder`'s question, asked of the validator, and the answer
// is a list of elements rather than a fraction to compare against a threshold.
// Two thresholds for one question is how a compositor and a validator come to
// disagree about the same page.

/** Breathing room between a scrim's edge and the glyphs it protects. */
const SCRIM_PADDING = BASELINE * 2;

/**
 * How far a relocated text region may travel, as a fraction of the canvas
 * diagonal. Beyond this the "free cell" is not *nearby* any more and moving the
 * copy there would break the reading order worse than a scrim breaks the art.
 */
export const MAX_RELOCATION_DISTANCE = 0.5;

/**
 * P1.2 — the most of a bleeding image that may leave the canvas. A bleed is a
 * gesture; past a quarter of the element it is just a crop, and crops eat
 * subjects. Text is not covered by this at all: no glyph may leave the canvas.
 */
export const MAX_IMAGE_BLEED_FRACTION = 0.25;

/**
 * P1.3 — the smallest an image or chart may be and still carry meaning.
 * Below this an illustration renders at icon size and reads as an orphan, so
 * the region is dropped instead. The area floor catches the pointing hand
 * beside a headline; the side floor catches slivers that pass on area alone.
 */
export const MIN_IMAGE_AREA_RATIO = 0.03;
export const MIN_IMAGE_SIDE_RATIO = 0.08;

/**
 * Past this aspect ratio a `cover` crop shows a band through the middle of the
 * artwork rather than its subject — the mechanism that turns an illustration
 * into a lone ground-shadow. Charts are exempt: a wide bar chart is fine.
 */
export const MAX_IMAGE_ASPECT = 5;

/**
 * Queries that name no subject. An illustration search for "shape" or
 * "background" cannot return anything meaningful, so the region is dropped
 * rather than filled with whatever the asset pipeline happens to match.
 */
const SUBJECTLESS_QUERY =
  /^(abstract|backdrop|background|blob|circle|decoration|decorative|ellipse|gradient|graphic|illustration|image|photo|picture|placeholder|rectangle|shadow|shape|square|texture|visual)$/i;

/**
 * The largest (numerically highest) type step a role may use without tripping
 * the validator's `min-font-size` rule. The floor comes from the validator's own
 * table, scaled exactly the way the validator scales it, so the two can never
 * disagree: a 'headline' can never be emitted below 24px at 1080 wide, which
 * rules steps 5 and 6 out for headlines entirely.
 */
export function minTypeStepForRole(role: RegionRole, canvas: CanvasSize): TypeEmphasis {
  const hint = ROLE_HINTS[role];
  const scale = canvas.width / 1080;
  const floor = (MIN_FONT_SIZES[hint] ?? MIN_FONT_SIZES.body ?? 14) * scale;
  let lowest: TypeEmphasis = 1;
  for (const step of [1, 2, 3, 4, 5, 6] as TypeEmphasis[])
    if (typeSize(step, canvas) >= floor) lowest = step;
  return lowest;
}

// ---------- copy resolution ----------

interface CopyItem {
  role: string;
  text: string;
}

/**
 * Resolves a region's copy from the concept.
 *
 * `contentRef` is the 0-based index into THIS page's `copy` array, written as a
 * decimal string — resolution is an index lookup and nothing else. Matching on
 * the copy item's `role` instead would look like it worked and then silently
 * mis-place copy on any page that uses a role twice, which is exactly the class
 * of bug this pipeline exists to eliminate. Two regions may legitimately point
 * at the same index; that is the plan's decision, not an error.
 *
 * A region with no usable ref consumes the next copy item that no indexed
 * reference has claimed, in the concept's own order, so a plan that omits
 * `contentRef` entirely still reads top to bottom.
 */
class CopyPool {
  private claimed = new Set<number>();
  private cursor = 0;

  constructor(
    private readonly items: CopyItem[],
    private readonly fallbacks: Record<string, string>,
  ) {}

  /** Reserve every explicitly indexed item before any positional fallback runs. */
  reserve(regions: readonly LayoutRegion[]): void {
    for (const r of regions) {
      const i = CopyPool.index(r.contentRef);
      if (i !== null && i < this.items.length) this.claimed.add(i);
    }
  }

  private static index(ref: string | undefined): number | null {
    if (ref === undefined || !/^\d+$/.test(ref)) return null;
    const i = Number(ref);
    return Number.isSafeInteger(i) && i >= 0 ? i : null;
  }

  take(region: LayoutRegion): string {
    const indexed = CopyPool.index(region.contentRef);
    if (indexed !== null) {
      const item = this.items[indexed];
      if (item) return item.text;
    }
    while (this.cursor < this.items.length && this.claimed.has(this.cursor)) this.cursor++;
    const next = this.items[this.cursor];
    if (next) {
      this.claimed.add(this.cursor);
      return next.text;
    }
    return this.fallbacks[region.role] ?? this.fallbacks.body ?? region.role;
  }
}

// ---------- plan normalisation ----------

interface PlannedRegion extends LayoutRegion {
  emphasis: TypeEmphasis;
}

/**
 * Stretch the plan's occupied rows to fill the whole grid.
 *
 * This is the fix for the single most common defect in the measured output:
 * 15 of 27 assessed pages used under 75% of the canvas height, leaving an
 * accidental dead band at the bottom that reads as unfinished (docs §1). The
 * remap is monotonic, so no two regions that were disjoint can become
 * overlapping, and spans only ever grow.
 */
function normaliseRows(regions: PlannedRegion[], notes: string[]): PlannedRegion[] {
  const top = Math.min(...regions.map((r) => r.row.start));
  const bottom = Math.max(...regions.map((r) => r.row.start + r.row.span));
  const used = bottom - top;
  if (used <= 0 || (top === 1 && bottom === GRID_ROWS + 1)) return regions;

  const scale = GRID_ROWS / used;
  const map = (t: number) => Math.round(1 + (t - top) * scale);
  const out = regions.map((r) => {
    const start = Math.min(Math.max(map(r.row.start), 1), GRID_ROWS);
    const end = Math.min(Math.max(map(r.row.start + r.row.span), start + 1), GRID_ROWS + 1);
    return { ...r, row: { start, span: end - start } };
  });
  notes.push(
    `coverage: plan occupied rows ${top}-${bottom - 1}; stretched to fill rows 1-${GRID_ROWS}`,
  );
  return out;
}

/**
 * Close internal dead bands until the page reaches the coverage target, by
 * extending the region directly above each gap down into it — largest gap
 * first. Non-text regions are preferred as the thing to grow (a block or an
 * image absorbing space is a design decision; a paragraph growing is just slack).
 */
function absorbGaps(regions: PlannedRegion[], canvas: CanvasSize, notes: string[]): PlannedRegion[] {
  const g = gridMetrics(canvas);
  const neededPx = COVERAGE_TARGET * canvas.height + 2 * BASELINE;
  const requiredRows = Math.min(GRID_ROWS, Math.ceil(neededPx / g.rowHeight));
  const out = regions.map((r) => ({ ...r, row: { ...r.row } }));

  const covered = () => {
    const rows = new Set<number>();
    for (const r of out) for (let i = r.row.start; i < r.row.start + r.row.span; i++) rows.add(i);
    return rows;
  };

  let guard = GRID_ROWS;
  while (covered().size < requiredRows && guard-- > 0) {
    const rows = covered();
    // maximal runs of uncovered rows
    const gaps: { start: number; end: number }[] = [];
    for (let i = 1; i <= GRID_ROWS; i++) {
      if (rows.has(i)) continue;
      const last = gaps[gaps.length - 1];
      if (last && last.end === i - 1) last.end = i;
      else gaps.push({ start: i, end: i });
    }
    if (gaps.length === 0) break;

    gaps.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
    const gap = gaps[0]!;
    const above = out
      .filter((r) => r.row.start + r.row.span === gap.start)
      .sort((a, b) => Number(isTextRole(a.role)) - Number(isTextRole(b.role)) || b.col.span - a.col.span);
    const below = out
      .filter((r) => r.row.start === gap.end + 1)
      .sort((a, b) => Number(isTextRole(a.role)) - Number(isTextRole(b.role)) || b.col.span - a.col.span);
    const target = above[0] ?? below[0];
    if (!target) break;
    if (above[0]) target.row.span += gap.end - gap.start + 1;
    else {
      target.row.start = gap.start;
      target.row.span += gap.end - gap.start + 1;
    }
    notes.push(
      `coverage: absorbed dead band at rows ${gap.start}-${gap.end} into region "${target.id}"`,
    );
  }
  return out;
}

// ---------- text ----------

interface FittedText {
  text: string;
  fontSize: number;
  lineHeight: number;
  frame: Rect;
  truncated: boolean;
}

/**
 * Fit copy into its region without ever leaving the type scale.
 *
 * Order, per the spec: step DOWN through the scale first (never below the
 * role's readability floor), then grow the row span, and only as a genuine last
 * resort truncate. `fitFontSize` is not used here because its fixed numeric
 * step walks off the scale; `measureText` — the same measurement authority the
 * validator uses — does the work instead, so the two can never disagree about
 * whether a block of text fits.
 */
function fitText(
  content: string,
  frame: Rect,
  startStep: TypeEmphasis,
  role: RegionRole,
  canvas: CanvasSize,
  letterSpacing: number,
): FittedText {
  const g = gridMetrics(canvas);
  const bounds = {
    top: ceilTo8(g.top),
    bottom: floorTo8(g.bottom),
    left: ceilTo8(g.left),
    right: floorTo8(g.right),
  };
  const floorStep = minTypeStepForRole(role, canvas);
  // A role can never be rendered below its readability floor, so a plan asking
  // for caption-sized headlines is raised to the smallest legal headline step.
  const start = Math.min(startStep, floorStep) as TypeEmphasis;

  // The largest step whose lines fit the frame's HEIGHT, remembered even when
  // they do not fit its width — see below for why that is worth keeping.
  let tallestThatFits: { fontSize: number; lineHeight: number } | null = null;
  for (let step = start; step <= floorStep; step++) {
    const fontSize = typeSize(step as TypeEmphasis, canvas);
    const lineHeight = lineHeightFor(fontSize);
    const m = measureText(content, fontSize, lineHeight, frame.width, letterSpacing);
    if (m.height > frame.height) continue;
    if (m.widestLine <= frame.width)
      return { text: content, fontSize, lineHeight, frame, truncated: false };
    tallestThatFits ??= { fontSize, lineHeight };
  }

  const { fontSize, lineHeight } = tallestThatFits ?? {
    fontSize: typeSize(floorStep, canvas),
    lineHeight: lineHeightFor(typeSize(floorStep, canvas)),
  };

  // WIDTH BEFORE HEIGHT, and this is the half that was missing.
  //
  // `wrapText` cannot break a word. A cell narrower than one word does not clip
  // that word — it lays it straight out of the frame and across whatever
  // happens to be beside it, and every downstream judgement is then wrong: a
  // scrim sized to the frame does not cover the ink, `ensureLegibleText`
  // measures a background the glyphs never touch, and the page ships with a
  // headline running over a colour block at 1.00:1. Stepping the type down does
  // not fix it either, because the word is still one word: at the readability
  // floor a headline in a one-column cell overflows just as far.
  //
  // So the frame is widened to hold its longest line, bounded by the grid.
  // Widening cannot make the wrap worse — a wider frame only ever fits more
  // words per line — and it makes the geometry honest about where the ink is,
  // which is what lets the occlusion and contrast passes do their jobs.
  let sized = frame;
  for (let pass = 0; pass < 3; pass++) {
    const m = measureText(content, fontSize, lineHeight, sized.width, letterSpacing);
    if (m.widestLine <= sized.width) break;
    const width = Math.min(ceilTo8(m.widestLine + 1), bounds.right - bounds.left);
    if (width <= sized.width) break; // already as wide as the grid allows
    sized = { ...sized, x: Math.min(Math.max(sized.x, bounds.left), bounds.right - width), width };
  }

  const needed = ceilTo8(measureText(content, fontSize, lineHeight, sized.width, letterSpacing).height + 1);
  const maxHeight = bounds.bottom - bounds.top;
  const height = Math.min(Math.max(needed, sized.height), maxHeight);
  const y = Math.min(sized.y, Math.max(bounds.top, bounds.bottom - height));
  const grown = { ...sized, y, height };

  const m = measureText(content, fontSize, lineHeight, grown.width, letterSpacing);
  if (m.height <= grown.height) return { text: content, fontSize, lineHeight, frame: grown, truncated: false };

  return {
    text: truncateToHeight(content, fontSize, lineHeight, grown.width, grown.height, letterSpacing),
    fontSize,
    lineHeight,
    frame: grown,
    truncated: true,
  };
}

/** Deterministic ellipsis truncation — the only path that ever drops copy. */
function truncateToHeight(
  content: string,
  fontSize: number,
  lineHeight: number,
  width: number,
  height: number,
  letterSpacing: number,
): string {
  const lines = wrapText(content, fontSize, width, letterSpacing);
  let keep = Math.max(1, Math.floor(height / (fontSize * lineHeight)));
  while (keep > 1) {
    const candidate = `${lines.slice(0, keep).join('\n').replace(/[\s.,;:]+$/, '')}…`;
    if (measureText(candidate, fontSize, lineHeight, width, letterSpacing).height <= height) return candidate;
    keep--;
  }
  const first = lines[0] ?? content;
  return `${first.slice(0, Math.max(1, Math.floor(first.length * 0.8)))}…`;
}

function textElement(
  ctx: CompositionContext,
  region: PlannedRegion,
  content: string,
  frame: Rect,
  z: number,
): TextElement {
  const role = region.role;
  const letterSpacing = role === 'kicker' ? 2 : 0;
  const fitted = fitText(content, frame, region.emphasis, role, ctx.canvas, letterSpacing);
  const heading = ctx.brandTokens.fonts.heading;
  const body = ctx.brandTokens.fonts.body;
  const usesHeading = role === 'headline' || role === 'stat' || role === 'subhead' || role === 'kicker';
  return {
    type: 'text',
    id: ctx.newId(),
    name: `${role}:${region.id}`.slice(0, 120),
    frame: { ...fitted.frame, rotation: 0 },
    opacity: 1,
    locked: false,
    visible: true,
    zIndex: z,
    roleHint: ROLE_HINTS[role],
    tokenRefs: [{ category: 'font', token: usesHeading ? 'heading' : 'body' }],
    recipeSlotId: region.id,
    meta: fitted.truncated ? { regionId: region.id, truncated: true } : { regionId: region.id },
    text: fitted.text,
    fontFamily: usesHeading ? heading : body,
    fontSize: fitted.fontSize,
    fontWeight: FONT_WEIGHTS[role] ?? 400,
    fontStyle: 'normal',
    lineHeight: fitted.lineHeight,
    letterSpacing,
    align: region.align ?? 'left',
    verticalAlign: role === 'body' || role === 'cta' ? 'top' : 'middle',
    colour: region.colour ? token(region.colour) : token('text'),
    autoFit: false,
  };
}

// ---------- charts ----------

/** Pull `label 42, other 18` / `label: 42` pairs out of copy; else seed a series. */
function chartData(content: string, seed: number): { label: string; value: number }[] {
  const pairs = [...content.matchAll(/([\p{L}\p{N} %&/'-]{1,40}?)\s*[:=]?\s*(-?\d+(?:\.\d+)?)\s*%?/gu)]
    .map((m) => ({ label: m[1]!.trim().slice(0, 60), value: Number(m[2]) }))
    .filter((d) => d.label.length > 0 && Number.isFinite(d.value))
    .slice(0, 6);
  if (pairs.length >= 2) return pairs;
  const n = 4;
  return Array.from({ length: n }, (_, i) => ({
    label: `Q${i + 1}`,
    // deterministic, plan-seeded, monotonically encouraging
    value: 20 + ((seed >>> (i * 5)) % 60) + i * 8,
  }));
}

// ---------- composition ----------

export function composeFromPlan(plan: LayoutPlan, ctx: CompositionContext): InternalDesignDocument {
  return composeFromPlanVerbose(plan, ctx).document;
}

/** Same composition, with the record of every coercion the plan needed. */
export function composeFromPlanVerbose(plan: LayoutPlan, ctx: CompositionContext): CompositionResult {
  const parsed = LayoutPlanSchema.parse(plan);
  const canvas = ctx.canvas;
  const notes: string[] = [];

  const pages: Page[] = parsed.pages.map((planPage, pageIndex) =>
    composePage(planPage, pageIndex, ctx, notes),
  );

  const document: InternalDesignDocument = {
    id: ctx.documentId,
    schemaVersion: SCHEMA_VERSION,
    version: 1,
    brandProfileId: ctx.brandProfileId,
    clientCompanyId: ctx.clientCompanyId,
    layoutRecipeRef: {
      recipeId: COMPOSED_RECIPE_ID,
      recipeVersion: COMPOSED_RECIPE_VERSION,
      variant: ctx.variant || ctx.concept.signatureMove,
    },
    format: ctx.format,
    canvas: { width: canvas.width, height: canvas.height, unit: 'px', dpi: 96 },
    brandTokens: ctx.brandTokens,
    pages,
  };

  settleArtworkAndLegibility(document, parsed, ctx, notes);
  return { document, notes };
}

/**
 * Settle "what colour is this text" and "is this text on artwork" together, on
 * the finished document.
 *
 * They cannot be settled apart, and finding that out cost a round of
 * integration failures. `artworkUnder` judges a text element against the colour
 * it is currently wearing; `ensureLegibleText` chooses that colour from what is
 * currently behind it. Composing a page answered the artwork question first and
 * the colour question afterwards, at document level — so every recolour left
 * the artwork answer stale, and a page could finish composition clean and still
 * validate as text on artwork the compositor had already looked at.
 *
 * Two rounds settle it, and the second is almost always a no-op: a scrim is an
 * opaque brand-token panel, so once one is laid the colour question has a real
 * backdrop to answer against and stops moving. Relocation is deliberately NOT
 * available here — moving copy this late would invalidate the coverage work
 * that has already been done — so this pass can only ever add a panel, which is
 * a change no later round can undo.
 *
 * Both questions are put to the validator's own exported functions, against the
 * real document rather than a stand-in. There is no second opinion left in this
 * module about either one.
 */
function settleArtworkAndLegibility(
  document: InternalDesignDocument,
  parsed: LayoutPlan,
  ctx: CompositionContext,
  notes: string[],
): void {
  for (let round = 0; round < 2; round++) {
    // Legibility is decided against the finished page, exactly as the validator
    // sees it, so a text element sitting on a signature colour block is judged
    // against that block and not against the page background.
    for (const page of document.pages) ensureLegibleText(document, page, ctx, notes);

    let changed = false;
    document.pages.forEach((page, i) => {
      const planPage = parsed.pages[Math.min(i, parsed.pages.length - 1)]!;
      const onArtwork = (el: TextElement) => artworkUnder(el, document, page, page.elements);
      if (resolveOcclusions(ctx, page.elements, planPage, notes, i, false, onArtwork)) changed = true;
    });
    if (!changed) return;
  }
}

function composePage(
  planPage: LayoutPlan['pages'][number],
  pageIndex: number,
  ctx: CompositionContext,
  notes: string[],
): Page {
  const canvas = ctx.canvas;
  const g = gridMetrics(canvas);
  const conceptPage = ctx.concept.pages[Math.min(pageIndex, ctx.concept.pages.length - 1)];
  const seed = hashSeed(`${pageIndex}:${planPage.regions.map((r) => r.id).join(',')}`);

  // --- 1. hierarchy coercion (never throws; always converges) ---
  // The role floor is applied first so the hierarchy rule reasons about the
  // steps that will actually be emitted, not the ones the plan wished for.
  const floored = planPage.regions.map((r) => ({
    ...r,
    emphasis: isTextRole(r.role)
      ? (Math.min(r.emphasis, minTypeStepForRole(r.role, canvas)) as TypeEmphasis)
      : r.emphasis,
  }));
  const coerced = coerceHierarchy(floored);
  for (const note of coerced.notes) notes.push(`page ${pageIndex + 1} ${note}`);
  let regions: PlannedRegion[] = floored.map((r) => ({
    ...r,
    emphasis: coerced.emphasis.get(r.id) ?? r.emphasis,
  }));

  // --- 2. fill the page, then throw out what cannot carry meaning ---
  // The footprint test runs on NORMALISED cells, because a region the plan drew
  // small may have been stretched into a real one by the step above; and the
  // gaps are absorbed a second time so a dropped orphan does not leave a hole.
  const pageNotes: string[] = [];
  regions = normaliseRows(regions, pageNotes);
  regions = absorbGaps(regions, canvas, pageNotes);
  for (const note of pageNotes) notes.push(`page ${pageIndex + 1} ${note}`);
  const viable = dropUnviableRegions(regions, canvas, notes, pageIndex);
  if (viable.length !== regions.length) {
    const closing: string[] = [];
    regions = absorbGaps(viable, canvas, closing);
    for (const note of closing) notes.push(`page ${pageIndex + 1} ${note}`);
  }

  // --- 3. resolve regions to elements ---
  const pool = new CopyPool(conceptPage?.copy ?? [], {
    headline: ctx.concept.bigIdea,
    subhead: ctx.concept.bigIdea,
    stat: ctx.concept.focalPoint,
    cta: ctx.concept.focalPoint,
    kicker: ctx.concept.register,
    body: ctx.concept.metaphor,
  });
  pool.reserve(regions);

  const built = new Map<string, { region: PlannedRegion; frame: Rect; elements: Element[] }>();
  const elements: Element[] = [];

  regions.forEach((region, i) => {
    const frame = gridFrame(canvas, region.col, region.row);
    const z = Z_BASE[region.role] + i * 2;
    const made = buildRegion(ctx, region, frame, z, pool, seed + i);
    built.set(region.id, { region, frame, elements: made });
    elements.push(...made);
  });

  // --- 4. the one signature move ---
  const signature =
    built.get(planPage.signatureRegionId) ?? built.get(regions[0]!.id)!;
  const extra = applySignatureMove(ctx, ctx.concept.signatureMove, signature, built, planPage, notes, pageIndex);
  elements.push(...extra);

  // --- 5. final coverage backstop ---
  // Row normalisation works on the plan; a signature move works on the finished
  // geometry and can re-open a dead band (an oversized numeral vacating its
  // cell is the usual culprit), so coverage is settled last, on real pixels.
  closeCoverageGaps(elements, canvas, notes, pageIndex);

  // --- 6. placement judgement, on finished geometry (docs/19 §2) ---
  // Nothing before this point knows what sits on what: the plan describes cells
  // and the signature move rewrites them. Both defects it fixes are only
  // visible once every rectangle is final, so both are settled here.
  //
  // Relocation can vacate rows, so coverage is re-settled after it; growing an
  // element can in turn slide type back onto artwork, so a second, scrim-only
  // pass closes the loop. A scrim cannot re-open either question — it is a
  // known-luminance panel above the artwork and below its own text — so two
  // passes terminate by construction.
  // Glyph safety first, and it applies to the signature region like everything
  // else — that is precisely where it was being violated. Occlusion resolution
  // afterwards can only move copy onto grid cells, tighten a frame or lay a
  // panel, so nothing below can push a glyph back off the canvas.
  // This pass exists to MOVE copy, which is why it lives here: relocation
  // vacates rows and coverage has to be settled again afterwards. It is not the
  // last word on whether the page has text on artwork — it cannot be, because
  // that answer depends on colours `ensureLegibleText` has not chosen yet. See
  // `settleArtworkAndLegibility`, which is.
  keepGlyphsOnCanvas(elements, canvas, notes, pageIndex);
  const probe = artworkProbe(ctx, planPage, elements);
  if (resolveOcclusions(ctx, elements, planPage, notes, pageIndex, true, probe))
    closeCoverageGaps(elements, canvas, notes, pageIndex);
  // Relocation and growth are the only things that can put a glyph back over an
  // edge, and both have run.
  keepGlyphsOnCanvas(elements, canvas, notes, pageIndex);

  // --- 7. a page of nothing but images is not an editable design ---
  if (!elements.some((el) => el.type !== 'image')) {
    elements.push(
      shapeEl(
        ctx,
        'rect',
        snapRectToGrid({ x: g.left, y: g.bottom - 24, width: g.contentWidth, height: 16 }, canvas),
        { fill: token('accent'), z: 900, role: 'divider' },
      ),
    );
    notes.push(`page ${pageIndex + 1} raster-only: added an accent rule to keep the page editable`);
  }

  return {
    id: ctx.newId(),
    name: (conceptPage?.purpose ?? `Page ${pageIndex + 1}`).slice(0, 120),
    background: token(planPage.background),
    safeArea: {
      top: g.safeMarginY,
      right: g.safeMarginX,
      bottom: g.safeMarginY,
      left: g.safeMarginX,
    },
    elements,
  };
}

function buildRegion(
  ctx: CompositionContext,
  region: PlannedRegion,
  frame: Rect,
  z: number,
  pool: CopyPool,
  seed: number,
): Element[] {
  switch (region.role) {
    case 'image': {
      const el = imageEl(ctx, frame, { z, role: 'image', slotId: region.id });
      const query = region.imageQuery ?? ctx.concept.metaphor;
      el.name = query.slice(0, 120);
      el.meta = { regionId: region.id, query };
      el.cornerRadius = snapTo8(Math.min(frame.width, frame.height) * 0.06);
      return [el];
    }
    case 'icon': {
      const named = region.imageQuery?.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
      const name = named && named.length > 1 ? named : ICON_NAMES[seed % ICON_NAMES.length]!;
      // icons read as squares; keep the glyph square inside its cell
      const side = Math.max(BASELINE * 4, snapTo8(Math.min(frame.width, frame.height)));
      const el = iconEl(ctx, name, { ...frame, width: side, height: side }, { z, slotId: region.id });
      if (region.colour) el.colour = token(region.colour);
      el.meta = { regionId: region.id };
      return [el];
    }
    case 'block': {
      const el = shapeEl(ctx, 'rect', frame, {
        fill: token(region.colour ?? 'primary'),
        z,
        role: 'decoration',
        slotId: region.id,
      });
      el.cornerRadius = snapTo8(Math.min(frame.width, frame.height) * 0.04);
      el.meta = { regionId: region.id };
      return [el];
    }
    case 'chart': {
      const content = pool.take(region);
      const el: ChartElement = {
        type: 'chart',
        id: ctx.newId(),
        name: `chart:${region.id}`.slice(0, 120),
        frame: { ...frame, rotation: 0 },
        opacity: 1,
        locked: false,
        visible: true,
        zIndex: z,
        roleHint: 'data',
        tokenRefs: [{ category: 'colour', token: region.colour ?? 'primary' }],
        recipeSlotId: region.id,
        meta: { regionId: region.id },
        chartType: frame.width > frame.height * 1.4 ? 'bar' : 'progress',
        data: chartData(content, seed),
        palette: [
          { category: 'colour', token: region.colour ?? 'primary' },
          { category: 'colour', token: 'accent' },
        ],
      };
      return [el];
    }
    default:
      return [textElement(ctx, region, pool.take(region), frame, z)];
  }
}

// ---------- signature moves (docs §5) ----------

type Built = { region: PlannedRegion; frame: Rect; elements: Element[] };

function applySignatureMove(
  ctx: CompositionContext,
  move: ConceptOutput['signatureMove'],
  signature: Built,
  built: Map<string, Built>,
  planPage: LayoutPlan['pages'][number],
  notes: string[],
  pageIndex: number,
): Element[] {
  const canvas = ctx.canvas;
  const g = gridMetrics(canvas);
  const note = (what: string) => notes.push(`page ${pageIndex + 1} signature: ${move} — ${what}`);

  switch (move) {
    case 'bleed-edge': {
      const edge = nearestEdge(signature.region, signature.frame, canvas);
      const bleed = bleedRect(signature.frame, edge, canvas);
      const primary = signature.elements[0]!;
      if (primary.type === 'image' || primary.type === 'shape') {
        // One axis, capped: an image that hangs off two edges is being cropped
        // from the corner, and the subject is the first thing a corner eats.
        const safe = primary.type === 'image' ? capImageBleed(bleed, canvas, false) : bleed;
        primary.frame = { ...safe, rotation: 0 };
        primary.roleHint = 'decoration';
        note(`extended "${signature.region.id}" to the ${edge} canvas edge`);
        return [];
      }
      // text and charts stay put; a colour block runs off-canvas behind them
      const block = shapeEl(ctx, 'rect', pad(bleed, g.gutter, canvas, edge), {
        fill: token(blockFill(planPage.background, signature.region.colour)),
        z: Math.max(1, (primary.zIndex ?? 100) - 1),
        role: 'background',
      });
      note(`ran a colour block off the ${edge} edge behind "${signature.region.id}"`);
      return [block];
    }

    case 'oversized-numeral': {
      const stat =
        ([...built.values()].find((b) => b.region.role === 'stat' && b.region.id === signature.region.id) ??
          [...built.values()].find((b) => b.region.role === 'stat') ??
          signature);
      const el = stat.elements.find((e): e is TextElement => e.type === 'text');
      if (!el) {
        note('no text region to oversize; move skipped');
        return [];
      }
      const size = typeSize(1, canvas) * OVERSIZED_NUMERAL_MULTIPLIER;
      const lineHeight = lineHeightFor(size);
      const source = el.text.replace(/\s+/g, ' ').trim() || el.text;
      const fitsOversized = (s: string) =>
        measureText(s, size, lineHeight, Number.MAX_SAFE_INTEGER).widestLine + size * 0.5 <=
        canvas.width;
      // The statistic, not the first six characters of the sentence around it.
      // "82% of contracts hide it" is the copy; "82%" is the move.
      const core = numeralCore(source);
      const first = core && fitsOversized(core) ? core : fitsOversized(source) ? source : null;

      // There is no number here. An art director calling a phrase a `stat` is
      // common, and the old code answered it by slicing six characters off the
      // front — which is how "Slow down" rendered as "Slow d" and "10 days" as
      // "10 day", with nothing anywhere to say the copy had been mutilated.
      // Copy is never cut to make a gesture: the type stays exactly as written
      // at its planned size, and the counter block bleeds in its place.
      if (first === null) {
        const side: Edge = el.frame.x + el.frame.width / 2 < canvas.width / 2 ? 'left' : 'right';
        const block = shapeEl(ctx, 'rect', counterRect(el.frame, side, canvas), {
          fill: token(blockFill(planPage.background, signature.region.colour)),
          z: layerDirectlyUnder(el, [...built.values()].flatMap((b) => b.elements)),
          role: 'background',
        });
        block.name = `counter:${stat.region.id}`.slice(0, 120);
        note(
          `"${source}" holds no numeral that survives ${size}px; copy left whole at ${el.fontSize}px and its counter block bled off the ${side} edge instead`,
        );
        return [block];
      }
      const m = measureText(first, size, lineHeight, Number.MAX_SAFE_INTEGER);
      // widen until the numeral is unambiguously one line — the whole move is
      // one enormous glyph run, and a wrap would turn it into an overflow error
      let width = ceilTo8(m.widestLine + size * 0.5);
      while (
        measureText(first, size, lineHeight, width).lines > 1 &&
        width < canvas.width * 2
      )
        width += BASELINE;
      width = Math.min(width, floorTo8(canvas.width));
      const height = ceilTo8(measureText(first, size, lineHeight, width).height + BASELINE);
      // Lean against whichever side the region already leans towards — but the
      // DIGITS stay on the canvas. This move used to push 14% of the glyph run
      // off the edge, which is how "82%" rendered as "32%": the whole reason
      // the post existed, destroyed to make a gesture. The gesture is kept by
      // running a backdrop off the edge behind the numeral instead, which is
      // the half of the composition that carries no meaning to lose.
      const leansLeft = stat.frame.x + stat.frame.width / 2 < canvas.width / 2;
      const x = leansLeft ? 0 : floorTo8(canvas.width - width);
      const y = Math.min(Math.max(snapTo8(stat.frame.y), 0), floorTo8(canvas.height - height));
      el.text = first;
      el.fontSize = size;
      el.lineHeight = lineHeight;
      el.letterSpacing = 0;
      el.frame = { x, y, width, height, rotation: 0 };
      el.roleHint = 'decoration';
      el.align = leansLeft ? 'left' : 'right';
      el.verticalAlign = 'middle';
      // Anything that shortens copy says so. A page that still validates, still
      // looks composed and quietly says something else is the worst outcome
      // available, so the flag downstream already reads is set here too.
      const shortened = first !== source;
      el.meta = shortened
        ? { ...el.meta, oversized: true, truncated: true }
        : { ...el.meta, oversized: true };

      const bleedSide: Edge = leansLeft ? 'left' : 'right';
      const backdrop = shapeEl(ctx, 'rect', counterRect(el.frame, bleedSide, canvas), {
        fill: token(blockFill(planPage.background, signature.region.colour)),
        z: layerDirectlyUnder(el, [...built.values()].flatMap((b) => b.elements)),
        role: 'background',
      });
      backdrop.name = `counter:${stat.region.id}`.slice(0, 120);
      note(
        `"${first}" set at ${size}px against the ${bleedSide} edge, every glyph on canvas; its counter block bleeds off that edge instead${shortened ? `; copy shortened from "${source}" and flagged truncated` : ''}`,
      );
      return [backdrop];
    }

    case 'overlap': {
      const neighbour = nearestNeighbour(signature, built);
      const primary = signature.elements[0]!;
      if (!neighbour) {
        note('no adjacent region to overlap; move skipped');
        return [];
      }
      const grown = growTowards(signature.frame, neighbour.frame, g.gutter, canvas);
      for (const el of signature.elements) {
        el.frame = { ...grown, rotation: 0 };
        el.zIndex = Math.max(el.zIndex, neighbour.elements[0]!.zIndex + 1);
      }
      if (primary.type === 'text') refit(primary, signature.region, ctx);
      note(`"${signature.region.id}" overlaps "${neighbour.region.id}" by one gutter`);
      return [];
    }

    case 'full-bleed-block': {
      // the band must fully contain any text that sits on it, otherwise the
      // validator would judge that text against the page background instead
      let topY = signature.frame.y;
      let bottomY = signature.frame.y + signature.frame.height;
      for (const b of built.values()) {
        if (!b.elements.some((e) => e.type === 'text')) continue;
        const f = b.frame;
        if (f.y + f.height <= topY || f.y >= bottomY) continue;
        topY = Math.min(topY, f.y);
        bottomY = Math.max(bottomY, f.y + f.height);
      }
      const y = Math.max(0, floorTo8(topY - g.gutter));
      const height = Math.min(canvas.height - y, ceilTo8(bottomY - y + g.gutter));
      const block = shapeEl(ctx, 'rect', { x: 0, y, width: canvas.width, height }, {
        fill: token(blockFill(planPage.background, signature.region.colour)),
        z: 4,
        role: 'background',
      });
      note(`colour band across the full canvas width behind "${signature.region.id}"`);
      return [block];
    }

    case 'crop-circle': {
      const target =
        [...built.values()].find((b) => b.region.id === signature.region.id && b.region.role === 'image') ??
        [...built.values()].find((b) => b.region.role === 'image');
      if (target) {
        const img = target.elements[0] as ImageElement;
        const side = ceilTo8(Math.max(target.frame.width, target.frame.height) + g.colWidth);
        const cx = target.frame.x + target.frame.width / 2;
        const cy = target.frame.y + target.frame.height / 2;
        // The circle may exceed its column span — that is the move — but only a
        // capped share of it may leave the canvas, or the subject inside the
        // mask is cropped away by the edge as well as by the mask.
        const circle = capImageBleed(
          { x: cx - side / 2, y: cy - side / 2, width: side, height: side },
          canvas,
          true,
        );
        img.frame = { ...circle, rotation: 0 };
        img.cornerRadius = circle.width / 2;
        img.roleHint = 'decoration';
        note(`image "${target.region.id}" masked to a ${circle.width}px circle beyond its column span`);
        return [];
      }
      // no image on the page — an accent disc behind the signature region reads
      // as the same move and keeps every page's signature honest
      const side = ceilTo8(Math.max(signature.frame.width, signature.frame.height) + g.colWidth);
      const disc = shapeEl(
        ctx,
        'ellipse',
        {
          x: snapTo8(signature.frame.x + signature.frame.width / 2 - side / 2),
          y: snapTo8(signature.frame.y + signature.frame.height / 2 - side / 2),
          width: side,
          height: side,
        },
        { fill: token(blockFill(planPage.background, signature.region.colour)), z: 6, role: 'background' },
      );
      note(`accent disc behind "${signature.region.id}" (no image region on this page)`);
      return [disc];
    }

    case 'rule-accent': {
      const headline =
        [...built.values()].find((b) => b.region.role === 'headline') ??
        [...built.values()].find((b) => isTextRole(b.region.role)) ??
        signature;
      const el = headline.elements.find((e): e is TextElement => e.type === 'text');
      const anchor = el?.frame ?? headline.frame;
      const width = Math.max(BASELINE * 4, snapTo8(Math.min(anchor.width * 0.4, 320 * (canvas.width / 1080))));
      const height = 16;
      // A heavy rule painted over a line of body copy is a strike-through, and
      // the copy loses. So the anchor point is a preference, not a command:
      // take the first slot near the headline that no run of glyphs occupies.
      const y = clearRuleY(anchor, { width, height }, built, g, canvas);
      const rule = shapeEl(
        ctx,
        'rect',
        snapRectToGrid({ x: anchor.x, y, width, height }, canvas),
        { fill: token(ruleFill(planPage.background)), z: 800, role: 'divider' },
      );
      note(`heavy accent rule anchored to "${headline.region.id}"`);
      return [rule];
    }
  }
}

/**
 * A colour for a compositor-drawn backdrop: never the page background it sits
 * on, and never the colour of the text it is drawn behind.
 *
 * The second half was missing, and worse, the region's colour was passed in as
 * a PREFERENCE — which is exactly backwards for a panel that goes behind that
 * region's own type. `textElement` gives a text region its `colour`, so handing
 * the same token to the block beneath it guaranteed a counter block at 1.00:1
 * under its own numeral on any page whose art direction named a colour at all.
 *
 * `settleArtworkAndLegibility` would now catch it either way. This is still
 * worth fixing here: a backdrop born legible keeps the colour the art director
 * chose for the type, instead of spending it to repair the block behind it.
 */
function blockFill(background: string, avoid?: string): string {
  const order = ['primary', 'accent', 'secondary', 'neutral', 'text', 'background'];
  return order.find((c) => c !== background && c !== avoid) ?? 'primary';
}

function ruleFill(background: string): string {
  return background === 'accent' ? 'primary' : 'accent';
}

/**
 * A baseline for the accent rule that no type is already sitting on.
 *
 * Preference order is the design intent — one gutter under the headline, then
 * one gutter above it — and after that the nearest clear baseline walking down
 * the page, then up. The rule sits ABOVE everything in the stack, so unlike a
 * scrim it cannot be argued with once painted: the only fix is not to paint it
 * across a word. If the page is genuinely full, it goes where it was asked to
 * go, because a page with no signature move at all is the worse outcome.
 */
function clearRuleY(
  anchor: Rect,
  rule: { width: number; height: number },
  built: Map<string, Built>,
  g: ReturnType<typeof gridMetrics>,
  canvas: CanvasSize,
): number {
  const glyphRuns = [...built.values()]
    .flatMap((b) => b.elements)
    .filter((e): e is TextElement => e.type === 'text' && e.visible)
    .map((e) => glyphBox(e));
  const hits = (y: number) =>
    glyphRuns.some(
      (t) =>
        anchor.x < t.x + t.width &&
        anchor.x + rule.width > t.x &&
        y < t.y + t.height &&
        y + rule.height > t.y,
    );

  const below = snapTo8(anchor.y + anchor.height + g.gutter);
  const above = snapTo8(anchor.y - g.gutter - rule.height);
  const top = ceilTo8(g.top);
  const bottom = floorTo8(g.bottom) - rule.height;
  const legal = (y: number) => y >= top && y <= bottom;

  for (const y of [below, above]) if (legal(y) && !hits(y)) return y;
  for (let y = below; y <= bottom; y += BASELINE) if (!hits(y)) return y;
  for (let y = above; y >= top; y -= BASELINE) if (!hits(y)) return y;
  return legal(below) ? below : above;
}

/**
 * The statistic inside a line of copy — a number with its unit, and nothing
 * else. `null` when the copy holds no number at all.
 *
 * `oversized-numeral` is a move about one number, so it takes the number:
 * "82% of contracts hide it" becomes "82%", and "10 days to hire" keeps its
 * unit as "10 days" because "10" alone says something different. The unit is
 * bounded to one short word, so this can only ever return a stat — never a
 * clause, and never a fragment of one. The old blind six-character slice is
 * what turned "Slow down" into "Slow d" at 192px, and returning `null` rather
 * than a guess is what lets the caller degrade instead of mutilate.
 */
function numeralCore(source: string): string | null {
  const stat = source.match(/[£$€]?\d[\d,.]*\s?(?:%|[A-Za-z]{1,6}\b)?/)?.[0]?.trim();
  return stat && stat.length > 0 ? stat : null;
}

/**
 * The block that bleeds in the numeral's place — sized to the glyphs, running
 * off the edge the numeral leans against and one gutter clear of it elsewhere.
 * Nothing on it carries meaning, so nothing is lost when the canvas cuts it.
 */
function counterRect(frame: Rect, edge: Edge, canvas: CanvasSize): Rect {
  const pad = BASELINE * 3;
  const overshoot = BASELINE * 6;
  const top = Math.max(0, floorTo8(frame.y - pad));
  const bottom = Math.min(canvas.height, ceilTo8(frame.y + frame.height + pad));
  const left = edge === 'left' ? -overshoot : Math.max(0, floorTo8(frame.x - pad));
  const right =
    edge === 'right' ? canvas.width + overshoot : Math.min(canvas.width, ceilTo8(frame.x + frame.width + pad));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

type Edge = 'left' | 'right' | 'top' | 'bottom';

function nearestEdge(region: PlannedRegion, frame: Rect, canvas: CanvasSize): Edge {
  if (region.col.start === 1) return 'left';
  if (region.col.start + region.col.span - 1 >= GRID_COLUMNS) return 'right';
  if (region.row.start === 1) return 'top';
  if (region.row.start + region.row.span - 1 >= GRID_ROWS) return 'bottom';
  const d: [Edge, number][] = [
    ['left', frame.x],
    ['right', canvas.width - (frame.x + frame.width)],
    ['top', frame.y],
    ['bottom', canvas.height - (frame.y + frame.height)],
  ];
  return d.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0]![0];
}

function bleedRect(frame: Rect, edge: Edge, canvas: CanvasSize): Rect {
  switch (edge) {
    case 'left':
      return { x: 0, y: frame.y, width: frame.x + frame.width, height: frame.height };
    case 'right':
      return { x: frame.x, y: frame.y, width: canvas.width - frame.x, height: frame.height };
    case 'top':
      return { x: frame.x, y: 0, width: frame.width, height: frame.y + frame.height };
    case 'bottom':
      return { x: frame.x, y: frame.y, width: frame.width, height: canvas.height - frame.y };
  }
}

/** Widen a bleeding block by one gutter on the sides that are not bleeding. */
function pad(rect: Rect, gutter: number, canvas: CanvasSize, edge: Edge): Rect {
  const horizontal = edge === 'left' || edge === 'right';
  const grow = horizontal
    ? { x: rect.x, y: Math.max(0, rect.y - gutter), width: rect.width, height: rect.height + gutter * 2 }
    : { x: Math.max(0, rect.x - gutter), y: rect.y, width: rect.width + gutter * 2, height: rect.height };
  return {
    x: grow.x,
    y: grow.y,
    width: Math.min(grow.width, canvas.width - grow.x),
    height: Math.min(grow.height, canvas.height - grow.y),
  };
}

function nearestNeighbour(signature: Built, built: Map<string, Built>): Built | null {
  const centre = (f: Rect) => ({ x: f.x + f.width / 2, y: f.y + f.height / 2 });
  const c = centre(signature.frame);
  const candidates = [...built.values()]
    .filter((b) => b.region.id !== signature.region.id)
    .filter((b) => b.region.role === 'image' || b.region.role === 'block' || b.region.role === 'chart');
  const pool = candidates.length > 0 ? candidates : [...built.values()].filter((b) => b.region.id !== signature.region.id);
  if (pool.length === 0) return null;
  return pool
    .map((b) => ({ b, d: Math.hypot(centre(b.frame).x - c.x, centre(b.frame).y - c.y) }))
    .sort((a, z) => a.d - z.d || a.b.region.id.localeCompare(z.b.region.id))[0]!.b;
}

/**
 * Extend `frame` so that it overlaps `towards` by exactly one gutter. The two
 * are separated by a gutter to begin with, so closing the gap and then eating
 * one more gutter is what actually produces the overlap the move promises —
 * extending by a single gutter would only make them touch.
 */
function growTowards(frame: Rect, towards: Rect, gutter: number, canvas: CanvasSize): Rect {
  const dx = towards.x + towards.width / 2 - (frame.x + frame.width / 2);
  const dy = towards.y + towards.height / 2 - (frame.y + frame.height / 2);
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const gapX = dx >= 0 ? towards.x - (frame.x + frame.width) : frame.x - (towards.x + towards.width);
  const gapY = dy >= 0 ? towards.y - (frame.y + frame.height) : frame.y - (towards.y + towards.height);
  const reach = snapTo8(Math.max(0, horizontal ? gapX : gapY) + gutter);
  const grown = horizontal
    ? dx >= 0
      ? { ...frame, width: frame.width + reach }
      : { ...frame, x: frame.x - reach, width: frame.width + reach }
    : dy >= 0
      ? { ...frame, height: frame.height + reach }
      : { ...frame, y: frame.y - reach, height: frame.height + reach };
  return snapRectToGrid(grown, canvas);
}

/** Re-run the fit after a signature move changed a text element's frame. */
function refit(el: TextElement, region: PlannedRegion, ctx: CompositionContext): void {
  const fitted = fitText(el.text, el.frame, region.emphasis, region.role, ctx.canvas, el.letterSpacing);
  el.text = fitted.text;
  el.fontSize = fitted.fontSize;
  el.lineHeight = fitted.lineHeight;
  el.frame = { ...fitted.frame, rotation: 0 };
}

// ---------- what sits on what (docs/19 §2) ----------

/**
 * The rectangle the GLYPHS occupy, which is not the rectangle the element
 * occupies. A text frame is a grid cell; the type inside it is usually much
 * narrower and shorter, and every judgement on this page — is it on the
 * artwork, does it cross the canvas edge, how big is its scrim — is a question
 * about the glyphs, not about the cell.
 *
 * Derived from the same `measureText` the validator and the SVG exporter use,
 * and positioned by the same alignment rules the exporter applies, so what this
 * says is on the page is what a reader sees on the page.
 */
/**
 * The rectangle the GLYPHS occupy, which is not the rectangle the element
 * occupies. A text frame is a grid cell; the type inside it is usually much
 * narrower and shorter, and every judgement here — does it cross the canvas
 * edge, how big is its scrim — is a question about the glyphs, not the cell.
 *
 * The line boxes come from `glyphLines`, the shared measurement authority the
 * validator and the SVG exporter both use, so what this says is on the page is
 * what the validator will say is on the page. An earlier version of this
 * function computed the box itself from `measureText` plus the alignment
 * rules; it agreed with the validator right up until the validator learned to
 * measure each line separately, and then it did not.
 */
export function glyphBox(el: TextElement): Rect {
  const lines = glyphLines(el).filter((l) => l.width > 0);
  if (lines.length === 0) return { x: el.frame.x, y: el.frame.y, width: 0, height: 0 };
  const x = Math.min(...lines.map((l) => l.x));
  const y = Math.min(...lines.map((l) => l.y));
  const right = Math.max(...lines.map((l) => l.x + l.width));
  const bottom = Math.max(...lines.map((l) => l.y + l.height));
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * A stand-in document and page, so composition can ask the validator its own
 * questions about a page that does not exist yet.
 *
 * `artworkUnder` needs only the brand tokens (to resolve a fill to a hex) and
 * the page background (to composite what shows through). Building those two
 * here is what lets stage 3 use the validator's answer instead of a second
 * opinion — and a second opinion is exactly what this module used to hold, with
 * its own sampler, its own point-in-shape test and its own tolerance. It agreed
 * with the validator until it didn't, and the disagreement shipped as text on
 * artwork that neither side flagged.
 */
function artworkProbe(
  ctx: CompositionContext,
  planPage: LayoutPlan['pages'][number],
  elements: readonly Element[],
): (el: TextElement) => Element[] {
  const doc = { brandTokens: ctx.brandTokens } as unknown as InternalDesignDocument;
  const page = { background: token(planPage.background), elements } as unknown as Page;
  return (el) => artworkUnder(el, doc, page, elements as Element[]);
}

/**
 * Shrink a text frame horizontally onto its own glyphs.
 *
 * Two things depend on this. A scrim "sized to the text" needs a text whose
 * frame IS its text — otherwise the panel is a grid cell wide and reads as a
 * slab. And the validator samples for contrast at fixed fractions of the
 * FRAME, so a scrim drawn around the glyphs of a frame three times their width
 * would be sampled off its own edge and judged against the page instead.
 *
 * It matters how much: a headline's cell is most of a column and three lines of
 * type are not, so an untightened scrim covers roughly twice the artwork it
 * needs to. On the QA funnel page that was the difference between a card
 * sitting on the illustration and the illustration being erased.
 *
 * Setting the width to the widest line cannot re-wrap the text — every line
 * already fits inside it — but the result is verified against `measureText`
 * regardless and abandoned if the wrap moves at all. Height only ever shrinks
 * to what the lines occupy, so `text-overflow` cannot start failing either.
 * Coverage is settled again afterwards, on the tightened geometry.
 */
function tightenToGlyphs(el: TextElement): boolean {
  const before = measureText(el.text, el.fontSize, el.lineHeight, el.frame.width, el.letterSpacing);
  const width = Math.min(el.frame.width, ceilTo8(before.widestLine + 1));
  const after = measureText(el.text, el.fontSize, el.lineHeight, width, el.letterSpacing);
  if (after.lines !== before.lines) return false;
  const height = Math.min(el.frame.height, ceilTo8(after.height + 1));
  if (width >= el.frame.width && height >= el.frame.height) return false;

  const slackX = el.frame.width - width;
  const slackY = el.frame.height - height;
  const rawX =
    el.align === 'center' ? el.frame.x + slackX / 2 : el.align === 'right' ? el.frame.x + slackX : el.frame.x;
  const rawY =
    el.verticalAlign === 'middle'
      ? el.frame.y + slackY / 2
      : el.verticalAlign === 'bottom'
        ? el.frame.y + slackY
        : el.frame.y;
  el.frame = {
    ...el.frame,
    x: Math.min(Math.max(snapTo8(rawX), el.frame.x), el.frame.x + slackX),
    y: Math.min(Math.max(snapTo8(rawY), el.frame.y), el.frame.y + slackY),
    width,
    height,
  };
  return true;
}

/**
 * The brand tokens for a scrim and the text on it.
 *
 * Order matters as design, not just as arithmetic: the calmest panel that
 * clears the threshold wins, so dark type gets a plain background panel rather
 * than the most violently contrasting colour in the kit. A scrim is always a
 * token — never a raw hex — because a raw fill would fail `palette-only` and,
 * worse, would not move when the brand does.
 */
function scrimTokens(
  ctx: CompositionContext,
  el: TextElement,
): { fill: string; text: string; ratio: number } {
  const palette = paletteTokens(ctx.brandTokens);
  const preference = ['background', 'text', 'primary', 'secondary', 'neutral', 'accent'].filter((t) =>
    palette.includes(t),
  );
  const ordered = [...preference, ...palette.filter((t) => !preference.includes(t))];
  const required = requiredContrastRatio(el.fontSize, el.fontWeight);
  const current = el.colour.kind === 'token' ? el.colour.token : null;
  const currentHex = current ? ctx.brandTokens.colours[current] : undefined;

  let best: { fill: string; text: string; ratio: number } | null = null;
  if (current && currentHex) {
    for (const fill of ordered) {
      const hex = ctx.brandTokens.colours[fill];
      if (!hex || fill === current) continue;
      const ratio = contrastRatio(currentHex, hex);
      if (!best || ratio > best.ratio) best = { fill, text: current, ratio };
      if (ratio >= required) return { fill, text: current, ratio };
    }
  }
  // The art director's colour cannot be carried by any panel: take the best
  // pair the brand owns and recolour the type to match its own scrim.
  const pair = bestPair(ctx.brandTokens, ordered);
  if (pair && (!best || pair.ratio > best.ratio)) return { fill: pair.bg, text: pair.fg, ratio: pair.ratio };
  return best ?? { fill: 'background', text: current ?? 'text', ratio: 1 };
}

/**
 * The z-index for a panel that must be seen BEHIND one element and IN FRONT OF
 * everything else beneath it — which is the only position from which a scrim or
 * a chip does anything at all.
 *
 * Sharing a z with another shape under the same text is not a near miss, it is
 * a silent failure: the validator resolves ties by document order, so a chip
 * laid at the same level as a backdrop it was meant to cover is skipped and the
 * text is judged against the backdrop it cannot read on. The element above is
 * raised if there is no room, which costs nothing — it is already the topmost
 * thing in its own stack.
 */
function layerDirectlyUnder(el: Element, elements: readonly Element[], mustCover: readonly Element[] = []): number {
  const below = [...elements, ...mustCover]
    .filter((s) => s.id !== el.id && s.zIndex < el.zIndex)
    .map((s) => s.zIndex);
  const z = Math.max(el.zIndex - 1, ...below.map((n) => n + 1), 1);
  if (z >= el.zIndex) el.zIndex = z + 1;
  return z;
}

/** Lay a brand-token panel behind a run of glyphs, above the artwork it covers. */
function addScrim(
  ctx: CompositionContext,
  elements: Element[],
  el: TextElement,
  occluders: readonly Element[],
): ShapeElement {
  tightenToGlyphs(el);
  const canvas = ctx.canvas;
  // The union of the frame and the glyphs, not just the frame: an unbreakable
  // word longer than its frame renders outside it, and a scrim that stopped at
  // the frame edge would leave exactly that word on the artwork.
  const f = el.frame;
  const gb = glyphBox(el);
  const left = Math.min(f.x, gb.x);
  const top = Math.min(f.y, gb.y);
  const right = Math.max(f.x + f.width, gb.x + gb.width);
  const bottom = Math.max(f.y + f.height, gb.y + gb.height);
  const x = Math.max(0, floorTo8(left - SCRIM_PADDING));
  const y = Math.max(0, floorTo8(top - SCRIM_PADDING));
  const rect: Rect = {
    x,
    y,
    width: Math.min(canvas.width - x, ceilTo8(right + SCRIM_PADDING) - x),
    height: Math.min(canvas.height - y, ceilTo8(bottom + SCRIM_PADDING) - y),
  };

  const chosen = scrimTokens(ctx, el);
  el.colour = token(chosen.text);
  const z = layerDirectlyUnder(el, elements, occluders);

  const scrim = shapeEl(ctx, 'rect', rect, { fill: token(chosen.fill), z, role: 'decoration' });
  scrim.name = `scrim:${el.recipeSlotId ?? el.name}`.slice(0, 120);
  scrim.cornerRadius = snapTo8(Math.min(rect.width, rect.height) * 0.04);
  scrim.meta = { scrimFor: el.id };
  elements.push(scrim);
  return scrim;
}

/**
 * Move a run of copy off the artwork and into free cells.
 *
 * The grid is the vocabulary here as everywhere else: the text lands on whole
 * cells, keeps its type step, and is only accepted if it fits and if the cells
 * it lands on are clear of artwork and of other copy. Candidates are scored by
 * distance, so the copy moves as little as the page allows.
 */
function relocateText(
  el: TextElement,
  ctx: CompositionContext,
  elements: readonly Element[],
): { moved: boolean; distance: number } {
  const canvas = ctx.canvas;
  const g = gridMetrics(canvas);
  const blockers = elements.filter(
    (s) => s.id !== el.id && s.visible && s.roleHint !== 'background' && s.roleHint !== 'divider',
  );

  const cellFree = (col: number, row: number): boolean => {
    const cell = gridFrame(canvas, { start: col, span: 1 }, { start: row, span: 1 });
    const area = cell.width * cell.height;
    for (const b of blockers) {
      const ix = Math.max(0, Math.min(b.frame.x + b.frame.width, cell.x + cell.width) - Math.max(b.frame.x, cell.x));
      const iy = Math.max(0, Math.min(b.frame.y + b.frame.height, cell.y + cell.height) - Math.max(b.frame.y, cell.y));
      if (area > 0 && (ix * iy) / area > 0.2) return false;
    }
    return true;
  };

  const free: boolean[][] = [];
  for (let c = 1; c <= GRID_COLUMNS; c++) {
    const column: boolean[] = [];
    for (let r = 1; r <= GRID_ROWS; r++) column.push(cellFree(c, r));
    free.push(column);
  }

  const cols = Math.min(
    GRID_COLUMNS,
    Math.max(1, Math.ceil((el.frame.width + g.gutter) / (g.colWidth + g.gutter))),
  );
  const rows = Math.min(GRID_ROWS, Math.max(1, Math.ceil(el.frame.height / g.rowHeight)));
  const shapes: [number, number][] = [];
  for (const dr of [0, 1, 2])
    for (const dc of [0, 1, -1]) {
      const c = cols + dc;
      const r = rows + dr;
      if (c >= 1 && c <= GRID_COLUMNS && r >= 1 && r <= GRID_ROWS && !shapes.some(([a, b]) => a === c && b === r))
        shapes.push([c, r]);
    }

  const centre = { x: el.frame.x + el.frame.width / 2, y: el.frame.y + el.frame.height / 2 };
  const limit = MAX_RELOCATION_DISTANCE * Math.hypot(canvas.width, canvas.height);
  let best: { frame: Rect; d: number; key: string } | null = null;

  for (const [cs, rs] of shapes) {
    for (let col = 1; col + cs - 1 <= GRID_COLUMNS; col++) {
      for (let row = 1; row + rs - 1 <= GRID_ROWS; row++) {
        let clear = true;
        for (let c = col; c < col + cs && clear; c++)
          for (let r = row; r < row + rs && clear; r++) if (!free[c - 1]![r - 1]) clear = false;
        if (!clear) continue;

        const frame = gridFrame(canvas, { start: col, span: cs }, { start: row, span: rs });
        const m = measureText(el.text, el.fontSize, el.lineHeight, frame.width, el.letterSpacing);
        // Height AND width: an unbreakable word wider than the cell would hang
        // outside it, back over the artwork this move exists to escape.
        if (m.height > frame.height || m.widestLine > frame.width) continue;
        const d = Math.hypot(frame.x + frame.width / 2 - centre.x, frame.y + frame.height / 2 - centre.y);
        if (d > limit) continue;
        const key = `${row}:${col}:${cs}:${rs}`;
        if (!best || d < best.d || (d === best.d && key < best.key)) best = { frame, d, key };
      }
    }
  }

  if (!best) return { moved: false, distance: 0 };
  el.frame = { ...best.frame, rotation: el.frame.rotation };
  return { moved: true, distance: best.d };
}

/**
 * An overlap is DELIBERATE when it is the page's signature move rather than an
 * accident of art direction. Three of the six moves exist precisely to run one
 * thing over another; when one of those is in play and the signature region is
 * on either side of the collision, the answer is a scrim, because relocating
 * the copy would delete the move. Everything else is an accident, and an
 * accident is moved out of the way if the page has anywhere to put it.
 */
const OVERLAPPING_MOVES = new Set<SignatureMove>(['overlap', 'bleed-edge', 'full-bleed-block']);

function isDeliberateOverlap(
  move: SignatureMove,
  signatureRegionId: string,
  el: TextElement,
  occluders: readonly Element[],
): boolean {
  if (!OVERLAPPING_MOVES.has(move)) return false;
  if (el.recipeSlotId === signatureRegionId) return true;
  return occluders.some((o) => o.recipeSlotId === signatureRegionId);
}

/**
 * P1.1 — no copy renders on artwork unaided.
 *
 * Runs on finished geometry, after the signature move, because a move can
 * create a collision the plan never had. Each run of glyphs is judged against
 * what is actually beneath it; the ones sitting on unknown artwork are either
 * moved to free cells or given a brand-token panel, and the choice is recorded.
 */
function resolveOcclusions(
  ctx: CompositionContext,
  elements: Element[],
  planPage: LayoutPlan['pages'][number],
  notes: string[],
  pageIndex: number,
  allowRelocation: boolean,
  onArtwork: (el: TextElement) => Element[],
): boolean {
  const move = ctx.concept.signatureMove;
  const note = (what: string) => notes.push(`page ${pageIndex + 1} occlusion: ${what}`);
  let changed = false;

  // Ascending z, so a scrim decided for one line is visible to the next.
  const texts = elements
    .filter((e): e is TextElement => e.type === 'text')
    .sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));

  for (const el of texts) {
    const found = onArtwork(el);
    if (found.length === 0) continue;
    const what = `"${el.name}" on ${found.map((o) => `"${o.name}"`).join(', ')}`;

    const deliberate = isDeliberateOverlap(move, planPage.signatureRegionId, el, found);
    if (allowRelocation && !deliberate && el.roleHint !== 'decoration') {
      const before = { ...el.frame };
      const moved = relocateText(el, ctx, elements);
      if (moved.moved && onArtwork(el).length === 0) {
        note(`relocated ${what} to free cells ${Math.round(moved.distance)}px away`);
        changed = true;
        continue;
      }
      if (moved.moved) el.frame = before; // no better off there; scrim where it was planned
    }

    const scrim = addScrim(ctx, elements, el, found);
    const why = deliberate ? `the ${move} signature move` : 'no free cells within reach';
    note(
      `scrimmed ${what} — ${why}; ${(scrim.fill as { token: string }).token} panel at ${scrimTokens(ctx, el).ratio.toFixed(1)}:1`,
    );
    changed = true;
  }
  return changed;
}

/**
 * P1.2 — no glyph crosses the canvas edge.
 *
 * A bleed extends a region past the safe area; it must never truncate meaning,
 * and a digit is the most meaning any mark on the page carries. "82%" bled off
 * the left edge and rendered "32%" — the statistic the post existed for,
 * destroyed silently. Backdrops bleed; type does not.
 */
function keepGlyphsOnCanvas(
  elements: Element[],
  canvas: CanvasSize,
  notes: string[],
  pageIndex: number,
): void {
  for (const el of elements) {
    if (el.type !== 'text') continue;
    const gb = glyphBox(el);
    const dx = gb.x < 0 ? -gb.x : gb.x + gb.width > canvas.width ? canvas.width - (gb.x + gb.width) : 0;
    const dy = gb.y < 0 ? -gb.y : gb.y + gb.height > canvas.height ? canvas.height - (gb.y + gb.height) : 0;
    if (dx === 0 && dy === 0) continue;
    // Snap away from the edge being crossed, so rounding can never re-cross it.
    const x = dx > 0 ? ceilTo8(el.frame.x + dx) : dx < 0 ? floorTo8(el.frame.x + dx) : el.frame.x;
    const y = dy > 0 ? ceilTo8(el.frame.y + dy) : dy < 0 ? floorTo8(el.frame.y + dy) : el.frame.y;
    el.frame = { ...el.frame, x, y };
    notes.push(
      `page ${pageIndex + 1} bleed: pulled "${el.name}" back inside the canvas (${Math.round(dx)},${Math.round(dy)}px) — glyphs never bleed`,
    );
  }
}

/** Fraction of a rect that lies outside the canvas. */
function offCanvasFraction(r: Rect, canvas: CanvasSize): number {
  const ix = Math.max(0, Math.min(r.x + r.width, canvas.width) - Math.max(r.x, 0));
  const iy = Math.max(0, Math.min(r.y + r.height, canvas.height) - Math.max(r.y, 0));
  const area = r.width * r.height;
  return area <= 0 ? 1 : 1 - (ix * iy) / area;
}

/**
 * P1.2 for artwork — bleed on one axis, and only so far.
 *
 * An image that hangs off two edges at once is not bleeding, it is being
 * cropped from the corner, and the subject is the first thing to go. So: cap
 * the hang at `MAX_IMAGE_BLEED_FRACTION` of the element on each axis, keep the
 * axis with the larger gesture, and pull the other one fully inside. If the
 * element is too large to bleed within the cap at all, it shrinks until it can.
 */
function capImageBleed(rect: Rect, canvas: CanvasSize, keepSquare: boolean): Rect {
  const room = 1 - MAX_IMAGE_BLEED_FRACTION;
  const scale = Math.min(1, canvas.width / room / rect.width, canvas.height / room / rect.height);
  let width = Math.max(BASELINE, floorTo8(rect.width * scale));
  let height = Math.max(BASELINE, floorTo8(rect.height * scale));
  if (keepSquare) width = height = Math.min(width, height);
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  let x = snapTo8(cx - width / 2);
  let y = snapTo8(cy - height / 2);

  const hangX = width * MAX_IMAGE_BLEED_FRACTION;
  const hangY = height * MAX_IMAGE_BLEED_FRACTION;
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  x = clamp(x, -hangX, canvas.width - width + hangX);
  y = clamp(y, -hangY, canvas.height - height + hangY);

  // One axis bleeds; the other comes home.
  const outX = Math.max(0, -x, x + width - canvas.width);
  const outY = Math.max(0, -y, y + height - canvas.height);
  if (outX > 0 && outY > 0) {
    if (outX >= outY) y = clamp(y, 0, canvas.height - height);
    else x = clamp(x, 0, canvas.width - width);
  }
  return { x: snapTo8(x), y: snapTo8(y), width, height };
}

/**
 * P1.3 — an image region too small, too thin or too vague to mean anything is
 * dropped rather than rendered.
 *
 * The failures this exists for are all the same failure: something that is not
 * a picture rendered in a picture's place. A pointing hand at icon size beside
 * a headline; a lone grey ellipse that was an illustration's ground shadow; a
 * letterbox strip that shows the middle band of a figure and none of the
 * figure. A page is better without any of them, and the note says so.
 */
function dropUnviableRegions(
  regions: PlannedRegion[],
  canvas: CanvasSize,
  notes: string[],
  pageIndex: number,
): PlannedRegion[] {
  const minSide = MIN_IMAGE_SIDE_RATIO * Math.min(canvas.width, canvas.height);
  const minArea = MIN_IMAGE_AREA_RATIO * canvas.width * canvas.height;
  const note = (what: string) => notes.push(`page ${pageIndex + 1} footprint: ${what}`);

  const kept = regions.filter((r) => {
    if (r.role !== 'image' && r.role !== 'chart') return true;
    const f = gridFrame(canvas, r.col, r.row);
    const area = f.width * f.height;
    if (area < minArea || f.width < minSide || f.height < minSide) {
      note(
        `dropped ${r.role} "${r.id}" — ${Math.round(f.width)}x${Math.round(f.height)}px is below the ${Math.round(minSide)}px / ${(MIN_IMAGE_AREA_RATIO * 100).toFixed(0)}% floor and would render at icon size`,
      );
      return false;
    }
    if (r.role !== 'image') return true;
    const aspect = Math.max(f.width / f.height, f.height / f.width);
    if (aspect > MAX_IMAGE_ASPECT) {
      note(
        `dropped image "${r.id}" — ${aspect.toFixed(1)}:1 crops an illustration to a band with no subject in it`,
      );
      return false;
    }
    const query = (r.imageQuery ?? '').trim();
    if (query.length > 1 && SUBJECTLESS_QUERY.test(query)) {
      note(`dropped image "${r.id}" — the query "${query}" names no subject`);
      return false;
    }
    return true;
  });
  // A plan is never emptied: the last region stands whatever its size.
  return kept.length > 0 ? kept : regions;
}

// ---------- coverage backstop ----------

interface Span {
  start: number;
  end: number;
}

const unionLength = (spans: Span[]): number => {
  let covered = 0;
  let cursor = -Infinity;
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    const from = Math.max(s.start, cursor);
    if (s.end > from) covered += s.end - from;
    cursor = Math.max(cursor, s.end);
  }
  return covered;
};

/**
 * Grow content downwards into any dead band inside the grid until the page
 * reaches the coverage target. Only bands BETWEEN the grid lines count — the
 * margins are deliberate emptiness and are never filled — which is why the
 * ceiling here is roughly 86% of the canvas rather than 100%.
 */
function closeCoverageGaps(
  elements: Element[],
  canvas: CanvasSize,
  notes: string[],
  pageIndex: number,
): void {
  const g = gridMetrics(canvas);
  const top = ceilTo8(g.top);
  const bottom = floorTo8(g.bottom);
  const target = COVERAGE_TARGET * canvas.height;
  const content = elements.filter((el) => el.visible && el.roleHint !== 'background');
  if (content.length === 0) return;

  for (let pass = 0; pass < GRID_ROWS; pass++) {
    const spans = content.map((el) => ({
      start: Math.max(0, el.frame.y),
      end: Math.min(canvas.height, el.frame.y + el.frame.height),
    }));
    if (unionLength(spans) >= target) return;

    // dead bands strictly inside the grid
    const inside = spans
      .map((s) => ({ start: Math.max(s.start, top), end: Math.min(s.end, bottom) }))
      .filter((s) => s.end > s.start)
      .sort((a, b) => a.start - b.start);
    const gaps: Span[] = [];
    let cursor = top;
    for (const s of inside) {
      if (s.start > cursor) gaps.push({ start: cursor, end: s.start });
      cursor = Math.max(cursor, s.end);
    }
    if (cursor < bottom) gaps.push({ start: cursor, end: bottom });
    if (gaps.length === 0) return;

    gaps.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
    const gap = gaps[0]!;

    const bottomOf = (el: Element) => el.frame.y + el.frame.height;
    const above = content
      .filter((el) => bottomOf(el) <= gap.start + 1 && el.frame.height > 0)
      .sort((a, b) => bottomOf(b) - bottomOf(a) || a.id.localeCompare(b.id))[0];
    const below = content
      .filter((el) => el.frame.y >= gap.end - 1)
      .sort((a, b) => a.frame.y - b.frame.y || a.id.localeCompare(b.id))[0];

    const grow = above ?? below;
    if (!grow) return;
    const limit = grow.roleHint === 'decoration' ? canvas.height : bottom;
    const before = grow.frame.height;
    if (above) grow.frame.height = Math.min(limit - grow.frame.y, ceilTo8(gap.end - grow.frame.y));
    else {
      grow.frame.height += grow.frame.y - Math.max(top, floorTo8(gap.start));
      grow.frame.y = Math.max(top, floorTo8(gap.start));
    }
    if (grow.frame.height <= before && above) return; // no progress; stop rather than spin
    notes.push(
      `page ${pageIndex + 1} coverage: grew "${grow.name}" to close a ${Math.round(gap.end - gap.start)}px dead band`,
    );
  }
}

// ---------- legibility ----------

/**
 * Guarantee the validator's contrast rule, using the validator's own notion of
 * "effective background" and its own threshold. A text element keeps the colour
 * the art director asked for whenever that colour passes; otherwise the
 * best-contrasting brand token wins, and if no token can carry the text on that
 * background a chip is placed behind it in the token that can.
 */
function ensureLegibleText(
  doc: InternalDesignDocument,
  page: Page,
  ctx: CompositionContext,
  notes: string[],
): void {
  const palette = paletteTokens(ctx.brandTokens);

  // Chips are appended as they are decided, so a later text element sitting on
  // an earlier element's chip is judged against that chip — the same view the
  // validator will take.
  for (const el of page.elements) {
    if (el.type !== 'text') continue;
    // Worst case across every background the text touches, matching the
    // validator: a colour that fixes one panel must not fail another.
    const bgs = backgroundHexesUnder(el, doc, page, page.elements);
    if (bgs.length === 0) continue;
    const worst = (hex: string) => Math.min(...bgs.map((bg) => contrastRatio(hex, bg)));
    const required = requiredContrastRatio(el.fontSize, el.fontWeight);
    const current = resolveColour(el.colour, doc);
    if (current && worst(current) >= required) continue;

    let best: { name: string; ratio: number } | null = null;
    for (const name of palette) {
      const hex = ctx.brandTokens.colours[name];
      if (!hex) continue;
      const ratio = worst(hex);
      if (!best || ratio > best.ratio) best = { name, ratio };
      if (ratio >= required) break;
    }
    if (!best) continue;
    if (best.ratio >= required) {
      el.colour = token(best.name);
      notes.push(`legibility: recoloured "${el.name}" to ${best.name} for ${best.ratio.toFixed(1)}:1`);
      continue;
    }
    // Nothing in the palette carries this text on this background: put a chip
    // behind it in the token pair with the highest contrast available.
    const pair = bestPair(ctx.brandTokens, palette);
    if (!pair || pair.ratio < required) {
      el.colour = token(best.name);
      notes.push(
        `legibility: brand palette cannot reach ${required}:1 for "${el.name}"; used the best available (${best.ratio.toFixed(1)}:1)`,
      );
      continue;
    }
    el.colour = token(pair.fg);
    page.elements.push(
      shapeEl(ctx, 'rect', chipRect(el.frame, ctx.canvas), {
        fill: token(pair.bg),
        z: layerDirectlyUnder(el, page.elements),
        role: 'decoration',
      }),
    );
    notes.push(`legibility: added a ${pair.bg} chip behind "${el.name}" (${pair.ratio.toFixed(1)}:1)`);
  }
}

function paletteTokens(brand: BrandTokensSnapshot): string[] {
  const standard = ['text', 'background', 'primary', 'secondary', 'accent', 'neutral'];
  const custom = Object.keys(brand.colours)
    .filter((k) => !standard.includes(k))
    .sort();
  return [...standard.filter((k) => brand.colours[k]), ...custom];
}

function bestPair(
  brand: BrandTokensSnapshot,
  palette: string[],
): { fg: string; bg: string; ratio: number } | null {
  let best: { fg: string; bg: string; ratio: number } | null = null;
  for (const fg of palette)
    for (const bg of palette) {
      if (fg === bg) continue;
      const a = brand.colours[fg];
      const b = brand.colours[bg];
      if (!a || !b) continue;
      const ratio = contrastRatio(a, b);
      if (!best || ratio > best.ratio) best = { fg, bg, ratio };
    }
  return best;
}

function chipRect(frame: { x: number; y: number; width: number; height: number }, canvas: CanvasSize): Rect {
  const p = BASELINE * 2;
  const x = Math.max(0, floorTo8(frame.x - p));
  const y = Math.max(0, floorTo8(frame.y - p));
  return {
    x,
    y,
    width: Math.min(canvas.width - x, ceilTo8(frame.x + frame.width + p) - x),
    height: Math.min(canvas.height - y, ceilTo8(frame.y + frame.height + p) - y),
  };
}

// ---------- measurement (docs §6) ----------

/**
 * Fraction of the canvas height the composition actually occupies — the union
 * of every content element's vertical extent, so an internal dead band counts
 * against the page exactly as a trailing one does. Page-spanning backgrounds
 * are excluded so the metric cannot be gamed by painting the canvas.
 */
export function verticalCoverage(doc: InternalDesignDocument, pageIndex = 0): number {
  const page = doc.pages[pageIndex];
  if (!page) return 0;
  const spans = flatten(page.elements)
    .filter((el) => el.visible && el.roleHint !== 'background')
    .map((el) => ({
      start: Math.max(0, el.frame.y),
      end: Math.min(doc.canvas.height, el.frame.y + el.frame.height),
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  let covered = 0;
  let cursor = -1;
  for (const span of spans) {
    const from = Math.max(span.start, cursor);
    if (span.end > from) covered += span.end - from;
    cursor = Math.max(cursor, span.end);
  }
  return covered / doc.canvas.height;
}

/** Every font size used in the document, deduplicated. */
export function distinctFontSizes(doc: InternalDesignDocument): number[] {
  const sizes = new Set<number>();
  for (const page of doc.pages)
    for (const el of flatten(page.elements)) if (el.type === 'text') sizes.add(el.fontSize);
  return [...sizes].sort((a, b) => b - a);
}

/** Fraction of element x/y coordinates that land on the 8px baseline. */
export function baselineAlignment(doc: InternalDesignDocument): number {
  const coords: number[] = [];
  for (const page of doc.pages)
    for (const el of flatten(page.elements)) coords.push(el.frame.x, el.frame.y);
  if (coords.length === 0) return 1;
  return coords.filter((n) => Number.isInteger(n) && n % BASELINE === 0).length / coords.length;
}

function flatten(elements: Element[]): Element[] {
  return elements.flatMap((el) => (el.type === 'group' ? [el, ...flatten(el.children)] : [el]));
}
