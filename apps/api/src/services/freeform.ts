/**
 * Freeform compose (creative mode): the AI emits the full composition —
 * element placement, layering, motifs — bounded by the schema, brand tokens
 * and the validation engine. Shared by the generation service and the
 * interactive compose endpoint.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  BrandTokensSnapshot,
  Colour,
  Element,
  InternalDesignDocument,
  TextElement,
  ValidationReport,
} from '@brandflow/design-schema';
import {
  contrastRatio,
  fitFontSize,
  parseDesignDocument,
  resolveColour,
  validateDesignDocument,
} from '@brandflow/design-schema';
import { LINKEDIN_CANVAS_PRESETS } from '@brandflow/shared';
import { getAiProvider } from '../ai/provider.js';
import { searchAssets } from '../assets/providers.js';

export const FreeformOutput = z.object({
  format: z.string().min(1),
  canvasPreset: z.enum(['square', 'portrait', 'landscape']),
  pages: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        // token-only: raw hex is forbidden in freeform mode
        background: z.object({ kind: z.literal('token'), token: z.string().min(1) }),
        elements: z.array(z.record(z.unknown())).min(1).max(60),
      }),
    )
    .min(1)
    .max(20),
});
export type FreeformOutputT = z.infer<typeof FreeformOutput>;

export interface FreeformContext {
  brandProfileId: string;
  clientCompanyId: string;
  brandTokens: BrandTokensSnapshot;
}

/** Assign ids/defaults to AI-emitted elements and hard-parse the result. */
export function normaliseFreeform(data: FreeformOutputT, ctx: FreeformContext): InternalDesignDocument {
  const preset = LINKEDIN_CANVAS_PRESETS[data.canvasPreset];
  const withIds = (el: Record<string, unknown>, i: number): unknown => ({
    id: randomUUID(),
    name: (el.name as string) ?? `${el.type}`,
    opacity: 1,
    locked: false,
    visible: true,
    zIndex: i,
    roleHint: null,
    tokenRefs: [],
    recipeSlotId: null,
    // preserve the AI's image subject (non-schema field) for asset resolution
    meta: { freeform: true, ...(el.imageQuery ? { query: String(el.imageQuery) } : {}) },
    ...el,
    ...(el.type === 'group' && Array.isArray(el.children)
      ? { children: (el.children as Record<string, unknown>[]).map(withIds) }
      : {}),
  });

  return parseDesignDocument({
    id: randomUUID(),
    schemaVersion: 1,
    version: 1,
    brandProfileId: ctx.brandProfileId,
    clientCompanyId: ctx.clientCompanyId,
    layoutRecipeRef: { recipeId: 'freeform', recipeVersion: 1, variant: 'ai-composed' },
    format: data.format,
    canvas: { ...preset, unit: 'px', dpi: 96 },
    brandTokens: ctx.brandTokens,
    pages: data.pages.map((p) => ({
      id: randomUUID(),
      name: p.name,
      background: p.background,
      safeArea: { top: 90, right: 90, bottom: 90, left: 90 },
      elements: p.elements.map(withIds),
    })),
  });
}

/**
 * Deterministic legibility guardrails applied to every AI composition —
 * the model keeps creative control of layout; we guarantee readability:
 *  - text that fails contrast against its effective background is
 *    re-coloured to the best-contrast brand token
 *  - overflowing text is font-stepped down to fit (never below role minima)
 */
export function autoFixFreeform(doc: InternalDesignDocument): InternalDesignDocument {
  const MIN_BY_ROLE: Record<string, number> = { headline: 24, subheadline: 18, caption: 12, cta: 14, data: 14 };

  for (const page of doc.pages) {
    const flat = flatten(page.elements);
    for (const el of flat) {
      if (el.type !== 'text') continue;

      // ---- contrast fix ----
      const bgHex = effectiveBg(el, flat, page.background, doc);
      const fgHex = resolveColour(el.colour, doc);
      if (bgHex && fgHex) {
        const large = el.fontSize >= 32 && el.fontWeight >= 700;
        const required = large ? 3 : 4.5;
        if (contrastRatio(fgHex, bgHex) < required) {
          let bestToken: string | null = null;
          let bestRatio = 0;
          for (const token of ['text', 'background', 'primary', 'secondary'] as const) {
            const hex = doc.brandTokens.colours[token];
            if (!hex) continue;
            const r = contrastRatio(hex, bgHex);
            if (r > bestRatio) {
              bestRatio = r;
              bestToken = token;
            }
          }
          if (bestToken) el.colour = { kind: 'token', token: bestToken } as Colour;
        }
      }

      // ---- overflow fix ----
      const min = MIN_BY_ROLE[el.roleHint ?? 'body'] ?? 14;
      const fitted = fitFontSize(el.text, el.fontSize, min, el.lineHeight, el.frame.width, el.frame.height);
      if (fitted !== null && fitted < el.fontSize) el.fontSize = fitted;
      else if (fitted === null) el.fontSize = min; // validator flags any residue
    }
  }
  return doc;
}

function flatten(elements: Element[]): Element[] {
  return elements.flatMap((el) => (el.type === 'group' ? [el, ...flatten(el.children)] : [el]));
}

function effectiveBg(
  el: TextElement,
  siblings: Element[],
  pageBg: unknown,
  doc: InternalDesignDocument,
): string | null {
  let best: { z: number; hex: string } | null = null;
  for (const s of siblings) {
    if (s.type !== 'shape' || s.zIndex >= el.zIndex || !s.visible || s.opacity < 0.99) continue;
    const fill = s.fill as { kind?: string };
    if (fill.kind !== 'token' && fill.kind !== 'raw') continue;
    const contains =
      s.frame.x <= el.frame.x &&
      s.frame.y <= el.frame.y &&
      s.frame.x + s.frame.width >= el.frame.x + el.frame.width &&
      s.frame.y + s.frame.height >= el.frame.y + el.frame.height;
    if (!contains) continue;
    const hex = resolveColour(s.fill as Colour, doc);
    if (hex && (!best || s.zIndex > best.z)) best = { z: s.zIndex, hex };
  }
  if (best) return best.hex;
  const bg = pageBg as { kind?: string };
  if (bg.kind === 'token' || bg.kind === 'raw') return resolveColour(pageBg as Colour, doc);
  return null;
}

/**
 * Fill AI-placed image placeholders with real assets from the licensed
 * providers (per the asset-source whitelist). Only auto-safe results are
 * used; when no suitable asset is found (e.g. no photo API keys), the
 * placeholder stays editable so a human can drop one in. Returns the
 * attribution lines that any used licence requires.
 */
export async function resolveImages(doc: InternalDesignDocument): Promise<string[]> {
  const attributions: string[] = [];
  const placeholders: { el: Extract<Element, { type: 'image' }>; query: string }[] = [];
  for (const page of doc.pages)
    for (const el of flatten(page.elements))
      if (el.type === 'image' && !el.src && !el.assetId) {
        const query = (el.meta?.query as string) || el.name || '';
        if (query) placeholders.push({ el, query });
      }
  if (placeholders.length === 0) return attributions;

  const HUMAN = /\b(person|people|team|figure|man|woman|men|women|character|avatar|engineer|worker|founder|ceo|employee|customer|portrait|face|hero|professional|developer|designer|manager|leader|staff|colleague|human)\b/i;
  const seen = new Set<string>();
  await Promise.all(
    placeholders.map(async ({ el, query }) => {
      try {
        const wantsFigure = HUMAN.test(query);
        // primary search; for human subjects prefer illustrations (DiceBear
        // is always available), otherwise photos
        let results = await searchAssets({ kind: wantsFigure ? 'illustration' : 'photo', query, limit: 6 });
        // fallback: if photo providers are dry (no keys) but the subject is
        // a person, an illustration figure beats an empty grey box
        if (results.length === 0 && wantsFigure)
          results = await searchAssets({ kind: 'illustration', query, limit: 6 });
        const pick = results.find((r) => r.usageTier <= 2 && !seen.has(r.contentUrl));
        if (!pick) return; // no licensed asset available → leave editable placeholder
        seen.add(pick.contentUrl);
        el.src = pick.contentUrl;
        el.isPlaceholder = false;
        el.meta = { ...el.meta, assetProvider: pick.provider, assetLicence: pick.licence, assetSource: pick.sourceUrl };
        if (pick.attributionRequired && pick.creator)
          attributions.push(`${pick.creator} / ${pick.provider}`);
      } catch {
        /* leave the placeholder editable */
      }
    }),
  );
  return attributions;
}

export interface ComposeResult {
  document: InternalDesignDocument;
  report: ValidationReport;
  needsAttention: boolean;
  attributions?: string[];
}

/**
 * Compose with one violation-guided repair round. Returns null only when
 * the output can't even be repaired into a near-valid design.
 */
export async function composeFreeform(
  request: Record<string, unknown>,
  ctx: FreeformContext,
  opts: { bannedPhrases?: string[]; contrastMode?: 'enforce' | 'warn' } = {},
): Promise<ComposeResult | null> {
  let violations: string[] = [];
  let best: ComposeResult | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data } = await getAiProvider().complete(
        'design_freeform',
        attempt === 0 ? request : { ...request, violations },
        FreeformOutput,
      );
      const document = autoFixFreeform(normaliseFreeform(data, ctx));
      const attributions = await resolveImages(document); // fill placeholders from licensed providers
      const report = validateDesignDocument(document, {
        bannedPhrases: opts.bannedPhrases,
        contrastMode: opts.contrastMode ?? 'enforce',
      });
      if (report.passed) return { document, report, needsAttention: false, attributions };
      violations = report.errors.map((e) => e.message);
      // keep the closest attempt: humans can fix a few residual errors
      if (!best || report.errors.length < best.report.errors.length)
        best = { document, report, needsAttention: true, attributions };
    } catch (err) {
      violations = [String(err)];
    }
  }
  return best;
}
