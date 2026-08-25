import { describe, expect, it } from 'vitest';
import {
  BASELINE,
  ConceptOutput,
  GRID_COLUMNS,
  GRID_ROWS,
  LayoutPlan,
  MAX_PLAN_PAGES,
  MAX_PLAN_REGIONS,
  MAX_TYPE_STEPS_PER_PAGE,
  RegionRole,
  SPACING,
  TYPE_SCALE,
  TypeRole,
  ceilTo8,
  coerceHierarchy,
  floorTo8,
  gridFrame,
  gridMetrics,
  gridRect,
  hashSeed,
  lineHeightFor,
  oversizedNumeralSize,
  snapTo8,
  typeScaleFor,
  typeSize,
} from './design-system.js';
import type { CanvasSize, TypeEmphasis } from './design-system.js';

const PORTRAIT: CanvasSize = { width: 1080, height: 1350 };
const SQUARE: CanvasSize = { width: 1080, height: 1080 };
const LANDSCAPE: CanvasSize = { width: 1200, height: 627 };
const CANVASES: [string, CanvasSize][] = [
  ['portrait 1080x1350', PORTRAIT],
  ['square 1080x1080', SQUARE],
  ['landscape 1200x627', LANDSCAPE],
];

describe('baseline helpers', () => {
  it('snaps to the nearest 8, and directionally when asked', () => {
    expect(snapTo8(90)).toBe(88);
    expect(snapTo8(92)).toBe(96);
    expect(ceilTo8(90)).toBe(96);
    expect(floorTo8(90)).toBe(88);
    expect(snapTo8(0)).toBe(0);
    expect(snapTo8(-90)).toBe(-88);
  });

  it('every spacing step is a multiple of the baseline', () => {
    for (const s of SPACING) expect(s % BASELINE).toBe(0);
  });
});

describe('grid maths', () => {
  it.each(CANVASES)('%s: derives the margin from the canvas, never per-canvas', (_name, canvas) => {
    const g = gridMetrics(canvas);
    // 90 at 1080 wide, proportional elsewhere, rounded up onto the baseline
    expect(g.safeMarginX).toBe(Math.round(canvas.width / 12));
    expect(g.marginX % BASELINE).toBe(0);
    expect(g.marginY % BASELINE).toBe(0);
    expect(g.marginX).toBeGreaterThanOrEqual(g.safeMarginX);
    expect(g.marginY).toBeGreaterThanOrEqual(g.safeMarginY);
    expect(g.columns).toBe(GRID_COLUMNS);
    expect(g.rows).toBe(GRID_ROWS);
  });

  it('uses the spec values on the 1080 LinkedIn canvases', () => {
    for (const canvas of [PORTRAIT, SQUARE]) {
      const g = gridMetrics(canvas);
      expect(g.safeMarginX).toBe(90);
      expect(g.safeMarginY).toBe(90);
      expect(g.gutter).toBe(24);
      expect(g.marginX).toBe(96);
    }
  });

  it.each(CANVASES)('%s: column 1 starts on the left margin', (_name, canvas) => {
    const g = gridMetrics(canvas);
    expect(gridRect(canvas, { start: 1, span: 1 }, { start: 1, span: 1 }).x).toBeCloseTo(g.left, 6);
  });

  it.each(CANVASES)('%s: column 12 ends on the right margin', (_name, canvas) => {
    const g = gridMetrics(canvas);
    const cell = gridRect(canvas, { start: 12, span: 1 }, { start: 1, span: 1 });
    expect(cell.x + cell.width).toBeCloseTo(g.right, 6);
  });

  it.each(CANVASES)('%s: columns tile with exactly one gutter and no overlap', (_name, canvas) => {
    const g = gridMetrics(canvas);
    for (let c = 1; c < GRID_COLUMNS; c++) {
      const a = gridRect(canvas, { start: c, span: 1 }, { start: 1, span: 1 });
      const b = gridRect(canvas, { start: c + 1, span: 1 }, { start: 1, span: 1 });
      expect(b.x - (a.x + a.width)).toBeCloseTo(g.gutter, 6);
    }
  });

  it.each(CANVASES)('%s: a span of k equals k cells plus k-1 gutters', (_name, canvas) => {
    const g = gridMetrics(canvas);
    for (let span = 1; span <= GRID_COLUMNS; span++) {
      const cell = gridRect(canvas, { start: 1, span }, { start: 1, span: 1 });
      expect(cell.width).toBeCloseTo(span * g.colWidth + (span - 1) * g.gutter, 6);
    }
  });

  it.each(CANVASES)('%s: rows tile edge to edge with no gaps or overlap', (_name, canvas) => {
    const g = gridMetrics(canvas);
    expect(gridRect(canvas, { start: 1, span: 1 }, { start: 1, span: 1 }).y).toBeCloseTo(g.top, 6);
    for (let r = 1; r < GRID_ROWS; r++) {
      const a = gridRect(canvas, { start: 1, span: 1 }, { start: r, span: 1 });
      const b = gridRect(canvas, { start: 1, span: 1 }, { start: r + 1, span: 1 });
      expect(a.y + a.height).toBeCloseTo(b.y, 6);
    }
    const last = gridRect(canvas, { start: 1, span: 1 }, { start: GRID_ROWS, span: 1 });
    expect(last.y + last.height).toBeCloseTo(g.bottom, 6);
  });

  it.each(CANVASES)('%s: the full grid is exactly the content box', (_name, canvas) => {
    const g = gridMetrics(canvas);
    const full = gridRect(canvas, { start: 1, span: 12 }, { start: 1, span: 16 });
    expect(full.x).toBeCloseTo(g.left, 6);
    expect(full.y).toBeCloseTo(g.top, 6);
    expect(full.width).toBeCloseTo(g.contentWidth, 6);
    expect(full.height).toBeCloseTo(g.contentHeight, 6);
  });

  it.each(CANVASES)('%s: every snapped frame is on the baseline and inside the safe area', (_name, canvas) => {
    const g = gridMetrics(canvas);
    for (let c = 1; c <= GRID_COLUMNS; c++)
      for (let r = 1; r <= GRID_ROWS; r++) {
        const f = gridFrame(canvas, { start: c, span: 1 }, { start: r, span: 1 });
        expect(f.x % BASELINE).toBe(0);
        expect(f.y % BASELINE).toBe(0);
        expect(f.width).toBeGreaterThan(0);
        expect(f.height).toBeGreaterThan(0);
        expect(f.x).toBeGreaterThanOrEqual(g.safeMarginX);
        expect(f.y).toBeGreaterThanOrEqual(g.safeMarginY);
        expect(f.x + f.width).toBeLessThanOrEqual(canvas.width - g.safeMarginX);
        expect(f.y + f.height).toBeLessThanOrEqual(canvas.height - g.safeMarginY);
      }
  });

  it('clamps out-of-range cells rather than producing negative geometry', () => {
    const f = gridFrame(PORTRAIT, { start: 11, span: 9 }, { start: 15, span: 9 });
    expect(f.width).toBeGreaterThan(0);
    expect(f.height).toBeGreaterThan(0);
    expect(f.x + f.width).toBeLessThanOrEqual(PORTRAIT.width);
  });
});

describe('type scale', () => {
  it('has six steps at roughly a 1.4 ratio, largest first', () => {
    expect(TYPE_SCALE).toHaveLength(6);
    for (let i = 1; i < TYPE_SCALE.length; i++) {
      const ratio = TYPE_SCALE[i - 1]!.size / TYPE_SCALE[i]!.size;
      expect(ratio).toBeGreaterThan(1.25);
      expect(ratio).toBeLessThan(1.6);
    }
  });

  it('matches the spec values on a 1080 canvas', () => {
    expect(typeScaleFor(PORTRAIT)).toEqual([96, 68, 44, 30, 22, 16]);
    expect(typeScaleFor(SQUARE)).toEqual([96, 68, 44, 30, 22, 16]);
    expect(typeSize(1)).toBe(96);
    expect(typeSize(6)).toBe(16);
  });

  it('derives sizes for other canvas widths', () => {
    expect(typeSize(1, LANDSCAPE)).toBe(Math.round(96 * (1200 / 1080)));
    expect(oversizedNumeralSize(PORTRAIT)).toBe(192);
  });

  it('gives every step a line box that is a whole number of baselines', () => {
    for (const { size } of TYPE_SCALE) {
      const box = size * lineHeightFor(size);
      expect(Math.round(box) % BASELINE).toBe(0);
      expect(lineHeightFor(size)).toBeGreaterThanOrEqual(0.8);
      expect(lineHeightFor(size)).toBeLessThanOrEqual(3);
    }
  });
});

describe('hierarchy rule coercion', () => {
  const region = (id: string, emphasis: TypeEmphasis, role: RegionRole = 'body') => ({
    id,
    role,
    emphasis,
  });

  it('leaves a compliant page alone', () => {
    const input = [region('a', 1, 'headline'), region('b', 4), region('c', 6, 'kicker')];
    const { emphasis, notes } = coerceHierarchy(input);
    expect(notes).toHaveLength(0);
    for (const r of input) expect(emphasis.get(r.id)).toBe(r.emphasis);
  });

  it('promotes the largest text region when nothing reaches step 1 or 2', () => {
    const { emphasis, notes } = coerceHierarchy([
      region('a', 3, 'subhead'),
      region('b', 4),
      region('c', 5),
    ]);
    expect(emphasis.get('a')).toBe(2);
    expect(notes.join(' ')).toContain('promoted');
    expect([...emphasis.values()].some((e) => e <= 2)).toBe(true);
  });

  it('merges down to at most four steps, keeping the focal point', () => {
    const { emphasis } = coerceHierarchy([
      region('a', 1, 'headline'),
      region('b', 3),
      region('c', 3),
      region('d', 4),
      region('e', 5),
      region('f', 6),
    ]);
    const distinct = new Set(emphasis.values());
    expect(distinct.size).toBeLessThanOrEqual(MAX_TYPE_STEPS_PER_PAGE);
    expect(emphasis.get('a')).toBe(1); // the focal point is never merged away
  });

  it('satisfies both rules at once on a page that breaks both', () => {
    const { emphasis } = coerceHierarchy([
      region('a', 3),
      region('b', 3),
      region('c', 4),
      region('d', 5),
      region('e', 6),
      region('f', 6),
    ]);
    const values = [...emphasis.values()];
    expect(new Set(values).size).toBeLessThanOrEqual(MAX_TYPE_STEPS_PER_PAGE);
    expect(values.some((e) => e <= 2)).toBe(true);
  });

  it('ignores non-text regions when counting steps', () => {
    const { emphasis, notes } = coerceHierarchy([
      region('a', 1, 'headline'),
      region('img', 3, 'image'),
      region('blk', 4, 'block'),
      region('ico', 5, 'icon'),
      region('cht', 6, 'chart'),
    ]);
    expect(notes).toHaveLength(0);
    expect(emphasis.get('cht')).toBe(6);
  });

  it('is deterministic', () => {
    const input = [region('a', 3), region('b', 4), region('c', 5), region('d', 6), region('e', 2)];
    const first = [...coerceHierarchy(input).emphasis.entries()];
    const second = [...coerceHierarchy(input).emphasis.entries()];
    expect(second).toEqual(first);
  });
});

describe('AI-facing contracts', () => {
  const region = {
    id: 'r0',
    role: 'headline',
    col: { start: 1, span: 12 },
    row: { start: 1, span: 8 },
    emphasis: 2,
  };
  const plan = { pages: [{ background: 'background', regions: [region], signatureRegionId: 'r0' }] };
  const concept = {
    bigIdea: 'One idea',
    metaphor: 'One picture',
    focalPoint: 'The number',
    register: 'bold',
    signatureMove: 'rule-accent',
    pages: [{ purpose: 'Open', copy: [{ role: 'headline', text: 'Hello' }] }],
  };

  it('TypeRole is the six type-scale step names, not the region roles', () => {
    expect(TypeRole.options).toEqual(TYPE_SCALE.map((s) => s.name));
    expect(TypeRole.options).toEqual(['display', 'headline', 'subhead', 'bodyLarge', 'body', 'caption']);
  });

  it('RegionRole is the ten stage-2 roles, and decoration/background are not among them', () => {
    expect(RegionRole.options).toEqual([
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
    expect(RegionRole.options).not.toContain('decoration');
    expect(RegionRole.options).not.toContain('background');
  });

  it('accepts the spec-shaped plan and concept', () => {
    expect(() => LayoutPlan.parse(plan)).not.toThrow();
    expect(() => ConceptOutput.parse(concept)).not.toThrow();
  });

  it('rejects any geometry the model tries to smuggle in — this is the whole guarantee', () => {
    for (const smuggled of [{ x: 40 }, { fontSize: 44 }, { width: 300 }, { y: 0 }]) {
      const bad = { pages: [{ ...plan.pages[0], regions: [{ ...region, ...smuggled }] }] };
      expect(() => LayoutPlan.parse(bad), JSON.stringify(smuggled)).toThrow();
    }
    expect(() => LayoutPlan.parse({ ...plan, canvas: { width: 1080 } })).toThrow();
    expect(() =>
      LayoutPlan.parse({ pages: [{ ...plan.pages[0], safeArea: 90 }] }),
    ).toThrow();
    expect(() => ConceptOutput.parse({ ...concept, pixels: true })).toThrow();
    expect(() =>
      ConceptOutput.parse({
        ...concept,
        pages: [{ purpose: 'Open', copy: [{ role: 'headline', text: 'Hello', size: 44 }] }],
      }),
    ).toThrow();
  });

  it('bounds regions to 1-14 per page and pages to 1-20', () => {
    expect(MAX_PLAN_REGIONS).toBe(14);
    expect(MAX_PLAN_PAGES).toBe(20);
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ ...region, id: `r${i}` }));
    expect(() =>
      LayoutPlan.parse({ pages: [{ ...plan.pages[0], regions: many(MAX_PLAN_REGIONS) }] }),
    ).not.toThrow();
    expect(() =>
      LayoutPlan.parse({ pages: [{ ...plan.pages[0], regions: many(MAX_PLAN_REGIONS + 1) }] }),
    ).toThrow();
    expect(() => LayoutPlan.parse({ pages: [] })).toThrow();
  });

  it('keeps grid references inside the grid', () => {
    const bad = (over: object) => ({
      pages: [{ ...plan.pages[0], regions: [{ ...region, ...over }] }],
    });
    expect(() => LayoutPlan.parse(bad({ col: { start: 0, span: 4 } }))).toThrow();
    expect(() => LayoutPlan.parse(bad({ col: { start: 13, span: 1 } }))).toThrow();
    expect(() => LayoutPlan.parse(bad({ row: { start: 1, span: 17 } }))).toThrow();
    expect(() => LayoutPlan.parse(bad({ emphasis: 7 }))).toThrow();
    expect(() => LayoutPlan.parse(bad({ emphasis: 2.5 }))).toThrow();
    expect(() => LayoutPlan.parse(bad({ colour: 'hotpink' }))).toThrow();
  });
});

describe('hashSeed', () => {
  it('is stable and well distributed enough to pick variants', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
    expect(hashSeed('')).toBeGreaterThanOrEqual(0);
  });
});
