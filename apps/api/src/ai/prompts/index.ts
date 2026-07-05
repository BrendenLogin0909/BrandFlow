/**
 * Versioned prompt templates, one per pipeline step.
 * Templates are provider-neutral; the adapter owns model selection.
 * Full template bodies are developed alongside golden-fixture tests
 * (docs/13-testing-strategy.md §3); the design_fill template below shows
 * the recipe-contract pattern the others follow.
 */
import type { PipelineStep } from '../../ports/index.js';

export interface PromptTemplate {
  version: string;
  system: string;
  /** JSON Schema for the tool definition (mirrors the step's Zod schema). */
  jsonSchema: Record<string, unknown>;
  render: (input: unknown) => string;
}

const BASE_SYSTEM = `You are BrandFlow's content engine. You work for exactly one brand at a time;
the brand context in the user message is the ONLY brand information that exists.
Never invent brand colours, fonts, phrases or facts not present in the context.
Respect every do/don't rule, banned phrase and compliance rule.
Always respond via the submit_result tool with JSON matching its schema exactly.`;

function template(partial: Omit<PromptTemplate, 'system'> & { system?: string }): PromptTemplate {
  return { system: partial.system ?? BASE_SYSTEM, ...partial };
}

export const PROMPT_TEMPLATES: Record<PipelineStep, PromptTemplate> = {
  brand_analysis: template({
    version: 'brand_analysis@1',
    jsonSchema: { type: 'object' }, // mirrors BrandAnalysis Zod schema
    render: (input) =>
      `Analyse the following brand source material and extract palette candidates, font signals, tone descriptors, recurring themes, audience clues and phrase candidates. Cite a sourceRef for every extracted item.\n\n${JSON.stringify(input)}`,
  }),
  brand_profile_draft: template({
    version: 'brand_profile_draft@1',
    jsonSchema: { type: 'object' },
    render: (input) =>
      `Draft a complete brand profile from this analysis and questionnaire. Mark every field with a confidence score. A human will review and correct everything before use.\n\n${JSON.stringify(input)}`,
  }),
  content_strategy: template({
    version: 'content_strategy@1',
    jsonSchema: { type: 'object' },
    render: (input) =>
      `Create a content calendar for the brand and goals below. Each slot needs date, objective, pillar, visual format and a one-line rationale. Vary formats and objectives across the period.\n\n${JSON.stringify(input)}`,
  }),
  post_ideas: template({
    version: 'post_ideas@1',
    jsonSchema: { type: 'object' },
    render: (input) =>
      `Suggest 5 distinct LinkedIn post ideas for the brand, objective and source material below. Each: title, angle, target audience, suggested visual format, quality score 0-1.\n\n${JSON.stringify(input)}`,
  }),
  post_copy: template({
    version: 'post_copy@1',
    jsonSchema: { type: 'object' },
    render: (input) =>
      `Write a complete LinkedIn post package for the approved idea below, in the brand voice, honouring locked fields verbatim if provided. Include: 3 hook options, main text, shorter version, longer version, CTA, hashtags, first comment, suggested visual format, carousel outline if applicable, on-image text, slide-by-slide text if carousel, accessibility alt text, brand compliance notes, quality score.\n\n${JSON.stringify(input)}`,
  }),
  visual_concept: template({
    version: 'visual_concept@1',
    jsonSchema: { type: 'object' },
    render: (input) =>
      `Propose a visual concept for this post: format, central visual metaphor, icon ideas, colour treatment, and rank the candidate layout recipes provided for fit.\n\n${JSON.stringify(input)}`,
  }),
  design_fill: template({
    version: 'design_fill@1',
    jsonSchema: {
      type: 'object',
      properties: {
        slots: {
          type: 'object',
          description: 'One entry per recipe slot id, matching the slot kind',
        },
      },
      required: ['slots'],
    },
    render: (input) => {
      const { recipe, ...rest } = input as { recipe: { slots: unknown[] } } & Record<string, unknown>;
      return `Fill the layout recipe slots below with content for this post. You decide ONLY slot content (text within character limits, icon names, colour treatment) — never positions, sizes or element types. Respect locked slot values verbatim.\n\nRecipe slots:\n${JSON.stringify(recipe.slots, null, 2)}\n\nContext:\n${JSON.stringify(rest)}`;
    },
  }),
  design_freeform: template({
    version: 'design_freeform@1',
    jsonSchema: {
      type: 'object',
      properties: {
        format: { type: 'string' },
        canvasPreset: { enum: ['square', 'portrait', 'landscape'] },
        pages: { type: 'array', items: { type: 'object' } },
      },
      required: ['format', 'canvasPreset', 'pages'],
    },
    render: (input) =>
      `Design an original LinkedIn visual for this post — you control the full composition:
element placement, sizes, layering, groups, shapes, decorative motifs, icon and image choices.

Hard rules (violations are rejected and cost you a retry):
- Only these element types: text, shape, icon, image, group.
- Every colour must be a brand token reference ({"kind":"token","token":"primary|secondary|accent|neutral|background|text"}). Raw hex is forbidden.
- Fonts: only the brand's heading and body fonts.
- Icons: {"provider":"lucide","name":"<lucide icon name>"}. Images: only assetIds from approvedImageAssets, or omit for a placeholder.
- Keep required content inside the safe area (90px margins); only decorative elements may bleed.
- Body text ≥14px, captions ≥12px, headlines ≥24px. Respect readable contrast against what each text sits on.
- Coordinates are absolute page pixels within the chosen canvas preset (square 1080x1080, portrait 1080x1350, landscape 1200x627).

Be genuinely creative with composition — asymmetry, overlaps, oversized numerals, icon clusters,
split layouts — while keeping the brand's personality. Do not imitate one fixed template.

${JSON.stringify(input)}`,
  }),
  compliance_review: template({
    version: 'compliance_review@1',
    jsonSchema: { type: 'object' },
    render: (input) =>
      `Review this copy and on-image text against the brand style guide and compliance rules. Report banned-phrase hits, tone deviations and rule violations with severity.\n\n${JSON.stringify(input)}`,
  }),
  accessibility_review: template({
    version: 'accessibility_review@1',
    jsonSchema: { type: 'object' },
    render: (input) =>
      `Review the design summary and copy for accessibility: alt-text quality, contrast advisories, reading order. Suggest improved alt text if needed.\n\n${JSON.stringify(input)}`,
  }),
};
