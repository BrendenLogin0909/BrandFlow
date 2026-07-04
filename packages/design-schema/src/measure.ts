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

export function measureText(
  text: string,
  fontSize: number,
  lineHeight: number,
  frameWidth: number,
  letterSpacing = 0,
): TextMetrics {
  const charWidth = fontSize * AVG_CHAR_WIDTH_RATIO + letterSpacing;
  const charsPerLine = Math.max(1, Math.floor(frameWidth / charWidth));

  let lines = 0;
  let widestLine = 0;
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines += 1;
      continue;
    }
    let current = 0;
    lines += 1;
    for (const word of words) {
      const w = word.length + (current > 0 ? 1 : 0);
      if (current + w > charsPerLine && current > 0) {
        widestLine = Math.max(widestLine, current * charWidth);
        lines += 1;
        current = word.length;
      } else {
        current += w;
      }
    }
    widestLine = Math.max(widestLine, current * charWidth);
  }

  return { lines, height: lines * fontSize * lineHeight, widestLine };
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
