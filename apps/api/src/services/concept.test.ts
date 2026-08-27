/**
 * Guardrail tests for composition-pipeline stages 1 and 2.
 *
 * The point of these stages is that the model CANNOT emit geometry: no pixels,
 * no font sizes, no off-grid cells, no second signature move. Every rejection
 * below is a guarantee stage 3 (the deterministic compositor) is allowed to
 * rely on, so each one is asserted explicitly rather than through a happy path.
 */
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import type { CanvasSize } from '@brandflow/design-schema';
import { emphasisFitsCell } from '@brandflow/design-schema';
import { MockAiAdapter } from '../adapters/mock-ai-adapter.js';
import type { AiCompletionMeta, AiProviderPort, PipelineStep } from '../ports/index.js';
import {
  ConceptOutput,
  LayoutPlan,
  reviewConcept,
  reviewLayoutPlan,
  runArtDirection,
  runConcept,
  type ConceptOutputT,
} from './concept.js';

const PORTRAIT: CanvasSize = { width: 1080, height: 1350 };

// ---------- fixtures ----------

const concept = (): Record<string, unknown> => ({
  bigIdea: 'Most teams lose more to rework than to anything on their plan',
  metaphor: 'A stopwatch still running on an empty desk after the meeting has moved on',
  focalPoint: 'one running stopwatch',
  register: 'bold',
  signatureMove: 'full-bleed-block',
  pages: [
    {
      purpose: 'State the claim',
      copy: [
        { role: 'headline', text: 'Rework is the real budget' },
        { role: 'body', text: 'Nobody plans for it, and everyone pays for it twice.' },
      ],
    },
  ],
});

/** One page, four regions, 16 of 16 rows used, block carries the move. */
const plan = (): Record<string, unknown> => ({
  pages: [
    {
      background: 'background',
      regions: [
        { id: 'band', role: 'block', col: { start: 1, span: 12 }, row: { start: 1, span: 4 }, emphasis: 3, colour: 'accent' },
        { id: 'hero', role: 'image', col: { start: 7, span: 6 }, row: { start: 5, span: 6 }, emphasis: 2, imageQuery: 'team reviewing dashboard' },
        { id: 'hook', role: 'headline', col: { start: 1, span: 6 }, row: { start: 5, span: 5 }, emphasis: 2, colour: 'text', contentRef: '0' },
        { id: 'note', role: 'body', col: { start: 1, span: 6 }, row: { start: 11, span: 6 }, emphasis: 5, colour: 'text', contentRef: '1' },
      ],
      signatureRegionId: 'band',
    },
  ],
});

/** Mutate the first region of a cloned valid plan. */
function withRegion(patch: Record<string, unknown>): unknown {
  const p = plan() as { pages: { regions: Record<string, unknown>[] }[] };
  p.pages[0]!.regions[2] = { ...p.pages[0]!.regions[2], ...patch };
  return p;
}

const rejects = (value: unknown, schema: z.ZodTypeAny = LayoutPlan) => schema.safeParse(value).success === false;

// ---------- stage 1 schema ----------

describe('ConceptOutput', () => {
  it('parses a well-formed concept', () => {
    const parsed = ConceptOutput.parse(concept());
    expect(parsed.signatureMove).toBe('full-bleed-block');
    expect(parsed.pages[0]!.copy[0]!.role).toBe('headline');
  });

  it('rejects more than one signature move', () => {
    expect(rejects({ ...concept(), signatureMove: ['bleed-edge', 'overlap'] }, ConceptOutput)).toBe(true);
    expect(rejects({ ...concept(), signatureMoves: ['bleed-edge', 'overlap'] }, ConceptOutput)).toBe(true);
  });

  it('rejects an invented signature move and an unknown field', () => {
    expect(rejects({ ...concept(), signatureMove: 'sparkles' }, ConceptOutput)).toBe(true);
    expect(rejects({ ...concept(), palette: ['#ff0000'] }, ConceptOutput)).toBe(true);
  });

  it('normalises near-miss type roles instead of burning a repair round', () => {
    const c = concept() as { pages: { copy: { role: string }[] }[] };
    c.pages[0]!.copy[0]!.role = 'title';
    c.pages[0]!.copy[1]!.role = 'pull-quote';
    const parsed = ConceptOutput.parse(c);
    expect(parsed.pages[0]!.copy.map((x) => x.role)).toEqual(['headline', 'bodyLarge']);
  });

  it('clamps over-long strings rather than rejecting them', () => {
    const parsed = ConceptOutput.parse({ ...concept(), bigIdea: 'x'.repeat(400) });
    expect(parsed.bigIdea.length).toBeLessThanOrEqual(220);
    expect(parsed.bigIdea.endsWith('…')).toBe(true);
  });
});

// ---------- stage 2 schema: the guardrails ----------

describe('LayoutPlan', () => {
  it('parses a well-formed plan', () => {
    const parsed = LayoutPlan.parse(plan());
    expect(parsed.pages[0]!.regions).toHaveLength(4);
    expect(parsed.pages[0]!.signatureRegionId).toBe('band');
  });

  it('rejects pixel geometry', () => {
    expect(rejects(withRegion({ x: 120, y: 40 }))).toBe(true);
    expect(rejects(withRegion({ width: 480, height: 220 }))).toBe(true);
    expect(rejects(withRegion({ frame: { x: 0, y: 0, width: 100, height: 40 } }))).toBe(true);
  });

  it('rejects font sizes — emphasis is the only size vocabulary', () => {
    expect(rejects(withRegion({ fontSize: 37 }))).toBe(true);
    expect(rejects(withRegion({ fontSize: 68 }))).toBe(true);
    expect(rejects(withRegion({ emphasis: 0 }))).toBe(true);
    expect(rejects(withRegion({ emphasis: 7 }))).toBe(true);
    expect(rejects(withRegion({ emphasis: 2.5 }))).toBe(true);
  });

  it('rejects raw colours', () => {
    expect(rejects(withRegion({ colour: '#ff0000' }))).toBe(true);
    const p = plan() as { pages: { background: string }[] };
    p.pages[0]!.background = '#ffffff';
    expect(rejects(p)).toBe(true);
  });

  it('rejects out-of-range grid cells', () => {
    expect(rejects(withRegion({ col: { start: 0, span: 4 } }))).toBe(true);
    expect(rejects(withRegion({ col: { start: 13, span: 1 } }))).toBe(true);
    expect(rejects(withRegion({ row: { start: 17, span: 1 } }))).toBe(true);
    expect(rejects(withRegion({ row: { start: 0, span: 2 } }))).toBe(true);
  });

  it('rejects spans that run off the grid', () => {
    expect(rejects(withRegion({ col: { start: 10, span: 4 } }))).toBe(true);
    expect(rejects(withRegion({ row: { start: 14, span: 4 } }))).toBe(true);
    expect(LayoutPlan.safeParse(withRegion({ col: { start: 9, span: 4 } })).success).toBe(true);
  });

  it('enforces the type-scale rules: at most 4 steps, at least one step 1-2', () => {
    const p = plan() as { pages: { regions: Record<string, unknown>[] }[] };
    p.pages[0]!.regions = [
      ...p.pages[0]!.regions,
      { id: 'a', role: 'subhead', col: { start: 1, span: 4 }, row: { start: 1, span: 1 }, emphasis: 3, contentRef: '0' },
      { id: 'b', role: 'body', col: { start: 5, span: 4 }, row: { start: 2, span: 1 }, emphasis: 4, contentRef: '0' },
      { id: 'c', role: 'cta', col: { start: 9, span: 4 }, row: { start: 3, span: 1 }, emphasis: 6, contentRef: '0' },
    ];
    expect(rejects(p)).toBe(true); // 5 distinct type steps on one page

    const flat = plan() as { pages: { regions: { emphasis: number }[] }[] };
    for (const r of flat.pages[0]!.regions) r.emphasis = 4;
    expect(rejects(flat)).toBe(true); // no focal point at all
  });

  it('rejects a signature region that does not exist, and duplicate ids', () => {
    const missing = plan() as { pages: { signatureRegionId: string }[] };
    missing.pages[0]!.signatureRegionId = 'nope';
    expect(rejects(missing)).toBe(true);

    const dupe = plan() as { pages: { regions: { id: string }[] }[] };
    dupe.pages[0]!.regions[3]!.id = 'hook';
    expect(rejects(dupe)).toBe(true);
  });
});

// ---------- the rubric, mechanised ----------

describe('reviewConcept', () => {
  const parse = (patch: Record<string, unknown>) => ConceptOutput.parse({ ...concept(), ...patch });

  it('passes a concept that does the job', () => {
    expect(reviewConcept(parse({}))).toEqual([]);
  });

  it('flags a focal point that is not nameable in three words', () => {
    const v = reviewConcept(parse({ focalPoint: 'the moment the whole team realises the estimate was wrong' }));
    expect(v.join(' ')).toMatch(/three words/);
  });

  it('flags stock phrasing and exhausted metaphors', () => {
    expect(reviewConcept(parse({ bigIdea: 'Unlock the secret to better delivery' })).join(' ')).toMatch(/stock phrasing/);
    expect(reviewConcept(parse({ metaphor: 'A puzzle piece finally clicking into place' })).join(' ')).toMatch(/exhausted/);
  });

  it('flags a bigIdea that is more than one sentence, and a page-count mismatch', () => {
    expect(reviewConcept(parse({ bigIdea: 'Rework is the real budget. Nobody plans for it.' })).join(' ')).toMatch(/ONE sentence/);
    expect(reviewConcept(parse({}), { pageCount: 3 }).join(' ')).toMatch(/exactly 3 page/);
  });

  it('flags brand banned phrases in on-page copy', () => {
    const v = reviewConcept(parse({}), { bannedPhrases: ['real budget'] });
    expect(v.join(' ')).toMatch(/banned brand phrase/);
  });
});

describe('reviewLayoutPlan', () => {
  const c = ConceptOutput.parse(concept());
  const parse = () => LayoutPlan.parse(plan());

  it('passes a plan that does the job', () => {
    expect(reviewLayoutPlan(parse(), c)).toEqual([]);
  });

  it('flags dead bands — under 75% row coverage', () => {
    const p = parse();
    p.pages[0]!.regions[3]!.row = { start: 11, span: 1 };
    expect(reviewLayoutPlan(p, c).join(' ')).toMatch(/occupies only .* rows/);
  });

  it('flags colliding copy regions but allows the signature region to overlap', () => {
    const p = parse();
    p.pages[0]!.regions[3]!.row = { start: 5, span: 5 }; // sits on top of "hook"
    expect(reviewLayoutPlan(p, c).join(' ')).toMatch(/occupy the same cells/);

    const signed = parse();
    signed.pages[0]!.signatureRegionId = 'note';
    signed.pages[0]!.regions[3]!.row = { start: 5, span: 5 };
    expect(reviewLayoutPlan(signed, c).some((v) => v.includes('same cells'))).toBe(false);
  });

  it('flags unplaced copy, missing contentRef and missing imageQuery', () => {
    const dropped = parse();
    dropped.pages[0]!.regions.splice(3, 1);
    expect(reviewLayoutPlan(dropped, c).join(' ')).toMatch(/never places copy/);

    const unref = parse();
    delete unref.pages[0]!.regions[3]!.contentRef;
    expect(reviewLayoutPlan(unref, c).join(' ')).toMatch(/no contentRef/);

    const noQuery = parse();
    delete noQuery.pages[0]!.regions[1]!.imageQuery;
    expect(reviewLayoutPlan(noQuery, c).join(' ')).toMatch(/no imageQuery/);
  });

  it('flags a signature move the compositor cannot perform', () => {
    const numeral = ConceptOutput.parse({ ...concept(), signatureMove: 'oversized-numeral' });
    expect(reviewLayoutPlan(parse(), numeral).join(' ')).toMatch(/needs a "stat" region/);
  });

  it('flags a region whose emphasis cannot fit its cell — the law-firm defect (P2.A)', () => {
    // docs/20 §B: the measured defect was `hero-headline` asked for emphasis 2
    // (68px) but allocated a 6-column x 2-row cell — too small to hold it, so
    // the compositor used to just shrink the type to 30px and say nothing.
    // 'hook' here is the same shape: headline copy at emphasis 2, squeezed
    // into a 6x2 cell.
    const p = parse();
    p.pages[0]!.regions[2]!.row = { start: 1, span: 2 };
    const v = reviewLayoutPlan(p, c);
    const hit = v.find((m) => m.includes('region "hook"') && m.includes('emphasis 2'));
    expect(hit, v.join(' | ')).toBeDefined();
    expect(hit).toMatch(/68px/);
    expect(hit).toMatch(/6x2 cell/);
    expect(hit).toMatch(/more (row|column)/); // names how much more room it needs
  });

  it('does not flag a region once its cell is grown enough to actually hold the emphasis', () => {
    const p = parse();
    // same headline, same emphasis, but a cell big enough this time — matches
    // what `emphasisFitsCell` itself reports as a fit, so this is checking the
    // reviewer agrees with the predicate it is supposed to be built on.
    p.pages[0]!.regions[2]!.row = { start: 1, span: 3 };
    p.pages[0]!.regions[2]!.col = { start: 1, span: 12 };
    expect(emphasisFitsCell('Rework is the real budget', 2, 12, 3, PORTRAIT)).toBe(true);
    const v = reviewLayoutPlan(p, c);
    expect(v.some((m) => m.includes('region "hook"') && m.includes('cannot hold'))).toBe(false);
  });

  it('flags stacked full-width bands', () => {
    const p = parse();
    for (const r of p.pages[0]!.regions) r.col = { start: 1, span: 12 };
    expect(reviewLayoutPlan(p, c).join(' ')).toMatch(/full-width bands/);
  });

  it('flags two pages laid out alike, and the headline-top default', () => {
    const threePage = ConceptOutput.parse({
      ...concept(),
      pages: [concept().pages, concept().pages, concept().pages].flatMap((p) => p as unknown[]),
    });
    const p = parse();
    p.pages = [p.pages[0]!, structuredClone(p.pages[0]!), structuredClone(p.pages[0]!)];
    const v = reviewLayoutPlan(p, threePage);
    expect(v.join(' ')).toMatch(/same structure as page 1/);

    // move every headline to the top of its page -> the default we forbid
    for (const page of p.pages) page.regions[2]!.row = { start: 1, span: 4 };
    expect(reviewLayoutPlan(p, threePage).join(' ')).toMatch(/headline-top default/);
  });
});

// ---------- repair loops ----------

/** Scripted provider: an Error entry is thrown, anything else is schema-parsed. */
function scriptedAi(scripts: unknown[]) {
  const calls: Record<string, unknown>[] = [];
  const ai: AiProviderPort = {
    async complete<T>(_step: PipelineStep, input: unknown, schema: z.ZodType<T>) {
      calls.push(input as Record<string, unknown>);
      const raw = scripts[Math.min(calls.length - 1, scripts.length - 1)];
      if (raw instanceof Error) throw raw;
      return {
        data: schema.parse(raw),
        meta: { model: 'scripted', promptVersion: 'test', tokensUsed: 0 } as AiCompletionMeta,
      };
    },
  };
  return { ai, calls };
}

describe('runConcept', () => {
  it('repairs a rubric violation on the second round and feeds the violations back', async () => {
    const bad = { ...concept(), focalPoint: 'the exact moment the estimate quietly stopped being true' };
    const { ai, calls } = scriptedAi([bad, concept()]);

    const result = await runConcept(ai, { brief: {}, brand: {}, pageCount: 1 });

    expect(result).not.toBeNull();
    expect(result!.attempts).toBe(2);
    expect(result!.violations).toEqual([]);
    expect(result!.needsAttention).toBe(false);
    expect(result!.concept.focalPoint).toBe('one running stopwatch');
    expect(calls[0]!.violations).toBeUndefined();
    expect(String(calls[1]!.violations)).toMatch(/three words/);
  });

  it('recovers from a schema failure on the first round', async () => {
    const { ai } = scriptedAi([new Error('signatureMove: expected one of 6 values'), concept()]);
    const result = await runConcept(ai, { brief: {}, brand: {} });
    expect(result!.attempts).toBe(2);
    expect(result!.violations).toEqual([]);
  });

  it('returns the closest attempt flagged needsAttention when nothing comes back clean', async () => {
    const bad = { ...concept(), metaphor: 'A lightbulb switching on above a laptop' };
    const { ai } = scriptedAi([bad]);
    const result = await runConcept(ai, { brief: {}, brand: {} });
    expect(result!.needsAttention).toBe(true);
    expect(result!.violations.join(' ')).toMatch(/exhausted/);
  });

  it('returns null when no round produces parseable output', async () => {
    const { ai } = scriptedAi([new Error('nope')]);
    expect(await runConcept(ai, { brief: {}, brand: {} })).toBeNull();
  });
});

describe('runArtDirection', () => {
  const c = ConceptOutput.parse(concept()) as ConceptOutputT;

  it('repairs a rubric violation on the second round and feeds the violations back', async () => {
    const bad = plan() as { pages: { regions: { row: { start: number; span: number } }[] }[] };
    bad.pages[0]!.regions[3]!.row = { start: 11, span: 1 }; // leaves a dead band
    const { ai, calls } = scriptedAi([bad, plan()]);

    const result = await runArtDirection(ai, { concept: c, brand: {} });

    expect(result).not.toBeNull();
    expect(result!.attempts).toBe(2);
    expect(result!.violations).toEqual([]);
    expect(result!.plan.pages[0]!.regions).toHaveLength(4);
    expect(String(calls[1]!.violations)).toMatch(/rows/);
    expect((calls[1]!.concept as ConceptOutputT).focalPoint).toBe('one running stopwatch');
  });

  it('recovers from a schema failure on the first round', async () => {
    const { ai } = scriptedAi([new Error('regions.0: unrecognised key "x"'), plan()]);
    const result = await runArtDirection(ai, { concept: c, brand: {} });
    expect(result!.attempts).toBe(2);
    expect(result!.violations).toEqual([]);
  });
});

// ---------- offline mock ----------

describe('MockAiAdapter', () => {
  it('returns schema-valid, rubric-clean output for both new steps', async () => {
    const ai = new MockAiAdapter();
    const brief = { idea: { title: 'The real cost of flaky tests nobody budgets for' } };

    const stage1 = await runConcept(ai, { brief, brand: {}, format: 'carousel', pageCount: 3 });
    expect(stage1).not.toBeNull();
    expect(stage1!.violations).toEqual([]);
    expect(stage1!.concept.pages).toHaveLength(3);

    const stage2 = await runArtDirection(ai, { concept: stage1!.concept, brand: {}, format: 'carousel' });
    expect(stage2).not.toBeNull();
    expect(stage2!.violations).toEqual([]);
    expect(stage2!.plan.pages).toHaveLength(3);
    // no pixels anywhere in the plan
    expect(JSON.stringify(stage2!.plan)).not.toMatch(/"(x|y|width|height|fontSize)"/);
  });

  it('produces a valid plan for a carousel of every supported length', async () => {
    const ai = new MockAiAdapter();
    for (const pageCount of [1, 2, 5, 8]) {
      const stage1 = await runConcept(ai, { brief: { title: 'One number nobody tracks' }, brand: {}, pageCount });
      const stage2 = await runArtDirection(ai, { concept: stage1!.concept, brand: {} });
      expect(stage2!.violations, `pageCount ${pageCount}`).toEqual([]);
    }
  });
});
