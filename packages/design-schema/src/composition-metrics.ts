/**
 * Composition metrics — how much of the canvas a page uses, and where its
 * weight sits. Docs 18 §6 and 19 §2 (P1.5).
 *
 * This module exists because the previous coverage metric measured the
 * VERTICAL band only. A page whose content occupies a narrow column with dead
 * space either side of it scored 100% and shipped looking unfinished — the
 * instrument certified exactly the defect it was there to catch. Measuring one
 * axis is not a smaller version of measuring composition; it is a measurement
 * that cannot see the failure.
 *
 * Everything here is pure and takes a parsed document, so the validation
 * engine, the compositor and the offline benchmark harness all read the same
 * numbers. There is one definition of coverage in the product and it is this
 * one; a second transcription of it anywhere is a bug.
 */
import { COVERAGE_TARGET } from './design-system.js';
import type { Element, InternalDesignDocument, Page, RoleHint } from './schema.js';

// ---------- what counts as content ----------

/**
 * Excluded from COVERAGE: a page-spanning background paints the whole canvas,
 * so counting it would let any page score 100% by being coloured in.
 * `decoration` stays in — a bled colour block or an oversized numeral is real
 * ink filling real space, and pretending otherwise understates the page.
 */
export const COVERAGE_EXCLUDED_ROLES: readonly RoleHint[] = ['background'];

/**
 * Excluded from BALANCE: `decoration` goes too, and for a different reason
 * than `background`. Balance asks where the page's *content* sits. A bled
 * decoration is deliberately off-centre — that is the whole point of it — so
 * including it both swamps the centroid with area and rewards the very drift
 * the measure exists to find. Excluding both is what makes the numbers move at
 * all: across the 25 real pages of the 2026-08-26 run, keeping decoration in
 * compressed every page into +/-0.14 of centre and separated nothing.
 */
export const BALANCE_EXCLUDED_ROLES: readonly RoleHint[] = ['background', 'decoration'];

// ---------- thresholds ----------

/**
 * Minimum share of each axis the content must occupy (docs 18 §6). The
 * vertical figure is the spec's existing 75%; the horizontal figure is the
 * same number applied to the axis nobody was measuring, and it earns its keep:
 * on the 25 real pages of the 2026-08-26 run it separates three pages
 * (10-agency p1 at 67%, 10-agency p3 at 68%, 04-sustainability at 73%) from
 * the other twenty-two, and all three read as unfinished when rendered.
 */
export const MIN_AXIS_COVERAGE = COVERAGE_TARGET;

/**
 * How far the content centroid may sit from the canvas centre, as a fraction
 * of the canvas dimension on that axis, before the page is called lopsided.
 *
 * 0.2 is deliberately permissive. Asymmetry is not a defect — a deliberate
 * off-centre focal point is good design, and the observed range on real pages
 * is continuous, with no natural gap to snap a line to. What is NOT a design
 * choice is a fifth of the canvas of drift: at 0.2 the rule fires on 3 of 25
 * pages from the 2026-08-26 run and 2 of 27 from the older run, and every one
 * of them has a visibly empty half. A tighter threshold (0.15) would have
 * taken 6 of 25, including pages that are simply asymmetric on purpose, and a
 * warning that fires on a quarter of all output is a warning nobody reads.
 */
export const MAX_BALANCE_OFFSET = 0.2;

// ---------- shapes ----------

export interface AxisCoverage {
  /** Fraction of the axis occupied by content, unions overlapping elements. */
  fraction: number;
  /** Widest uninterrupted gap between the first and last content, in px. */
  largestDeadBand: number;
  /** First and last content coordinate on this axis, in px. */
  start: number;
  end: number;
}

export interface Balance {
  /** Content centroid in canvas coordinates. */
  centroidX: number;
  centroidY: number;
  /** Signed offset from the canvas centre as a fraction of the canvas: +right, +down. */
  offsetX: number;
  offsetY: number;
  /** Straight-line offset, for a single number to sort pages by. */
  offset: number;
  /** Total area (px^2) of the elements the centroid was computed from. */
  contentArea: number;
  /** How many elements contributed. Zero means the page has no content to weigh. */
  elementCount: number;
}

export interface CompositionMetrics {
  pageIndex: number;
  pageId: string;
  horizontal: AxisCoverage;
  vertical: AxisCoverage;
  balance: Balance;
  /** True when both axes meet `MIN_AXIS_COVERAGE`. */
  coverageOk: boolean;
  /** True when neither centroid axis exceeds `MAX_BALANCE_OFFSET`. */
  balanceOk: boolean;
}

// ---------- helpers ----------

/** Depth-first flatten, keeping group containers — matches the validator's view. */
export function flattenElements(elements: readonly Element[]): Element[] {
  return elements.flatMap((el) => (el.type === 'group' ? [el, ...flattenElements(el.children)] : [el]));
}

interface Span {
  start: number;
  end: number;
}

/** Merged, sorted spans. */
function mergeSpans(spans: Span[]): Span[] {
  const sorted = spans.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

function axisCoverage(spans: Span[], extent: number): AxisCoverage {
  const merged = mergeSpans(spans);
  if (merged.length === 0) return { fraction: 0, largestDeadBand: 0, start: 0, end: 0 };
  const covered = merged.reduce((sum, s) => sum + (s.end - s.start), 0);
  let largestDeadBand = 0;
  for (let i = 1; i < merged.length; i++)
    largestDeadBand = Math.max(largestDeadBand, merged[i]!.start - merged[i - 1]!.end);
  return {
    fraction: extent > 0 ? covered / extent : 0,
    largestDeadBand,
    start: merged[0]!.start,
    end: merged[merged.length - 1]!.end,
  };
}

function contentElements(page: Page, excluded: readonly RoleHint[]): Element[] {
  return flattenElements(page.elements).filter(
    (el) => el.visible && el.opacity > 0.05 && !(el.roleHint && excluded.includes(el.roleHint)),
  );
}

/** Element footprint clipped to the canvas — off-canvas bleed is not coverage. */
function clipped(el: Element, width: number, height: number) {
  const f = el.frame;
  const x0 = Math.max(0, f.x);
  const y0 = Math.max(0, f.y);
  const x1 = Math.min(width, f.x + f.width);
  const y1 = Math.min(height, f.y + f.height);
  return { x0, y0, x1, y1, empty: x1 <= x0 || y1 <= y0 };
}

// ---------- the metrics ----------

/**
 * Optical balance: the area-weighted centroid of the page's content, against
 * the canvas centre.
 *
 * Area weighting rather than element count is what makes it optical: one large
 * block outweighs three small ones, which is how the eye reads the page.
 * Footprints are clipped to the canvas, so a region that bleeds off the edge
 * contributes only the part a reader can see.
 */
export function opticalBalance(doc: InternalDesignDocument, pageIndex = 0): Balance {
  const page = doc.pages[pageIndex];
  const { width, height } = doc.canvas;
  const empty: Balance = {
    centroidX: width / 2,
    centroidY: height / 2,
    offsetX: 0,
    offsetY: 0,
    offset: 0,
    contentArea: 0,
    elementCount: 0,
  };
  if (!page) return empty;

  let area = 0;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const el of contentElements(page, BALANCE_EXCLUDED_ROLES)) {
    const c = clipped(el, width, height);
    if (c.empty) continue;
    const a = (c.x1 - c.x0) * (c.y1 - c.y0);
    area += a;
    sumX += a * ((c.x0 + c.x1) / 2);
    sumY += a * ((c.y0 + c.y1) / 2);
    count++;
  }
  if (area === 0) return empty;

  const centroidX = sumX / area;
  const centroidY = sumY / area;
  const offsetX = (centroidX - width / 2) / width;
  const offsetY = (centroidY - height / 2) / height;
  return {
    centroidX,
    centroidY,
    offsetX,
    offsetY,
    offset: Math.hypot(offsetX, offsetY),
    contentArea: area,
    elementCount: count,
  };
}

/**
 * Fraction of the canvas WIDTH the composition occupies — the union of every
 * content element's horizontal extent, so a dead column between two elements
 * counts against the page exactly as a dead margin does.
 *
 * This is the axis the old metric did not have, and the one the 2026-08-26
 * pages failed on while scoring 100% vertically.
 */
export function horizontalCoverage(doc: InternalDesignDocument, pageIndex = 0): number {
  return pageCoverage(doc, pageIndex).horizontal.fraction;
}

/**
 * Fraction of the canvas HEIGHT the composition occupies. Same definition the
 * compositor's own backstop works to, so the two cannot drift apart.
 */
export function verticalCoverage(doc: InternalDesignDocument, pageIndex = 0): number {
  return pageCoverage(doc, pageIndex).vertical.fraction;
}

function pageCoverage(
  doc: InternalDesignDocument,
  pageIndex: number,
): { horizontal: AxisCoverage; vertical: AxisCoverage } {
  const page = doc.pages[pageIndex];
  const { width, height } = doc.canvas;
  if (!page)
    return {
      horizontal: { fraction: 0, largestDeadBand: 0, start: 0, end: 0 },
      vertical: { fraction: 0, largestDeadBand: 0, start: 0, end: 0 },
    };
  const els = contentElements(page, COVERAGE_EXCLUDED_ROLES);
  const hs: Span[] = [];
  const vs: Span[] = [];
  for (const el of els) {
    const c = clipped(el, width, height);
    if (c.empty) continue;
    hs.push({ start: c.x0, end: c.x1 });
    vs.push({ start: c.y0, end: c.y1 });
  }
  return { horizontal: axisCoverage(hs, width), vertical: axisCoverage(vs, height) };
}

/** Every composition metric for one page. */
export function pageCompositionMetrics(
  doc: InternalDesignDocument,
  pageIndex = 0,
): CompositionMetrics {
  const { horizontal, vertical } = pageCoverage(doc, pageIndex);
  const balance = opticalBalance(doc, pageIndex);
  return {
    pageIndex,
    pageId: doc.pages[pageIndex]?.id ?? '',
    horizontal,
    vertical,
    balance,
    coverageOk: horizontal.fraction >= MIN_AXIS_COVERAGE && vertical.fraction >= MIN_AXIS_COVERAGE,
    balanceOk:
      Math.abs(balance.offsetX) <= MAX_BALANCE_OFFSET &&
      Math.abs(balance.offsetY) <= MAX_BALANCE_OFFSET,
  };
}

/** Every composition metric for every page — the harness entry point. */
export function compositionMetrics(doc: InternalDesignDocument): CompositionMetrics[] {
  return doc.pages.map((_, i) => pageCompositionMetrics(doc, i));
}
