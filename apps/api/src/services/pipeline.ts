/**
 * The four-stage composition pipeline (docs/18).
 *
 *   1 concept        (AI)   what the post is ABOUT — idea, metaphor, copy
 *   2 art direction  (AI)   where things go, in grid cells and emphasis levels
 *   3 compositor     (code) grid cells -> real geometry. Deterministic.
 *   4 critic         (AI)   look at the render, adjust regions, re-compose
 *
 * Stage 3 is where the guarantees live: the model never emits a pixel, a font
 * size or an off-palette colour, so alignment and type discipline are arithmetic
 * rather than something we ask for politely.
 *
 * Failure policy: every stage degrades rather than throws. No concept means no
 * design (there is nothing to lay out); a failed critic returns the composed
 * document unchanged. The caller always gets either a usable document or a null
 * with the reason recorded.
 */
import { randomUUID } from 'node:crypto';
import type { BrandTokensSnapshot, InternalDesignDocument, LayoutPlan, ValidationReport } from '@brandflow/design-schema';
import { validateDesignDocument } from '@brandflow/design-schema';
import { composeFromPlanVerbose } from '@brandflow/layout-recipes';
import { exportPageSvg } from '@brandflow/exporters/svg';
import { LINKEDIN_CANVAS_PRESETS } from '@brandflow/shared';
import type { AiProviderPort } from '../ports/index.js';
import { getAiProvider } from '../ai/provider.js';
import { runArtDirection, runConcept } from './concept.js';
import { criticLoop } from './critic.js';
import { resolveImages } from './freeform.js';

export interface PipelineRequest {
  /** The post being designed: idea, copy, on-image text, slides. */
  brief: unknown;
  brand: unknown;
  brandTokens: BrandTokensSnapshot;
  clientCompanyId: string;
  brandProfileId?: string;
  format?: string;
  pageCount?: number;
  visualDirection?: Record<string, unknown> | null;
}

export interface PipelineOptions {
  provider?: AiProviderPort;
  bannedPhrases?: string[];
  contrastMode?: 'enforce' | 'warn';
  /** Stage 4 costs a vision call per page; off by default for cheap runs. */
  critique?: boolean;
  /** Critique rounds per page (hard-capped at 2 by criticLoop). */
  criticRounds?: number;
  /** Deterministic ids for tests. */
  newId?: () => string;
}

export interface PipelineResult {
  document: InternalDesignDocument;
  plan: LayoutPlan;
  report: ValidationReport;
  attributions: string[];
  /** Deterministic coercions the compositor had to apply. */
  notes: string[];
  stages: {
    concept: { attempts: number; violations: string[]; needsAttention: boolean };
    artDirection: { attempts: number; violations: string[]; needsAttention: boolean };
    critique?: { pages: { pageIndex: number; bestTotal: number | null; roundsRun: number }[] };
  };
  /** Populated when a stage degraded rather than succeeded. */
  warnings: string[];
}

function canvasFor(format: string | undefined): { width: number; height: number } {
  const preset = LINKEDIN_CANVAS_PRESETS as Record<string, { width: number; height: number }>;
  return preset[format ?? 'single_image'] ?? preset.single_image ?? { width: 1080, height: 1350 };
}

/**
 * Run the whole pipeline. Returns null only when stage 1 or 2 produce nothing
 * usable — there is no design to salvage at that point.
 */
export async function composePipeline(
  request: PipelineRequest,
  opts: PipelineOptions = {},
): Promise<PipelineResult | null> {
  const ai = opts.provider ?? getAiProvider();
  const newId = opts.newId ?? (() => randomUUID());
  const warnings: string[] = [];
  const canvas = canvasFor(request.format);

  // ---- stage 1: concept ----
  const concept = await runConcept(
    ai,
    {
      brief: request.brief,
      brand: request.brand,
      format: request.format,
      pageCount: request.pageCount,
      visualDirection: request.visualDirection ?? null,
    },
    { bannedPhrases: opts.bannedPhrases },
  );
  if (!concept) return null;
  if (concept.needsAttention) warnings.push(`concept: ${concept.violations.join('; ')}`);

  // ---- stage 2: art direction ----
  const art = await runArtDirection(
    ai,
    {
      concept: concept.concept,
      brand: request.brand,
      format: request.format,
      canvasPreset: canvas.width === canvas.height ? 'square' : 'portrait',
    },
    { bannedPhrases: opts.bannedPhrases },
  );
  if (!art) return null;
  if (art.needsAttention) warnings.push(`art-direction: ${art.violations.join('; ')}`);

  const compositionContext = {
    documentId: newId(),
    brandProfileId: request.brandProfileId ?? 'pipeline',
    clientCompanyId: request.clientCompanyId,
    brandTokens: request.brandTokens,
    variant: 'composed',
    seed: 1,
    newId,
    canvas,
    format: request.format ?? 'single_image',
    concept: concept.concept,
  };

  // ---- stage 3: compositor (deterministic) ----
  const compose = (plan: LayoutPlan) => composeFromPlanVerbose(plan, compositionContext);

  let plan = art.plan;
  const critique: { pageIndex: number; bestTotal: number | null; roundsRun: number }[] = [];

  // ---- stage 4: critic (optional; one loop per page) ----
  if (opts.critique) {
    for (let pageIndex = 0; pageIndex < plan.pages.length; pageIndex++) {
      try {
        const loop = await criticLoop(
          plan,
          (candidate, index) => exportPageSvg(compose(candidate).document, index),
          {
            pageIndex,
            provider: opts.provider,
            maxRounds: opts.criticRounds,
            format: request.format,
            pageCount: plan.pages.length,
            bigIdea: concept.concept.bigIdea,
            purpose: plan.pages[pageIndex] ? concept.concept.pages[pageIndex]?.purpose : undefined,
            signatureMove: concept.concept.signatureMove,
          },
        );
        plan = loop.plan;
        critique.push({ pageIndex, bestTotal: loop.bestTotal, roundsRun: loop.roundsRun });
      } catch (err) {
        // A critic failure must never cost us the design.
        warnings.push(`critique page ${pageIndex}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const { document, notes } = compose(plan);

  // Fill image placeholders from the licence-checked pool, recolouring bundled
  // packs to this brand (the same path the single-call composer uses).
  let attributions: string[] = [];
  try {
    attributions = await resolveImages(document);
    if (attributions.length) document.attributions = attributions;
  } catch (err) {
    warnings.push(`image resolution: ${err instanceof Error ? err.message : String(err)}`);
  }

  const report = validateDesignDocument(document, {
    bannedPhrases: opts.bannedPhrases,
    contrastMode: opts.contrastMode ?? 'warn',
  });

  return {
    document,
    plan,
    report,
    attributions,
    notes,
    stages: {
      concept: {
        attempts: concept.attempts,
        violations: concept.violations,
        needsAttention: concept.needsAttention,
      },
      artDirection: {
        attempts: art.attempts,
        violations: art.violations,
        needsAttention: art.needsAttention,
      },
      ...(opts.critique ? { critique: { pages: critique } } : {}),
    },
    warnings,
  };
}
