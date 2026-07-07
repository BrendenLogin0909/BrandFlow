/**
 * Pure frame-mutation helpers for the DesignCanvas. These are the single
 * authority for how a Konva transform (drag / resize / rotate) turns into a
 * new `InternalDesignDocument` — kept side-effect-free so they can be unit
 * tested without React or a canvas, and so every mutation produces a fresh
 * document (structural sharing) that React state can diff cheaply.
 *
 * The canvas never mutates `element.frame` in place; it calls these to build
 * the next document and hands it to `onDocumentChange`.
 */
import type { Element, Frame, InternalDesignDocument, Page } from '@brandflow/design-schema';

/** Konva reports resize as scaleX/scaleY on a node we keep at scale 1; we bake
 *  that scale straight into width/height so the stored frame is always the true
 *  size (no residual node scale to reconcile on the next edit). */
export interface FrameTransform {
  x: number;
  y: number;
  /** absolute width after the gesture (already multiplied by any node scale) */
  width: number;
  /** absolute height after the gesture */
  height: number;
  /** degrees, matching schema `Frame.rotation` (-360..360) */
  rotation: number;
}

const MIN_SIZE = 1;

/** Clamp a would-be frame to the schema's invariants (positive, finite size;
 *  rotation normalised into range). Returns a brand-new Frame. */
export function normaliseFrame(next: FrameTransform): Frame {
  const width = Math.max(MIN_SIZE, roundPx(next.width));
  const height = Math.max(MIN_SIZE, roundPx(next.height));
  return {
    x: roundPx(next.x),
    y: roundPx(next.y),
    width,
    height,
    rotation: normaliseRotation(next.rotation),
  };
}

/** Round to 0.01px so save→reopen stays within the ±0.5px acceptance bound
 *  while avoiding long binary-float tails in the stored JSON. */
export function roundPx(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Fold any rotation into the schema's [-360, 360] window, preserving sign
 *  near the bounds so a full spin never trips Zod's `.max(360)`. */
export function normaliseRotation(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  let r = deg % 360;
  if (r > 360) r -= 360;
  if (r < -360) r += 360;
  return roundPx(r);
}

/** Depth-first search for an element by id anywhere in the document (recurses
 *  into groups). Returns null if absent. */
export function findElement(doc: InternalDesignDocument, id: string): Element | null {
  for (const page of doc.pages) {
    const hit = findInElements(page.elements, id);
    if (hit) return hit;
  }
  return null;
}

function findInElements(elements: Element[], id: string): Element | null {
  for (const el of elements) {
    if (el.id === id) return el;
    if (el.type === 'group') {
      const hit = findInElements(el.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

/** True when the element (searched doc-wide) is present and locked. Locked
 *  elements must never move via direct manipulation. */
export function isLocked(doc: InternalDesignDocument, id: string): boolean {
  return findElement(doc, id)?.locked ?? false;
}

/**
 * Return a new document with one element's frame replaced. Locked elements are
 * left untouched (the gesture is a no-op that returns the SAME document
 * reference, so callers can detect "nothing changed"). Recurses into groups.
 */
export function updateElementFrame(
  doc: InternalDesignDocument,
  id: string,
  transform: FrameTransform,
): InternalDesignDocument {
  const frame = normaliseFrame(transform);
  return mapElement(doc, id, (el) => (el.locked ? el : { ...el, frame }));
}

/**
 * Apply a batch of frame transforms in one pass (multi-select drag). Locked
 * ids in the batch are skipped. Unchanged when the batch is empty or touches
 * only locked/absent elements.
 */
export function updateElementFrames(
  doc: InternalDesignDocument,
  transforms: Record<string, FrameTransform>,
): InternalDesignDocument {
  const ids = Object.keys(transforms);
  if (ids.length === 0) return doc;
  let next = doc;
  for (const id of ids) {
    const t = transforms[id];
    if (t) next = updateElementFrame(next, id, t);
  }
  return next;
}

/**
 * Translate an element by a delta without touching its size or rotation.
 * Convenience for keyboard nudge / snap correction.
 */
export function moveElementBy(
  doc: InternalDesignDocument,
  id: string,
  dx: number,
  dy: number,
): InternalDesignDocument {
  return mapElement(doc, id, (el) =>
    el.locked
      ? el
      : { ...el, frame: { ...el.frame, x: roundPx(el.frame.x + dx), y: roundPx(el.frame.y + dy) } },
  );
}

/**
 * Structural-sharing map: rebuild only the branch that contains `id`, reusing
 * every other node by reference. If `id` is not found the original document is
 * returned unchanged (same reference). `fn` may return the same element to
 * signal "no change" (e.g. locked), in which case the document reference is
 * preserved too.
 */
export function mapElement(
  doc: InternalDesignDocument,
  id: string,
  fn: (el: Element) => Element,
): InternalDesignDocument {
  let touched = false;
  const pages = doc.pages.map((page) => {
    const { elements, changed } = mapElements(page.elements, id, fn);
    if (!changed) return page;
    touched = true;
    return { ...page, elements };
  });
  return touched ? { ...doc, pages } : doc;
}

function mapElements(
  elements: Element[],
  id: string,
  fn: (el: Element) => Element,
): { elements: Element[]; changed: boolean } {
  let changed = false;
  const out = elements.map((el) => {
    if (el.id === id) {
      const next = fn(el);
      if (next !== el) changed = true;
      return next;
    }
    if (el.type === 'group') {
      const res = mapElements(el.children, id, fn);
      if (res.changed) {
        changed = true;
        return { ...el, children: res.elements };
      }
    }
    return el;
  });
  return { elements: changed ? out : elements, changed };
}

/**
 * Translate an element by (dx, dy). Groups are special: the schema (and the SVG
 * exporter) store group children in *absolute* page coordinates — the group's
 * own frame is only a rotation pivot / bounding box and does not offset its
 * children. So moving a group must shift the group frame AND every descendant.
 * Leaf elements just shift their own frame. Locked elements are skipped
 * (returns the same document reference when nothing moved).
 */
export function translateElement(
  doc: InternalDesignDocument,
  id: string,
  dx: number,
  dy: number,
): InternalDesignDocument {
  if (dx === 0 && dy === 0) return doc;
  return mapElement(doc, id, (el) => (el.locked ? el : shiftSubtree(el, dx, dy)));
}

/** Deep-shift an element and, for groups, all of its descendants. */
function shiftSubtree(el: Element, dx: number, dy: number): Element {
  const frame = { ...el.frame, x: roundPx(el.frame.x + dx), y: roundPx(el.frame.y + dy) };
  if (el.type === 'group') {
    return { ...el, frame, children: el.children.map((c) => shiftSubtree(c, dx, dy)) };
  }
  return { ...el, frame };
}

/** The page for an id, or the first page when the id is missing/undefined. */
export function activePage(doc: InternalDesignDocument, pageId: string | null | undefined): Page {
  return doc.pages.find((p) => p.id === pageId) ?? doc.pages[0]!;
}

/** Axis-aligned bounding box of a set of elements on a page (ignores rotation —
 *  used only for the multi-select outline and centre-snap reference). Returns
 *  null when no ids resolve to elements on the page. */
export function boundingBox(
  page: Page,
  ids: Iterable<string>,
): { x: number; y: number; width: number; height: number } | null {
  const idSet = ids instanceof Set ? ids : new Set(ids);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of page.elements) {
    if (!idSet.has(el.id)) continue;
    const f = el.frame;
    minX = Math.min(minX, f.x);
    minY = Math.min(minY, f.y);
    maxX = Math.max(maxX, f.x + f.width);
    maxY = Math.max(maxY, f.y + f.height);
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
