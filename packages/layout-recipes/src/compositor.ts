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
  ceilTo8,
  contrastRatio,
  backgroundHexesUnder,
  floorTo8,
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
  const bounds = { top: ceilTo8(g.top), bottom: floorTo8(g.bottom) };
  const floorStep = minTypeStepForRole(role, canvas);
  // A role can never be rendered below its readability floor, so a plan asking
  // for caption-sized headlines is raised to the smallest legal headline step.
  const start = Math.min(startStep, floorStep) as TypeEmphasis;

  for (let step = start; step <= floorStep; step++) {
    const fontSize = typeSize(step as TypeEmphasis, canvas);
    const lineHeight = lineHeightFor(fontSize);
    const m = measureText(content, fontSize, lineHeight, frame.width, letterSpacing);
    if (m.height <= frame.height)
      return { text: content, fontSize, lineHeight, frame, truncated: false };
  }

  // Smallest legal size for the role; grow the frame instead of shrinking further.
  const fontSize = typeSize(floorStep, canvas);
  const lineHeight = lineHeightFor(fontSize);
  const needed = ceilTo8(measureText(content, fontSize, lineHeight, frame.width, letterSpacing).height + 1);
  const maxHeight = bounds.bottom - bounds.top;
  const height = Math.min(needed, maxHeight);
  const y = Math.min(frame.y, Math.max(bounds.top, bounds.bottom - height));
  const grown = { ...frame, y, height };

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

  // Legibility is decided against the finished page, exactly as the validator
  // sees it, so a text element sitting on a signature colour block is judged
  // against that block and not against the page background.
  for (const page of document.pages) ensureLegibleText(document, page, ctx, notes);
  return { document, notes };
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

  // --- 2. fill the page ---
  const pageNotes: string[] = [];
  regions = normaliseRows(regions, pageNotes);
  regions = absorbGaps(regions, canvas, pageNotes);
  for (const note of pageNotes) notes.push(`page ${pageIndex + 1} ${note}`);

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

  // --- 6. a page of nothing but images is not an editable design ---
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
        primary.frame = { ...bleed, rotation: 0 };
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
      const first = source.slice(0, 6).trim() || source.slice(0, 1);
      const m = measureText(first, size, lineHeight, Number.MAX_SAFE_INTEGER);
      // widen until the numeral is unambiguously one line — the whole move is
      // one enormous glyph run, and a wrap would turn it into an overflow error
      let width = ceilTo8(m.widestLine + size * 0.4);
      while (
        measureText(first, size, lineHeight, width).lines > 1 &&
        width < canvas.width * 2
      )
        width += BASELINE;
      const height = ceilTo8(measureText(first, size, lineHeight, width).height + BASELINE);
      // crop against whichever side the region already leans towards
      const leansLeft = stat.frame.x + stat.frame.width / 2 < canvas.width / 2;
      const x = leansLeft ? -floorTo8(width * 0.14) : floorTo8(canvas.width - width * 0.86);
      const y = Math.min(Math.max(snapTo8(stat.frame.y), 0), floorTo8(canvas.height - height));
      el.text = first;
      el.fontSize = size;
      el.lineHeight = lineHeight;
      el.letterSpacing = 0;
      el.frame = { x, y, width, height, rotation: 0 };
      el.roleHint = 'decoration';
      el.align = leansLeft ? 'left' : 'right';
      el.verticalAlign = 'middle';
      el.meta = { ...el.meta, oversized: true };
      note(`"${first}" set at ${size}px and cropped by the ${leansLeft ? 'left' : 'right'} edge`);
      return [];
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
        img.frame = {
          x: snapTo8(cx - side / 2),
          y: snapTo8(cy - side / 2),
          width: side,
          height: side,
          rotation: 0,
        };
        img.cornerRadius = side / 2;
        img.roleHint = 'decoration';
        note(`image "${target.region.id}" masked to a ${side}px circle beyond its column span`);
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
      const below = snapTo8(anchor.y + anchor.height + g.gutter);
      const y = below + height <= floorTo8(g.bottom) ? below : snapTo8(anchor.y - g.gutter - height);
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

/** A block colour that is never the page background it sits on. */
function blockFill(background: string, preferred?: string): string {
  const order = [preferred, 'primary', 'accent', 'secondary', 'neutral', 'text'].filter(
    (c): c is string => Boolean(c),
  );
  return order.find((c) => c !== background) ?? 'primary';
}

function ruleFill(background: string): string {
  return background === 'accent' ? 'primary' : 'accent';
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
        z: el.zIndex - 1,
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
