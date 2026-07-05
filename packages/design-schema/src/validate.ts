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
 * Effective background: the topmost opaque solid shape fully containing the
 * text frame and layered beneath it (e.g. a rail, chip or band); otherwise
 * the page background.
 */
function effectiveBackgroundHex(
  el: TextElement,
  doc: InternalDesignDocument,
  page: Page,
  siblings: Element[],
): string | null {
  let best: { z: number; hex: string } | null = null;
  for (const s of siblings) {
    if (s.type !== 'shape' || s.zIndex >= el.zIndex || !s.visible || s.opacity < 0.99) continue;
    const fill = s.fill;
    if (!('kind' in fill) || (fill.kind !== 'token' && fill.kind !== 'raw')) continue;
    const contains =
      s.frame.x <= el.frame.x &&
      s.frame.y <= el.frame.y &&
      s.frame.x + s.frame.width >= el.frame.x + el.frame.width &&
      s.frame.y + s.frame.height >= el.frame.y + el.frame.height;
    if (!contains) continue;
    const hex = resolveColour(fill, doc);
    if (hex && (!best || s.zIndex > best.z)) best = { z: s.zIndex, hex };
  }
  if (best) return best.hex;
  const bg = page.background;
  return 'kind' in bg && (bg.kind === 'token' || bg.kind === 'raw') ? resolveColour(bg, doc) : null;
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
  const bgHex = effectiveBackgroundHex(el, doc, page, siblings);
  if (!fg || !bgHex) return; // gradient/image backgrounds: worst-case sampling handled server-side
  const large = el.fontSize >= 32 && el.fontWeight >= 700;
  const required = large ? 3 : 4.5;
  const ratio = contrastRatio(fg, bgHex);
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
