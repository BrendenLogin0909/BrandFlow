/**
 * Google Fonts catalog — real brand typography that is free, needs no API
 * key and no subscription. This is the single source of truth shared by the
 * playground picker (live preview) and the SVG exporter (portable @import),
 * so a family selected in the UI always resolves to the same weights and
 * fallback stack on export.
 *
 * Weights are the exact static weights we request from the Google Fonts CSS2
 * API — requesting a weight a family does not publish makes the API return an
 * error and no CSS, so keep these accurate when adding fonts.
 */

export type FontCategory = 'sans-serif' | 'serif' | 'display' | 'monospace';

export interface GoogleFontDef {
  family: string;
  category: FontCategory;
  /** static weights the family actually publishes (used to build the CSS URL) */
  weights: number[];
  /** generic family appended to the CSS stack when the webfont is unavailable */
  fallback: 'sans-serif' | 'serif' | 'monospace';
}

/** Curated set — popular, brand-appropriate, broad weight coverage. */
export const GOOGLE_FONTS: GoogleFontDef[] = [
  // sans-serif — versatile headline + body workhorses
  { family: 'Inter', category: 'sans-serif', weights: [400, 500, 600, 700, 800, 900], fallback: 'sans-serif' },
  { family: 'Poppins', category: 'sans-serif', weights: [400, 500, 600, 700, 800], fallback: 'sans-serif' },
  { family: 'Montserrat', category: 'sans-serif', weights: [400, 500, 600, 700, 800, 900], fallback: 'sans-serif' },
  { family: 'Roboto', category: 'sans-serif', weights: [400, 500, 700, 900], fallback: 'sans-serif' },
  { family: 'Open Sans', category: 'sans-serif', weights: [400, 500, 600, 700, 800], fallback: 'sans-serif' },
  { family: 'Lato', category: 'sans-serif', weights: [400, 700, 900], fallback: 'sans-serif' },
  { family: 'Work Sans', category: 'sans-serif', weights: [400, 500, 600, 700, 800], fallback: 'sans-serif' },
  { family: 'Nunito Sans', category: 'sans-serif', weights: [400, 600, 700, 800, 900], fallback: 'sans-serif' },
  { family: 'Raleway', category: 'sans-serif', weights: [400, 500, 600, 700, 800], fallback: 'sans-serif' },
  { family: 'Manrope', category: 'sans-serif', weights: [400, 500, 600, 700, 800], fallback: 'sans-serif' },
  { family: 'DM Sans', category: 'sans-serif', weights: [400, 500, 700], fallback: 'sans-serif' },
  { family: 'Archivo', category: 'sans-serif', weights: [400, 500, 600, 700, 800, 900], fallback: 'sans-serif' },
  { family: 'Sora', category: 'sans-serif', weights: [400, 600, 700, 800], fallback: 'sans-serif' },
  { family: 'Figtree', category: 'sans-serif', weights: [400, 500, 600, 700, 800, 900], fallback: 'sans-serif' },
  { family: 'Plus Jakarta Sans', category: 'sans-serif', weights: [400, 500, 600, 700, 800], fallback: 'sans-serif' },
  // serif — editorial and premium
  { family: 'Playfair Display', category: 'serif', weights: [400, 500, 600, 700, 800, 900], fallback: 'serif' },
  { family: 'Merriweather', category: 'serif', weights: [400, 700, 900], fallback: 'serif' },
  { family: 'Lora', category: 'serif', weights: [400, 500, 600, 700], fallback: 'serif' },
  { family: 'Source Serif 4', category: 'serif', weights: [400, 600, 700], fallback: 'serif' },
  { family: 'Libre Baskerville', category: 'serif', weights: [400, 700], fallback: 'serif' },
  { family: 'PT Serif', category: 'serif', weights: [400, 700], fallback: 'serif' },
  { family: 'Bitter', category: 'serif', weights: [400, 600, 700, 800], fallback: 'serif' },
  { family: 'Fraunces', category: 'serif', weights: [400, 600, 700, 900], fallback: 'serif' },
  // display — big, punchy headlines (29FORWARD-style bold)
  { family: 'Oswald', category: 'display', weights: [400, 500, 600, 700], fallback: 'sans-serif' },
  { family: 'Bebas Neue', category: 'display', weights: [400], fallback: 'sans-serif' },
  { family: 'Anton', category: 'display', weights: [400], fallback: 'sans-serif' },
  { family: 'Archivo Black', category: 'display', weights: [400], fallback: 'sans-serif' },
  // monospace — technical / code aesthetic
  { family: 'Roboto Mono', category: 'monospace', weights: [400, 500, 700], fallback: 'monospace' },
  { family: 'JetBrains Mono', category: 'monospace', weights: [400, 600, 700], fallback: 'monospace' },
  { family: 'Space Mono', category: 'monospace', weights: [400, 700], fallback: 'monospace' },
];

/** System fonts that need no network load — kept as a no-cost option. */
export const WEB_SAFE_FONTS = [
  'Arial',
  'Arial Black',
  'Georgia',
  'Verdana',
  'Trebuchet MS',
  'Impact',
  'Times New Roman',
  'Courier New',
];

const GOOGLE_FONT_INDEX = new Map(GOOGLE_FONTS.map((f) => [f.family, f]));

export function googleFontDef(family: string): GoogleFontDef | undefined {
  return GOOGLE_FONT_INDEX.get(family.trim());
}

export function isGoogleFont(family: string): boolean {
  return GOOGLE_FONT_INDEX.has(family.trim());
}

/** CSS font stack with a generic fallback, e.g. `'Poppins', sans-serif`. */
export function fontStack(family: string): string {
  const def = googleFontDef(family);
  if (def) return `'${def.family}', ${def.fallback}`;
  return family;
}

/**
 * Build a Google Fonts CSS2 URL for the given families. Non-Google (web-safe
 * or unknown) families are ignored; duplicates are collapsed. Returns null
 * when none of the families are Google fonts (nothing to load).
 *
 * e.g. https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Poppins:wght@600;700&display=swap
 */
export function googleFontsCssUrl(families: Array<string | undefined | null>): string | null {
  const seen = new Set<string>();
  const params: string[] = [];
  for (const raw of families) {
    if (!raw) continue;
    const def = googleFontDef(raw);
    if (!def || seen.has(def.family)) continue;
    seen.add(def.family);
    // Google's URL uses '+' for spaces and leaves ':', '@', ';' literal.
    const name = encodeURIComponent(def.family).replace(/%20/g, '+');
    params.push(`family=${name}:wght@${def.weights.join(';')}`);
  }
  if (!params.length) return null;
  return `https://fonts.googleapis.com/css2?${params.join('&')}&display=swap`;
}
