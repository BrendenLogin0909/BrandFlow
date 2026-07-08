import { describe, expect, it } from 'vitest';
import type { InternalDesignDocument } from '@brandflow/design-schema';
import { summarizePatchDiff } from './patchDiffSummary';

function miniDoc(overrides?: Partial<InternalDesignDocument>): InternalDesignDocument {
  return {
    format: 'linkedin_single',
    canvas: { width: 1080, height: 1080 },
    brandProfileId: 'playground',
    brandTokens: {
      colours: { primary: '#000', text: '#111', background: '#fff', accent: '#f00', secondary: '#222', neutral: '#999' },
      fonts: { heading: 'Inter', body: 'Inter' },
    },
    layoutRecipeRef: { recipeId: 'quote-card', variant: 'default' },
    pages: [
      {
        id: 'p1',
        name: 'Cover',
        background: { kind: 'solid', colour: { kind: 'token', token: 'background' } },
        elements: [
          {
            id: 'h1',
            type: 'text',
            name: 'Headline',
            frame: { x: 0, y: 0, width: 400, height: 80, rotation: 0 },
            opacity: 1,
            locked: false,
            visible: true,
            zIndex: 1,
            roleHint: null,
            tokenRefs: [],
            recipeSlotId: null,
            meta: {},
            text: 'Before',
            fontFamily: 'Inter',
            fontSize: 48,
            fontWeight: 700,
            fontStyle: 'normal',
            lineHeight: 1.1,
            letterSpacing: 0,
            align: 'left',
            verticalAlign: 'top',
            colour: { kind: 'token', token: 'text' },
          },
        ],
      },
    ],
    version: 1,
    ...overrides,
  } as InternalDesignDocument;
}

describe('summarizePatchDiff', () => {
  it('detects text changes', () => {
    const before = miniDoc();
    const after = miniDoc();
    after.pages[0]!.elements[0] = { ...after.pages[0]!.elements[0]!, text: 'After' } as typeof after.pages[0]['elements'][0];
    const lines = summarizePatchDiff(before, after);
    expect(lines.some((l) => l.kind === 'text' && l.elementId === 'h1')).toBe(true);
  });

  it('detects removed elements', () => {
    const before = miniDoc();
    const after = miniDoc();
    after.pages[0]!.elements = [];
    const lines = summarizePatchDiff(before, after);
    expect(lines.some((l) => l.kind === 'removed')).toBe(true);
  });
});
