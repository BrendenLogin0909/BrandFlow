/**
 * Stage 4 — the vision critic. docs/18-design-system-and-pipeline.md §2 and §4.
 *
 * Stage 3 guarantees a page is *correct* (on the grid, on the type scale). It
 * cannot tell whether the page is any GOOD — that is a judgement about what the
 * eye sees, and the only way to make it is to look. So: render the page, score
 * it against the section 2 rubric, and feed region-level adjustments back into
 * stage 3.
 *
 * Three properties this module is built around, because a critic that lacks any
 * of them makes the pipeline worse rather than better:
 *
 *  1. `applyAdjustments` is PURE and TOTAL. No AI, no clock, no randomness, and
 *     no input can make it emit an invalid plan. A critic is allowed to be
 *     wrong; it is not allowed to produce a page that will not compose.
 *  2. The loop is MONOTONIC. It returns the highest-scoring version it saw,
 *     never merely the last one. Round 2 scoring worse than round 1 is a normal
 *     outcome, not an error.
 *  3. A critique FAILURE IS NOT A COMPOSITION FAILURE. Render failed, model
 *     down, schema rejected — the input plan comes back unchanged and logged.
 *     Nothing here throws into the caller's composition path.
 */
import { z } from 'zod';
import {
  clampCol,
  clampEmphasis,
  clampRow,
  GRID_ROWS,
  isTextRole,
  MAX_DISTINCT_EMPHASIS_PER_PAGE,
  type LayoutPlan,
  type PlanPage,
  type PlanRegion,
} from '@brandflow/design-schema';
import type { AiProviderPort } from '../ports/index.js';
import { getAiProvider } from '../ai/provider.js';
import { rasterisePage, RasteriseError, type RasteriseOptions } from './rasterise.js';

// ---------- schema ----------

const Criterion = z.object({
  score: z.number().int().min(1).max(5),
  note: z.string().min(1).max(400),
});

export const CritiqueScores = z.object({
  hierarchy: Criterion,
  alignment: Criterion,
  activeWhitespace: Criterion,
  restraint: Criterion,
  concept: Criterion,
  signatureMove: Criterion,
  variety: Criterion,
});
export type CritiqueScores = z.infer<typeof CritiqueScores>;

export const CRITERIA = [
  'hierarchy',
  'alignment',
  'activeWhitespace',
  'restraint',
  'concept',
  'signatureMove',
  'variety',
] as const;

export const AdjustmentAction = z.enum(['move', 'resize', 'emphasise', 'deemphasise', 'recolour', 'remove']);
export type AdjustmentAction = z.infer<typeof AdjustmentAction>;

export const RegionAdjustment = z.object({
  regionId: z.string().min(1),
  action: AdjustmentAction,
  to: z
    .object({
      col: z.object({ start: z.number(), span: z.number() }).optional(),
      row: z.object({ start: z.number(), span: z.number() }).optional(),
      colour: z.enum(['text', 'primary', 'secondary', 'accent', 'neutral', 'background']).optional(),
      align: z.enum(['left', 'center', 'right']).optional(),
      emphasis: z.number().optional(),
    })
    .optional(),
  why: z.string().min(1).max(400),
});
export type RegionAdjustment = z.infer<typeof RegionAdjustment>;

export const CritiqueOutput = z.object({
  scores: CritiqueScores,
  biggestProblem: z.string().min(1).max(600),
  verdict: z.enum(['good', 'generic', 'amateur', 'broken']),
  adjustments: z.array(RegionAdjustment).max(6),
});
export type CritiqueOutput = z.infer<typeof CritiqueOutput>;

// ---------- scoring ----------

/** Sum of the seven criteria, 7..35. The loop's single comparable number. */
export function totalScore(scores: CritiqueScores): number {
  return CRITERIA.reduce((sum, key) => sum + scores[key].score, 0);
}

export const MAX_TOTAL_SCORE = CRITERIA.length * 5;

// ---------- critiquePage ----------

export interface CritiqueContext {
  /** The plan page being critiqued — supplies region ids the critic may target. */
  page: PlanPage;
  pageIndex?: number;
  pageCount?: number;
  format?: string;
  purpose?: string;
  bigIdea?: string;
  /**
   * The set's signature move. It lives on the CONCEPT (spec section 4), not on
   * the plan page — a page only names which region carries it via
   * signatureRegionId — so the caller passes it through here.
   */
  signatureMove?: string;
  /** One-line structural summaries of the other pages, for the variety criterion. */
  otherPages?: string[];
  /** Passed through to the rasteriser (font dirs, width, image fetching). */
  rasterise?: RasteriseOptions;
  /** Injectable for tests; defaults to the configured provider. */
  provider?: AiProviderPort;
}

export interface CritiqueResult {
  ok: boolean;
  scores?: CritiqueScores;
  total?: number;
  biggestProblem?: string;
  verdict?: CritiqueOutput['verdict'];
  adjustments: RegionAdjustment[];
  /** Why the critique did not happen. Set only when ok is false. */
  failure?: string;
  /** Render caveats that were disclosed to the critic (fonts, missing images). */
  renderNotes?: string[];
  meta?: { model: string; promptVersion: string; tokensUsed: number };
}

/** Never-throwing failure result — the caller carries on with the input plan. */
function failed(reason: string): CritiqueResult {
  console.warn(`[critic] critique skipped: ${reason}`);
  return { ok: false, adjustments: [], failure: reason };
}

export interface GridOccupancy {
  /** Percent of the 16 grid rows between the topmost and lowest occupied row. */
  coveragePercent: number;
  topRow: number;
  bottomRow: number;
  /** Contiguous empty rows at the bottom of the grid. */
  emptyRowsBelow: number;
  /** Contiguous empty rows above the first content. */
  emptyRowsAbove: number;
}

/**
 * Where the content actually sits on the grid. PURE — derived from the plan,
 * not from the model.
 *
 * This exists because of a measured failure: asked to judge "active whitespace"
 * from the picture alone, the critic looked at a page using the top 38% of the
 * canvas with the bottom half bare and called it "intentional breathing room",
 * scoring it 4/5. Vision models are poor at estimating proportion by eye and
 * will rationalise whatever they see — especially against a prompt that (rightly)
 * warns them not to demand pages be filled. Handing them the number instead of
 * asking them to guess it turns the judgement from perception into reasoning,
 * which is the part they are good at. docs/18 §6 makes 75% coverage the target.
 */
export function gridOccupancy(page: PlanPage): GridOccupancy {
  const rows = page.regions.map((r) => ({ top: r.row.start, bottom: r.row.start + r.row.span - 1 }));
  if (rows.length === 0)
    return { coveragePercent: 0, topRow: 0, bottomRow: 0, emptyRowsBelow: GRID_ROWS, emptyRowsAbove: GRID_ROWS };
  const topRow = Math.min(...rows.map((r) => r.top));
  const bottomRow = Math.max(...rows.map((r) => r.bottom));
  return {
    coveragePercent: Math.round(((bottomRow - topRow + 1) / GRID_ROWS) * 100),
    topRow,
    bottomRow,
    emptyRowsBelow: Math.max(0, GRID_ROWS - bottomRow),
    emptyRowsAbove: Math.max(0, topRow - 1),
  };
}

/**
 * Render `svg` and score it. Returns `ok: false` rather than throwing for every
 * failure mode — a critic that can break composition is a liability.
 */
export async function critiquePage(svg: string, context: CritiqueContext): Promise<CritiqueResult> {
  let render: Awaited<ReturnType<typeof rasterisePage>>;
  try {
    render = await rasterisePage(svg, context.rasterise ?? {});
  } catch (err) {
    const detail = err instanceof RasteriseError ? err.message : String(err);
    return failed(`render failed (${detail})`);
  }

  // Tell the critic what the render got wrong, so it grades the DESIGN and not
  // our rasteriser. Silently critiquing a page in the wrong typeface produces
  // confident, wrong advice about headline weight.
  const renderNotes: string[] = [];
  if (render.fontFallbacks.length)
    renderNotes.push(
      `The brand font${render.fontFallbacks.length > 1 ? 's' : ''} ${render.fontFallbacks.join(', ')} could not be loaded by the renderer; the type you see is a substitute face. Judge size, position and hierarchy — do NOT comment on the typeface, letterforms or font choice.`,
    );
  if (render.unresolvedImages.length)
    renderNotes.push(
      `${render.unresolvedImages.length} image(s) could not be fetched and render as empty space. Treat those regions as "image present", not as a hole in the layout.`,
    );

  const input = {
    image: { base64: render.png.toString('base64'), mediaType: 'image/png' as const },
    format: context.format,
    pageIndex: context.pageIndex ?? 0,
    pageCount: context.pageCount ?? 1,
    purpose: context.purpose,
    bigIdea: context.bigIdea,
    background: context.page.background,
    signatureMove: context.signatureMove,
    signatureRegionId: context.page.signatureRegionId,
    regions: context.page.regions.map((r) => ({
      id: r.id,
      role: r.role,
      col: r.col,
      row: r.row,
      emphasis: r.emphasis,
      colour: r.colour,
      align: r.align,
    })),
    otherPages: context.otherPages,
    occupancy: gridOccupancy(context.page),
    renderNotes,
  };

  try {
    const provider = context.provider ?? getAiProvider();
    const { data, meta } = await provider.complete('design_critique', input, CritiqueOutput);
    // Drop adjustments aimed at regions that do not exist — a hallucinated id
    // is the single most common way a critic tries to corrupt a plan.
    const known = new Set(context.page.regions.map((r) => r.id));
    const adjustments = data.adjustments.filter((a) => known.has(a.regionId));
    if (adjustments.length !== data.adjustments.length)
      console.warn(
        `[critic] dropped ${data.adjustments.length - adjustments.length} adjustment(s) targeting unknown region ids`,
      );
    return {
      ok: true,
      scores: data.scores,
      total: totalScore(data.scores),
      biggestProblem: data.biggestProblem,
      verdict: data.verdict,
      adjustments,
      renderNotes,
      meta,
    };
  } catch (err) {
    return failed(`model call failed (${String(err)})`);
  }
}

// ---------- applyAdjustments (pure) ----------

/** Emphasis steps that count as "carries the hierarchy" (docs/18 §3). */
const HERO_EMPHASIS_MAX = 2;

/**
 * Apply region-level adjustments to a plan. PURE: same inputs, same output,
 * no AI, no network, no clock, no randomness. The input plan is not mutated.
 *
 * The invariants below are enforced unconditionally — an adjustment that would
 * break one is clamped or dropped, never obeyed:
 *  - grid cells stay within 1-12 columns / 1-16 rows, span >= 1 and in bounds
 *  - emphasis stays within the 1-6 type scale
 *  - a page keeps at least one text region (the last one cannot be removed)
 *  - a page keeps exactly one signature move: signatureRegionId always names a
 *    region that still exists
 *  - a page keeps at least one step-1-or-2 region and at most 4 distinct steps
 *
 * `pageIndex` selects the page; adjustments only ever address one page.
 */
export function applyAdjustments(
  plan: LayoutPlan,
  adjustments: readonly RegionAdjustment[],
  pageIndex = 0,
): LayoutPlan {
  const page = plan.pages[pageIndex];
  if (!page) return plan;

  // deep copy of the target page only; other pages are shared by reference,
  // which is safe because nothing here mutates them
  let regions: PlanRegion[] = page.regions.map((r) => ({
    ...r,
    col: { ...r.col },
    row: { ...r.row },
  }));

  for (const adj of adjustments) {
    const index = regions.findIndex((r) => r.id === adj.regionId);
    if (index === -1) continue;
    const region = regions[index]!;

    switch (adj.action) {
      case 'move': {
        // move changes position, keeping the existing span
        if (adj.to?.col) regions[index] = { ...region, col: clampCol({ start: adj.to.col.start, span: region.col.span }) };
        const afterCol = regions[index]!;
        if (adj.to?.row) regions[index] = { ...afterCol, row: clampRow({ start: adj.to.row.start, span: afterCol.row.span }) };
        if (adj.to?.align) regions[index] = { ...regions[index]!, align: adj.to.align };
        break;
      }
      case 'resize': {
        let next = region;
        if (adj.to?.col) next = { ...next, col: clampCol({ start: adj.to.col.start ?? next.col.start, span: adj.to.col.span }) };
        if (adj.to?.row) next = { ...next, row: clampRow({ start: adj.to.row.start ?? next.row.start, span: adj.to.row.span }) };
        regions[index] = next;
        break;
      }
      case 'emphasise':
      case 'deemphasise': {
        // step one place up (towards 1 = display) or down, unless the critic
        // named a specific step. Never a font size — always a scale step.
        const target =
          adj.to?.emphasis !== undefined
            ? clampEmphasis(adj.to.emphasis)
            : clampEmphasis(region.emphasis + (adj.action === 'emphasise' ? -1 : 1));
        if (target === region.emphasis) break;
        const candidate = regions.map((r, i) => (i === index ? { ...r, emphasis: target } : r));
        if (violatesTypeScale(candidate)) break; // refuse rather than emit an illegal page
        regions = candidate;
        break;
      }
      case 'recolour': {
        if (adj.to?.colour) regions[index] = { ...region, colour: adj.to.colour };
        break;
      }
      case 'remove': {
        // the last text region on a page is not removable: a page with no copy
        // is not a design, it is a blank
        const isLastText = isTextRole(region.role) && regions.filter((r) => isTextRole(r.role)).length <= 1;
        if (isLastText || regions.length <= 1) break;
        const candidate = regions.filter((_, i) => i !== index);
        if (violatesTypeScale(candidate)) break;
        regions = candidate;
        break;
      }
    }
  }

  const pages = plan.pages.slice();
  pages[pageIndex] = {
    ...page,
    regions,
    // exactly one signature move: if its region is gone, re-anchor it
    // deterministically on the strongest remaining region
    signatureRegionId: regions.some((r) => r.id === page.signatureRegionId)
      ? page.signatureRegionId
      : pickSignatureRegion(regions),
  };
  return { ...plan, pages };
}

/**
 * The type-scale rules from docs/18 §3: at most 4 distinct steps per page, and
 * at least one step-1-or-2 element. A page with neither has no hierarchy, which
 * is the exact failure the pipeline exists to fix — so an adjustment that would
 * create one is refused.
 */
function violatesTypeScale(regions: readonly PlanRegion[]): boolean {
  const text = regions.filter((r) => isTextRole(r.role));
  if (text.length === 0) return false; // image-only pages have no type scale to break
  const steps = new Set(text.map((r) => r.emphasis));
  if (steps.size > MAX_DISTINCT_EMPHASIS_PER_PAGE) return true;
  return !text.some((r) => r.emphasis <= HERO_EMPHASIS_MAX);
}

/**
 * Deterministic re-anchor for the signature move: the largest region by grid
 * area, ties broken by strongest emphasis then by id, so the same plan always
 * produces the same choice.
 */
function pickSignatureRegion(regions: readonly PlanRegion[]): string {
  const best = [...regions].sort((a, b) => {
    const areaDiff = b.col.span * b.row.span - a.col.span * a.row.span;
    if (areaDiff !== 0) return areaDiff;
    if (a.emphasis !== b.emphasis) return a.emphasis - b.emphasis;
    return a.id.localeCompare(b.id);
  })[0];
  return best?.id ?? '';
}

// ---------- criticLoop ----------

/** Renders a plan to the SVG the critic will look at. Supplied by the caller. */
export type ComposeFn = (plan: LayoutPlan, pageIndex: number) => Promise<string> | string;

export interface CriticLoopOptions extends Omit<CritiqueContext, 'page'> {
  /** Critique calls to make. Capped at 2 (docs/18 §4: "loop at most twice"). */
  maxRounds?: number;
  /** Stop early once the total score reaches this. Default 32 of 35. */
  goodEnough?: number;
  pageIndex?: number;
}

export interface CriticRound {
  round: number;
  total: number | null;
  verdict?: CritiqueOutput['verdict'];
  biggestProblem?: string;
  adjustmentCount: number;
  failure?: string;
}

export interface CriticLoopResult {
  /** The highest-scoring plan seen — possibly the input, never a worse round. */
  plan: LayoutPlan;
  /** Score of the returned plan, or null if nothing could be scored. */
  bestTotal: number | null;
  bestScores?: CritiqueScores;
  /** 0 = the input plan won. */
  roundsRun: number;
  history: CriticRound[];
}

const MAX_ROUNDS_HARD_CAP = 2;

/**
 * Critique-and-improve loop. Runs at most 2 rounds and returns the
 * HIGHEST-SCORING version, which may be the plan it was given.
 *
 * The monotonicity matters more than it looks: a critic asked to improve an
 * already-good page will happily prescribe changes that make it worse, and a
 * loop that returns "the last thing it did" ships those. This one does not —
 * a round that scores lower than a previous round is discarded.
 *
 * Never throws. Any failure (compose, render, model) ends the loop and returns
 * the best plan so far.
 */
export async function criticLoop(
  plan: LayoutPlan,
  compose: ComposeFn,
  opts: CriticLoopOptions = {},
): Promise<CriticLoopResult> {
  const pageIndex = opts.pageIndex ?? 0;
  const maxRounds = Math.min(Math.max(opts.maxRounds ?? MAX_ROUNDS_HARD_CAP, 0), MAX_ROUNDS_HARD_CAP);
  const goodEnough = opts.goodEnough ?? 32;

  let bestPlan = plan;
  let bestTotal: number | null = null;
  let bestScores: CritiqueScores | undefined;
  const history: CriticRound[] = [];

  let candidate = plan;
  let roundsRun = 0;

  for (let round = 1; round <= maxRounds; round++) {
    const page = candidate.pages[pageIndex];
    if (!page) break;

    let svg: string;
    try {
      svg = await compose(candidate, pageIndex);
    } catch (err) {
      history.push({ round, total: null, adjustmentCount: 0, failure: `compose failed (${String(err)})` });
      console.warn(`[critic] round ${round} compose failed: ${String(err)}`);
      break;
    }

    const result = await critiquePage(svg, { ...opts, page, pageIndex });
    roundsRun = round;

    if (!result.ok || result.total === undefined) {
      history.push({ round, total: null, adjustmentCount: 0, failure: result.failure });
      break;
    }

    history.push({
      round,
      total: result.total,
      verdict: result.verdict,
      biggestProblem: result.biggestProblem,
      adjustmentCount: result.adjustments.length,
    });

    // this candidate's score belongs to the plan that produced it
    if (bestTotal === null || result.total > bestTotal) {
      bestTotal = result.total;
      bestScores = result.scores;
      bestPlan = candidate;
    }

    if (result.total >= goodEnough || result.adjustments.length === 0) break;
    if (round === maxRounds) break;

    const next = applyAdjustments(candidate, result.adjustments, pageIndex);
    // a no-op revision cannot score differently; spending another call on it
    // is pure cost
    if (JSON.stringify(next) === JSON.stringify(candidate)) break;
    candidate = next;
  }

  return { plan: bestPlan, bestTotal, bestScores, roundsRun, history };
}
