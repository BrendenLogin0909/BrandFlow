/**
 * Style directives — a creative-variance layer applied AFTER a recipe's
 * deterministic layout. Directives decorate and restyle any recipe output
 * (two-tone headlines, background motifs, oversized icon graphics) without
 * touching the recipe's geometry contract, and the result still passes the
 * full validation engine.
 *
 * This multiplies distinct looks: recipes × variants × treatments × motifs.
 * The AI chooses directives in step 7 alongside slot content; humans can
 * change them in the playground/editor. Inspired by real brand pages where
 * every post differs in composition but shares unmistakable DNA
 * (e.g. two-tone black+accent headlines with rotating line-art motifs).
 */
import type {
  Colour,
  Page,
  Element,
  IconElement,
  InternalDesignDocument,
  ShapeElement,
  TextElement,
} from '@brandflow/design-schema';
import {
  artworkUnder,
  backgroundHexesUnder,
  contrastRatio,
  requiredContrastRatio,
  wrapText,
} from '@brandflow/design-schema';

export const HEADLINE_TREATMENTS = ['plain', 'two-tone'] as const;
export type HeadlineTreatment = (typeof HEADLINE_TREATMENTS)[number];

export const MOTIFS = [
  'none',
  'dot-grid',
  'corner-ring',
  'diagonal-band',
  'underline-accent',
  'oversized-icon',
  'logo-top-left',
] as const;
export type Motif = (typeof MOTIFS)[number];

export interface StyleDirectives {
  headlineTreatment: HeadlineTreatment;
  motif: Motif;
  /** Icon for the oversized-icon motif (AI picks one matching the concept). */
  motifIconName?: string;
  /**
   * When the brand has opted out of strict display-text contrast
   * (ValidationContext.contrastMode = 'warn'), two-tone always prefers the
   * accent token even if it misses WCAG thresholds.
   */
  relaxContrast?: boolean;
}

export function applyStyleDirectives(
  doc: InternalDesignDocument,
  directives: StyleDirectives,
  newId: () => string,
): InternalDesignDocument {
  const out = structuredClone(doc);
  for (const page of out.pages) {
    if (directives.headlineTreatment === 'two-tone')
      twoToneHeadline(out, page, newId, directives.relaxContrast ?? false);
    addMotif(out, page.elements, directives, newId);
  }
  return out;
}

// ---------- two-tone headline (black phrase + accent phrase) ----------

/**
 * Splits the page's headline into two stacked text elements so the second
 * half renders in a display colour — the classic "Testing Is Not / the Same
 * as QA" treatment. Picks the most readable display token that still passes
 * large-text contrast; skips locked headlines and single-line headlines.
 */
function twoToneHeadline(
  doc: InternalDesignDocument,
  page: Page,
  newId: () => string,
  relaxContrast: boolean,
): void {
  const elements = page.elements;
  const headline = elements.find(
    (el): el is TextElement => el.type === 'text' && el.roleHint === 'headline' && !el.locked,
  );
  if (!headline) return;

  const lines = wrapText(headline.text, headline.fontSize, headline.frame.width, headline.letterSpacing);
  if (lines.length < 2) return;

  const accent: Colour | null = relaxContrast
    ? { kind: 'token', token: 'accent' }
    : pickDisplayColour(doc, page, headline);
  if (!accent) return;

  const split = Math.ceil(lines.length / 2);
  const lineHeightPx = headline.fontSize * headline.lineHeight;

  headline.text = lines.slice(0, split).join('\n');
  const firstHeight = split * lineHeightPx;

  const second: TextElement = {
    ...structuredClone(headline),
    id: newId(),
    name: `${headline.name} (accent)`,
    text: lines.slice(split).join('\n'),
    colour: accent,
    frame: {
      ...headline.frame,
      y: headline.frame.y + firstHeight,
      height: headline.frame.height - firstHeight,
    },
  };
  headline.frame.height = firstHeight;
  elements.splice(elements.indexOf(headline) + 1, 0, second);
}

/** Best display token for large text on this page's effective background. */
function pickDisplayColour(
  doc: InternalDesignDocument,
  page: Page,
  headline: TextElement,
): Colour | null {
  // Uses the engine's own background model rather than a local copy. The old
  // local one only counted a shape FULLY CONTAINING the headline and otherwise
  // assumed the page colour — the same flaw already fixed twice elsewhere, and
  // it is how an accent half-line ended up on a photo scrim at 2.95:1.
  const bgs = backgroundHexesUnder(headline, doc, page, page.elements);
  if (bgs.length === 0) return null;
  // Artwork showing through means the luminance is unknown, so no token can be
  // guaranteed: leave the headline single-colour rather than gamble on it.
  if (artworkUnder(headline, doc, page, page.elements).length > 0) return null;
  const required = requiredContrastRatio(headline.fontSize, headline.fontWeight);
  for (const token of ['accent', 'primary', 'secondary'] as const) {
    const hex = doc.brandTokens.colours[token];
    if (!hex) continue;
    if (Math.min(...bgs.map((bg) => contrastRatio(hex, bg))) >= required)
      return { kind: 'token', token };
  }
  return null;
}


// ---------- background motifs ----------

function addMotif(
  doc: InternalDesignDocument,
  elements: Element[],
  d: StyleDirectives,
  newId: () => string,
): void {
  const { width, height } = doc.canvas;
  const accent: Colour = { kind: 'token', token: 'accent' };
  const decorate = (el: Element) => elements.unshift(el);

  switch (d.motif) {
    case 'dot-grid': {
      // 4×4 grid of small dots, bottom-right corner, subtle
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++)
          decorate(
            dot(newId(), width - 220 + c * 48, height - 220 + r * 48, 14, accent, 0.5),
          );
      return;
    }
    case 'corner-ring': {
      // Ring poking in from the top-right corner (donut = two ellipses),
      // centred on the corner itself.
      //
      // It must not pass behind text. It always could, and did: the slide
      // counter in the carousel recipes sits right across the annulus, so the
      // accent band rendered behind dark type at 2.76:1. Nothing caught it
      // until the contrast check learned to sample partial overlaps.
      // So: shrink the ring until it clears every text frame, and if it cannot
      // stay a legible ring, draw nothing rather than something unreadable.
      const OUTER = 220;
      const INNER_RATIO = 360 / 440;
      const CLEARANCE = 8;
      const MIN_OUTER = 120;

      let outer = OUTER;
      for (const el of elements) {
        if (el.type !== 'text' || !el.visible) continue;
        const f = el.frame;
        // Nearest corner of the text frame to the ring centre at (width, 0).
        const dx = Math.max(0, width - (f.x + f.width));
        const dy = Math.max(0, f.y);
        outer = Math.min(outer, Math.hypot(dx, dy) - CLEARANCE);
      }
      if (outer < MIN_OUTER) return; // no room for a ring that reads as one
      const inner = outer * INNER_RATIO;
      decorate(ellipseShape(newId(), width - inner, -inner, inner * 2, inner * 2, { kind: 'token', token: 'background' }, 2));
      decorate(ellipseShape(newId(), width - outer, -outer, outer * 2, outer * 2, accent, 1));
      return;
    }
    case 'diagonal-band': {
      // An accent band across the lower third. It must not pass behind text:
      // at 90% opacity it used to be SKIPPED by the contrast rule's opacity
      // gate, so type sitting on it was measured against the page behind and
      // shipped at 3.19:1. Same class of bug as the corner-ring motif.
      //
      // The band is opaque (a translucent accent over white is a washed-out
      // accent anyway) and slides clear of every text frame; if there is no
      // clear band of canvas left, it is not drawn at all.
      const BAND_H = 90;
      const CLEARANCE = 12;
      const ROTATION_SLOP = 40; // the -8deg tilt lifts the corners
      let y = height - 260;

      const textBoxes = elements
        .filter((el): el is TextElement => el.type === 'text' && el.visible)
        .map((el) => el.frame);
      const clashes = (top: number) =>
        textBoxes.some(
          (f) =>
            f.y < top + BAND_H + ROTATION_SLOP + CLEARANCE &&
            f.y + f.height > top - ROTATION_SLOP - CLEARANCE,
        );
      // Try the intended position, then slide down towards the bottom edge.
      while (clashes(y) && y + BAND_H < height) y += 8;
      if (clashes(y)) return; // nowhere legible to put it

      const band = rectShape(newId(), -100, y, width + 200, BAND_H, accent, 1);
      band.frame.rotation = -8;
      decorate(band);
      return;
    }
    case 'underline-accent': {
      const headline = elements.find(
        (el): el is TextElement => el.type === 'text' && el.roleHint === 'headline',
      );
      if (!headline) return;
      elements.push(
        rectShape(
          newId(),
          headline.frame.x,
          headline.frame.y + headline.frame.height + 14,
          Math.min(headline.frame.width * 0.35, 320),
          14,
          accent,
          headline.zIndex,
        ),
      );
      return;
    }
    case 'oversized-icon': {
      // large line icon beside/above the headline — the "maze next to the
      // headline" pattern; sits inside the safe area so it stays validated
      const headline = elements.find(
        (el): el is TextElement => el.type === 'text' && el.roleHint === 'headline',
      );
      const size = 170;
      const x = Math.min(doc.canvas.width - 90 - size, (headline?.frame.x ?? 100) + (headline?.frame.width ?? 700) - size + 40);
      const y = Math.max(90, (headline?.frame.y ?? 200) - size - 20);
      const icon: IconElement = {
        type: 'icon',
        id: newId(),
        name: 'motif icon',
        frame: { x, y, width: size, height: size, rotation: 0 },
        opacity: 1,
        locked: false,
        visible: true,
        zIndex: 2,
        roleHint: 'decoration',
        tokenRefs: [{ category: 'colour', token: 'accent' }],
        recipeSlotId: null,
        meta: { motif: true },
        iconRef: { provider: 'lucide', name: d.motifIconName ?? 'route' },
        colour: accent,
        strokeWidth: 1.5,
      };
      elements.push(icon);
      return;
    }
    case 'logo-top-left': {
      // brand logo anchored top-left inside the safe area (the classic
      // carousel signature); a labelled placeholder until the brand-kit
      // logo asset is attached, replaceable in the editor
      const page = doc.pages.find((p) => p.elements === elements);
      const x = page?.safeArea.left ?? 90;
      const y = page?.safeArea.top ?? 90;
      const logo: Element = {
        type: 'image',
        id: newId(),
        name: 'brand logo',
        frame: { x, y, width: 220, height: 64, rotation: 0 },
        opacity: 1,
        locked: false,
        visible: true,
        zIndex: 5,
        roleHint: 'logo',
        tokenRefs: [{ category: 'logo', token: 'primary' }],
        recipeSlotId: null,
        meta: { motif: true },
        assetId: doc.brandTokens.logoAssetIds[0],
        fit: 'contain',
        cornerRadius: 0,
        borderWidth: 0,
        isPlaceholder: doc.brandTokens.logoAssetIds.length === 0,
      };
      elements.push(logo);
      return;
    }
    case 'none':
      return;
  }
}

function dot(id: string, x: number, y: number, size: number, colour: Colour, opacity: number): ShapeElement {
  const s = ellipseShape(id, x, y, size, size, colour, 1);
  s.opacity = opacity;
  return s;
}

function ellipseShape(id: string, x: number, y: number, w: number, h: number, fill: Colour, z: number): ShapeElement {
  return baseShape(id, 'ellipse', x, y, w, h, fill, z);
}

function rectShape(id: string, x: number, y: number, w: number, h: number, fill: Colour, z: number): ShapeElement {
  return baseShape(id, 'rect', x, y, w, h, fill, z);
}

function baseShape(
  id: string,
  shape: 'rect' | 'ellipse',
  x: number,
  y: number,
  w: number,
  h: number,
  fill: Colour,
  z: number,
): ShapeElement {
  return {
    type: 'shape',
    id,
    name: `motif ${shape}`,
    frame: { x, y, width: w, height: h, rotation: 0 },
    opacity: 1,
    locked: false,
    visible: true,
    zIndex: z,
    roleHint: 'decoration',
    tokenRefs: [],
    recipeSlotId: null,
    meta: { motif: true },
    shape,
    fill,
    strokeWidth: 0,
    cornerRadius: 0,
  };
}
