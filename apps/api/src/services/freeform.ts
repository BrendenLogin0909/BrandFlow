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
  backgroundHexesUnder,
  contrastRatio,
  fitFontSize,
  measureText,
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

    // ---- safe-area clamp ----
    // The model routinely places an element 10-30px past the right margin
    // (e.g. x=620 + width=380 = 1000 on a 1080 canvas with a 90px margin),
    // which is a hard validation error. Pull every element back inside the
    // safe area before fitting text, so narrowing a frame is accounted for
    // by the overflow pass below rather than fighting it.
    // Decoration/background may bleed by design, and groups are checked
    // through their children — both match the validator's own exemptions.
    const s = page.safeArea;
    const maxW = doc.canvas.width - s.left - s.right;
    const maxH = doc.canvas.height - s.top - s.bottom;
    for (const el of flat) {
      if (el.roleHint === 'decoration' || el.roleHint === 'background') continue;
      if (el.type === 'group') continue;
      const f = el.frame;
      f.width = Math.min(f.width, maxW);
      f.height = Math.min(f.height, maxH);
      f.x = Math.min(Math.max(f.x, s.left), doc.canvas.width - s.right - f.width);
      f.y = Math.min(Math.max(f.y, s.top), doc.canvas.height - s.bottom - f.height);
    }

    for (const el of flat) {
      if (el.type !== 'text') continue;

      // ---- contrast fix ----
      // Against EVERY background the text overlaps, not just one that fully
      // contains it: a headline half-over a dark panel used to be measured
      // against the white page and pass while rendering dark-on-dark.
      const bgHexes = backgroundHexesUnder(el, doc, page, flat);
      const fgHex = resolveColour(el.colour, doc);
      if (bgHexes.length && fgHex) {
        const large = el.fontSize >= 32 && el.fontWeight >= 700;
        const required = large ? 3 : 4.5;
        const worst = (hex: string) => Math.min(...bgHexes.map((bg) => contrastRatio(hex, bg)));
        if (worst(fgHex) < required) {
          // Pick the token that is most legible against the WORST background,
          // so a fix for one panel cannot make another unreadable.
          let bestToken: string | null = null;
          let bestRatio = 0;
          for (const token of ['text', 'background', 'primary', 'secondary'] as const) {
            const hex = doc.brandTokens.colours[token];
            if (!hex) continue;
            const r = worst(hex);
            if (r > bestRatio) {
              bestRatio = r;
              bestToken = token;
            }
          }
          if (bestToken) el.colour = { kind: 'token', token: bestToken } as Colour;
        }
      }

      // ---- overflow fix ----
      // Two stages, because font-stepping alone does not converge: the AI
      // often allocates a frame too short for the copy at ANY readable size
      // (e.g. 2 lines needing 44px in a 26px frame), and the old code just
      // set the minimum size and let the validator flag it — so posts shipped
      // with errors a human had to fix (docs/16-backlog.md A2).
      const min = MIN_BY_ROLE[el.roleHint ?? 'body'] ?? 14;
      // Step 1: shrink to fit, at 1px granularity (2px could skip a fit).
      const fitted = fitFontSize(el.text, el.fontSize, min, el.lineHeight, el.frame.width, el.frame.height, 1);
      if (fitted !== null) {
        if (fitted < el.fontSize) el.fontSize = fitted;
        continue;
      }
      // Step 2: it cannot fit at the readability floor, so grow the frame
      // rather than clipping the copy. Growth stays inside the page safe area
      // (otherwise we would just trade text-overflow for a safe-margins
      // error), preferring to extend downwards and only shifting upwards when
      // there is not enough room below.
      el.fontSize = min;
      const needed = Math.ceil(measureText(el.text, min, el.lineHeight, el.frame.width, el.letterSpacing).height) + 1;
      if (needed <= el.frame.height) continue;
      const top = page.safeArea.top;
      const bottom = doc.canvas.height - page.safeArea.bottom;
      const available = bottom - top;
      if (needed <= available) {
        el.frame.height = needed;
        // pull back up if growing pushed it past the safe bottom edge
        if (el.frame.y + el.frame.height > bottom) el.frame.y = Math.max(top, bottom - el.frame.height);
      } else {
        // Genuinely cannot fit even using the full safe height — take all of
        // it and let the validator report the residue honestly.
        el.frame.y = top;
        el.frame.height = available;
      }
    }
  }
  return doc;
}

function flatten(elements: Element[]): Element[] {
  return elements.flatMap((el) => (el.type === 'group' ? [el, ...flatten(el.children)] : [el]));
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

  // Prefer flat illustrations for people AND for B2B scene/chart metaphors —
  // photos are a fallback. Matches the 29FORWARD-style LinkedIn benchmark.
  const ILLUSTRATION_FIRST =
    /\b(person|people|team|figure|man|woman|men|women|character|avatar|engineer|worker|founder|ceo|employee|customer|portrait|face|hero|professional|developer|designer|manager|leader|staff|colleague|human|tester|qa|analyst|mentor|coach|cartoon|illustration|scene|chart|graph|funnel|gauge|ladder|process|workflow|bug|rocket|shield|trophy|celebration|meeting|presentation|dashboard|metrics|kpi|growth|idea|checklist|network|handshake|megaphone|warning|alert|timeline|comparison|before.?after|maturity)\b/i;
  const seen = new Set<string>();
  // Recolour bundled illustrations to THIS brand. Without it every composed
  // post came back with the packs' default indigo characters/props no matter
  // what the brand palette was (docs/16-backlog.md A1). Accent is the pack's
  // own role (it replaces #6c63ff); primary is the fallback for brands that
  // do not define one.
  const brandHue = doc.brandTokens.colours.accent || doc.brandTokens.colours.primary;
  // Prefer the bundled CC0 character scenes, then the flat geometric pack, then
  // avatar APIs / stock. Hand-drawn characters are the 29FORWARD-grade hero art.
  const rank = (r: { provider: string; usageTier: number }) =>
    (r.provider === 'openpeeps' ? 0 : r.provider === 'undraw' ? 1 : r.provider === 'dicebear' ? 2 : 3) * 10 +
    r.usageTier;

  await Promise.all(
    placeholders.map(async ({ el, query }) => {
      try {
        const wantsIllustration = ILLUSTRATION_FIRST.test(query);
        let results = await searchAssets({
          kind: wantsIllustration ? 'illustration' : 'photo',
          query,
          limit: 8,
          brandHue,
        });
        if (results.length === 0)
          results = await searchAssets({
            kind: wantsIllustration ? 'photo' : 'illustration',
            query,
            limit: 8,
            brandHue,
          });
        // final fallback: free no-key AI generation — never leave a grey box
        if (results.length === 0) results = await searchAssets({ kind: 'ai', query, limit: 1 });
        results = [...results].sort((a, b) => rank(a) - rank(b));
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
      // travel with the document so credits persist through save/reopen/export
      if (attributions.length) document.attributions = attributions;
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
