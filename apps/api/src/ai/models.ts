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
  compliance_review: 'review',
  accessibility_review: 'review',
};

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
  return process.env[ENV_BY_STAGE[stage]]?.trim() || DEFAULTS[provider][stage];
}
