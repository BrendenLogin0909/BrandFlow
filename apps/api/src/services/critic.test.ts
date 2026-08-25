/**
 * Stage 4 critic tests. The two things worth guarding hardest:
 *  - applyAdjustments cannot be talked into an invalid plan, whatever the
 *    critic returns (out-of-range cells, removing the last text region,
 *    orphaning the signature move);
 *  - the loop never returns a worse round than one it already saw.
 * No live vision endpoint is touched: providers are stubbed or mocked.
 */
import { describe, expect, it, vi } from 'vitest';
import type { LayoutPlan, PlanPage } from '@brandflow/design-schema';
import { MockAiAdapter } from '../adapters/mock-ai-adapter.js';
import {
  applyAdjustments,
  criticLoop,
  critiquePage,
  CritiqueOutput,
  gridOccupancy,
  totalScore,
  type CritiqueScores,
  type RegionAdjustment,
} from './critic.js';
import type { AiCompletionMeta, AiProviderPort, PipelineStep } from '../ports/index.js';

// ---------- fixtures ----------

function page(overrides: Partial<PlanPage> = {}): PlanPage {
  return {
    background: 'background',
    signatureRegionId: 'stat',
    signatureMove: 'oversized-numeral',
    regions: [
      { id: 'kicker', role: 'kicker', col: { start: 1, span: 4 }, row: { start: 2, span: 1 }, emphasis: 6 },
      { id: 'headline', role: 'headline', col: { start: 1, span: 8 }, row: { start: 3, span: 3 }, emphasis: 2 },
      { id: 'body', role: 'body', col: { start: 1, span: 6 }, row: { start: 7, span: 2 }, emphasis: 5 },
      { id: 'stat', role: 'stat', col: { start: 8, span: 5 }, row: { start: 10, span: 4 }, emphasis: 1 },
      { id: 'hero', role: 'image', col: { start: 7, span: 6 }, row: { start: 2, span: 6 }, emphasis: 4 },
    ],
    ...overrides,
  };
}

function plan(overrides: Partial<PlanPage> = {}): LayoutPlan {
  return { pages: [page(overrides)] };
}

const find = (p: LayoutPlan, id: string) => p.pages[0]!.regions.find((r) => r.id === id);

function adj(a: Partial<RegionAdjustment> & Pick<RegionAdjustment, 'regionId' | 'action'>): RegionAdjustment {
  return { why: 'test', ...a };
}

function scores(values: Partial<Record<keyof CritiqueScores, number>> = {}, base = 3): CritiqueScores {
  const mk = (n: number) => ({ score: n, note: 'test note' });
  return {
    hierarchy: mk(values.hierarchy ?? base),
    alignment: mk(values.alignment ?? base),
    activeWhitespace: mk(values.activeWhitespace ?? base),
    restraint: mk(values.restraint ?? base),
    concept: mk(values.concept ?? base),
    signatureMove: mk(values.signatureMove ?? base),
    variety: mk(values.variety ?? base),
  };
}

/** Provider stub returning canned critiques in order, one per call. */
function stubProvider(rounds: { scores: CritiqueScores; adjustments: RegionAdjustment[] }[]): AiProviderPort {
  let call = 0;
  return {
    async complete<T>(_step: PipelineStep, _input: unknown, schema: import('zod').ZodType<T>) {
      const r = rounds[Math.min(call++, rounds.length - 1)]!;
      const data = schema.parse({
        scores: r.scores,
        biggestProblem: 'stubbed problem',
        verdict: 'generic',
        adjustments: r.adjustments,
      });
      const meta: AiCompletionMeta = { model: 'stub', promptVersion: 'stub@1', tokensUsed: 0 };
      return { data, meta };
    },
  };
}

/** An SVG the rasteriser can actually render, so critiquePage gets past the render. */
const RENDERABLE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <rect width="1080" height="1080" fill="#101828"/>
  <text x="90" y="300" font-family="Arial" font-size="96" font-weight="800" fill="#ffffff">HEADLINE HERE</text>
  <text x="90" y="420" font-family="Arial" font-size="28" fill="#94a3b8">Supporting line of body copy for the page.</text>
  <rect x="90" y="600" width="520" height="300" rx="24" fill="#22d3ee"/>
</svg>`;

// ---------- applyAdjustments: each action ----------

describe('applyAdjustments — actions', () => {
  it('move repositions a region and keeps its span', () => {
    const out = applyAdjustments(plan(), [
      adj({ regionId: 'body', action: 'move', to: { col: { start: 6, span: 99 }, row: { start: 12, span: 99 } } }),
    ]);
    expect(find(out, 'body')!.col).toEqual({ start: 6, span: 6 });
    expect(find(out, 'body')!.row).toEqual({ start: 12, span: 2 });
  });

  it('move can also set alignment', () => {
    const out = applyAdjustments(plan(), [
      adj({ regionId: 'body', action: 'move', to: { col: { start: 2, span: 1 }, align: 'center' } }),
    ]);
    expect(find(out, 'body')!.align).toBe('center');
  });

  it('resize changes the span, keeping the start when none is given', () => {
    const out = applyAdjustments(plan(), [
      adj({ regionId: 'hero', action: 'resize', to: { col: { start: 7, span: 4 }, row: { start: 2, span: 8 } } }),
    ]);
    expect(find(out, 'hero')!.col).toEqual({ start: 7, span: 4 });
    expect(find(out, 'hero')!.row).toEqual({ start: 2, span: 8 });
  });

  it('emphasise steps one place up the type scale', () => {
    const out = applyAdjustments(plan(), [adj({ regionId: 'headline', action: 'emphasise' })]);
    expect(find(out, 'headline')!.emphasis).toBe(1);
  });

  it('deemphasise steps one place down the type scale', () => {
    const out = applyAdjustments(plan(), [adj({ regionId: 'headline', action: 'deemphasise' })]);
    expect(find(out, 'headline')!.emphasis).toBe(3);
  });

  it('emphasise honours an explicit target step', () => {
    const out = applyAdjustments(plan(), [
      adj({ regionId: 'body', action: 'emphasise', to: { emphasis: 4 } }),
    ]);
    expect(find(out, 'body')!.emphasis).toBe(4);
  });

  it('recolour swaps the region colour token', () => {
    const out = applyAdjustments(plan(), [
      adj({ regionId: 'kicker', action: 'recolour', to: { colour: 'accent' } }),
    ]);
    expect(find(out, 'kicker')!.colour).toBe('accent');
  });

  it('remove deletes the region', () => {
    const out = applyAdjustments(plan(), [adj({ regionId: 'kicker', action: 'remove' })]);
    expect(find(out, 'kicker')).toBeUndefined();
    expect(out.pages[0]!.regions).toHaveLength(4);
  });

  it('ignores adjustments naming a region that does not exist', () => {
    const before = plan();
    const out = applyAdjustments(before, [adj({ regionId: 'ghost', action: 'remove' })]);
    expect(out.pages[0]!.regions).toHaveLength(before.pages[0]!.regions.length);
  });
});

// ---------- applyAdjustments: purity ----------

describe('applyAdjustments — purity', () => {
  it('does not mutate the input plan', () => {
    const before = plan();
    const snapshot = JSON.parse(JSON.stringify(before));
    applyAdjustments(before, [
      adj({ regionId: 'headline', action: 'emphasise' }),
      adj({ regionId: 'kicker', action: 'remove' }),
      adj({ regionId: 'body', action: 'move', to: { row: { start: 14, span: 2 } } }),
    ]);
    expect(before).toEqual(snapshot);
  });

  it('is deterministic across repeated runs', () => {
    const list = [
      adj({ regionId: 'stat', action: 'remove' }),
      adj({ regionId: 'headline', action: 'deemphasise' }),
      adj({ regionId: 'hero', action: 'resize', to: { col: { start: 3, span: 40 } } }),
    ];
    const a = applyAdjustments(plan(), list);
    const b = applyAdjustments(plan(), list);
    expect(a).toEqual(b);
  });

  it('uses no clock or randomness', () => {
    const now = vi.spyOn(Date, 'now');
    const rand = vi.spyOn(Math, 'random');
    applyAdjustments(plan(), [
      adj({ regionId: 'stat', action: 'remove' }),
      adj({ regionId: 'body', action: 'move', to: { col: { start: 2, span: 3 } } }),
    ]);
    expect(now).not.toHaveBeenCalled();
    expect(rand).not.toHaveBeenCalled();
    now.mockRestore();
    rand.mockRestore();
  });
});

// ---------- applyAdjustments: clamping ----------

describe('applyAdjustments — clamping out-of-range targets', () => {
  it('clamps column start above 12 back into the grid', () => {
    const out = applyAdjustments(plan(), [
      adj({ regionId: 'body', action: 'move', to: { col: { start: 40, span: 6 } } }),
    ]);
    const col = find(out, 'body')!.col;
    expect(col.start).toBe(12);
    expect(col.start + col.span - 1).toBeLessThanOrEqual(12);
  });

  it('clamps row start above 16 back into the grid', () => {
    const out = applyAdjustments(plan(), [
      adj({ regionId: 'body', action: 'move', to: { row: { start: 99, span: 2 } } }),
    ]);
    const row = find(out, 'body')!.row;
    expect(row.start).toBe(16);
    expect(row.start + row.span - 1).toBeLessThanOrEqual(16);
  });

  it('clamps zero and negative starts up to 1', () => {
    const out = applyAdjustments(plan(), [
      adj({ regionId: 'body', action: 'move', to: { col: { start: -5, span: 2 }, row: { start: 0, span: 2 } } }),
    ]);
    expect(find(out, 'body')!.col.start).toBe(1);
    expect(find(out, 'body')!.row.start).toBe(1);
  });

  it('clamps a span that would overflow the axis', () => {
    const out = applyAdjustments(plan(), [
      adj({ regionId: 'hero', action: 'resize', to: { col: { start: 10, span: 12 }, row: { start: 14, span: 12 } } }),
    ]);
    expect(find(out, 'hero')!.col).toEqual({ start: 10, span: 3 });
    expect(find(out, 'hero')!.row).toEqual({ start: 14, span: 3 });
  });

  it('clamps a zero or negative span to 1', () => {
    const out = applyAdjustments(plan(), [
      adj({ regionId: 'hero', action: 'resize', to: { col: { start: 3, span: 0 }, row: { start: 3, span: -4 } } }),
    ]);
    expect(find(out, 'hero')!.col.span).toBe(1);
    expect(find(out, 'hero')!.row.span).toBe(1);
  });

  it('rounds fractional grid values to whole cells', () => {
    const out = applyAdjustments(plan(), [
      adj({ regionId: 'body', action: 'move', to: { col: { start: 4.6, span: 2 } } }),
    ]);
    expect(Number.isInteger(find(out, 'body')!.col.start)).toBe(true);
    expect(find(out, 'body')!.col.start).toBe(5);
  });

  it('clamps an out-of-range emphasis target to the 1-6 type scale', () => {
    const high = applyAdjustments(plan(), [
      adj({ regionId: 'body', action: 'deemphasise', to: { emphasis: 99 } }),
    ]);
    expect(find(high, 'body')!.emphasis).toBe(6);
    const low = applyAdjustments(plan(), [
      adj({ regionId: 'body', action: 'emphasise', to: { emphasis: -3 } }),
    ]);
    // emphasis 1 on body would be a 5th distinct step, so it is refused rather
    // than clamped into an illegal page — either way it stays in range
    expect(find(low, 'body')!.emphasis).toBeGreaterThanOrEqual(1);
    expect(find(low, 'body')!.emphasis).toBeLessThanOrEqual(6);
  });

  it('never steps emphasis past the ends of the scale', () => {
    const top = applyAdjustments(plan(), [adj({ regionId: 'stat', action: 'emphasise' })]);
    expect(find(top, 'stat')!.emphasis).toBe(1); // already 1, cannot go higher
    const bottom = applyAdjustments(plan(), [adj({ regionId: 'kicker', action: 'deemphasise' })]);
    expect(find(bottom, 'kicker')!.emphasis).toBe(6); // already 6, cannot go lower
  });
});

// ---------- applyAdjustments: invariants ----------

describe('applyAdjustments — invariants', () => {
  it('refuses to remove the last remaining text region', () => {
    const single = plan({
      signatureRegionId: 'headline',
      regions: [
        { id: 'headline', role: 'headline', col: { start: 1, span: 8 }, row: { start: 3, span: 3 }, emphasis: 2 },
        { id: 'hero', role: 'image', col: { start: 1, span: 12 }, row: { start: 8, span: 6 }, emphasis: 4 },
      ],
    });
    const out = applyAdjustments(single, [adj({ regionId: 'headline', action: 'remove' })]);
    expect(find(out, 'headline')).toBeDefined();
    expect(out.pages[0]!.regions.filter((r) => r.role === 'headline')).toHaveLength(1);
  });

  it('removes text regions freely while more than one remains', () => {
    const out = applyAdjustments(plan(), [
      adj({ regionId: 'kicker', action: 'remove' }),
      adj({ regionId: 'body', action: 'remove' }),
    ]);
    expect(find(out, 'kicker')).toBeUndefined();
    expect(find(out, 'body')).toBeUndefined();
    expect(out.pages[0]!.regions.some((r) => ['headline', 'stat'].includes(r.id))).toBe(true);
  });

  it('never empties a page', () => {
    const solo = plan({
      signatureRegionId: 'only',
      regions: [{ id: 'only', role: 'headline', col: { start: 1, span: 12 }, row: { start: 1, span: 4 }, emphasis: 1 }],
    });
    const out = applyAdjustments(solo, [adj({ regionId: 'only', action: 'remove' })]);
    expect(out.pages[0]!.regions).toHaveLength(1);
  });

  it('keeps exactly one signature move when its region survives', () => {
    const out = applyAdjustments(plan(), [adj({ regionId: 'kicker', action: 'remove' })]);
    expect(out.pages[0]!.signatureRegionId).toBe('stat');
    expect(out.pages[0]!.regions.filter((r) => r.id === out.pages[0]!.signatureRegionId)).toHaveLength(1);
  });

  it('re-anchors the signature move when its region is removed', () => {
    const out = applyAdjustments(plan(), [adj({ regionId: 'stat', action: 'remove' })]);
    expect(find(out, 'stat')).toBeUndefined();
    const sigId = out.pages[0]!.signatureRegionId;
    expect(sigId).not.toBe('stat');
    // exactly one, and it exists
    expect(out.pages[0]!.regions.filter((r) => r.id === sigId)).toHaveLength(1);
  });

  it('re-anchors the signature move deterministically', () => {
    const a = applyAdjustments(plan(), [adj({ regionId: 'stat', action: 'remove' })]);
    const b = applyAdjustments(plan(), [adj({ regionId: 'stat', action: 'remove' })]);
    expect(a.pages[0]!.signatureRegionId).toBe(b.pages[0]!.signatureRegionId);
  });

  it('refuses an emphasis change that would leave the page with no step-1-or-2 region', () => {
    const two = plan({
      signatureRegionId: 'headline',
      regions: [
        { id: 'headline', role: 'headline', col: { start: 1, span: 8 }, row: { start: 3, span: 3 }, emphasis: 2 },
        { id: 'body', role: 'body', col: { start: 1, span: 6 }, row: { start: 7, span: 2 }, emphasis: 5 },
      ],
    });
    const out = applyAdjustments(two, [adj({ regionId: 'headline', action: 'deemphasise' })]);
    expect(find(out, 'headline')!.emphasis).toBe(2); // refused: nothing else carries hierarchy
  });

  it('refuses an emphasis change that would introduce a fifth distinct type step', () => {
    const four = plan({
      signatureRegionId: 'a',
      regions: [
        { id: 'a', role: 'headline', col: { start: 1, span: 8 }, row: { start: 1, span: 2 }, emphasis: 1 },
        { id: 'b', role: 'subhead', col: { start: 1, span: 8 }, row: { start: 4, span: 2 }, emphasis: 3 },
        { id: 'c', role: 'body', col: { start: 1, span: 8 }, row: { start: 7, span: 2 }, emphasis: 4 },
        { id: 'd', role: 'cta', col: { start: 1, span: 8 }, row: { start: 10, span: 2 }, emphasis: 5 },
      ],
    });
    // d -> 6 would make {1,3,4,6} — still four, allowed
    expect(find(applyAdjustments(four, [adj({ regionId: 'd', action: 'deemphasise' })]), 'd')!.emphasis).toBe(6);
    // b -> 2 would make {1,2,4,5} — still four, allowed
    expect(find(applyAdjustments(four, [adj({ regionId: 'b', action: 'emphasise' })]), 'b')!.emphasis).toBe(2);
    // adding a 5th distinct step is refused
    const five = plan({
      signatureRegionId: 'a',
      regions: [
        ...four.pages[0]!.regions,
        { id: 'e', role: 'kicker', col: { start: 1, span: 4 }, row: { start: 13, span: 1 }, emphasis: 6 },
      ],
    });
    const out = applyAdjustments(five, [adj({ regionId: 'e', action: 'emphasise' })]); // 6 -> 5 gives {1,3,4,5,5}
    expect(find(out, 'e')!.emphasis).toBe(5); // legal: collapses onto an existing step
    const out2 = applyAdjustments(five, [adj({ regionId: 'e', action: 'emphasise', to: { emphasis: 2 } })]);
    expect(find(out2, 'e')!.emphasis).toBe(6); // refused: {1,2,3,4,5} is five steps
  });

  it('produces a schema-valid plan under a barrage of hostile adjustments', () => {
    const hostile: RegionAdjustment[] = [
      adj({ regionId: 'headline', action: 'move', to: { col: { start: 999, span: 999 }, row: { start: -50, span: 0 } } }),
      adj({ regionId: 'stat', action: 'remove' }),
      adj({ regionId: 'body', action: 'remove' }),
      adj({ regionId: 'kicker', action: 'remove' }),
      adj({ regionId: 'headline', action: 'deemphasise', to: { emphasis: 6 } }),
      adj({ regionId: 'hero', action: 'resize', to: { col: { start: 12, span: 12 }, row: { start: 16, span: 16 } } }),
    ];
    const out = applyAdjustments(plan(), hostile);
    const p = out.pages[0]!;
    expect(p.regions.length).toBeGreaterThan(0);
    expect(p.regions.some((r) => ['kicker', 'headline', 'subhead', 'body', 'stat', 'cta'].includes(r.role))).toBe(true);
    expect(p.regions.filter((r) => r.id === p.signatureRegionId)).toHaveLength(1);
    for (const r of p.regions) {
      expect(r.col.start).toBeGreaterThanOrEqual(1);
      expect(r.col.start + r.col.span - 1).toBeLessThanOrEqual(12);
      expect(r.row.start).toBeGreaterThanOrEqual(1);
      expect(r.row.start + r.row.span - 1).toBeLessThanOrEqual(16);
      expect(r.emphasis).toBeGreaterThanOrEqual(1);
      expect(r.emphasis).toBeLessThanOrEqual(6);
    }
  });
});

// ---------- criticLoop ----------

describe('criticLoop', () => {
  const compose = () => RENDERABLE_SVG;

  it('returns the first-round result when round 2 scores worse', async () => {
    const provider = stubProvider([
      { scores: scores({}, 4), adjustments: [adj({ regionId: 'body', action: 'remove' })] }, // 28
      { scores: scores({}, 2), adjustments: [] }, // 14 — worse
    ]);
    const input = plan();
    const out = await criticLoop(input, compose, { provider, goodEnough: 99 });

    expect(out.bestTotal).toBe(28);
    expect(out.roundsRun).toBe(2);
    expect(out.history.map((h) => h.total)).toEqual([28, 14]);
    // round 1 scored the INPUT plan, so the input plan is what comes back
    expect(out.plan).toEqual(input);
    expect(find(out.plan, 'body')).toBeDefined();
  });

  it('returns the improved plan when round 2 scores better', async () => {
    const provider = stubProvider([
      { scores: scores({}, 2), adjustments: [adj({ regionId: 'body', action: 'remove' })] }, // 14
      { scores: scores({}, 4), adjustments: [] }, // 28 — better
    ]);
    const out = await criticLoop(plan(), compose, { provider, goodEnough: 99 });

    expect(out.bestTotal).toBe(28);
    expect(find(out.plan, 'body')).toBeUndefined(); // the round-2 plan won
  });

  it('never runs more than 2 rounds even when asked for more', async () => {
    const provider = stubProvider([
      { scores: scores({}, 2), adjustments: [adj({ regionId: 'kicker', action: 'remove' })] },
      { scores: scores({}, 2), adjustments: [adj({ regionId: 'body', action: 'remove' })] },
      { scores: scores({}, 5), adjustments: [] },
    ]);
    const out = await criticLoop(plan(), compose, { provider, maxRounds: 10, goodEnough: 99 });
    expect(out.roundsRun).toBe(2);
    expect(out.history).toHaveLength(2);
  });

  it('stops early once the page is good enough', async () => {
    const provider = stubProvider([{ scores: scores({}, 5), adjustments: [] }]);
    const out = await criticLoop(plan(), compose, { provider, goodEnough: 32 });
    expect(out.roundsRun).toBe(1);
    expect(out.bestTotal).toBe(35);
  });

  it('returns the input plan unchanged when the critique fails, without throwing', async () => {
    const exploding: AiProviderPort = {
      async complete() {
        throw new Error('provider exploded');
      },
    };
    const input = plan();
    const out = await criticLoop(input, compose, { provider: exploding });
    expect(out.plan).toEqual(input);
    expect(out.bestTotal).toBeNull();
    expect(out.history[0]?.failure).toContain('provider exploded');
  });

  it('returns the input plan unchanged when the render fails, without throwing', async () => {
    const input = plan();
    const out = await criticLoop(input, () => '<svg>not valid', { provider: stubProvider([{ scores: scores(), adjustments: [] }]) });
    expect(out.plan).toEqual(input);
    expect(out.bestTotal).toBeNull();
    expect(out.history[0]?.failure).toMatch(/render failed/);
  });

  it('returns the input plan unchanged when compose itself throws', async () => {
    const input = plan();
    const out = await criticLoop(
      input,
      () => {
        throw new Error('compositor blew up');
      },
      { provider: stubProvider([{ scores: scores(), adjustments: [] }]) },
    );
    expect(out.plan).toEqual(input);
    expect(out.history[0]?.failure).toContain('compositor blew up');
  });
});

// ---------- critiquePage ----------

describe('critiquePage', () => {
  it('drops adjustments aimed at region ids that are not on the page', async () => {
    const provider = stubProvider([
      {
        scores: scores(),
        adjustments: [
          adj({ regionId: 'does-not-exist', action: 'remove' }),
          adj({ regionId: 'body', action: 'emphasise' }),
        ],
      },
    ]);
    const out = await critiquePage(RENDERABLE_SVG, { page: page(), provider });
    expect(out.ok).toBe(true);
    expect(out.adjustments.map((a) => a.regionId)).toEqual(['body']);
  });

  it('reports failure rather than throwing when the render is unusable', async () => {
    const out = await critiquePage('not an svg at all', { page: page() });
    expect(out.ok).toBe(false);
    expect(out.failure).toMatch(/render failed/);
    expect(out.adjustments).toEqual([]);
  });
});

// ---------- mock adapter ----------

describe('MockAiAdapter design_critique', () => {
  it('returns schema-valid critique output', async () => {
    const p = page();
    const { data, meta } = await new MockAiAdapter().complete(
      'design_critique',
      { regions: p.regions, signatureRegionId: p.signatureRegionId },
      CritiqueOutput,
    );
    expect(() => CritiqueOutput.parse(data)).not.toThrow();
    expect(totalScore(data.scores)).toBeGreaterThanOrEqual(7);
    expect(totalScore(data.scores)).toBeLessThanOrEqual(35);
    expect(data.biggestProblem.length).toBeGreaterThan(0);
    expect(meta.promptVersion).toBe('design_critique@mock');
  });

  it('only targets region ids that exist on the page, so the loop runs offline', async () => {
    const p = page();
    const { data } = await new MockAiAdapter().complete(
      'design_critique',
      { regions: p.regions, signatureRegionId: p.signatureRegionId },
      CritiqueOutput,
    );
    const ids = new Set(p.regions.map((r) => r.id));
    expect(data.adjustments.length).toBeGreaterThan(0);
    for (const a of data.adjustments) expect(ids.has(a.regionId)).toBe(true);
  });

  it('drives a full offline loop that returns a valid plan', async () => {
    const out = await criticLoop(plan(), () => RENDERABLE_SVG, {
      provider: new MockAiAdapter(),
      goodEnough: 99,
    });
    expect(out.roundsRun).toBeGreaterThan(0);
    expect(out.bestTotal).not.toBeNull();
    expect(out.plan.pages[0]!.regions.length).toBeGreaterThan(0);
  });
});

// ---------- gridOccupancy ----------

describe('gridOccupancy', () => {
  it('measures the band the content actually occupies', () => {
    // fixture spans rows 2..13 of 16
    const o = gridOccupancy(page());
    expect(o.topRow).toBe(2);
    expect(o.bottomRow).toBe(13);
    expect(o.coveragePercent).toBe(75);
    expect(o.emptyRowsAbove).toBe(1);
    expect(o.emptyRowsBelow).toBe(3);
  });

  it('reports the dead band on a page whose content stops half way down', () => {
    // the real failure this exists for: content crammed into the top rows
    const o = gridOccupancy(
      page({
        regions: [
          { id: 'h', role: 'headline', col: { start: 1, span: 10 }, row: { start: 2, span: 2 }, emphasis: 2 },
          { id: 'b', role: 'body', col: { start: 1, span: 8 }, row: { start: 5, span: 2 }, emphasis: 5 },
        ],
      }),
    );
    expect(o.bottomRow).toBe(6);
    expect(o.emptyRowsBelow).toBe(10);
    expect(o.coveragePercent).toBeLessThan(50);
  });

  it('reports full coverage for a page using the whole grid', () => {
    const o = gridOccupancy(
      page({
        regions: [
          { id: 'a', role: 'headline', col: { start: 1, span: 12 }, row: { start: 1, span: 8 }, emphasis: 1 },
          { id: 'b', role: 'body', col: { start: 1, span: 12 }, row: { start: 9, span: 8 }, emphasis: 5 },
        ],
      }),
    );
    expect(o.coveragePercent).toBe(100);
    expect(o.emptyRowsBelow).toBe(0);
    expect(o.emptyRowsAbove).toBe(0);
  });

  it('is pure and deterministic', () => {
    const p = page();
    const snapshot = JSON.parse(JSON.stringify(p));
    expect(gridOccupancy(p)).toEqual(gridOccupancy(p));
    expect(p).toEqual(snapshot);
  });
});
