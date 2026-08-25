/**
 * Regression tests for the two defects the 10-post output assessment exposed
 * (docs/16-backlog.md A1 + A2). Both shipped in every generated post, and
 * neither was catchable by a typecheck — only by looking at the output.
 */
import { describe, expect, it } from 'vitest';
import type { InternalDesignDocument } from '@brandflow/design-schema';
import { measureText, validateDesignDocument } from '@brandflow/design-schema';
import { autoFixFreeform } from './freeform.js';
import { normaliseHue, DEFAULT_PACK_HUE } from '../assets/providers.js';

const COLOURS = {
  primary: '#1a3c8f',
  secondary: '#4a6fd4',
  accent: '#e8b23a',
  neutral: '#8a8f98',
  background: '#ffffff',
  text: '#101418',
};

/** A document with one text element in a frame far too short for its copy. */
function docWithText(opts: { text: string; fontSize: number; height: number; y?: number; width?: number }): InternalDesignDocument {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    version: 1,
    brandProfileId: 'test',
    clientCompanyId: '00000000-0000-4000-8000-000000000002',
    layoutRecipeRef: null,
    format: 'single_image',
    canvas: { width: 1080, height: 1350, unit: 'px', dpi: 96 },
    brandTokens: { colours: COLOURS, fonts: { heading: 'Poppins', body: 'Inter' }, logoAssetIds: [] },
    pages: [
      {
        id: '00000000-0000-4000-8000-000000000003',
        name: 'Page 1',
        background: { kind: 'token', token: 'background' },
        safeArea: { top: 64, right: 64, bottom: 64, left: 64 },
        elements: [
          {
            id: '00000000-0000-4000-8000-000000000004',
            name: 'body copy',
            type: 'text',
            frame: { x: 100, y: opts.y ?? 200, width: opts.width ?? 600, height: opts.height, rotation: 0 },
            opacity: 1,
            locked: false,
            visible: true,
            zIndex: 1,
            roleHint: 'body',
            tokenRefs: [],
            recipeSlotId: null,
            meta: {},
            text: opts.text,
            fontFamily: 'Inter',
            fontSize: opts.fontSize,
            fontWeight: 400,
            fontStyle: 'normal',
            lineHeight: 1.3,
            letterSpacing: 0,
            align: 'left',
            verticalAlign: 'top',
            colour: { kind: 'token', token: 'text' },
            autoFit: false,
          },
        ],
      },
    ],
  } as unknown as InternalDesignDocument;
}

const overflowErrors = (doc: InternalDesignDocument) =>
  validateDesignDocument(doc, { contrastMode: 'warn' }).errors.filter((e) => e.ruleId === 'text-overflow');
const marginErrors = (doc: InternalDesignDocument) =>
  validateDesignDocument(doc, { contrastMode: 'warn' }).errors.filter((e) => e.ruleId === 'safe-margins');

describe('autoFixFreeform — text overflow (A2)', () => {
  it('shrinks text that can fit by stepping the font down', () => {
    const doc = docWithText({ text: 'A headline that is a little too large for its box', fontSize: 48, height: 120 });
    expect(overflowErrors(doc).length).toBe(1);
    const fixed = autoFixFreeform(doc);
    expect(overflowErrors(fixed).length).toBe(0);
  });

  it('grows the frame when the copy cannot fit at the readability floor', () => {
    // 26px frame, copy that needs ~2 lines at the 14px floor — the exact
    // shape that shipped as an error in the cybersecurity post.
    const doc = docWithText({
      text: 'Blaming employees for clicking a well-crafted phishing email does not reduce risk.',
      fontSize: 18,
      height: 26,
    });
    expect(overflowErrors(doc).length).toBe(1);
    const fixed = autoFixFreeform(doc);
    const el: any = fixed.pages[0]!.elements[0];
    expect(el.frame.height).toBeGreaterThan(26);
    expect(overflowErrors(fixed).length).toBe(0);
    expect(marginErrors(fixed).length).toBe(0);
  });

  it('keeps grown frames inside the safe area rather than trading one error for another', () => {
    // Sits near the bottom edge, so naive downward growth would cross the safe margin.
    const doc = docWithText({
      text: 'A long sentence pinned near the bottom of the canvas that needs several lines to render in full at any readable size.',
      fontSize: 16,
      height: 30,
      y: 1240,
    });
    const fixed = autoFixFreeform(doc);
    const el: any = fixed.pages[0]!.elements[0];
    expect(el.frame.y).toBeGreaterThanOrEqual(64);
    expect(el.frame.y + el.frame.height).toBeLessThanOrEqual(1350 - 64);
    expect(marginErrors(fixed).length).toBe(0);
    expect(overflowErrors(fixed).length).toBe(0);
  });

  it('never shrinks below the readability floor', () => {
    const doc = docWithText({ text: 'Short', fontSize: 40, height: 400 });
    const fixed = autoFixFreeform(doc);
    expect((fixed.pages[0]!.elements[0] as any).fontSize).toBeGreaterThanOrEqual(14);
  });

  it('leaves text that already fits untouched', () => {
    const text = 'Fits fine';
    const doc = docWithText({ text, fontSize: 20, height: 200 });
    const before = measureText(text, 20, 1.3, 600).height;
    const fixed = autoFixFreeform(doc);
    expect((fixed.pages[0]!.elements[0] as any).fontSize).toBe(20);
    expect(before).toBeLessThanOrEqual(200);
  });
});

describe('bundled pack hue (A1)', () => {
  it('accepts a brand hex', () => {
    expect(normaliseHue('#e8b23a')).toBe('#e8b23a');
  });

  it('falls back to the pack default for missing or malformed input', () => {
    for (const bad of [undefined, '', 'red', '#fff', 'e8b23a', '#gggggg', 'javascript:x']) {
      expect(normaliseHue(bad as string | undefined)).toBe(DEFAULT_PACK_HUE);
    }
  });
});

describe('autoFixFreeform — safe-area clamp', () => {
  it('pulls an element back inside the right margin instead of leaving a hard error', () => {
    // Same shape as the generated posts: an element whose right edge runs
    // past the safe margin (here 700 + 380 = 1080 against a 1016 limit).
    const doc = docWithText({ text: 'Overhanging copy', fontSize: 18, height: 80, width: 380 });
    (doc.pages[0]!.elements[0] as any).frame.x = 700;
    expect(marginErrors(doc).length).toBe(1);
    const fixed = autoFixFreeform(doc);
    const f = (fixed.pages[0]!.elements[0] as any).frame;
    expect(f.x + f.width).toBeLessThanOrEqual(1080 - 64);
    expect(marginErrors(fixed).length).toBe(0);
    expect(overflowErrors(fixed).length).toBe(0);
  });

  it('leaves decoration free to bleed past the margin', () => {
    const doc = docWithText({ text: 'Bleeding shape', fontSize: 18, height: 80, width: 380 });
    const el: any = doc.pages[0]!.elements[0];
    el.roleHint = 'decoration';
    el.frame.x = 900;
    const fixed = autoFixFreeform(doc);
    expect((fixed.pages[0]!.elements[0] as any).frame.x).toBe(900);
  });
});
