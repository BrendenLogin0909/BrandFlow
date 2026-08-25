/**
 * Model selection per pipeline stage, per provider — overridable via env.
 *
 * Stages (user-facing):
 *   ideation — short, high-volume, creative (idea batches, expansions)
 *   draft    — substantial generation (post copy, visual concepts, recipe fills)
 *   final    — highest quality (freeform composition, final-draft polish)
 *   review   — cheap checks (compliance, accessibility)
 *
 * Env overrides (apply to whichever provider is active):
 *   AI_MODEL_IDEATION, AI_MODEL_DRAFT, AI_MODEL_FINAL, AI_MODEL_REVIEW
 *
 * Defaults below reflect early-2026 model line-ups; model names move fast —
 * verify against docs.anthropic.com/models and platform.openai.com/docs/models.
 */
import type { PipelineStep } from '../ports/index.js';

export type ModelStage = 'ideation' | 'draft' | 'final' | 'review';
export type ProviderName = 'anthropic' | 'openai';

export const STEP_STAGE: Record<PipelineStep, ModelStage> = {
  post_ideas: 'ideation',
  content_strategy: 'ideation',
  brand_analysis: 'draft',
  brand_profile_draft: 'draft',
  post_copy: 'draft',
  visual_concept: 'draft',
  design_fill: 'draft',
  design_freeform: 'final',
  design_patch: 'final',
  // the critic looks at a render: final tier, and it must accept image input
  design_critique: 'final',
  compliance_review: 'review',
  accessibility_review: 'review',
};

/** Steps whose prompt attaches an image — the model MUST accept image input. */
export const VISION_STEPS: ReadonlySet<PipelineStep> = new Set<PipelineStep>(['design_critique']);

const DEFAULTS: Record<ProviderName, Record<ModelStage, string>> = {
  anthropic: {
    ideation: 'claude-sonnet-5',
    draft: 'claude-sonnet-5',
    final: 'claude-opus-4-8',
    review: 'claude-haiku-4-5-20251001',
  },
  openai: {
    ideation: 'gpt-5-mini',
    draft: 'gpt-5.1',
    final: 'gpt-5.1',
    review: 'gpt-5-mini',
  },
};

const ENV_BY_STAGE: Record<ModelStage, string> = {
  ideation: 'AI_MODEL_IDEATION',
  draft: 'AI_MODEL_DRAFT',
  final: 'AI_MODEL_FINAL',
  review: 'AI_MODEL_REVIEW',
};

export function modelFor(provider: ProviderName, step: PipelineStep): string {
  const stage = STEP_STAGE[step];
  const configured = process.env[ENV_BY_STAGE[stage]]?.trim() || DEFAULTS[provider][stage];
  if (!VISION_STEPS.has(step)) return configured;
  return resolveVisionModel(provider, configured).model;
}

/**
 * Known text-only model families. Sending an image to one of these does not
 * warn — the image is dropped or the call 400s, and a critic silently grading
 * a blank page is worse than no critic. Anything not matched here is assumed
 * vision-capable (every current Claude and GPT-5 model is).
 */
const TEXT_ONLY_PATTERNS: RegExp[] = [
  /^claude-(2|instant)/i,
  /^claude-3-5-haiku/i, // text-only in the 3.5 line
  /^gpt-3\.5/i,
  /^gpt-4-(0314|0613)/i, // pre-vision gpt-4 snapshots
  /^o1-mini/i,
  /^o3-mini/i,
  /-text($|-)/i,
  /embedding|moderation|tts|whisper/i,
];

/** Vision-capable default per provider, used when the configured model is not. */
const VISION_FALLBACK: Record<ProviderName, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5.1',
};

export function supportsVision(model: string): boolean {
  return !TEXT_ONLY_PATTERNS.some((p) => p.test(model.trim()));
}

export interface VisionModelChoice {
  model: string;
  /** Set when the configured model was rejected, for logging by the caller. */
  fellBackFrom?: string;
}

/**
 * Pick a model that actually accepts image input. Never silently downgrades:
 * when the configured model cannot take an image the substitution is returned
 * on `fellBackFrom` so the caller can log it rather than the pipeline pretending
 * nothing happened.
 */
export function resolveVisionModel(provider: ProviderName, configured: string): VisionModelChoice {
  if (supportsVision(configured)) return { model: configured };
  return { model: VISION_FALLBACK[provider], fellBackFrom: configured };
}

/** The model the critic will use, plus any fallback, without running a call. */
export function visionModelFor(provider: ProviderName): VisionModelChoice {
  const stage = STEP_STAGE.design_critique;
  const configured = process.env[ENV_BY_STAGE[stage]]?.trim() || DEFAULTS[provider][stage];
  return resolveVisionModel(provider, configured);
}
