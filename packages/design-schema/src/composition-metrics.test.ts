/**
 * Regression: two-axis coverage and optical balance (docs/19 P1.5).
 *
 * The metric this replaces measured the VERTICAL band only. Every page in the
 * 2026-08-26 run scored 85% and passed, including pages whose content sat in a
 * narrow column with a dead third of the canvas beside it. An instrument that
 * cannot see the failure it was built for is worse than no instrument, because
 * it certifies the defect.
 *
 * The first test below is that exact shape: full height, one third of the
 * width. Delete the horizontal axis and it passes.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_BALANCE_OFFSET,
  MIN_AXIS_COVERAGE,
  compositionMetrics,
  horizontalCoverage,
  opticalBalance,
  pageCompositionMetrics,
  verticalCoverage,
} from './composition-metrics.js';
import { validateDesignDocument } from './validate.js';
import type { Element, InternalDesignDocument } from './schema.js';

let n = 0;
const uuid = () => `40000000-0000-4000-8000-${String(n++).padStart(12, '0')}`;

/** A plain opaque block — coverage and balance only look at geometry. */
const block = (
  x: number,
  y: number,
  width: number,
  height: number,
  roleHint: string | null = null,
): Element =>
  ({
    id: uuid(),
    name: 'block',
    type: 'shape',
    shape: 'rect',
    frame: { x, y, width, height, rotation: 0 },
    opacity: 1,
    locked: false,
    visible: true,
    zIndex: 10,
    roleHint,
    tokenRefs: [],
    recipeSlotId: null,
    meta: {},
    fill: { kind: 'token', token: 'primary' },
    strokeWidth: 0,
    cornerRadius: 0,
  }) as unknown as Element;

function doc(elements: Element[]): InternalDesignDocument {
  return {
    id: uuid(),
    version: 1,
    brandProfileId: 'test',
    clientCompanyId: uuid(),
    layoutRecipeRef: null,
    format: 'single_image',
    canvas: { width: 1000, height: 1000, unit: 'px', dpi: 96 },
    brandTokens: {
      colours: {
        primary: '#1c1917',
        secondary: '#44403c',
        accent: '#b45309',
        neutral: '#a8a29e',
        background: '#ffffff',
        text: '#1c1917',
      },
      fonts: { heading: 'Inter', body: 'Inter' },
      logoAssetIds: [],
    },
    pages: [
      {
        id: uuid(),
        name: 'Page 1',
        background: { kind: 'token', token: 'background' },
        safeArea: { top: 90, right: 90, bottom: 90, left: 90 },
        elements,
      },
    ],
  } as unknown as InternalDesignDocument;
}

const warnings = (d: InternalDesignDocument, ruleId: string) =>
  validateDesignDocument(d).warnings.filter((v) => v.ruleId === ruleId);

describe('two-axis coverage', () => {
  it('catches the narrow strip the vertical-only metric certified', () => {
    // Full height, one third of the width — 100% on the old metric.
    const d = doc([block(340, 0, 320, 1000)]);
    expect(verticalCoverage(d)).toBe(1);
    expect(horizontalCoverage(d)).toBeCloseTo(0.32, 5);
    const w = warnings(d, 'coverage');
    expect(w).toHaveLength(1);
    expect(w[0]!.message).toMatch(/width/);
  });

  it('still catches a short page on the vertical axis', () => {
    const d = doc([block(0, 0, 1000, 400)]);
    expect(horizontalCoverage(d)).toBe(1);
    expect(verticalCoverage(d)).toBeCloseTo(0.4, 5);
    expect(warnings(d, 'coverage')[0]!.message).toMatch(/height/);
  });

  it('unions overlapping elements rather than summing them', () => {
    // Two blocks covering the same half must not add up to full coverage.
    const d = doc([block(0, 0, 500, 1000), block(100, 0, 300, 1000)]);
    expect(horizontalCoverage(d)).toBeCloseTo(0.5, 5);
  });

  it('counts an internal dead band against the page, and reports its width', () => {
    const d = doc([block(0, 0, 350, 1000), block(650, 0, 350, 1000)]);
    const m = pageCompositionMetrics(d);
    expect(m.horizontal.fraction).toBeCloseTo(0.7, 5);
    expect(m.horizontal.largestDeadBand).toBe(300);
    expect(warnings(d, 'coverage')[0]!.message).toMatch(/dead band 300px/);
  });

  it('cannot be gamed by painting the canvas', () => {
    // A page-spanning `background` is excluded, so colouring the canvas in
    // does not buy coverage the composition has not earned.
    const d = doc([block(0, 0, 1000, 1000, 'background'), block(340, 0, 320, 1000)]);
    expect(horizontalCoverage(d)).toBeCloseTo(0.32, 5);
  });

  it('counts decoration as real ink', () => {
    // Unlike balance. A bled colour block or an oversized numeral occupies
    // space a reader sees; pretending otherwise understates the page.
    const d = doc([block(0, 0, 1000, 1000, 'decoration')]);
    expect(horizontalCoverage(d)).toBe(1);
  });

  it('does not credit the part of a bleed that falls off the canvas', () => {
    const d = doc([block(-500, 0, 1000, 1000)]);
    expect(horizontalCoverage(d)).toBeCloseTo(0.5, 5);
  });

  it('passes a page that fills both axes', () => {
    const d = doc([block(60, 60, 880, 880)]);
    expect(horizontalCoverage(d)).toBeGreaterThanOrEqual(MIN_AXIS_COVERAGE);
    expect(warnings(d, 'coverage')).toHaveLength(0);
  });
});

describe('optical balance', () => {
  it('is centred when the content is', () => {
    const b = opticalBalance(doc([block(100, 100, 800, 800)]));
    expect(b.offsetX).toBeCloseTo(0, 5);
    expect(b.offsetY).toBeCloseTo(0, 5);
  });

  it('weights by area, not by element count', () => {
    // Three small blocks left, one large block right: the large one wins,
    // which is how the eye reads the page.
    const b = opticalBalance(
      doc([block(0, 0, 60, 60), block(0, 100, 60, 60), block(0, 200, 60, 60), block(500, 0, 500, 500)]),
    );
    expect(b.offsetX).toBeGreaterThan(0.2);
    expect(b.elementCount).toBe(4);
  });

  it('ignores background and decoration', () => {
    // A full-canvas background is centred and enormous; leaving it in would
    // swamp every real imbalance. Across the 25 real pages of the 2026-08-26
    // run, keeping decoration in compressed every page to within +/-0.14.
    const lopsided = [block(800, 400, 200, 200)];
    const bare = opticalBalance(doc(lopsided));
    const dressed = opticalBalance(
      doc([block(0, 0, 1000, 1000, 'background'), block(0, 0, 600, 1000, 'decoration'), ...lopsided]),
    );
    expect(dressed.offsetX).toBeCloseTo(bare.offsetX, 5);
    expect(dressed.elementCount).toBe(1);
  });

  it('warns once the centroid drifts past the threshold', () => {
    // 03-cyber-phishing p2's shape: everything in the left half, right half
    // empty. Measured at -0.201 on the real page.
    const d = doc([block(60, 100, 340, 800)]);
    const b = opticalBalance(d);
    expect(Math.abs(b.offsetX)).toBeGreaterThan(MAX_BALANCE_OFFSET);
    const w = warnings(d, 'balance');
    expect(w).toHaveLength(1);
    expect(w[0]!.severity).toBe('warning');
    expect(w[0]!.message).toMatch(/left of centre/);
  });

  it('leaves a merely asymmetric page alone', () => {
    // Deliberate asymmetry is good design; only extreme drift is a defect.
    const d = doc([block(60, 60, 500, 880), block(620, 300, 320, 400)]);
    expect(Math.abs(opticalBalance(d).offsetX)).toBeLessThanOrEqual(MAX_BALANCE_OFFSET);
    expect(warnings(d, 'balance')).toHaveLength(0);
  });

  it('reports no balance at all for a page with nothing but decoration', () => {
    const b = opticalBalance(doc([block(0, 0, 1000, 1000, 'decoration')]));
    expect(b.elementCount).toBe(0);
    expect(b.offset).toBe(0);
  });

  it('never emits a balance warning it cannot substantiate', () => {
    expect(warnings(doc([block(0, 0, 1000, 1000, 'background')]), 'balance')).toHaveLength(0);
  });
});

describe('the shared module', () => {
  it('reports every page, so the harness and the validator read one set of numbers', () => {
    const d = doc([block(340, 0, 320, 1000)]);
    const all = compositionMetrics(d);
    expect(all).toHaveLength(1);
    expect(all[0]!.pageId).toBe(d.pages[0]!.id);
    expect(all[0]!.coverageOk).toBe(false);
    expect(all[0]!.balanceOk).toBe(true);
    // …and the convenience accessors agree with the full record.
    expect(all[0]!.horizontal.fraction).toBe(horizontalCoverage(d));
    expect(all[0]!.vertical.fraction).toBe(verticalCoverage(d));
  });
});
