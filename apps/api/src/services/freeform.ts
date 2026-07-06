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
    meta: { freeform: true },
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

export interface ComposeResult {
  document: InternalDesignDocument;
  report: ValidationReport;
  needsAttention: boolean;
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
      const report = validateDesignDocument(document, {
        bannedPhrases: opts.bannedPhrases,
        contrastMode: opts.contrastMode ?? 'enforce',
      });
      if (report.passed) return { document, report, needsAttention: false };
      violations = report.errors.map((e) => e.message);
      // keep the closest attempt: humans can fix a few residual errors
      if (!best || report.errors.length < best.report.errors.length)
        best = { document, report, needsAttention: true };
    } catch (err) {
      violations = [String(err)];
    }
  }
  return best;
}
