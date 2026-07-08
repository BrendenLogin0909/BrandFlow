import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { parseDesignDocument, type InternalDesignDocument } from '@brandflow/design-schema';
import { patchDesign, buildExcerpt } from './design-patch.js';
import { MockAiAdapter } from '../adapters/mock-ai-adapter.js';
import type { AiCompletionMeta, AiProviderPort, PipelineStep } from '../ports/index.js';

// ---------- fixture document ----------

let counter = 0;
function uuid(): string {
  const n = (counter++).toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${n}`;
}

const IDS = {
  doc: uuid(),
  page1: uuid(),
  page2: uuid(),
  headline: uuid(),
  logo: uuid(),
  page2Text: uuid(),
};

function baseDoc(): InternalDesignDocument {
  return parseDesignDocument({
    id: IDS.doc,
    schemaVersion: 1,
    version: 1,
    brandProfileId: 'brand-1',
    clientCompanyId: 'client-1',
    layoutRecipeRef: { recipeId: 'freeform', recipeVersion: 1, variant: 'ai-composed' },
    format: 'carousel',
    canvas: { width: 1080, height: 1080, unit: 'px', dpi: 96 },
    brandTokens: {
      colours: {
        primary: '#1a3c8f', secondary: '#4a6fd4', accent: '#e8b23a',
        neutral: '#8a8f98', background: '#ffffff', text: '#101418',
      },
      fonts: { heading: 'Inter', body: 'Inter' },
      logoAssetIds: [],
    },
    pages: [
      {
        id: IDS.page1,
        name: 'Cover',
        background: { kind: 'token', token: 'background' },
        safeArea: { top: 90, right: 90, bottom: 90, left: 90 },
        elements: [
          {
            id: IDS.headline, type: 'text', name: 'headline', text: 'Original headline',
            frame: { x: 120, y: 120, width: 840, height: 120, rotation: 0 },
            fontFamily: 'Inter', fontSize: 48, fontWeight: 800,
            colour: { kind: 'token', token: 'text' }, zIndex: 5, roleHint: 'headline',
          },
          {
            id: IDS.logo, type: 'text', name: 'logo', text: '29FORWARD',
            frame: { x: 120, y: 900, width: 300, height: 60, rotation: 0 },
            fontFamily: 'Inter', fontSize: 24, fontWeight: 700,
            colour: { kind: 'token', token: 'text' }, zIndex: 6, roleHint: 'logo', locked: true,
          },
        ],
      },
      {
        id: IDS.page2,
        name: 'Detail',
        background: { kind: 'token', token: 'background' },
        safeArea: { top: 90, right: 90, bottom: 90, left: 90 },
        elements: [
          {
            id: IDS.page2Text, type: 'text', name: 'body', text: 'Second page body',
            frame: { x: 120, y: 120, width: 840, height: 200, rotation: 0 },
            fontFamily: 'Inter', fontSize: 24, fontWeight: 400,
            colour: { kind: 'token', token: 'text' }, zIndex: 1, roleHint: 'body',
          },
        ],
      },
    ],
  });
}

const brand = { companyName: 'Acme', styleGuide: {}, fonts: { heading: 'Inter', body: 'Inter' } };

/** A programmable AiProviderPort that returns scripted operation lists. */
function scriptedAi(scripts: Record<string, unknown>[]): AiProviderPort {
  let i = 0;
  return {
    async complete<T>(_step: PipelineStep, _input: unknown, schema: z.ZodType<T>) {
      const raw = scripts[Math.min(i, scripts.length - 1)];
      i++;
      const data = schema.parse(raw);
      return { data, meta: { model: 'scripted', promptVersion: 'test', tokensUsed: 0 } as AiCompletionMeta };
    },
  };
}

const findEl = (doc: InternalDesignDocument, id: string) =>
  doc.pages.flatMap((p) => p.elements).find((e) => e.id === id);

// ---------- excerpt ----------

describe('buildExcerpt', () => {
  it('element scope includes only the target element', () => {
    const ex = buildExcerpt(baseDoc(), 'element', [IDS.headline]);
    const elems = ex.pages.flatMap((p) => p.elements) as { id: string }[];
    expect(elems).toHaveLength(1);
    expect(elems[0]!.id).toBe(IDS.headline);
  });
  it('page scope includes only the target page', () => {
    const ex = buildExcerpt(baseDoc(), 'page', [IDS.page2]);
    expect(ex.pages.map((p) => p.id)).toEqual([IDS.page2]);
  });
});

// ---------- patchDesign with the real MockAiAdapter ----------

describe('patchDesign (MockAiAdapter)', () => {
  it('applies a scoped text edit and persists a valid document', async () => {
    const res = await patchDesign(
      new MockAiAdapter(),
      baseDoc(),
      { instruction: 'Make it punchier', scope: 'element', targetIds: [IDS.headline], lockedElementIds: [], brand },
    );
    expect(res).not.toBeNull();
    expect(res!.report.passed).toBe(true);
    expect(res!.needsAttention).toBe(false);
    const el = findEl(res!.document, IDS.headline);
    expect(el?.type === 'text' && el.text).toBe('Make it punchier');
  });

  it('recolours when the instruction mentions a colour', async () => {
    const res = await patchDesign(
      new MockAiAdapter(),
      baseDoc(),
      { instruction: 'change the colour to accent', scope: 'element', targetIds: [IDS.headline], lockedElementIds: [], brand },
    );
    const el = findEl(res!.document, IDS.headline);
    expect(el?.type === 'text' && el.colour).toEqual({ kind: 'token', token: 'accent' });
  });
});

// ---------- locked-element guarantee ----------

describe('patchDesign — locked elements', () => {
  it('leaves a doc-locked element byte-identical even if the AI targets it', async () => {
    const base = baseDoc();
    const lockedBefore = JSON.stringify(findEl(base, IDS.logo));
    const ai = scriptedAi([
      { operations: [{ op: 'updateText', elementId: IDS.logo, text: 'HACKED' }], rationale: 'x' },
      { operations: [{ op: 'updateText', elementId: IDS.headline, text: 'ok now' }], rationale: 'fixed' },
    ]);
    const res = await patchDesign(ai, base, {
      instruction: 'edit', scope: 'document', targetIds: [], lockedElementIds: [], brand,
    });
    expect(JSON.stringify(findEl(res!.document, IDS.logo))).toBe(lockedBefore);
  });

  it('reimposes an element passed via lockedElementIds', async () => {
    const base = baseDoc();
    const headlineBefore = JSON.stringify(findEl(base, IDS.headline));
    // AI tries to change the headline, but caller locked it for this edit
    const ai = scriptedAi([{ operations: [{ op: 'updateText', elementId: IDS.headline, text: 'nope' }], rationale: 'x' }]);
    const res = await patchDesign(ai, base, {
      instruction: 'edit', scope: 'document', targetIds: [], lockedElementIds: [IDS.headline], brand,
    });
    expect(JSON.stringify(findEl(res!.document, IDS.headline))).toBe(headlineBefore);
  });
});

// ---------- page-scoped byte identity (P3-F) ----------

describe('patchDesign — page scope', () => {
  it('regenerates one page and leaves other pages byte-identical', async () => {
    const base = baseDoc();
    const page2Before = JSON.stringify(base.pages[1]);
    const ai = scriptedAi([
      {
        operations: [{ op: 'updateText', elementId: IDS.headline, text: 'Cover reworked' }],
        rationale: 'reworked cover',
      },
    ]);
    const res = await patchDesign(ai, base, {
      instruction: 'rework the cover', scope: 'page', targetIds: [IDS.page1], lockedElementIds: [], brand,
    });
    expect(res!.report.passed).toBe(true);
    expect(JSON.stringify(res!.document.pages[1])).toBe(page2Before);
    const el = findEl(res!.document, IDS.headline);
    expect(el?.type === 'text' && el.text).toBe('Cover reworked');
  });

  it('ignores an AI op aimed at an element on a non-target page', async () => {
    const base = baseDoc();
    const page2Before = JSON.stringify(base.pages[1]);
    const ai = scriptedAi([
      { operations: [{ op: 'updateText', elementId: IDS.page2Text, text: 'cross-page' }], rationale: 'x' },
    ]);
    const res = await patchDesign(ai, base, {
      instruction: 'edit cover', scope: 'page', targetIds: [IDS.page1], lockedElementIds: [], brand,
    });
    // op was out of scope → page 2 unchanged
    expect(JSON.stringify(res!.document.pages[1])).toBe(page2Before);
  });
});

// ---------- repair loop ----------

describe('patchDesign — repair loop', () => {
  it('retries once when the first attempt fails validation, then succeeds', async () => {
    const base = baseDoc();
    const ai = scriptedAi([
      // attempt 1: shrink the headline below the 24px minimum → validation error
      { operations: [{ op: 'updateText', elementId: IDS.headline, fontSize: 10 }], rationale: 'too small' },
      // attempt 2: valid text edit
      { operations: [{ op: 'updateText', elementId: IDS.headline, text: 'Recovered' }], rationale: 'fixed' },
    ]);
    const res = await patchDesign(ai, base, {
      instruction: 'edit', scope: 'element', targetIds: [IDS.headline], lockedElementIds: [], brand,
    });
    expect(res!.report.passed).toBe(true);
    expect(res!.attempts).toBe(2);
    const el = findEl(res!.document, IDS.headline);
    expect(el?.type === 'text' && el.text).toBe('Recovered');
  });

  it('returns the best (flagged) result when both attempts fail validation', async () => {
    const base = baseDoc();
    const ai = scriptedAi([
      { operations: [{ op: 'updateText', elementId: IDS.headline, fontSize: 10 }], rationale: 'bad' },
      { operations: [{ op: 'updateText', elementId: IDS.headline, fontSize: 9 }], rationale: 'still bad' },
    ]);
    const res = await patchDesign(ai, base, {
      instruction: 'edit', scope: 'element', targetIds: [IDS.headline], lockedElementIds: [], brand,
    });
    expect(res).not.toBeNull();
    expect(res!.report.passed).toBe(false);
    expect(res!.needsAttention).toBe(true);
    expect(res!.attempts).toBe(2);
  });
});
