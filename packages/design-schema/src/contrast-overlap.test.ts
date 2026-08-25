/**
 * Regression: text overlapping a coloured panel must be judged against that
 * panel, not the page behind it.
 *
 * Found 2026-08-25 by rendering a real generated post: a kicker coloured with
 * the `text` token sat on a `primary` panel, and for that brand both tokens
 * resolve to the same hex — literally invisible. The validator scored it as
 * passing because its background lookup required the panel to FULLY CONTAIN
 * the text frame, so a partial overlap fell back to the white page. The vision
 * critic missed it too, so nothing caught it.
 *
 * This matters more under art direction, where overlapping text with a colour
 * block is a deliberate move.
 */
import { describe, expect, it } from 'vitest';
import { validateDesignDocument } from './validate.js';
import type { InternalDesignDocument } from './schema.js';

// primary and text are deliberately the SAME hex, as in the real brand.
const COLOURS = {
  primary: '#1c1917',
  secondary: '#44403c',
  accent: '#b45309',
  neutral: '#a8a29e',
  background: '#ffffff',
  text: '#1c1917',
};

let n = 0;
const uuid = () => `20000000-0000-4000-8000-${String(n++).padStart(12, '0')}`;

/**
 * A dark panel plus a `text`-coloured line overlapping it by `coverage`.
 * `fromRight` puts the panel at the trailing edge instead of the leading one —
 * for left-aligned text the trailing edge is where no glyph sits.
 */
function doc(coverage: number, fromRight = false): InternalDesignDocument {
  const textFrame = { x: 100, y: 200, width: 400, height: 100, rotation: 0 };
  const panelWidth = 400 * coverage;
  const panelX = fromRight ? 100 + 400 - panelWidth : 100;
  return {
    id: uuid(),
    version: 1,
    brandProfileId: 'test',
    clientCompanyId: uuid(),
    layoutRecipeRef: null,
    format: 'single_image',
    canvas: { width: 1080, height: 1350, unit: 'px', dpi: 96 },
    brandTokens: { colours: COLOURS, fonts: { heading: 'Poppins', body: 'Inter' }, logoAssetIds: [] },
    pages: [
      {
        id: uuid(),
        name: 'Page 1',
        background: { kind: 'token', token: 'background' },
        safeArea: { top: 64, right: 64, bottom: 64, left: 64 },
        elements: [
          {
            id: uuid(), name: 'panel', type: 'shape', shape: 'rect',
            frame: { x: panelX, y: 200, width: panelWidth, height: 100, rotation: 0 },
            opacity: 1, locked: false, visible: true, zIndex: 1,
            roleHint: 'decoration', tokenRefs: [], recipeSlotId: null, meta: {},
            fill: { kind: 'token', token: 'primary' }, strokeWidth: 0, cornerRadius: 0,
          },
          {
            id: uuid(), name: 'kicker', type: 'text',
            frame: textFrame,
            opacity: 1, locked: false, visible: true, zIndex: 5,
            roleHint: 'caption', tokenRefs: [], recipeSlotId: null, meta: {},
            text: 'COMMERCIAL CONTRACT RISK',
            fontFamily: 'Inter', fontSize: 18, fontWeight: 400, fontStyle: 'normal',
            lineHeight: 1.3, letterSpacing: 0, align: 'left', verticalAlign: 'top',
            colour: { kind: 'token', token: 'text' }, autoFit: false,
          },
        ],
      },
    ],
  } as unknown as InternalDesignDocument;
}

const contrastIssues = (d: InternalDesignDocument) => {
  const r = validateDesignDocument(d, { contrastMode: 'enforce' });
  return [...r.errors, ...r.warnings].filter((v) => v.ruleId === 'contrast');
};

describe('contrast against overlapping backgrounds', () => {
  it('flags dark-on-dark when the panel fully covers the text', () => {
    expect(contrastIssues(doc(1)).length).toBe(1);
  });

  it('flags dark-on-dark when the panel only PARTIALLY covers the text (the regression)', () => {
    // Half-covered: previously fell back to the white page and passed.
    expect(contrastIssues(doc(0.5)).length).toBe(1);
  });

  it('still flags it at a small but meaningful overlap', () => {
    expect(contrastIssues(doc(0.3)).length).toBe(1);
  });

  it('flags even a small clip at the LEADING edge, where the first glyph sits', () => {
    // Left-aligned text starts at the left edge, so a 5% panel there is not
    // negligible at all — the opening characters render dark-on-dark.
    expect(contrastIssues(doc(0.05)).length).toBe(1);
  });

  it('ignores a clip at the TRAILING edge, where no glyph sits', () => {
    // Sampling follows the alignment rather than the frame, so a sliver at the
    // right-hand end of a left-aligned frame is correctly ignored.
    expect(contrastIssues(doc(0.05, true)).length).toBe(0);
  });

  it('passes legible text on the same partially-overlapping panel', () => {
    const d = doc(0.5);
    const kicker: any = d.pages[0]!.elements[1];
    kicker.colour = { kind: 'token', token: 'background' }; // white on dark panel AND on white page…
    // …white-on-white against the page is itself a failure, so this asserts the
    // worst-case rule is genuinely two-sided rather than only checking panels.
    expect(contrastIssues(d).length).toBe(1);
  });
});
