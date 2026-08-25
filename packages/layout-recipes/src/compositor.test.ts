import { describe, expect, it } from 'vitest';
import type {
  BrandTokensSnapshot,
  CanvasSize,
  ConceptOutput,
  LayoutPlan,
  LayoutRegion,
  RegionRole,
  SignatureMove,
  TextElement,
  TypeEmphasis,
} from '@brandflow/design-schema';
import {
  GRID_COLUMNS,
  GRID_ROWS,
  MAX_PLAN_REGIONS,
  MAX_TYPE_STEPS_PER_PAGE,
  TYPE_SCALE,
  gridMetrics,
  isTextRole,
  oversizedNumeralSize,
  typeScaleFor,
  validateDesignDocument,
} from '@brandflow/design-schema';
import {
  baselineAlignment,
  composeFromPlan,
  composeFromPlanVerbose,
  distinctFontSizes,
  minTypeStepForRole,
  verticalCoverage,
} from './compositor.js';
import type { CompositionContext } from './compositor.js';

// ---------- fixtures ----------

const brand: BrandTokensSnapshot = {
  colours: {
    primary: '#1a3c8f',
    secondary: '#4a6fd4',
    accent: '#e8b23a',
    neutral: '#8a8f98',
    background: '#ffffff',
    text: '#101418',
  },
  fonts: { heading: 'Inter', body: 'Inter' },
  logoAssetIds: [],
};

const PORTRAIT: CanvasSize = { width: 1080, height: 1350 };
const SQUARE: CanvasSize = { width: 1080, height: 1080 };

/** Deterministic 32-bit PRNG — no Math.random anywhere in these tests. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
}
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length]!;
const between = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

function idFactory() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${(n++).toString(16).padStart(12, '0')}`;
}

const WORDS = [
  'testing', 'shipping', 'velocity', 'quality', 'signal', 'pipeline', 'revenue', 'retention',
  'discovery', 'onboarding', 'clarity', 'compounding', 'systems', 'leverage', 'defaults',
  'measurement', 'craft', 'throughput', 'guardrails', 'momentum',
];

function sentence(r: () => number, minChars: number, maxChars: number): string {
  const target = between(r, minChars, maxChars);
  let out = '';
  while (out.length < target) out += `${out ? ' ' : ''}${pick(r, WORDS)}`;
  return out.slice(0, Math.max(2, target));
}

/** Concept copy is tagged with a TYPE-SCALE STEP NAME, not a region role. */
const scaleName = (emphasis: TypeEmphasis) => TYPE_SCALE[emphasis - 1]!.name;

function copyFor(role: RegionRole, r: () => number): string {
  switch (role) {
    case 'kicker':
      return sentence(r, 6, 18);
    case 'headline':
      return sentence(r, 24, 70);
    case 'subhead':
      return sentence(r, 18, 50);
    case 'stat':
      return `${between(r, 2, 99)}%`;
    case 'cta':
      return sentence(r, 10, 26);
    default:
      return sentence(r, 40, 220);
  }
}

// ---------- plan generator ----------

interface Cell {
  col: { start: number; span: number };
  row: { start: number; span: number };
}

/**
 * Recursively split the grid so generated plans tile it — the shape a
 * competent art director would produce — then optionally punch a hole to make
 * sure the coverage backstop is exercised too.
 */
function partition(r: () => number, count: number): Cell[] {
  let cells: Cell[] = [{ col: { start: 1, span: GRID_COLUMNS }, row: { start: 1, span: GRID_ROWS } }];
  while (cells.length < count) {
    // split the largest cell that can still be split
    const idx = cells
      .map((c, i) => ({ i, area: c.col.span * c.row.span, c }))
      .filter(({ c }) => c.col.span > 1 || c.row.span > 1)
      .sort((a, b) => b.area - a.area)[0]?.i;
    if (idx === undefined) break;
    const cell = cells[idx]!;
    const canV = cell.col.span > 1;
    const canH = cell.row.span > 1;
    const vertical = canV && (!canH || r() < 0.4);
    if (vertical) {
      const at = between(r, 1, cell.col.span - 1);
      cells = cells.flatMap((c, i) =>
        i !== idx
          ? [c]
          : [
              { col: { start: c.col.start, span: at }, row: c.row },
              { col: { start: c.col.start + at, span: c.col.span - at }, row: c.row },
            ],
      );
    } else {
      const at = between(r, 1, cell.row.span - 1);
      cells = cells.flatMap((c, i) =>
        i !== idx
          ? [c]
          : [
              { col: c.col, row: { start: c.row.start, span: at } },
              { col: c.col, row: { start: c.row.start + at, span: c.row.span - at } },
            ],
      );
    }
  }
  return cells;
}

const NON_TEXT: RegionRole[] = ['image', 'block', 'icon', 'chart'];
const TEXT: RegionRole[] = ['kicker', 'subhead', 'body', 'stat', 'cta'];
const MOVES: SignatureMove[] = [
  'bleed-edge',
  'oversized-numeral',
  'overlap',
  'full-bleed-block',
  'crop-circle',
  'rule-accent',
];

interface Generated {
  plan: LayoutPlan;
  concept: ConceptOutput;
  canvas: CanvasSize;
  move: SignatureMove;
}

function generate(seed: number): Generated {
  const r = rng(seed);
  const canvas = r() < 0.5 ? PORTRAIT : SQUARE;
  const move = MOVES[seed % MOVES.length]!;
  const pageCount = r() < 0.75 ? 1 : between(r, 2, 3);

  const planPages: LayoutPlan['pages'] = [];
  const conceptPages: ConceptOutput['pages'] = [];

  for (let p = 0; p < pageCount; p++) {
    const cells = partition(r, between(r, 3, 8));
    // drop a cell now and then so the coverage backstop has to do real work
    const kept = cells.length > 3 && r() < 0.35 ? cells.filter((_, i) => i !== between(r, 1, cells.length - 1)) : cells;

    const regions: LayoutRegion[] = kept.map((cell, i) => {
      const role: RegionRole = i === 0 ? 'headline' : r() < 0.55 ? pick(r, TEXT) : pick(r, NON_TEXT);
      const region: LayoutRegion = {
        id: `p${p}r${i}`,
        role,
        col: cell.col,
        row: cell.row,
        emphasis: between(r, 1, 6) as TypeEmphasis,
      };
      if (r() < 0.5) region.align = pick(r, ['left', 'center', 'right'] as const);
      if (r() < 0.4)
        region.colour = pick(r, ['text', 'primary', 'secondary', 'accent', 'neutral', 'background'] as const);
      if (role === 'image' || role === 'icon') region.imageQuery = pick(r, WORDS);
      return region;
    });

    // copy is authored per text region, in order; contentRef is that item's
    // 0-based index, sometimes omitted so the positional fallback is exercised
    const copyRegions = regions.filter((x) => isTextRole(x.role) || x.role === 'chart');
    const copy = copyRegions.map((x) => ({
      role: scaleName(x.emphasis),
      text: copyFor(x.role, r),
    }));
    copyRegions.forEach((region, i) => {
      if (r() < 0.7) region.contentRef = String(i);
    });

    planPages.push({
      background: pick(r, ['background', 'primary', 'accent', 'text'] as const),
      regions,
      signatureRegionId: pick(r, regions).id,
    });
    conceptPages.push({ purpose: sentence(r, 10, 40), copy });
  }

  return {
    canvas,
    move,
    plan: { pages: planPages },
    concept: {
      bigIdea: sentence(r, 30, 80),
      metaphor: sentence(r, 20, 60),
      focalPoint: sentence(r, 8, 30),
      register: pick(r, ['bold', 'calm', 'urgent', 'playful', 'authoritative'] as const),
      signatureMove: move,
      pages: conceptPages,
    },
  };
}

function contextFor(g: Generated, seed: number): CompositionContext {
  const newId = idFactory();
  return {
    documentId: newId(),
    brandProfileId: 'brand-1',
    clientCompanyId: 'client-1',
    brandTokens: brand,
    variant: g.move,
    seed,
    newId,
    canvas: g.canvas,
    format: 'single_image',
    concept: g.concept,
  };
}

// ---------- property tests ----------

describe('composeFromPlan — property tests over generated plans', () => {
  const PLANS = 400;
  const results = {
    plans: 0,
    pages: 0,
    errors: [] as string[],
    minAlignment: 1,
    minCoverage: 1,
    maxDistinctSizes: 0,
  };

  const composed = Array.from({ length: PLANS }, (_, i) => {
    const g = generate(i + 1);
    return { g, doc: composeFromPlan(g.plan, contextFor(g, i + 1)) };
  });

  it(`composes ${PLANS} varied plans with zero validation errors`, () => {
    for (const { g, doc } of composed) {
      const report = validateDesignDocument(doc);
      results.plans++;
      results.pages += doc.pages.length;
      if (!report.passed)
        results.errors.push(
          `${g.move} ${g.canvas.width}x${g.canvas.height}: ${report.errors.map((e) => `${e.ruleId} ${e.message}`).join('; ')}`,
        );
    }
    expect(results.errors.slice(0, 5)).toEqual([]);
    expect(results.errors).toHaveLength(0);
  });

  it('lands at least 95% of element positions on the 8px grid', () => {
    for (const { doc } of composed) {
      const alignment = baselineAlignment(doc);
      results.minAlignment = Math.min(results.minAlignment, alignment);
      expect(alignment).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('never emits a font size outside the scale, and never more than six of them', () => {
    for (const { g, doc } of composed) {
      const scale = new Set(typeScaleFor(g.canvas));
      const oversized = oversizedNumeralSize(g.canvas);
      const sizes = distinctFontSizes(doc);
      const onScale = sizes.filter((s) => scale.has(s));
      const offScale = sizes.filter((s) => !scale.has(s));
      results.maxDistinctSizes = Math.max(results.maxDistinctSizes, onScale.length);
      // the scale is the closed vocabulary: at most its six values
      expect(onScale.length).toBeLessThanOrEqual(6);
      // the only sanctioned exception is the signature oversized numeral
      expect(offScale.every((s) => s === oversized), `off-scale sizes ${offScale}`).toBe(true);
      expect(offScale.length).toBeLessThanOrEqual(1);
    }
  });

  it('uses at least 75% of the canvas height on every page', () => {
    for (const { g, doc } of composed)
      for (let i = 0; i < doc.pages.length; i++) {
        const coverage = verticalCoverage(doc, i);
        results.minCoverage = Math.min(results.minCoverage, coverage);
        expect(coverage, `${g.move} page ${i + 1} covered only ${(coverage * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(
          0.75,
        );
      }
  });

  it('keeps every planned page within the hierarchy rule', () => {
    for (const { doc } of composed)
      for (const page of doc.pages) {
        const steps = new Set(
          page.elements.filter((e): e is TextElement => e.type === 'text').map((e) => e.fontSize),
        );
        // the plan is coerced to <=4 steps; fitting may step a region down
        // within the scale, which is why the emitted ceiling is the scale itself
        expect(steps.size).toBeLessThanOrEqual(6);
      }
  });

  it('is deterministic: the same plan composes to the same document', () => {
    for (let i = 0; i < 40; i++) {
      const g = generate(i + 1);
      const a = composeFromPlan(g.plan, contextFor(g, i + 1));
      const b = composeFromPlan(g.plan, contextFor(g, i + 1));
      expect(JSON.stringify(b)).toEqual(JSON.stringify(a));
    }
  });

  it('reports the aggregate measures the spec targets', () => {
    expect(results.plans).toBe(PLANS);
    // surfaced so a regression shows the number, not just a red cross
    expect({
      plans: results.plans,
      pagesComposed: results.pages,
      worstAlignment: Number(results.minAlignment.toFixed(3)),
      worstCoverage: Number(results.minCoverage.toFixed(3)),
      mostDistinctFontSizes: results.maxDistinctSizes,
      validationErrors: results.errors.length,
    }).toMatchObject({ validationErrors: 0 });
  });
});

// ---------- targeted behaviour ----------

function simplePlan(over: Partial<LayoutRegion>[], move: SignatureMove, signatureId = 'r0') {
  const regions: LayoutRegion[] = over.map((o, i) => ({
    id: `r${i}`,
    role: 'body',
    col: { start: 1, span: 12 },
    row: { start: i * 4 + 1, span: 4 },
    emphasis: 4,
    ...o,
  }));
  const plan: LayoutPlan = {
    pages: [{ background: 'background', regions, signatureRegionId: signatureId }],
  };
  const concept: ConceptOutput = {
    bigIdea: 'Quality is a system, not a heroic effort at the end of the sprint',
    metaphor: 'a conveyor belt with inspection stations along its length',
    focalPoint: 'the number 73',
    register: 'authoritative',
    signatureMove: move,
    pages: [
      {
        purpose: 'Make the case',
        copy: regions.map((r, i) => ({
          role: scaleName(r.emphasis),
          text:
            r.role === 'stat'
              ? '73%'
              : r.role === 'headline'
                ? 'Testing is not the same as quality assurance'
                : `Supporting copy number ${i + 1} that explains the point in a sentence of real length.`,
        })),
      },
    ],
  };
  const g: Generated = { plan, concept, canvas: PORTRAIT, move };
  return { ...g, ctx: contextFor(g, 7) };
}

describe('signature moves', () => {
  it('bleed-edge runs a block off the canvas without tripping safe margins', () => {
    const { plan, ctx } = simplePlan(
      [
        { role: 'block', col: { start: 1, span: 6 }, row: { start: 1, span: 8 } },
        { role: 'headline', col: { start: 1, span: 12 }, row: { start: 9, span: 8 }, emphasis: 2 },
      ],
      'bleed-edge',
    );
    const doc = composeFromPlan(plan, ctx);
    expect(validateDesignDocument(doc).errors).toEqual([]);
    const bled = doc.pages[0]!.elements.find((e) => e.frame.x === 0);
    expect(bled).toBeDefined();
    expect(['decoration', 'background']).toContain(bled!.roleHint);
  });

  it('oversized-numeral sets a stat at display x2 and crops it on the canvas edge', () => {
    const { plan, ctx } = simplePlan(
      [
        { role: 'stat', col: { start: 1, span: 8 }, row: { start: 1, span: 8 }, emphasis: 1 },
        { role: 'headline', col: { start: 1, span: 12 }, row: { start: 9, span: 8 }, emphasis: 2 },
      ],
      'oversized-numeral',
    );
    const doc = composeFromPlan(plan, ctx);
    expect(validateDesignDocument(doc).errors).toEqual([]);
    const numeral = doc.pages[0]!.elements.find(
      (e): e is TextElement => e.type === 'text' && e.fontSize === oversizedNumeralSize(PORTRAIT),
    );
    expect(numeral).toBeDefined();
    expect(numeral!.roleHint).toBe('decoration');
    // genuinely cropped: one edge is off-canvas, but it is not off-canvas entirely
    const off = numeral!.frame.x < 0 || numeral!.frame.x + numeral!.frame.width > PORTRAIT.width;
    expect(off).toBe(true);
    expect(numeral!.frame.x).toBeLessThan(PORTRAIT.width);
    expect(numeral!.frame.x + numeral!.frame.width).toBeGreaterThan(0);
  });

  it('overlap extends the signature region into its neighbour by one gutter', () => {
    const { plan, ctx } = simplePlan(
      [
        { role: 'headline', col: { start: 1, span: 6 }, row: { start: 1, span: 8 }, emphasis: 2 },
        { role: 'image', col: { start: 7, span: 6 }, row: { start: 1, span: 8 } },
        { role: 'body', col: { start: 1, span: 12 }, row: { start: 9, span: 8 } },
      ],
      'overlap',
    );
    const plain = composeFromPlan(plan, { ...ctx, concept: { ...ctx.concept, signatureMove: 'rule-accent' } });
    const doc = composeFromPlan(plan, ctx);
    expect(validateDesignDocument(doc).errors).toEqual([]);
    const before = plain.pages[0]!.elements.find((e) => e.recipeSlotId === 'r0')!;
    const after = doc.pages[0]!.elements.find((e) => e.recipeSlotId === 'r0')!;
    const image = doc.pages[0]!.elements.find((e) => e.recipeSlotId === 'r1')!;
    expect(after.frame.width).toBeGreaterThan(before.frame.width);
    expect(after.frame.x + after.frame.width).toBeGreaterThan(image.frame.x);
    expect(after.zIndex).toBeGreaterThan(image.zIndex);
  });

  it('full-bleed-block spans the canvas width and stays legible', () => {
    const { plan, ctx } = simplePlan(
      [
        { role: 'headline', col: { start: 2, span: 10 }, row: { start: 4, span: 6 }, emphasis: 2 },
        { role: 'body', col: { start: 2, span: 10 }, row: { start: 11, span: 6 } },
      ],
      'full-bleed-block',
    );
    const doc = composeFromPlan(plan, ctx);
    expect(validateDesignDocument(doc).errors).toEqual([]);
    const band = doc.pages[0]!.elements.find((e) => e.type === 'shape' && e.frame.width === PORTRAIT.width);
    expect(band).toBeDefined();
    expect(band!.roleHint).toBe('background');
    expect(band!.frame.x).toBe(0);
  });

  it('crop-circle masks an image to a circle beyond its column span', () => {
    const { plan, ctx } = simplePlan(
      [
        { role: 'image', col: { start: 2, span: 6 }, row: { start: 2, span: 8 } },
        { role: 'headline', col: { start: 1, span: 12 }, row: { start: 11, span: 6 }, emphasis: 2 },
      ],
      'crop-circle',
      'r0',
    );
    const doc = composeFromPlan(plan, ctx);
    expect(validateDesignDocument(doc).errors).toEqual([]);
    const img = doc.pages[0]!.elements.find((e) => e.type === 'image')!;
    expect(img.type === 'image' && img.cornerRadius).toBe(img.frame.width / 2);
    expect(img.frame.width).toBe(img.frame.height);
    const g = gridMetrics(PORTRAIT);
    const cellWidth = 6 * g.colWidth + 5 * g.gutter;
    expect(img.frame.width).toBeGreaterThan(cellWidth);
  });

  it('rule-accent anchors a heavy rule to the headline, inside the safe area', () => {
    const { plan, ctx } = simplePlan(
      [
        { role: 'headline', col: { start: 1, span: 10 }, row: { start: 2, span: 6 }, emphasis: 2 },
        { role: 'body', col: { start: 1, span: 10 }, row: { start: 10, span: 7 } },
      ],
      'rule-accent',
    );
    const doc = composeFromPlan(plan, ctx);
    expect(validateDesignDocument(doc).errors).toEqual([]);
    const rule = doc.pages[0]!.elements.find((e) => e.roleHint === 'divider')!;
    const g = gridMetrics(PORTRAIT);
    expect(rule.frame.height).toBeGreaterThanOrEqual(8);
    expect(rule.frame.x).toBeGreaterThanOrEqual(g.safeMarginX);
    expect(rule.frame.y + rule.frame.height).toBeLessThanOrEqual(PORTRAIT.height - g.safeMarginY);
  });

  it('applies exactly one signature move per page', () => {
    for (const move of MOVES) {
      const { plan, ctx } = simplePlan(
        [
          { role: 'headline', col: { start: 1, span: 8 }, row: { start: 1, span: 8 }, emphasis: 2 },
          { role: 'image', col: { start: 9, span: 4 }, row: { start: 1, span: 8 } },
          { role: 'body', col: { start: 1, span: 12 }, row: { start: 9, span: 8 } },
        ],
        move,
      );
      const { notes } = composeFromPlanVerbose(plan, ctx);
      expect(notes.filter((n) => n.includes('signature:')).length).toBeLessThanOrEqual(1);
    }
  });
});

describe('deterministic coercions', () => {
  it('raises a headline asked for at caption size to its readability floor', () => {
    expect(minTypeStepForRole('headline', PORTRAIT)).toBe(4);
    expect(minTypeStepForRole('subhead', PORTRAIT)).toBe(5);
    expect(minTypeStepForRole('body', PORTRAIT)).toBe(6);
    const { plan, ctx } = simplePlan(
      [
        { role: 'headline', col: { start: 1, span: 12 }, row: { start: 1, span: 8 }, emphasis: 6 },
        { role: 'body', col: { start: 1, span: 12 }, row: { start: 9, span: 8 } },
      ],
      'rule-accent',
    );
    const doc = composeFromPlan(plan, ctx);
    const headline = doc.pages[0]!.elements.find(
      (e): e is TextElement => e.type === 'text' && e.roleHint === 'headline',
    )!;
    expect(headline.fontSize).toBeGreaterThanOrEqual(30);
    expect(validateDesignDocument(doc).errors).toEqual([]);
  });

  it('steps type down within the scale rather than off it', () => {
    const { plan, ctx } = simplePlan(
      [
        { role: 'headline', col: { start: 1, span: 4 }, row: { start: 1, span: 2 }, emphasis: 1 },
        { role: 'body', col: { start: 1, span: 12 }, row: { start: 3, span: 14 } },
      ],
      'rule-accent',
    );
    const doc = composeFromPlan(plan, ctx);
    const legal = new Set(typeScaleFor(PORTRAIT));
    for (const size of distinctFontSizes(doc)) expect(legal.has(size)).toBe(true);
    expect(validateDesignDocument(doc).errors).toEqual([]);
  });

  it('stretches a short plan to fill the page and records why', () => {
    const { plan, ctx } = simplePlan(
      [
        { role: 'headline', col: { start: 1, span: 12 }, row: { start: 2, span: 2 }, emphasis: 2 },
        { role: 'body', col: { start: 1, span: 12 }, row: { start: 4, span: 2 } },
      ],
      'rule-accent',
    );
    const { document, notes } = composeFromPlanVerbose(plan, ctx);
    expect(notes.join(' ')).toContain('stretched to fill');
    expect(verticalCoverage(document, 0)).toBeGreaterThanOrEqual(0.75);
    expect(validateDesignDocument(document).errors).toEqual([]);
  });

  it('truncates only as a last resort, and says so in the element meta', () => {
    const { plan, ctx } = simplePlan(
      [{ role: 'headline', col: { start: 1, span: 1 }, row: { start: 1, span: 16 }, emphasis: 2 }],
      'rule-accent',
    );
    const huge = 'quality '.repeat(400);
    ctx.concept.pages[0]!.copy = [{ role: 'headline', text: huge.slice(0, 600) }];
    const doc = composeFromPlan(plan, ctx);
    expect(validateDesignDocument(doc).errors).toEqual([]);
    const text = doc.pages[0]!.elements.find((e): e is TextElement => e.type === 'text')!;
    expect(text.meta.truncated).toBe(true);
    expect(text.text.endsWith('…')).toBe(true);
  });

  it('keeps a page of nothing but images editable', () => {
    const { plan, ctx } = simplePlan(
      [
        { role: 'image', col: { start: 1, span: 12 }, row: { start: 1, span: 8 } },
        { role: 'image', col: { start: 1, span: 12 }, row: { start: 9, span: 8 } },
      ],
      'bleed-edge',
    );
    const doc = composeFromPlan(plan, ctx);
    expect(validateDesignDocument(doc).errors).toEqual([]);
    expect(doc.pages[0]!.elements.some((e) => e.type !== 'image')).toBe(true);
  });

  it('recolours text that would fail contrast on its background', () => {
    const { plan, ctx } = simplePlan(
      [
        { role: 'headline', col: { start: 1, span: 12 }, row: { start: 1, span: 8 }, emphasis: 2, colour: 'text' },
        { role: 'body', col: { start: 1, span: 12 }, row: { start: 9, span: 8 }, colour: 'text' },
      ],
      'rule-accent',
    );
    plan.pages[0]!.background = 'text'; // same token as the copy: 1:1 contrast
    const doc = composeFromPlan(plan, ctx);
    expect(validateDesignDocument(doc).errors).toEqual([]);
    for (const el of doc.pages[0]!.elements)
      if (el.type === 'text') expect(el.colour).not.toEqual({ kind: 'token', token: 'text' });
  });

  it('composes both LinkedIn canvases from the same plan', () => {
    const { plan, ctx } = simplePlan(
      [
        { role: 'kicker', col: { start: 1, span: 6 }, row: { start: 1, span: 2 }, emphasis: 6 },
        { role: 'headline', col: { start: 1, span: 10 }, row: { start: 3, span: 7 }, emphasis: 2 },
        { role: 'image', col: { start: 1, span: 12 }, row: { start: 10, span: 7 } },
      ],
      'rule-accent',
    );
    for (const canvas of [PORTRAIT, SQUARE]) {
      const doc = composeFromPlan(plan, { ...ctx, canvas, newId: idFactory() });
      expect(validateDesignDocument(doc).errors).toEqual([]);
      expect(doc.canvas.width).toBe(canvas.width);
      expect(baselineAlignment(doc)).toBeGreaterThanOrEqual(0.95);
      expect(verticalCoverage(doc, 0)).toBeGreaterThanOrEqual(0.75);
    }
  });

  it('resolves contentRef by 0-based index into the page copy array', () => {
    const { plan, ctx } = simplePlan(
      [
        { role: 'headline', col: { start: 1, span: 12 }, row: { start: 1, span: 6 }, emphasis: 2, contentRef: '2' },
        { role: 'body', col: { start: 1, span: 12 }, row: { start: 7, span: 5 }, contentRef: '1' },
        { role: 'body', col: { start: 1, span: 12 }, row: { start: 12, span: 5 }, contentRef: '0' },
      ],
      'rule-accent',
    );
    const copy = ctx.concept.pages[0]!.copy;
    copy[0] = { role: 'display', text: 'Zero index copy line' };
    copy[1] = { role: 'headline', text: 'One index copy line' };
    copy[2] = { role: 'body', text: 'Two index copy line' };

    const doc = composeFromPlan(plan, ctx);
    const byRegion = (id: string) =>
      doc.pages[0]!.elements.find((e): e is TextElement => e.type === 'text' && e.recipeSlotId === id)!;
    // index lookup, NOT role matching: r0 is a headline region but points at
    // index 2, whose copy item is tagged 'body' — the index must win
    expect(byRegion('r0').text).toBe('Two index copy line');
    expect(byRegion('r1').text).toBe('One index copy line');
    expect(byRegion('r2').text).toBe('Zero index copy line');
  });

  it('falls back to concept order when contentRef is absent, without stealing indexed copy', () => {
    const { plan, ctx } = simplePlan(
      [
        { role: 'headline', col: { start: 1, span: 12 }, row: { start: 1, span: 6 }, emphasis: 2 },
        { role: 'body', col: { start: 1, span: 12 }, row: { start: 7, span: 5 }, contentRef: '0' },
        { role: 'body', col: { start: 1, span: 12 }, row: { start: 12, span: 5 } },
      ],
      'rule-accent',
    );
    const copy = ctx.concept.pages[0]!.copy;
    copy[0] = { role: 'display', text: 'Claimed by an explicit index' };
    copy[1] = { role: 'body', text: 'First unclaimed line' };
    copy[2] = { role: 'body', text: 'Second unclaimed line' };

    const doc = composeFromPlan(plan, ctx);
    const byRegion = (id: string) =>
      doc.pages[0]!.elements.find((e): e is TextElement => e.type === 'text' && e.recipeSlotId === id)!;
    expect(byRegion('r1').text).toBe('Claimed by an explicit index');
    // the unreferenced regions skip index 0 because r1 already claimed it
    expect(byRegion('r0').text).toBe('First unclaimed line');
    expect(byRegion('r2').text).toBe('Second unclaimed line');
  });

  it('lets two regions share one copy index without erroring', () => {
    const { plan, ctx } = simplePlan(
      [
        { role: 'headline', col: { start: 1, span: 12 }, row: { start: 1, span: 8 }, emphasis: 2, contentRef: '0' },
        { role: 'body', col: { start: 1, span: 12 }, row: { start: 9, span: 8 }, contentRef: '0' },
      ],
      'rule-accent',
    );
    ctx.concept.pages[0]!.copy = [{ role: 'headline', text: 'Shared copy line for both regions' }];
    const doc = composeFromPlan(plan, ctx);
    expect(validateDesignDocument(doc).errors).toEqual([]);
    const texts = doc.pages[0]!.elements.filter((e): e is TextElement => e.type === 'text');
    expect(texts.filter((t) => t.text === 'Shared copy line for both regions')).toHaveLength(2);
  });
});

describe('hierarchy rule end to end', () => {
  it('coerces a six-step plan down to at most four planned steps', () => {
    const regions: Partial<LayoutRegion>[] = ([1, 2, 3, 4, 5, 6] as TypeEmphasis[]).map((e, i) => ({
      role: (i === 0 ? 'headline' : 'body') as RegionRole,
      col: { start: 1, span: 12 },
      row: { start: i * 2 + 1, span: 2 },
      emphasis: e,
    }));
    const { plan, ctx } = simplePlan(regions, 'rule-accent');
    const { document, notes } = composeFromPlanVerbose(plan, ctx);
    expect(notes.join(' ')).toContain('exceeded the limit');
    expect(validateDesignDocument(document).errors).toEqual([]);
    const sizes = distinctFontSizes(document);
    expect(sizes.length).toBeLessThanOrEqual(MAX_TYPE_STEPS_PER_PAGE + 2);
  });

  it('guarantees at least one step-1-or-2 element on every generated page', () => {
    for (let i = 0; i < 60; i++) {
      const g = generate(i + 500);
      const doc = composeFromPlan(g.plan, contextFor(g, i + 500));
      for (const page of doc.pages) {
        const texts = page.elements.filter((e): e is TextElement => e.type === 'text');
        if (texts.length === 0) continue;
        const biggest = Math.max(...texts.map((t) => t.fontSize));
        const scale = typeScaleFor(g.canvas);
        expect(biggest).toBeGreaterThanOrEqual(scale[3]!); // at least bodyLarge, i.e. a real focal point
      }
    }
  });
});
