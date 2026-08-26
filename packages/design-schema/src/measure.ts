/**
 * Text measurement. This module is the single measurement authority used by
 * both the layout engine and the validation engine so they can never disagree.
 *
 * MVP implementation: average-glyph-width heuristic tuned for common
 * sans-serif brand fonts. The API adapter can swap in real font metrics
 * (opentype.js / canvas measurement in polotno-node) behind the same function
 * signature without touching callers.
 */

export interface TextMetrics {
  lines: number;
  height: number;
  widestLine: number;
}

const AVG_CHAR_WIDTH_RATIO = 0.54; // avg glyph width / fontSize for sans-serif

/** Average advance width of one glyph, including tracking. */
export const charWidthFor = (fontSize: number, letterSpacing = 0): number =>
  fontSize * AVG_CHAR_WIDTH_RATIO + letterSpacing;

/** Break text into wrapped lines exactly as the layout/validation engines see it. */
export function wrapText(
  text: string,
  fontSize: number,
  frameWidth: number,
  letterSpacing = 0,
): string[] {
  const charWidth = fontSize * AVG_CHAR_WIDTH_RATIO + letterSpacing;
  const charsPerLine = Math.max(1, Math.floor(frameWidth / charWidth));

  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = words[0]!;
    for (const word of words.slice(1)) {
      if (current.length + 1 + word.length > charsPerLine) {
        lines.push(current);
        current = word;
      } else {
        current += ` ${word}`;
      }
    }
    lines.push(current);
  }
  return lines;
}

export function measureText(
  text: string,
  fontSize: number,
  lineHeight: number,
  frameWidth: number,
  letterSpacing = 0,
): TextMetrics {
  const charWidth = fontSize * AVG_CHAR_WIDTH_RATIO + letterSpacing;
  const lines = wrapText(text, fontSize, frameWidth, letterSpacing);
  const widestLine = Math.max(...lines.map((l) => l.length * charWidth));
  return { lines: lines.length, height: lines.length * fontSize * lineHeight, widestLine };
}

/**
 * Largest font size (stepping down from `preferred` by `step`) at which the
 * text fits the frame; returns null if it doesn't fit even at `minimum`.
 * Used by recipe layout functions for the overflow auto-fix.
 */
export function fitFontSize(
  text: string,
  preferred: number,
  minimum: number,
  lineHeight: number,
  frameWidth: number,
  frameHeight: number,
  step = 2,
): number | null {
  for (let size = preferred; size >= minimum; size -= step) {
    if (measureText(text, size, lineHeight, frameWidth).height <= frameHeight) return size;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Glyph geometry — where the ink actually lands
// ---------------------------------------------------------------------------
//
// A text FRAME is not where the text is. It is usually wider than the longest
// line and taller than the block, and the block sits inside it according to
// `align` / `verticalAlign`. Every question about what a reader can actually
// see — is this text on top of that image, did the canvas edge cut a character
// off — is a question about the glyphs, not the frame, and answering it from
// the frame is how "82%" shipped rendering as "32%" with every check green.
//
// The layout below mirrors `exportPageSvg`'s `textToSvg` exactly, because that
// is what renders: same `wrapText`, same line-height box, same first baseline
// at `lineBox/2 + 0.3em`. If the exporter's text layout changes, this must
// change with it — that is the price of it being a measurement of the real
// output rather than a second opinion about it.

/** Ascender above the baseline, as a fraction of font size (typical sans). */
const ASCENT_RATIO = 0.8;
/** Descender below the baseline, as a fraction of font size. */
const DESCENT_RATIO = 0.2;
/** Baseline offset inside a line box, as a fraction of font size — matches the exporter. */
const BASELINE_IN_LINE_RATIO = 0.3;

/** The fields of a text element this module needs. `TextElement` satisfies it. */
export interface TextLayout {
  text: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  frame: { x: number; y: number; width: number; height: number };
}

export interface GlyphLine {
  /** The wrapped line this box belongs to. */
  text: string;
  /** Ink box of the line: left/top/right/bottom in canvas coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Baseline y, for callers that need to reason about it directly. */
  baseline: number;
}

export interface GlyphBox {
  /** Union of every line's ink box. */
  x: number;
  y: number;
  width: number;
  height: number;
  lines: GlyphLine[];
}

/**
 * Ink box of every wrapped line, in canvas coordinates.
 *
 * Horizontally each line is measured, then placed by `align`, so a short last
 * line does not claim the width of the longest one. Vertically the box is
 * glyph-tight (ascender to descender) rather than the full line box, so the
 * leading a generous `lineHeight` adds is not mistaken for ink.
 */
export function glyphLines(el: TextLayout): GlyphLine[] {
  const charWidth = charWidthFor(el.fontSize, el.letterSpacing ?? 0);
  const lines = wrapText(el.text, el.fontSize, el.frame.width, el.letterSpacing ?? 0);
  const lineBox = el.fontSize * el.lineHeight;
  const blockHeight = lines.length * lineBox;
  const align = el.align ?? 'left';
  const startY =
    el.verticalAlign === 'middle'
      ? el.frame.y + (el.frame.height - blockHeight) / 2
      : el.verticalAlign === 'bottom'
        ? el.frame.y + el.frame.height - blockHeight
        : el.frame.y;

  return lines.map((line, i) => {
    const width = line.length * charWidth;
    const x =
      align === 'center'
        ? el.frame.x + el.frame.width / 2 - width / 2
        : align === 'right'
          ? el.frame.x + el.frame.width - width
          : el.frame.x;
    const baseline = startY + i * lineBox + lineBox / 2 + el.fontSize * BASELINE_IN_LINE_RATIO;
    return {
      text: line,
      x,
      y: baseline - el.fontSize * ASCENT_RATIO,
      width,
      height: el.fontSize * (ASCENT_RATIO + DESCENT_RATIO),
      baseline,
    };
  });
}

/** `glyphLines` plus their bounding box. Empty lines are kept — they occupy leading. */
export function glyphBox(el: TextLayout): GlyphBox {
  const lines = glyphLines(el);
  const inked = lines.filter((l) => l.width > 0);
  const boxes = inked.length ? inked : lines;
  const x = Math.min(...boxes.map((l) => l.x));
  const y = Math.min(...boxes.map((l) => l.y));
  const right = Math.max(...boxes.map((l) => l.x + l.width));
  const bottom = Math.max(...boxes.map((l) => l.y + l.height));
  return { x, y, width: right - x, height: bottom - y, lines };
}

/**
 * Which edges of a glyph box are EXACT rather than estimated.
 *
 * The anchored edge — left for left-aligned text, right for right-aligned —
 * is the frame edge itself and is exact whatever the font metrics turn out to
 * be. The opposite edge is `wrapText`'s average-glyph estimate and can be out
 * by a glyph or so either way. Callers that fail a document on a boundary
 * crossing need to know which is which, so they can be strict where the number
 * is trustworthy and forgiving where it is not.
 */
export function anchoredEdges(el: TextLayout): {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
} {
  const align = el.align ?? 'left';
  const va = el.verticalAlign ?? 'top';
  return {
    left: align === 'left',
    right: align === 'right',
    top: va === 'top',
    bottom: va === 'bottom',
  };
}
