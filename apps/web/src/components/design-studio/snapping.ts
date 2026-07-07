/**
 * Snap-guide computation for drag gestures. Pure and side-effect-free: given
 * the moving box, the static neighbour boxes, and the canvas size, it returns
 * the corrected position plus the guide lines to draw. The canvas layer calls
 * this on every dragmove and applies the returned offset before committing.
 *
 * Snapping targets, in the order a designer expects: the three axes of the
 * moving box (near edge, centre, far edge) against each neighbour's three
 * axes, and against the canvas edges + canvas centre.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapGuide {
  axis: 'x' | 'y';
  /** canvas coordinate of the guide line */
  position: number;
  /** span to draw the guide across (min/max on the other axis) */
  start: number;
  end: number;
}

export interface SnapResult {
  /** corrected top-left of the moving box */
  x: number;
  y: number;
  guides: SnapGuide[];
}

/** Default pull distance in *canvas* px. Callers divide their screen-px
 *  threshold by the current zoom before passing it in so the felt pull is
 *  constant regardless of zoom. */
export const DEFAULT_SNAP_THRESHOLD = 6;

interface Candidate {
  /** where the moving box's own reference line would land */
  moving: number;
  /** the target line to snap to */
  target: number;
  /** span of the neighbour/canvas edge, for drawing the guide */
  span: [number, number];
}

/**
 * Compute snapped position + guides for `moving` against `neighbours` inside a
 * `canvas` of the given size.
 */
export function computeSnap(
  moving: Box,
  neighbours: Box[],
  canvas: { width: number; height: number },
  threshold = DEFAULT_SNAP_THRESHOLD,
): SnapResult {
  const best = { x: pickAxis('x', moving, neighbours, canvas, threshold),
                 y: pickAxis('y', moving, neighbours, canvas, threshold) };

  const guides: SnapGuide[] = [];
  let x = moving.x;
  let y = moving.y;

  if (best.x) {
    x = moving.x + (best.x.target - best.x.moving);
    guides.push({ axis: 'x', position: best.x.target, start: best.x.span[0], end: best.x.span[1] });
  }
  if (best.y) {
    y = moving.y + (best.y.target - best.y.moving);
    guides.push({ axis: 'y', position: best.y.target, start: best.y.span[0], end: best.y.span[1] });
  }
  return { x, y, guides };
}

/** Best single snap for one axis, or null when nothing is within threshold. */
function pickAxis(
  axis: 'x' | 'y',
  moving: Box,
  neighbours: Box[],
  canvas: { width: number; height: number },
  threshold: number,
): Candidate | null {
  const movingLines = axisLines(axis, moving);
  const canvasExtent = axis === 'x' ? canvas.height : canvas.width;
  const candidates: Candidate[] = [];

  // canvas edges + centre
  const canvasSize = axis === 'x' ? canvas.width : canvas.height;
  for (const target of [0, canvasSize / 2, canvasSize]) {
    for (const m of movingLines) candidates.push({ moving: m, target, span: [0, canvasExtent] });
  }
  // neighbour edges + centres
  for (const nb of neighbours) {
    const span = perpSpan(axis, moving, nb);
    for (const target of axisLines(axis, nb)) {
      for (const m of movingLines) candidates.push({ moving: m, target, span });
    }
  }

  let best: Candidate | null = null;
  let bestDist = threshold;
  for (const c of candidates) {
    const dist = Math.abs(c.moving - c.target);
    if (dist <= bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

/** The three reference lines of a box on one axis: near edge, centre, far edge. */
function axisLines(axis: 'x' | 'y', box: Box): [number, number, number] {
  return axis === 'x'
    ? [box.x, box.x + box.width / 2, box.x + box.width]
    : [box.y, box.y + box.height / 2, box.y + box.height];
}

/** Span of a guide along the *other* axis, covering both boxes so the line
 *  visibly connects the moving box to the neighbour it aligned to. */
function perpSpan(axis: 'x' | 'y', a: Box, b: Box): [number, number] {
  if (axis === 'x') {
    return [Math.min(a.y, b.y), Math.max(a.y + a.height, b.y + b.height)];
  }
  return [Math.min(a.x, b.x), Math.max(a.x + a.width, b.x + b.width)];
}
