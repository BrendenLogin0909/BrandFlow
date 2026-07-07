import { describe, expect, it } from 'vitest';
import type { Element, InternalDesignDocument, Page } from '@brandflow/design-schema';
import {
  boundingBox,
  findElement,
  isLocked,
  moveElementBy,
  normaliseFrame,
  normaliseRotation,
  roundPx,
  translateElement,
  updateElementFrame,
  updateElementFrames,
} from './frame';

// ---------- fixtures ----------
// The frame helpers only read id / type / frame / locked / children, so we
// build lightweight typed literals rather than fully-valid schema documents.

function leaf(id: string, frame: Partial<Element['frame']>, locked = false): Element {
  return {
    id,
    name: id,
    type: 'shape',
    frame: { x: 0, y: 0, width: 100, height: 100, rotation: 0, ...frame },
    opacity: 1,
    locked,
    visible: true,
    zIndex: 0,
    roleHint: null,
    tokenRefs: [],
    recipeSlotId: null,
    meta: {},
    shape: 'rect',
    fill: { kind: 'raw', hex: '#000000', allowedOverride: false },
    strokeWidth: 0,
    cornerRadius: 0,
  } as unknown as Element;
}

function group(id: string, frame: Partial<Element['frame']>, children: Element[]): Element {
  return {
    id,
    name: id,
    type: 'group',
    frame: { x: 0, y: 0, width: 200, height: 200, rotation: 0, ...frame },
    opacity: 1,
    locked: false,
    visible: true,
    zIndex: 0,
    roleHint: null,
    tokenRefs: [],
    recipeSlotId: null,
    meta: {},
    children,
  } as unknown as Element;
}

function docWith(elements: Element[]): InternalDesignDocument {
  return {
    canvas: { width: 1200, height: 1500, unit: 'px', dpi: 96 },
    pages: [{ id: 'page-1', name: 'p', elements } as unknown as Page],
  } as unknown as InternalDesignDocument;
}

// ---------- rounding / normalisation ----------

describe('roundPx', () => {
  it('rounds to two decimals', () => {
    expect(roundPx(10.126)).toBe(10.13);
    expect(roundPx(10.124)).toBe(10.12);
    expect(roundPx(40)).toBe(40);
  });
});

describe('normaliseRotation', () => {
  it('folds a value into the schema range', () => {
    expect(normaliseRotation(0)).toBe(0);
    expect(normaliseRotation(90)).toBe(90);
    expect(normaliseRotation(370)).toBe(10);
    expect(normaliseRotation(-370)).toBe(-10);
  });
  it('coerces non-finite to 0', () => {
    expect(normaliseRotation(Number.NaN)).toBe(0);
    expect(normaliseRotation(Infinity)).toBe(0);
  });
});

describe('normaliseFrame', () => {
  it('clamps to positive finite size and rounds', () => {
    const f = normaliseFrame({ x: 10.126, y: -3.001, width: 0, height: -5, rotation: 400 });
    expect(f.width).toBeGreaterThanOrEqual(1);
    expect(f.height).toBeGreaterThanOrEqual(1);
    expect(f.x).toBe(10.13);
    expect(f.rotation).toBe(40);
  });
});

// ---------- updateElementFrame ----------

describe('updateElementFrame', () => {
  it('replaces a leaf frame and returns a new document (original untouched)', () => {
    const doc = docWith([leaf('a', { x: 0, y: 0 })]);
    const next = updateElementFrame(doc, 'a', { x: 40, y: 40, width: 100, height: 100, rotation: 0 });
    expect(next).not.toBe(doc);
    expect(findElement(next, 'a')!.frame.x).toBe(40);
    // structural sharing: source document is unchanged
    expect(findElement(doc, 'a')!.frame.x).toBe(0);
  });

  it('is a no-op (same reference) for a locked element', () => {
    const doc = docWith([leaf('a', { x: 0, y: 0 }, true)]);
    const next = updateElementFrame(doc, 'a', { x: 40, y: 40, width: 100, height: 100, rotation: 0 });
    expect(next).toBe(doc);
    expect(isLocked(doc, 'a')).toBe(true);
  });

  it('returns the same reference when the id is absent', () => {
    const doc = docWith([leaf('a', {})]);
    expect(updateElementFrame(doc, 'missing', { x: 1, y: 1, width: 1, height: 1, rotation: 0 })).toBe(doc);
  });

  it('stays within ±0.5px through a round-trip (P1 acceptance)', () => {
    const doc = docWith([leaf('a', { x: 100, y: 100 })]);
    const moved = updateElementFrame(doc, 'a', { x: 140.004, y: 100, width: 100, height: 100, rotation: 0 });
    expect(Math.abs(findElement(moved, 'a')!.frame.x - 140)).toBeLessThanOrEqual(0.5);
  });
});

describe('updateElementFrames (batch)', () => {
  it('applies several transforms and skips locked ids', () => {
    const doc = docWith([leaf('a', { x: 0 }), leaf('b', { x: 0 }, true)]);
    const next = updateElementFrames(doc, {
      a: { x: 10, y: 0, width: 100, height: 100, rotation: 0 },
      b: { x: 10, y: 0, width: 100, height: 100, rotation: 0 },
    });
    expect(findElement(next, 'a')!.frame.x).toBe(10);
    expect(findElement(next, 'b')!.frame.x).toBe(0); // locked, unchanged
  });

  it('is a no-op for an empty batch', () => {
    const doc = docWith([leaf('a', {})]);
    expect(updateElementFrames(doc, {})).toBe(doc);
  });
});

// ---------- translateElement (group-aware) ----------

describe('translateElement', () => {
  it('shifts a leaf by the delta', () => {
    const doc = docWith([leaf('a', { x: 10, y: 20 })]);
    const next = translateElement(doc, 'a', 5, -5);
    expect(findElement(next, 'a')!.frame).toMatchObject({ x: 15, y: 15 });
  });

  it('shifts a group AND all of its descendants (children are absolute coords)', () => {
    const child = leaf('child', { x: 50, y: 60 });
    const doc = docWith([group('g', { x: 40, y: 40 }, [child])]);
    const next = translateElement(doc, 'g', 10, 10);
    expect(findElement(next, 'g')!.frame).toMatchObject({ x: 50, y: 50 });
    expect(findElement(next, 'child')!.frame).toMatchObject({ x: 60, y: 70 });
  });

  it('is a no-op for a zero delta', () => {
    const doc = docWith([leaf('a', {})]);
    expect(translateElement(doc, 'a', 0, 0)).toBe(doc);
  });
});

describe('moveElementBy', () => {
  it('translates without touching size or rotation', () => {
    const doc = docWith([leaf('a', { x: 10, y: 10, width: 80, height: 40, rotation: 15 })]);
    const next = moveElementBy(doc, 'a', 5, 5);
    expect(findElement(next, 'a')!.frame).toMatchObject({ x: 15, y: 15, width: 80, height: 40, rotation: 15 });
  });
});

// ---------- lookups ----------

describe('findElement', () => {
  it('finds a deeply nested element inside a group', () => {
    const doc = docWith([group('g', {}, [leaf('deep', { x: 1 })])]);
    expect(findElement(doc, 'deep')?.id).toBe('deep');
    expect(findElement(doc, 'nope')).toBeNull();
  });
});

describe('boundingBox', () => {
  it('unions the frames of the given ids', () => {
    const page = docWith([leaf('a', { x: 0, y: 0, width: 100, height: 100 }), leaf('b', { x: 200, y: 50, width: 100, height: 100 })])
      .pages[0]!;
    expect(boundingBox(page, ['a', 'b'])).toEqual({ x: 0, y: 0, width: 300, height: 150 });
  });

  it('returns null when no ids match', () => {
    const page = docWith([leaf('a', {})]).pages[0]!;
    expect(boundingBox(page, ['x'])).toBeNull();
  });
});
