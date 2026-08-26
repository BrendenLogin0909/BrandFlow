/**
 * ============================================================================
 * THIRD-PARTY LICENCE RISK — @resvg/resvg-js is MPL-2.0 (weak copyleft)
 * ============================================================================
 * Every other runtime dependency in this product is permissive (MIT/Apache/ISC)
 * or an explicitly licence-cleared asset. This one is not, so it is called out
 * here rather than buried in a lockfile.
 *
 * OUR UNDERSTANDING of why the way we use it is within the licence — recorded
 * so it can be re-checked, not asserted as legal advice:
 *   - We consume the published npm package UNMODIFIED. MPL-2.0 copyleft is
 *     file-level: it reaches files of the covered work that you modify, not
 *     software that merely calls it. We modify none of resvg's own source.
 *   - MPL-2.0 has no network/SaaS clause (unlike AGPL), so running it
 *     server-side to render an image does not oblige us to publish anything.
 *   - We do not redistribute resvg's source, and we do not statically link it
 *     into a combined work whose terms would conflict; it is a runtime
 *     dependency invoked through its public API.
 * If that understanding turns out to be wrong, or the licence changes, the
 * dependency must be removable without touching the rest of the product.
 *
 * CONTAINMENT CONTRACT — do not break this:
 *   - This file is the ONLY place in the repo permitted to import
 *     '@resvg/resvg-js'. `rasterise.contained.test.ts` fails the build if any
 *     other module imports it.
 *   - Everything downstream depends on `rasterisePage()`, never on resvg types.
 *   - Only the stage-4 vision critic consumes it, and a rasterisation failure
 *     is already non-fatal there (the critic returns the plan unchanged).
 * TO REMOVE: delete this file and `critic.ts`'s render step, drop the
 * dependency, and stage 4 degrades to a no-op. Nothing else is affected.
 * ============================================================================
 */

/**
 * Rasteriser — SVG string to PNG buffer, for the vision critic (stage 4 of the
 * composition pipeline, docs/18-design-system-and-pipeline.md §4).
 *
 * The critic looks at a picture, so this has one job the SVG exporter does not:
 * produce a render that is HONEST about what a human would see. Two resvg
 * behaviours actively work against that and are handled explicitly:
 *
 *  1. FONTS. resvg does not execute the `@import url(fonts.googleapis.com/...)`
 *     that `exportPageSvg` embeds ("The @import rule is not supported"), and it
 *     does not fetch webfonts. A brand set in Poppins therefore renders in
 *     whatever local font resvg happens to pick — and with no explicit default
 *     it picks the alphabetically-first system family, which on a stock Windows
 *     box is "Agency FB", an ultra-condensed display face. Critiquing headline
 *     weight and length against THAT is critiquing a design nobody will ever
 *     see. So: local font files are loaded from BRANDFLOW_FONT_DIRS when they
 *     are provided, the generic families are pinned to real ones, and every
 *     family we could not resolve locally is returned in `fontFallbacks` so the
 *     caller can tell the critic not to judge the typeface. Never silent.
 *
 *  2. IMAGES. resvg does not fetch remote hrefs; an unresolved <image> renders
 *     as nothing at all, so a page with a hero illustration would be critiqued
 *     as a page with a hole in it. Remote images are fetched (bounded, opt-out)
 *     and handed back to resvg; anything still unresolved is reported.
 *
 * Also downscales: the critic does not need 1080px. ~700px wide is legible for
 * layout judgement and roughly halves the image tokens.
 */
import { Resvg, type ResvgRenderOptions } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';

/** Default render width — enough to judge layout, small enough to stay cheap. */
export const CRITIC_RENDER_WIDTH = 700;

export interface RasteriseOptions {
  /** Target width in px; height follows the SVG aspect ratio. */
  width?: number;
  /** Extra directories of .ttf/.otf files to load (beyond BRANDFLOW_FONT_DIRS). */
  fontDirs?: string[];
  /** Fetch remote <image href> so the render is not full of holes. Default true. */
  resolveRemoteImages?: boolean;
  /** Per-image fetch budget. Default 4000ms. */
  imageTimeoutMs?: number;
  /** Opaque backdrop; a transparent PNG reads as white to a vision model anyway. */
  background?: string;
}

export interface RasteriseResult {
  png: Buffer;
  width: number;
  height: number;
  /**
   * Families referenced by the SVG that no local font file provides, so the
   * render substitutes a fallback face. Non-empty means: do not trust the
   * rendered typography.
   */
  fontFallbacks: string[];
  /** Remote images that could not be fetched — they render as empty space. */
  unresolvedImages: string[];
}

/**
 * Blank-render detection. Byte length alone does NOT work here: measured on a
 * 700px render, a page whose text all dropped out for want of a font came to
 * 3412 bytes and a genuinely blank white page to 3407 — five bytes apart. What
 * separates them from a real page is ink: a rendered page has many colours and
 * a meaningful share of pixels away from the dominant one, and a blank page has
 * exactly one colour and none. So we look at the pixels.
 */
const MIN_NON_MODAL_PIXEL_FRACTION = 0.0005;
const INK_SAMPLE_STRIDE = 7; // sample every 7th pixel; plenty for this signal

interface InkStats {
  distinctColours: number;
  nonModalFraction: number;
}

function measureInk(pixels: Buffer): InkStats {
  const counts = new Map<number, number>();
  const step = 4 * INK_SAMPLE_STRIDE;
  for (let i = 0; i + 2 < pixels.length; i += step) {
    const key = (pixels[i]! << 16) | (pixels[i + 1]! << 8) | pixels[i + 2]!;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let total = 0;
  let modal = 0;
  for (const count of counts.values()) {
    total += count;
    if (count > modal) modal = count;
  }
  return {
    distinctColours: counts.size,
    nonModalFraction: total > 0 ? (total - modal) / total : 0,
  };
}

export class RasteriseError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'RasteriseError';
  }
}

// ---------- fonts ----------

/**
 * Generic-family pins. resvg maps `sans-serif`/`serif` in a font stack to these;
 * without them a missing brand font lands on an arbitrary system face.
 * Overridable for non-Windows images where these names do not exist.
 */
const GENERIC_FAMILIES = {
  sansSerifFamily: process.env.BRANDFLOW_SANS_FALLBACK?.trim() || 'Arial',
  serifFamily: process.env.BRANDFLOW_SERIF_FALLBACK?.trim() || 'Georgia',
  monospaceFamily: process.env.BRANDFLOW_MONO_FALLBACK?.trim() || 'Courier New',
};

/**
 * apps/api/.fonts — the bundled Google Font TTFs, populated by
 * `npm run fonts` (scripts/fetch-fonts.mjs). resvg never fetches the webfonts
 * the SVG exporter @imports, so without these every brand face falls back and
 * the render misrepresents the design. Included by default so the critic sees
 * the real typography; BRANDFLOW_FONT_DIRS still takes precedence.
 */
const BUNDLED_FONT_DIR = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '.fonts');

function configuredFontDirs(extra: string[] = []): string[] {
  const fromEnv = (process.env.BRANDFLOW_FONT_DIRS ?? '')
    .split(/[;,]/)
    .map((d) => d.trim())
    .filter(Boolean);
  const bundled = fs.existsSync(BUNDLED_FONT_DIR) ? [BUNDLED_FONT_DIR] : [];
  return [...fromEnv, ...bundled, ...extra];
}

/** Normalise a family name or font filename to a comparable key. */
function fontKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.(ttf|otf|ttc|woff2?)$/i, '')
    // drop the style/weight suffix font files carry: Poppins-SemiBoldItalic
    .replace(/[-_](thin|extralight|ultralight|light|regular|book|medium|semibold|demibold|bold|extrabold|ultrabold|black|heavy|italic|oblique)+$/gi, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Families the SVG asks for, in declaration order, de-duplicated. */
export function referencedFontFamilies(svg: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of svg.matchAll(/font-family="([^"]+)"/g)) {
    for (const raw of (match[1] ?? '').split(',')) {
      const family = raw.trim().replace(/^['"]|['"]$/g, '');
      // generic families are not "missing" — they are the fallback itself
      if (!family || /^(sans-serif|serif|monospace|cursive|fantasy|system-ui)$/i.test(family)) continue;
      const key = fontKey(family);
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push(family);
      }
    }
  }
  return out;
}

async function localFontKeys(dirs: string[]): Promise<Set<string>> {
  const keys = new Set<string>();
  await Promise.all(
    dirs.map(async (dir) => {
      try {
        for (const file of await readdir(dir)) {
          if (/\.(ttf|otf|ttc)$/i.test(file)) keys.add(fontKey(file));
        }
      } catch {
        /* a configured dir that does not exist is not fatal — just no fonts */
      }
    }),
  );
  return keys;
}

/**
 * Which referenced families have no local file. With no font dirs configured
 * we cannot enumerate what the system provides, so every non-web-safe family
 * is reported as at-risk rather than pretending it resolved.
 */
async function detectFontFallbacks(svg: string, dirs: string[]): Promise<string[]> {
  const referenced = referencedFontFamilies(svg);
  if (referenced.length === 0) return [];
  const available = await localFontKeys(dirs);
  const pinned = new Set(Object.values(GENERIC_FAMILIES).map(fontKey));
  return referenced.filter((f) => !available.has(fontKey(f)) && !pinned.has(fontKey(f)));
}

// ---------- svg preparation ----------

/**
 * Strip the webfont `<style>` block. resvg skips the @import anyway and its CSS
 * parser logs a selector error on the CDATA wrapper; removing it keeps the
 * render log clean and the behaviour explicit rather than incidental.
 */
export function stripWebfontImports(svg: string): string {
  return svg.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
}

// ---------- images ----------

function isRemote(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

async function fetchImage(url: string, timeoutMs: number): Promise<Buffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- main ----------

/**
 * Render one exported page SVG to a downscaled PNG.
 *
 * Throws RasteriseError only when the render is unusable (resvg failed, or the
 * output is blank) — callers treat that as "no critique this round", never as
 * a composition failure.
 */
export async function rasterisePage(svg: string, opts: RasteriseOptions = {}): Promise<RasteriseResult> {
  const width = Math.max(64, Math.round(opts.width ?? CRITIC_RENDER_WIDTH));
  const dirs = configuredFontDirs(opts.fontDirs);
  const prepared = stripWebfontImports(svg);
  const fontFallbacks = await detectFontFallbacks(prepared, dirs);

  const renderOptions: ResvgRenderOptions = {
    fitTo: { mode: 'width', value: width },
    background: opts.background ?? '#ffffff',
    logLevel: 'error',
    font: {
      loadSystemFonts: true,
      fontDirs: dirs.length ? dirs : undefined,
      // never leave this empty: resvg then defaults to the first system family
      // it happens to enumerate, which is not a design decision anyone made
      defaultFontFamily: GENERIC_FAMILIES.sansSerifFamily,
      ...GENERIC_FAMILIES,
    },
  };

  let resvg: Resvg;
  try {
    resvg = new Resvg(prepared, renderOptions);
  } catch (err) {
    throw new RasteriseError(`resvg could not parse the SVG: ${String(err)}`, err);
  }

  const unresolvedImages: string[] = [];
  const pending = resvg.imagesToResolve();
  if (pending.length) {
    const wantRemote = opts.resolveRemoteImages !== false;
    const timeoutMs = opts.imageTimeoutMs ?? 4000;
    const fetched = await Promise.all(
      pending.map(async (href) => {
        if (!wantRemote || !isRemote(href)) return { href, buffer: null };
        return { href, buffer: await fetchImage(href, timeoutMs) };
      }),
    );
    for (const { href, buffer } of fetched) {
      if (buffer) {
        try {
          resvg.resolveImage(href, buffer);
          continue;
        } catch {
          /* fall through to unresolved */
        }
      }
      unresolvedImages.push(href);
    }
  }

  let png: Buffer;
  let outWidth: number;
  let outHeight: number;
  let ink: InkStats;
  try {
    const rendered = resvg.render();
    png = rendered.asPng();
    outWidth = rendered.width;
    outHeight = rendered.height;
    ink = measureInk(rendered.pixels);
  } catch (err) {
    throw new RasteriseError(`resvg render failed: ${String(err)}`, err);
  }

  if (ink.distinctColours < 2 || ink.nonModalFraction < MIN_NON_MODAL_PIXEL_FRACTION) {
    throw new RasteriseError(
      `render at ${outWidth}x${outHeight} is blank: ${ink.distinctColours} distinct colour(s), ` +
        `${(ink.nonModalFraction * 100).toFixed(3)}% of pixels off the dominant colour (${png.length} bytes). ` +
        `Referenced fonts: ${referencedFontFamilies(prepared).join(', ') || 'none'}. ` +
        `If the page has text, no font matched and the type dropped out — configure BRANDFLOW_FONT_DIRS.`,
    );
  }

  return { png, width: outWidth, height: outHeight, fontFallbacks, unresolvedImages };
}

/** Convenience for the AI adapters, which need base64 image blocks. */
export function toBase64Png(png: Buffer): string {
  return png.toString('base64');
}
