/**
 * Regression: text rendered on an image or a chart (docs/19 P1.4, P1.2).
 *
 * Both defects below shipped on 2026-08-26 with every check green:
 *
 *  - A headline set straight onto a law-firm illustration and another onto a
 *    funnel chart. The contrast rule sampled SHAPES only, so artwork under
 *    text was invisible to it — it found the white page beneath the image and
 *    scored dark-on-white. The vision critic missed it too, so the page was
 *    blind from both directions.
 *  - "82%" composed with its glyph box 48px off the left edge, which renders
 *    as "32%". Nothing in the validator had any notion of where the glyphs
 *    were, so a bleed that destroyed a number passed as a signature move.
 *
 * The fixtures here are the real geometry from those pages, scaled down.
 */
import { describe, expect, it } from 'vitest';
import { validateDesignDocument } from './validate.js';
import type { Element, InternalDesignDocument } from './schema.js';

const COLOURS = {
  primary: '#1c1917',
  secondary: '#44403c',
  accent: '#b45309',
  neutral: '#a8a29e',
  background: '#ffffff',
  text: '#1c1917',
};

let n = 0;
const uuid = () => `30000000-0000-4000-8000-${String(n++).padStart(12, '0')}`;

const base = (zIndex: number, frame: Partial<Element['frame']> = {}) => ({
  id: uuid(),
  opacity: 1,
  locked: false,
  visible: true,
  zIndex,
  roleHint: null,
  tokenRefs: [],
  recipeSlotId: null,
  meta: {},
  frame: { x: 0, y: 0, width: 100, height: 100, rotation: 0, ...frame },
});

const text = (o: Record<string, unknown> = {}): Element =>
  ({
    ...base(500, { x: 200, y: 400, width: 400, height: 200 }),
    name: 'headline',
    type: 'text',
    text: 'The clause that costs clients',
    fontFamily: 'Inter',
    fontSize: 44,
    fontWeight: 800,
    fontStyle: 'normal',
    lineHeight: 1.25,
    letterSpacing: 0,
    align: 'left',
    verticalAlign: 'top',
    colour: { kind: 'token', token: 'text' },
    autoFit: false,
    ...o,
  }) as unknown as Element;

const image = (o: Record<string, unknown> = {}): Element =>
  ({
    ...base(200, { x: 100, y: 300, width: 700, height: 700 }),
    name: 'illustration',
    type: 'image',
    src: 'https://example.test/a.png',
    fit: 'cover',
    cornerRadius: 0,
    borderWidth: 0,
    isPlaceholder: false,
    ...o,
  }) as unknown as Element;

const chart = (o: Record<string, unknown> = {}): Element =>
  ({
    ...base(200, { x: 100, y: 300, width: 700, height: 700 }),
    name: 'funnel',
    type: 'chart',
    chartType: 'bar',
    data: [{ label: 'a', value: 1 }],
    palette: [{ category: 'colour', token: 'primary' }],
    ...o,
  }) as unknown as Element;

/** An opaque panel — what the compositor puts between artwork and text. */
const scrim = (o: Record<string, unknown> = {}): Element =>
  ({
    ...base(400, { x: 180, y: 380, width: 440, height: 240 }),
    name: 'scrim',
    type: 'shape',
    shape: 'rect',
    fill: { kind: 'token', token: 'background' },
    strokeWidth: 0,
    cornerRadius: 0,
    ...o,
  }) as unknown as Element;

function doc(elements: Element[]): InternalDesignDocument {
  return {
    id: uuid(),
    version: 1,
    brandProfileId: 'test',
    clientCompanyId: uuid(),
    layoutRecipeRef: null,
    format: 'single_image',
    canvas: { width: 1080, height: 1350, unit: 'px', dpi: 96 },
    brandTokens: {
      colours: COLOURS,
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

const issues = (d: InternalDesignDocument, ruleId: string) => {
  const r = validateDesignDocument(d);
  return [...r.errors, ...r.warnings].filter((v) => v.ruleId === ruleId);
};

describe('text on artwork', () => {
  it('fails a headline sitting on an image with nothing in between', () => {
    // The law-firm page: headline entirely inside the illustration's frame.
    expect(issues(doc([image(), text()]), 'text-on-artwork')).toHaveLength(1);
  });

  it('fails a headline sitting on a chart', () => {
    // The funnel page. A chart is artwork for the same reason an image is:
    // its luminance at the glyphs is not knowable from the document.
    expect(issues(doc([chart(), text()]), 'text-on-artwork')).toHaveLength(1);
  });

  it('passes once an opaque scrim sits between the artwork and the text', () => {
    // This is the contract with the compositor: it inserts the scrim, and the
    // scrim is what makes the page legal — not a relaxation of the rule.
    const d = doc([image(), scrim(), text()]);
    expect(issues(d, 'text-on-artwork')).toHaveLength(0);
    expect(issues(d, 'contrast')).toHaveLength(0);
  });

  it('fails a scrim too thin to bound the artwork into legibility', () => {
    // 30% white leaves 70% of an unknown image showing. The darkest that
    // composite could be is #4d4d4d, and dark text on #4d4d4d is 2.1:1.
    const d = doc([image(), scrim({ opacity: 0.3 }), text()]);
    const v = issues(d, 'text-on-artwork');
    expect(v).toHaveLength(1);
    // …and it says the scrim is thin, not that there is none. Sending someone
    // to add a scrim that is already there is not an actionable message.
    expect(v[0]!.message).toMatch(/scrim too thin/);
    expect(v[0]!.message).toMatch(/worst case is \d+\.\d+:1/);
    expect(v[0]!.message).not.toMatch(/no scrim/);
  });

  it('passes the standard translucent scrim — dark panel, white type', () => {
    // How everyone actually sets type over a photograph, and what
    // `photo-hero-card / full-bleed-scrim` emits: an 82% dark panel. 18% of
    // even pure white cannot lift it far enough to lose white text — the
    // worst case is still better than 11:1 — so this is legible by
    // measurement, not by assertion. A blanket "opaque or fail" rule would
    // have banned the technique instead of measuring it.
    const d = doc([
      image(),
      scrim({ opacity: 0.82, fill: { kind: 'token', token: 'text' } }),
      text({ colour: { kind: 'token', token: 'background' } }),
    ]);
    expect(issues(d, 'text-on-artwork')).toHaveLength(0);
    expect(issues(d, 'contrast')).toHaveLength(0);
  });

  it('fails the same translucent scrim when the type is dark instead', () => {
    // Same 82% dark panel, dark text: the scrim is doing its job and the text
    // still cannot be read. Presence of a scrim is never the test; legibility
    // against both bounds is.
    const d = doc([
      image(),
      scrim({ opacity: 0.82, fill: { kind: 'token', token: 'text' } }),
      text(),
    ]);
    expect(issues(d, 'text-on-artwork')).toHaveLength(1);
  });

  it('requires the scrim to be LEGIBLE, not merely present', () => {
    // Opaque scrim in the same hex as the text: artwork is hidden, so the
    // artwork rule is satisfied and the contrast rule takes over. A scrim you
    // cannot read the text against is not a fix.
    const d = doc([image(), scrim({ fill: { kind: 'token', token: 'primary' } }), text()]);
    expect(issues(d, 'text-on-artwork')).toHaveLength(0);
    expect(issues(d, 'contrast')).toHaveLength(1);
  });

  it('does not fire when the text sits clear of the artwork', () => {
    // Image occupies the right half; left-aligned text runs left of it.
    const d = doc([
      image({ ...base(200, { x: 700, y: 300, width: 380, height: 700 }), name: 'illustration' }),
      text({ frame: { x: 100, y: 400, width: 400, height: 200, rotation: 0 } }),
    ]);
    expect(issues(d, 'text-on-artwork')).toHaveLength(0);
  });

  it('does not fire on artwork drawn ABOVE the text', () => {
    // Higher z-index means it covers the text rather than backing it. That is
    // a different defect (hidden content) and not this rule's business.
    expect(issues(doc([image({ zIndex: 900 }), text()]), 'text-on-artwork')).toHaveLength(0);
  });

  it('respects a crop-circle mask instead of the bounding box', () => {
    // `crop-circle` masks an image to a circle via cornerRadius. Text tucked
    // into the corner the mask cuts away is on the page, not on the artwork —
    // the same reasoning the sampler already applies to ellipse shapes.
    const circle = image({
      ...base(200, { x: 300, y: 300, width: 600, height: 600 }),
      name: 'illustration',
      src: 'https://example.test/a.png',
      fit: 'cover',
      cornerRadius: 300,
      borderWidth: 0,
      isPlaceholder: false,
    });
    const corner = text({
      text: 'ok',
      fontSize: 24,
      frame: { x: 310, y: 310, width: 60, height: 40, rotation: 0 },
    });
    expect(issues(doc([circle, corner]), 'text-on-artwork')).toHaveLength(0);
    // …and the same text in the middle of the circle is still caught.
    const middle = text({
      text: 'ok',
      fontSize: 24,
      frame: { x: 560, y: 570, width: 60, height: 40, rotation: 0 },
    });
    expect(issues(doc([circle, middle]), 'text-on-artwork')).toHaveLength(1);
  });

  it('gives artwork its own rule id, not the low-contrast one', () => {
    // A human reading the report has to be able to tell "this text is on a
    // panel that is too dark" from "this text is on a photograph". They are
    // different defects with different fixes.
    const v = issues(doc([image(), text()]), 'text-on-artwork')[0]!;
    expect(v.ruleId).toBe('text-on-artwork');
    expect(v.message).toMatch(/no scrim between them/);
    expect(v.severity).toBe('error');
  });

  it('does not exempt decoration or background roleHints', () => {
    // The law-firm illustration was tagged `decoration`. Those hints exempt an
    // element from the SAFE AREA, which is about bleeding; there is no sense
    // in which unreadable text is a legitimate decorative choice.
    const d = doc([image({ roleHint: 'decoration' }), text({ roleHint: 'decoration' })]);
    expect(issues(d, 'text-on-artwork')).toHaveLength(1);
  });
});

describe('cropped glyphs', () => {
  const numeral = (o: Record<string, unknown> = {}) =>
    text({
      name: 'stat',
      text: '82%',
      fontSize: 192,
      lineHeight: 1.0833333333333333,
      roleHint: 'decoration',
      frame: { x: -48, y: 168, width: 392, height: 216, rotation: 0 },
      verticalAlign: 'middle',
      ...o,
    });

  it('fails the numeral that rendered as 32%', () => {
    // Real geometry from 02-fintech-cashflow: 48px of the leading "8" is off
    // the canvas, and the glyph that survives reads as a 3.
    const v = issues(doc([numeral()]), 'text-cropped');
    expect(v).toHaveLength(1);
    expect(v[0]!.message).toMatch(/left edge/);
    expect(v[0]!.severity).toBe('error');
  });

  it('does not exempt decoration, unlike the safe-area rule', () => {
    // The fixture above is already `decoration`; assert the exemption that
    // makes bleeds legal has not leaked into this rule.
    expect(issues(doc([numeral()]), 'safe-margins')).toHaveLength(0);
    expect(issues(doc([numeral()]), 'text-cropped')).toHaveLength(1);
  });

  it('fails a right-aligned line pushed past the right edge', () => {
    const v = issues(
      doc([
        numeral({
          align: 'right',
          frame: { x: 784, y: 168, width: 392, height: 216, rotation: 0 },
        }),
      ]),
      'text-cropped',
    );
    expect(v).toHaveLength(1);
    expect(v[0]!.message).toMatch(/right edge/);
  });

  it('fails text cut by the bottom edge', () => {
    const v = issues(
      doc([
        numeral({
          verticalAlign: 'bottom',
          frame: { x: 100, y: 1200, width: 392, height: 300, rotation: 0 },
        }),
      ]),
      'text-cropped',
    );
    expect(v).toHaveLength(1);
    expect(v[0]!.message).toMatch(/bottom edge/);
  });

  it('passes the same numeral once the bleed is moved off the type', () => {
    // P1.2's actual requirement: bleed the backdrop, not the digits.
    expect(
      issues(
        doc([numeral({ frame: { x: 96, y: 168, width: 392, height: 216, rotation: 0 } })]),
        'text-cropped',
      ),
    ).toHaveLength(0);
  });

  it('tolerates a hairline overshoot on an ESTIMATED edge', () => {
    // Left-aligned text is anchored on its left edge; the right edge is
    // `measureText`'s average-glyph estimate and is out by a glyph either way.
    // Failing a document on that number would be failing it on a guess.
    const nudged = text({
      text: 'abcdefgh',
      fontSize: 40,
      align: 'left',
      // 8 glyphs x 21.6px = 172.8px of estimated ink starting at 920 -> ~13px
      // past the canvas, well inside one glyph of slack.
      frame: { x: 920, y: 400, width: 400, height: 100, rotation: 0 },
    });
    expect(issues(doc([nudged]), 'text-cropped')).toHaveLength(0);
  });

  it('does not tolerate the same overshoot on an ANCHORED edge', () => {
    // Right-aligned text is positioned FROM the right edge, so that number is
    // exact whatever the font turns out to be, and is held to a half-pixel.
    const nudged = text({
      text: 'abcdefgh',
      fontSize: 40,
      align: 'right',
      frame: { x: 700, y: 400, width: 400, height: 100, rotation: 0 },
    });
    expect(issues(doc([nudged]), 'text-cropped')).toHaveLength(1);
  });
});
