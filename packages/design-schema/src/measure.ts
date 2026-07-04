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
