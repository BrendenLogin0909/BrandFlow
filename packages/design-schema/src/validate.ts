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
import { measureText } from './measure.js';

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

const MIN_FONT_SIZES: Record<string, number> = {
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
        checkHiddenText(el, page, v);
      }
    }
    checkRasterOnly(page, flat.map((f) => f.el), v);
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
 * Sample points across the text frame, used to find what is actually behind
 * the glyphs. Sampling (rather than comparing bounding boxes) is what makes
 * this correct for two cases that both occur in real output: a shape that
 * OCCLUDES another beneath it (the corner-ring motif is an accent ellipse with
 * a background-coloured ellipse on top — text in the hole sits on the
 * background, not the accent), and non-rectangular shapes, whose bounding box
 * badly overstates their coverage at the corners.
 */
// Sampling follows the GLYPHS, not the frame. A text frame is usually wider
// than the text inside it, so sampling its corners reports whatever is behind
// empty space — which produced a false failure for a numeral centred in a
// circular chip, where the frame corners fall outside the circle onto the page.
// Horizontal sampling therefore tracks the alignment, and vertical sampling
// stays in the band where the first lines sit.
const SAMPLE_X_BY_ALIGN: Record<string, number[]> = {
  left: [0.03, 0.18, 0.36, 0.54],
  center: [0.32, 0.42, 0.5, 0.58, 0.68],
  right: [0.46, 0.64, 0.82, 0.97],
};
const SAMPLE_Y = [0.18, 0.42, 0.7];

/** Is a point inside this shape, accounting for its own rotation? */
function pointInShape(px: number, py: number, s: Extract<Element, { type: 'shape' }>): boolean {
  const f = s.frame;
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
  if (s.shape === 'ellipse') {
    const rx = f.width / 2 || 1;
    const ry = f.height / 2 || 1;
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  }
  // rect and everything else: the bounding box is the honest approximation.
  return true;
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
 * reader sees the worst one, not the average.
 */
export function backgroundHexesUnder(
  el: TextElement,
  doc: InternalDesignDocument,
  page: Page,
  siblings: Element[],
): string[] {
  // Resolve each candidate's colour once; gradients and patterns are skipped
  // (worst-case sampling for those is handled server-side).
  const candidates: { shape: Extract<Element, { type: 'shape' }>; z: number; hex: string }[] = [];
  for (const s of siblings) {
    if (s.type !== 'shape' || s.zIndex >= el.zIndex || !s.visible || s.opacity < 0.99) continue;
    const fill = s.fill;
    if (!('kind' in fill) || (fill.kind !== 'token' && fill.kind !== 'raw')) continue;
    const hex = resolveColour(fill, doc);
    if (hex) candidates.push({ shape: s, z: s.zIndex, hex });
  }
  const pageBg = page.background;
  const pageHex =
    'kind' in pageBg && (pageBg.kind === 'token' || pageBg.kind === 'raw')
      ? resolveColour(pageBg, doc)
      : null;

  const f = el.frame;
  const seen = new Set<string>();
  const sampleX = SAMPLE_X_BY_ALIGN[el.align] ?? SAMPLE_X_BY_ALIGN.left!;
  for (const fx of sampleX) {
    for (const fy of SAMPLE_Y) {
      const px = f.x + f.width * fx;
      const py = f.y + f.height * fy;
      // Topmost shape wins at this point; anything below it is occluded.
      let top: { z: number; hex: string } | null = null;
      for (const c of candidates) {
        if (top && c.z <= top.z) continue;
        if (!pointInShape(px, py, c.shape)) continue;
        top = { z: c.z, hex: c.hex };
      }
      const hex = top?.hex ?? pageHex;
      if (hex) seen.add(hex);
    }
  }
  return [...seen];
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
  const large = el.fontSize >= 32 && el.fontWeight >= 700;
  const required = large ? 3 : 4.5;
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
