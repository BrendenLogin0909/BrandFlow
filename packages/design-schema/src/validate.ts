/**
 * Design validation engine — rule-time checks producing a ValidationReport.
 * Parse-time (Zod) failures are handled before this runs.
 * See docs/11-validation-rules.md for the rule catalogue.
 */
import { LINKEDIN_CANVAS_PRESETS, MAX_CAROUSEL_SLIDES } from '@brandflow/shared';
import type {
  Colour,
  Element,
  GroupElement,
  InternalDesignDocument,
  Page,
  TextElement,
} from './schema.js';
import { anchoredEdges, charWidthFor, glyphLines, measureText } from './measure.js';
import type { GlyphLine } from './measure.js';
import {
  MAX_BALANCE_OFFSET,
  MIN_AXIS_COVERAGE,
  pageCompositionMetrics,
} from './composition-metrics.js';

export type Severity = 'error' | 'warning';

export interface Violation {
  ruleId: string;
  severity: Severity;
  pageId?: string;
  elementId?: string;
  message: string;
}

export interface ValidationReport {
  passed: boolean;
  errors: Violation[];
  warnings: Violation[];
  validatedAt: string;
}

export interface ValidationContext {
  /** Asset ids that are approved for this tenant; undefined disables the check (e.g. fixtures). */
  approvedAssetIds?: Set<string>;
  /** Style-guide banned phrases (lower-cased). */
  bannedPhrases?: string[];
  /** Recipe-required slot ids that must be present. */
  requiredSlotIds?: string[];
  /**
   * 'enforce' (default): contrast failures are errors and block approval.
   * 'warn': the brand has opted out of strict contrast for display text —
   * failures are still measured and reported, but as warnings.
   */
  contrastMode?: 'enforce' | 'warn';
}

/**
 * Readability floors by role, defined at the 1080px reference canvas and scaled
 * by canvas width at check time. Exported so composition code can pick a type
 * step that is legal by construction instead of re-declaring these numbers.
 */
export const MIN_FONT_SIZES: Record<string, number> = {
  headline: 24,
  subheadline: 18,
  body: 14,
  caption: 12,
  cta: 14,
  attribution: 12,
  data: 14,
};

export function validateDesignDocument(
  doc: InternalDesignDocument,
  ctx: ValidationContext = {},
): ValidationReport {
  const v: Violation[] = [];

  checkDimensions(doc, v);
  checkSlideCount(doc, v);

  const slotIds = new Set<string>();
  let pageIndex = 0;
  for (const page of doc.pages) {
    const flat = flatten(page.elements);
    for (const { el, depth } of flat) {
      if (el.recipeSlotId) slotIds.add(el.recipeSlotId);
      checkGroupDepth(el, depth, page, v);
      checkWithinCanvas(el, doc, page, v);
      checkSafeMargins(el, doc, page, v);
      checkColours(el, doc, page, v);
      checkAssets(el, ctx, page, v);
      checkFonts(el, doc, page, v);
      if (el.type === 'text') {
        checkMinFontSize(el, doc, page, v);
        checkTextOverflow(el, page, v);
        checkBannedPhrases(el, ctx, page, v);
        checkContrast(el, doc, page, flat.map((f) => f.el), ctx, v);
        checkTextOnArtwork(el, doc, page, flat.map((f) => f.el), ctx, v);
        checkGlyphCrop(el, doc, page, v);
        checkHiddenText(el, page, v);
      }
    }
    checkRasterOnly(page, flat.map((f) => f.el), v);
    checkComposition(doc, page, pageIndex, v);
    pageIndex++;
  }

  checkRequiredSlots(slotIds, ctx, v);

  const errors = v.filter((x) => x.severity === 'error');
  const warnings = v.filter((x) => x.severity === 'warning');
  return { passed: errors.length === 0, errors, warnings, validatedAt: new Date().toISOString() };
}

// ---------- helpers ----------

function flatten(elements: Element[], depth = 1): { el: Element; depth: number }[] {
  return elements.flatMap((el) =>
    el.type === 'group'
      ? [{ el, depth }, ...flatten((el as GroupElement).children, depth + 1)]
      : [{ el, depth }],
  );
}

export function resolveColour(colour: Colour, doc: InternalDesignDocument): string | null {
  if (colour.kind === 'raw') return colour.hex;
  const key = colour.token.startsWith('custom:') ? colour.token.slice(7) : colour.token;
  return doc.brandTokens.colours[key] ?? null;
}

// ---------- rules ----------

function checkDimensions(doc: InternalDesignDocument, v: Violation[]) {
  const ok = Object.values(LINKEDIN_CANVAS_PRESETS).some(
    (p) => p.width === doc.canvas.width && p.height === doc.canvas.height,
  );
  if (!ok)
    v.push({
      ruleId: 'dimensions',
      severity: 'error',
      message: `Canvas ${doc.canvas.width}x${doc.canvas.height} is not a LinkedIn preset`,
    });
}

function checkSlideCount(doc: InternalDesignDocument, v: Violation[]) {
  if (doc.pages.length > MAX_CAROUSEL_SLIDES)
    v.push({
      ruleId: 'slide-count',
      severity: 'error',
      message: `${doc.pages.length} slides exceeds LinkedIn maximum of ${MAX_CAROUSEL_SLIDES}`,
    });
}

function checkGroupDepth(el: Element, depth: number, page: Page, v: Violation[]) {
  if (el.type === 'group' && depth > 4)
    v.push({
      ruleId: 'group-depth',
      severity: 'error',
      pageId: page.id,
      elementId: el.id,
      message: 'Group nesting exceeds depth 4',
    });
}

function checkWithinCanvas(el: Element, doc: InternalDesignDocument, page: Page, v: Violation[]) {
  const f = el.frame;
  const outside =
    f.x + f.width <= 0 || f.y + f.height <= 0 || f.x >= doc.canvas.width || f.y >= doc.canvas.height;
  if (outside)
    v.push({
      ruleId: 'within-canvas',
      severity: 'error',
      pageId: page.id,
      elementId: el.id,
      message: `Element "${el.name}" lies entirely outside the canvas`,
    });
}

function checkSafeMargins(el: Element, doc: InternalDesignDocument, page: Page, v: Violation[]) {
  if (el.roleHint === 'decoration' || el.roleHint === 'background') return;
  if (el.type === 'group') return; // children are checked individually
  const s = page.safeArea;
  const f = el.frame;
  const inside =
    f.x >= s.left &&
    f.y >= s.top &&
    f.x + f.width <= doc.canvas.width - s.right &&
    f.y + f.height <= doc.canvas.height - s.bottom;
  if (!inside)
    v.push({
      ruleId: 'safe-margins',
      severity: 'error',
      pageId: page.id,
      elementId: el.id,
      message: `Element "${el.name}" crosses the safe area`,
    });
}

function collectColours(el: Element): Colour[] {
  const out: Colour[] = [];
  if (el.type === 'text') out.push(el.colour);
  if (el.type === 'icon') out.push(el.colour);
  if (el.type === 'shape') {
    const fill = el.fill;
    if ('kind' in fill && (fill.kind === 'token' || fill.kind === 'raw')) out.push(fill as Colour);
    if (fill.kind === 'gradient') out.push(...fill.stops.map((s) => s.colour));
    if (el.stroke) out.push(el.stroke);
  }
  if (el.type === 'image' && el.borderColour) out.push(el.borderColour);
  return out;
}

function checkColours(el: Element, doc: InternalDesignDocument, page: Page, v: Violation[]) {
  for (const c of collectColours(el)) {
    if (c.kind === 'raw' && !c.allowedOverride) {
      v.push({
        ruleId: 'palette-only',
        severity: 'error',
        pageId: page.id,
        elementId: el.id,
        message: `Raw colour ${c.hex} is not a brand token and has no permitted override`,
      });
    }
    if (c.kind === 'token' && resolveColour(c, doc) === null) {
      v.push({
        ruleId: 'palette-only',
        severity: 'error',
        pageId: page.id,
        elementId: el.id,
        message: `Unknown brand colour token "${c.token}"`,
      });
    }
  }
}

function checkAssets(el: Element, ctx: ValidationContext, page: Page, v: Violation[]) {
  if (!ctx.approvedAssetIds) return;
  const assetId = el.type === 'image' ? el.assetId : undefined;
  if (assetId && !ctx.approvedAssetIds.has(assetId))
    v.push({
      ruleId: 'approved-assets',
      severity: 'error',
      pageId: page.id,
      elementId: el.id,
      message: `Asset ${assetId} is not approved for this brand`,
    });
}

function checkFonts(el: Element, doc: InternalDesignDocument, page: Page, v: Violation[]) {
  if (el.type !== 'text') return;
  const allowed = [doc.brandTokens.fonts.heading, doc.brandTokens.fonts.body, doc.brandTokens.fonts.accent].filter(
    Boolean,
  );
  if (!allowed.includes(el.fontFamily))
    v.push({
      ruleId: 'approved-fonts',
      severity: 'error',
      pageId: page.id,
      elementId: el.id,
      message: `Font "${el.fontFamily}" is not in the brand kit`,
    });
}

function checkMinFontSize(el: TextElement, doc: InternalDesignDocument, page: Page, v: Violation[]) {
  const scale = doc.canvas.width / 1080; // minimums defined at 1080px canvas
  const min = (MIN_FONT_SIZES[el.roleHint ?? 'body'] ?? MIN_FONT_SIZES.body!) * scale;
  if (el.fontSize < min)
    v.push({
      ruleId: 'min-font-size',
      severity: 'error',
      pageId: page.id,
      elementId: el.id,
      message: `Font size ${el.fontSize}px below minimum ${Math.round(min)}px for role "${el.roleHint ?? 'body'}"`,
    });
}

function checkTextOverflow(el: TextElement, page: Page, v: Violation[]) {
  const m = measureText(el.text, el.fontSize, el.lineHeight, el.frame.width, el.letterSpacing);
  if (m.height > el.frame.height + 0.5 || (el.maxLines && m.lines > el.maxLines))
    v.push({
      ruleId: 'text-overflow',
      severity: 'error',
      pageId: page.id,
      elementId: el.id,
      message: `Text in "${el.name}" overflows its frame (${m.lines} lines, needs ${Math.ceil(m.height)}px of ${el.frame.height}px)`,
    });
}

function checkBannedPhrases(el: TextElement, ctx: ValidationContext, page: Page, v: Violation[]) {
  if (!ctx.bannedPhrases?.length) return;
  const text = el.text.toLowerCase();
  for (const phrase of ctx.bannedPhrases) {
    if (text.includes(phrase.toLowerCase()))
      v.push({
        ruleId: 'banned-phrases',
        severity: 'error',
        pageId: page.id,
        elementId: el.id,
        message: `On-image text contains banned phrase "${phrase}"`,
      });
  }
}

function relativeLuminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const s = parseInt(hex.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrastRatio(hexA: string, hexB: string): number {
  const [l1, l2] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * WCAG threshold this engine applies to a given text element. Exported so that
 * composition code can choose a colour that passes rather than guess at the
 * numbers and disagree with the validator.
 */
export function requiredContrastRatio(fontSize: number, fontWeight: number): number {
  const large = fontSize >= 32 && fontWeight >= 700;
  return large ? 3 : 4.5;
}

/**
 * Every background a text element actually sits on.
 *
 * This used to return only the topmost shape FULLY CONTAINING the text frame,
 * falling back to the page background otherwise. That let the worst kind of
 * illegibility through silently: a headline overlapping a dark panel by half
 * its width was measured against the white page, so dark-on-dark scored as
 * high contrast and passed. It matters more now that art direction
 * deliberately overlaps text with colour blocks.
 *
 * So: return the hex of every opaque solid shape beneath the text that covers
 * a meaningful fraction of it, plus the page background unless a shape covers
 * the text almost entirely. The caller must hold the text legible against ALL
 * of them — the worst case is the one the reader sees.
 */
/**
 * Sample points inside each line's GLYPH box, used to find what is actually
 * behind the ink. Sampling (rather than comparing bounding boxes) is what
 * makes this correct for two cases that both occur in real output: a shape
 * that OCCLUDES another beneath it (the corner-ring motif is an accent ellipse
 * with a background-coloured ellipse on top — text in the hole sits on the
 * background, not the accent), and non-rectangular shapes, whose bounding box
 * badly overstates their coverage at the corners.
 *
 * These fractions span the whole line box, edge to edge, because the box they
 * are applied to is the ink itself — `glyphLines` has already placed each line
 * according to its alignment and measured its real width. The previous version
 * of this file sampled the FRAME and compensated with alignment-specific
 * fractions that stopped at 0.54 for left-aligned text; that approximation is
 * no longer needed, and it was the reason a frame corner over empty space
 * could report a colour no glyph ever touched.
 */
const SAMPLE_X = [0.02, 0.25, 0.5, 0.75, 0.98];
/** Vertical samples sit in the x-height band, away from ascender/descender air. */
const SAMPLE_Y = [0.3, 0.7];

/**
 * How much of a measured line we are prepared to swear ink actually occupies,
 * when the answer decides whether to FAIL a document.
 *
 * `measureText` models a glyph as 0.54em, which is right for a regular-width
 * sans and badly wrong for the condensed display faces real brands use. On the
 * 2026-08-26 output the estimate ran up to 60% wide: "The real leaks" set in
 * Anton at 68px measures 514px here and renders 320px. For LEFT-aligned text
 * that error lands harmlessly past the end of the line, but a right-aligned
 * line is positioned FROM its far edge, so the same error walks its start
 * hundreds of pixels leftwards — straight onto an image that no glyph touches.
 * That produced two false artwork failures on 01-qa-consultancy p2 and
 * 05-recruitment p3, on pages where the text is plainly clear of the artwork.
 *
 * So the artwork rule only samples the fraction of each line nearest its
 * ANCHORED edge (both sides of centre for centred text), where the position is
 * exact. 0.65 covers the worst over-estimate observed with room to spare. The
 * error is taken in the safe direction: a rule that blocks a document may
 * under-claim where the measurement is untrustworthy, never over-claim.
 *
 * The colour sampling below is deliberately NOT restricted this way. There an
 * extra sample costs a worst-case comparison against a colour that is known,
 * which is the conservative side of that rule rather than the reckless one.
 */
const INK_CONFIDENCE = 0.65;

type Rot = { x: number; y: number; width: number; height: number; rotation?: number };

/** Is a point inside this frame, accounting for its own rotation? */
function pointInFrame(px: number, py: number, f: Rot, ellipse: boolean): boolean {
  const cx = f.x + f.width / 2;
  const cy = f.y + f.height / 2;
  let x = px;
  let y = py;
  if (f.rotation) {
    const r = (-f.rotation * Math.PI) / 180;
    const dx = px - cx;
    const dy = py - cy;
    x = cx + dx * Math.cos(r) - dy * Math.sin(r);
    y = cy + dx * Math.sin(r) + dy * Math.cos(r);
  }
  if (x < f.x || x > f.x + f.width || y < f.y || y > f.y + f.height) return false;
  if (ellipse) {
    const rx = f.width / 2 || 1;
    const ry = f.height / 2 || 1;
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  }
  // rect and everything else: the bounding box is the honest approximation.
  return true;
}

/**
 * A candidate backdrop: something drawn beneath the text that a sample point
 * might land on. `hex` is null for ARTWORK — an image or a chart, whose
 * luminance at any given pixel we do not and cannot know from the document.
 */
interface Backdrop {
  el: Element;
  z: number;
  /** null means ARTWORK — an image or chart, of unknown colour at this pixel. */
  hex: string | null;
  /** Coverage this layer contributes, 0..1. */
  alpha: number;
  ellipse: boolean;
}

function backdropsUnder(
  el: TextElement,
  doc: InternalDesignDocument,
  siblings: Element[],
): Backdrop[] {
  const out: Backdrop[] = [];
  for (const s of siblings) {
    if (s.zIndex >= el.zIndex || !s.visible || s.opacity <= 0.05) continue;
    if (s.type === 'shape') {
      const fill = s.fill;
      if (!('kind' in fill) || (fill.kind !== 'token' && fill.kind !== 'raw')) continue;
      const hex = resolveColour(fill, doc);
      // A see-through shape is kept, at its real alpha, rather than skipped.
      // It contributes its share of the composite and passes the rest down —
      // which is what a scrim IS, and the only way to judge one honestly.
      if (hex) out.push({ el: s, z: s.zIndex, hex, alpha: s.opacity, ellipse: s.shape === 'ellipse' });
      continue;
    }
    if (s.type === 'image' || s.type === 'chart') {
      // `crop-circle` masks an image to a circle via cornerRadius; its bounding
      // box overstates it badly at the corners, exactly as an ellipse shape's
      // does. Charts are never masked this way.
      const ellipse =
        s.type === 'image' && s.cornerRadius * 2 >= Math.min(s.frame.width, s.frame.height) - 0.5;
      out.push({ el: s, z: s.zIndex, hex: null, alpha: s.opacity, ellipse });
      continue;
    }
  }
  return out;
}

// ---------- compositing an unknown backdrop into bounds ----------

const rgbOf = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const hexOf = (c: [number, number, number]): string =>
  `#${c.map((n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')).join('')}`;

/** Below this share of unknown, the two bounds are the same colour in practice. */
const UNKNOWN_EPSILON = 0.02;

/**
 * What one sample point resolves to, once every layer beneath the glyph has
 * been composited in z order.
 *
 * `hexes` is what the text must stay legible against. When artwork shows
 * through, that is TWO colours — the composite over the darkest possible
 * artwork and over the lightest — because those bound every pixel the artwork
 * could actually contain. Bounding is not the same as guessing an average: an
 * average invents a colour that may appear nowhere on the page and hides the
 * one dark shape that swallows the text, whereas a bound that holds at both
 * extremes holds everywhere in between.
 *
 * This is what lets a real scrim work. A dark panel at 82% over a photograph —
 * the standard way anyone puts type on an image — leaves 18% unknown, and 18%
 * of even pure white cannot lift a dark scrim far enough to lose white text.
 * A blanket "opaque or fail" rule would ban the technique instead of measuring
 * it, and a rule that bans correct work gets switched off.
 */
function resolvePoint(
  covering: Backdrop[],
  pageHex: string | null,
): { hexes: string[]; artwork: Element | null; unknown: number } {
  let acc: [number, number, number] = [0, 0, 0];
  let remaining = 1;
  let unknown = 0;
  let artwork: Element | null = null;

  for (const b of covering) {
    const a = Math.min(1, Math.max(0, b.alpha));
    const share = remaining * a;
    if (b.hex === null) {
      unknown += share;
      if (!artwork) artwork = b.el;
    } else {
      const c = rgbOf(b.hex);
      acc = [acc[0] + share * c[0], acc[1] + share * c[1], acc[2] + share * c[2]];
    }
    remaining -= share;
    if (remaining <= 0.001) break;
  }
  // Anything still uncovered shows the page itself.
  if (remaining > 0.001 && pageHex) {
    const c = rgbOf(pageHex);
    acc = [acc[0] + remaining * c[0], acc[1] + remaining * c[1], acc[2] + remaining * c[2]];
    remaining = 0;
  }

  if (unknown <= UNKNOWN_EPSILON) {
    // Either there is no artwork here, or so little of it shows through that
    // the composite is settled. Report the single resolved colour.
    const settled = unknown > 0 ? ([acc[0] + unknown * 128, acc[1] + unknown * 128, acc[2] + unknown * 128] as [number, number, number]) : acc;
    return { hexes: remaining > 0.001 && !pageHex ? [] : [hexOf(settled)], artwork: null, unknown };
  }
  return {
    hexes: [hexOf(acc), hexOf([acc[0] + unknown * 255, acc[1] + unknown * 255, acc[2] + unknown * 255])],
    artwork,
    unknown,
  };
}

/** One sample point where artwork shows through, and the bounds it resolves to. */
interface ArtworkHit {
  el: Element;
  /** Composite over the darkest and the lightest artwork the pixel could hold. */
  hexes: string[];
  /** Share of the pixel still coming from the artwork, 0..1. 1 means bare. */
  unknown: number;
}

/** Everything visible behind the glyphs, sampled across each line's ink box. */
function sampleBackdrops(
  el: TextElement,
  doc: InternalDesignDocument,
  page: Page,
  siblings: Element[],
): { colours: Set<string>; hits: ArtworkHit[] } {
  const candidates = backdropsUnder(el, doc, siblings);
  const pageBg = page.background;
  const pageHex =
    'kind' in pageBg && (pageBg.kind === 'token' || pageBg.kind === 'raw')
      ? resolveColour(pageBg, doc)
      : null;

  const anchored = anchoredEdges(el);
  const colours = new Set<string>();
  const hits = new Map<string, ArtworkHit>();
  for (const line of glyphLines(el)) {
    if (line.width <= 0) continue; // blank line: no ink, nothing to judge
    // The span of this line whose position is exact rather than estimated.
    const slack = line.width * (1 - INK_CONFIDENCE);
    const coreFrom = anchored.left ? line.x : anchored.right ? line.x + slack : line.x + slack / 2;
    const coreTo = coreFrom + line.width * INK_CONFIDENCE;
    for (const fx of SAMPLE_X) {
      for (const fy of SAMPLE_Y) {
        const px = line.x + line.width * fx;
        const py = line.y + line.height * fy;
        const confident = px >= coreFrom && px <= coreTo;
        // Every layer covering this point, topmost first, composited down.
        const covering = candidates
          .filter((c) => pointInFrame(px, py, c.el.frame, c.ellipse))
          .sort((a, b) => b.z - a.z);
        const point = resolvePoint(covering, pageHex);
        if (point.artwork) {
          if (confident) {
            const prev = hits.get(point.artwork.id);
            // Keep the widest bounds seen for this artwork — the worst case.
            if (!prev)
              hits.set(point.artwork.id, {
                el: point.artwork,
                hexes: point.hexes,
                unknown: point.unknown,
              });
            else {
              prev.hexes = [...new Set([...prev.hexes, ...point.hexes])];
              prev.unknown = Math.max(prev.unknown, point.unknown);
            }
          }
        } else {
          for (const h of point.hexes) colours.add(h);
        }
      }
    }
  }
  return { colours, hits: [...hits.values()] };
}

/**
 * Every background colour visible behind a text element.
 *
 * This used to return only the topmost shape FULLY CONTAINING the text frame,
 * falling back to the page background otherwise — which let the worst kind of
 * illegibility through silently: a kicker overlapping a dark panel by half its
 * width was measured against the white page, so dark-on-dark scored as high
 * contrast and passed. It matters more under art direction, where overlapping
 * text with a colour block is a deliberate move.
 *
 * The caller must hold the text legible against ALL returned colours — the
 * reader sees the worst one, not the average. Points where the topmost thing
 * is ARTWORK contribute no colour at all; see `artworkUnder`, which is the
 * only honest answer for those and is checked as its own rule.
 */
export function backgroundHexesUnder(
  el: TextElement,
  doc: InternalDesignDocument,
  page: Page,
  siblings: Element[],
): string[] {
  return [...sampleBackdrops(el, doc, page, siblings).colours];
}

/**
 * Artwork the glyphs land on that this text is NOT demonstrably legible
 * against — i.e. every image or chart showing through beneath the ink whose
 * unknown luminance cannot be bounded into legibility by what sits over it.
 *
 * An empty result is the definition of "this text does not need a scrim":
 * either no artwork is under it, or enough scrim already is. Exported so
 * composition code can ask the validator's own question and get the
 * validator's own answer instead of a second opinion that drifts from it.
 */
export function artworkUnder(
  el: TextElement,
  doc: InternalDesignDocument,
  page: Page,
  siblings: Element[],
): Element[] {
  const fg = resolveColour(el.colour, doc);
  const required = requiredContrastRatio(el.fontSize, el.fontWeight);
  return sampleBackdrops(el, doc, page, siblings)
    .hits.filter(
      (h) => !fg || h.hexes.some((bg) => contrastRatio(fg, bg) < required),
    )
    .map((h) => h.el);
}

function checkContrast(
  el: TextElement,
  doc: InternalDesignDocument,
  page: Page,
  siblings: Element[],
  ctx: ValidationContext,
  v: Violation[],
) {
  const fg = resolveColour(el.colour, doc);
  const bgHexes = backgroundHexesUnder(el, doc, page, siblings);
  if (!fg || bgHexes.length === 0) return; // gradient/image backgrounds: worst-case sampling handled server-side
  const required = requiredContrastRatio(el.fontSize, el.fontWeight);
  // Worst case across every background the text overlaps — the reader sees the
  // worst one, not the average.
  const ratio = Math.min(...bgHexes.map((bg) => contrastRatio(fg, bg)));
  if (ratio < required)
    v.push({
      ruleId: 'contrast',
      severity: ctx.contrastMode === 'warn' ? 'warning' : 'error',
      pageId: page.id,
      elementId: el.id,
      message: `Contrast ${ratio.toFixed(2)}:1 below recommended ${required}:1${ctx.contrastMode === 'warn' ? ' (brand override active)' : ''}`,
    });
}

/**
 * Text on artwork (docs/19 P1.4).
 *
 * The contrast rule above can only judge text against a colour it can name. An
 * image or a chart has no single colour, so before this rule existed text over
 * artwork was simply invisible to validation: the sampler skipped images
 * entirely, found the page beneath, and cheerfully measured dark-on-white for
 * a headline sitting on a dark illustration. That is how unreadable copy
 * shipped on a law-firm illustration and on a funnel chart — and the vision
 * critic missed both, so nothing caught it from either direction.
 *
 * The fix is not to guess the artwork's average luminance. An average is
 * exactly the wrong answer: text is unreadable where it crosses the ONE dark
 * shape in an otherwise pale illustration, and an average hides that. Unknown
 * is treated as unknown, and the only safe response to unknown is to demand a
 * scrim — an opaque panel between the artwork and the text, which the sampler
 * then sees as the topmost backdrop and the contrast rule judges normally.
 *
 * Deliberately NOT exempt: `decoration` and `background` roleHints. Those are
 * exempt from the safe-area clamp because a bleed is a legitimate move; there
 * is no corresponding sense in which unreadable text is legitimate, and the
 * law-firm illustration that started this was tagged `decoration`.
 */
function checkTextOnArtwork(
  el: TextElement,
  doc: InternalDesignDocument,
  page: Page,
  siblings: Element[],
  ctx: ValidationContext,
  v: Violation[],
) {
  const fg = resolveColour(el.colour, doc);
  const required = requiredContrastRatio(el.fontSize, el.fontWeight);
  const unsafe = sampleBackdrops(el, doc, page, siblings).hits.filter(
    (h) => !fg || h.hexes.some((bg) => contrastRatio(fg, bg) < required),
  );
  if (unsafe.length === 0) return;

  const names = unsafe.map((a) => `"${a.el.name}"`).join(', ');
  const kinds = [...new Set(unsafe.map((a) => a.el.type))].join('/');
  // A scrim that covers most of the pixel is a scrim that is present but too
  // thin or too close in tone; saying "no scrim" there sends whoever reads
  // this to add a second one instead of fixing the one already there.
  const bare = Math.max(...unsafe.map((a) => a.unknown)) >= 1 - UNKNOWN_EPSILON;
  const worst = fg
    ? Math.min(...unsafe.flatMap((a) => a.hexes.map((bg) => contrastRatio(fg, bg))))
    : 0;

  const detail = bare
    ? `with no scrim between them. The artwork's luminance is unknown, so legibility cannot be established — place an opaque brand-token panel behind the text, or move the text clear of the artwork.`
    : `through a scrim too thin to carry it: against the lightest and darkest pixels the artwork could hold, the worst case is ${worst.toFixed(2)}:1 against the required ${required}:1. Make the scrim opaque, deepen it, or recolour the text.`;

  v.push({
    ruleId: 'text-on-artwork',
    severity: ctx.contrastMode === 'warn' ? 'warning' : 'error',
    pageId: page.id,
    elementId: el.id,
    message: `Text "${el.name}" renders on ${kinds} artwork (${names}) ${detail}`,
  });
}

/**
 * Cropped glyphs (docs/19 P1.2).
 *
 * A bleed may extend a region past the safe area and off the canvas; that is a
 * sanctioned signature move and `checkSafeMargins` exempts `decoration` and
 * `background` for exactly that reason. What a bleed may never do is truncate
 * meaning. "82%" was composed with its glyph box starting 48px off the left
 * edge and rendered as "32%" — a different, wrong number — with every check in
 * this file green, because no check had any notion of where the glyphs were.
 *
 * So: no roleHint exemption. A decorative panel may bleed; a decorative
 * NUMERAL may not, because a reader still reads it.
 *
 * Tolerances follow the measurement, not the taste. `glyphLines` places the
 * anchored edge of each line — the left edge of left-aligned text, the right
 * edge of right-aligned — on the frame itself, so that number is exact and is
 * held to a half-pixel. The opposite edge is an average-glyph-width estimate
 * that can be out by a glyph either way, so it must overshoot by more than one
 * average glyph before we are willing to call a character lost.
 */
const EDGE_EPSILON = 0.5;

function checkGlyphCrop(
  el: TextElement,
  doc: InternalDesignDocument,
  page: Page,
  v: Violation[],
) {
  const anchored = anchoredEdges(el);
  const glyph = charWidthFor(el.fontSize, el.letterSpacing);
  const lineBox = el.fontSize * el.lineHeight;
  const tol = {
    left: anchored.left ? EDGE_EPSILON : glyph,
    right: anchored.right ? EDGE_EPSILON : glyph,
    top: anchored.top ? EDGE_EPSILON : lineBox / 2,
    bottom: anchored.bottom ? EDGE_EPSILON : lineBox / 2,
  };

  const worst = { edge: '', over: 0, at: 0, line: null as GlyphLine | null };
  const consider = (edge: keyof typeof tol, over: number, at: number, line: GlyphLine) => {
    if (over > tol[edge] && over > worst.over) {
      worst.edge = edge;
      worst.over = over;
      worst.at = at;
      worst.line = line;
    }
  };

  for (const line of glyphLines(el)) {
    if (line.width <= 0) continue;
    consider('left', -line.x, line.x, line);
    consider('right', line.x + line.width - doc.canvas.width, line.x + line.width, line);
    consider('top', -line.y, line.y, line);
    consider('bottom', line.y + line.height - doc.canvas.height, line.y + line.height, line);
  }
  if (!worst.line) return;

  const excerpt = worst.line.text.length > 40 ? `${worst.line.text.slice(0, 40)}…` : worst.line.text;
  v.push({
    ruleId: 'text-cropped',
    severity: 'error',
    pageId: page.id,
    elementId: el.id,
    message: `Text "${el.name}" is cut by the canvas ${worst.edge} edge — ${Math.round(worst.over)}px of the line "${excerpt}" falls outside the canvas and will not render. Bleed the backdrop, not the type.`,
  });
}

/**
 * Two-axis coverage and optical balance (docs/19 P1.5), as warnings.
 *
 * Both are warnings rather than errors on purpose. Coverage and balance are
 * composition judgements: a page can be sparse or deliberately asymmetric and
 * still be right, which is not true of unreadable or truncated text. Blocking
 * a document on them would trade a legibility gate for a taste gate. They are
 * reported so the harness, the critic and a human reviewer all see the same
 * numbers — see `composition-metrics.ts` for how the thresholds were chosen
 * against the real 2026-08-26 output.
 */
function checkComposition(
  doc: InternalDesignDocument,
  page: Page,
  pageIndex: number,
  v: Violation[],
) {
  const m = pageCompositionMetrics(doc, pageIndex);
  // One decimal, because "covers only 75%, below the 75% target" is not a
  // message anyone can act on.
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  for (const axis of ['horizontal', 'vertical'] as const) {
    const a = m[axis];
    if (a.fraction >= MIN_AXIS_COVERAGE) continue;
    const band = a.largestDeadBand >= 1 ? `; widest internal dead band ${Math.round(a.largestDeadBand)}px` : '';
    v.push({
      ruleId: 'coverage',
      severity: 'warning',
      pageId: page.id,
      message: `Content covers only ${pct(a.fraction)} of the canvas ${axis === 'horizontal' ? 'width' : 'height'}, below the ${pct(MIN_AXIS_COVERAGE)} target${band}. The empty band reads as unfinished rather than as deliberate whitespace.`,
    });
  }

  const b = m.balance;
  if (b.elementCount > 0 && !m.balanceOk) {
    const parts: string[] = [];
    if (Math.abs(b.offsetX) > MAX_BALANCE_OFFSET)
      parts.push(`${Math.round(Math.abs(b.offsetX) * doc.canvas.width)}px ${b.offsetX > 0 ? 'right' : 'left'} of centre`);
    if (Math.abs(b.offsetY) > MAX_BALANCE_OFFSET)
      parts.push(`${Math.round(Math.abs(b.offsetY) * doc.canvas.height)}px ${b.offsetY > 0 ? 'below' : 'above'} centre`);
    v.push({
      ruleId: 'balance',
      severity: 'warning',
      pageId: page.id,
      message: `Content is lopsided: the area-weighted centroid sits ${parts.join(' and ')} (limit ${pct(MAX_BALANCE_OFFSET)} of the canvas). One side of the page carries no weight.`,
    });
  }
}

function checkHiddenText(el: TextElement, page: Page, v: Violation[]) {
  if (!el.visible || el.opacity < 0.05)
    v.push({
      ruleId: 'no-hidden-content',
      severity: 'error',
      pageId: page.id,
      elementId: el.id,
      message: `Text element "${el.name}" is hidden or effectively invisible`,
    });
}

function checkRasterOnly(page: Page, flat: Element[], v: Violation[]) {
  const editable = flat.filter((e) => e.type !== 'image');
  if (editable.length === 0)
    v.push({
      ruleId: 'no-raster-only',
      severity: 'error',
      pageId: page.id,
      message: 'Page contains only raster images — designs must be layered and editable',
    });
}

function checkRequiredSlots(found: Set<string>, ctx: ValidationContext, v: Violation[]) {
  for (const slot of ctx.requiredSlotIds ?? []) {
    if (!found.has(slot))
      v.push({
        ruleId: 'required-elements',
        severity: 'error',
        message: `Required recipe slot "${slot}" has no element`,
      });
  }
}
