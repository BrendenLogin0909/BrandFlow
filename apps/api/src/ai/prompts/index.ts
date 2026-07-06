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
    version: 'post_ideas@2',
    jsonSchema: {
      type: 'object',
      properties: {
        ideas: {
          type: 'array',
          minItems: 1,
          maxItems: 24,
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', maxLength: 200 },
              angle: { type: 'string', maxLength: 500 },
              objective: {
                type: 'string',
                enum: [
                  'thought_leadership', 'announcement', 'event_promotion', 'case_study',
                  'educational', 'hiring', 'founder_insight', 'project_update', 'industry_commentary',
                ],
              },
              score: { type: 'number', minimum: 0, maximum: 1 },
              parentIndex: {
                type: 'integer',
                minimum: 0,
                description: 'Expand mode only: 0-based index of the expandFrom idea this direction develops',
              },
            },
            required: ['title', 'objective'],
          },
        },
      },
      required: ['ideas'],
    },
    render: (input) => {
      const req = input as {
        count?: number;
        expandFrom?: unknown[];
        topicInstruction?: string;
        existingTitles?: string[];
      };
      const task = req.expandFrom?.length
        ? `For EACH idea in expandFrom, generate exactly 2 distinct creative directions (e.g. a contrarian take vs a story-driven version). Titles must make the direction obvious. Set parentIndex on every direction to the 0-based index of the expandFrom idea it develops.`
        : `Suggest ${req.count ?? 5} distinct LinkedIn post ideas. Each needs: punchy title, one-line angle, objective, quality score 0-1. Vary formats and hooks — no two ideas alike.`;
      const memory = req.existingTitles?.length
        ? `\nThis brand has already covered the ideas below. Do NOT duplicate or closely paraphrase any of them — bring genuinely new territory, formats or angles:\n- ${req.existingTitles.slice(0, 150).join('\n- ')}`
        : '';
      return `${task}\n${req.topicInstruction ?? ''}${memory}\n\n${JSON.stringify({ ...req, existingTitles: undefined })}`;
    },
  }),
  post_copy: template({
    version: 'post_copy@2',
    jsonSchema: {
      type: 'object',
      properties: {
        hooks: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string', maxLength: 200 } },
        mainText: { type: 'string', maxLength: 2800 },
        shortVersion: { type: 'string', maxLength: 900 },
        cta: { type: 'string', maxLength: 150 },
        hashtags: { type: 'array', minItems: 3, maxItems: 8, items: { type: 'string', maxLength: 40 } },
        firstComment: { type: 'string', maxLength: 500 },
        suggestedVisualFormat: {
          type: 'string',
          enum: ['single_image', 'carousel', 'quote_card', 'statistic_card', 'announcement_graphic'],
        },
        onImageText: {
          type: 'object',
          properties: {
            headline: { type: 'string', maxLength: 90 },
            support: { type: 'string', maxLength: 140 },
            badge: { type: 'string', maxLength: 20 },
          },
          required: ['headline'],
        },
        slides: {
          type: 'array',
          minItems: 3,
          maxItems: 7,
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', maxLength: 60 },
              body: { type: 'string', maxLength: 180 },
              iconName: { type: 'string', maxLength: 40, description: 'lucide icon matching this slide' },
            },
            required: ['title', 'body'],
          },
        },
        altText: { type: 'string', maxLength: 300 },
      },
      required: ['hooks', 'mainText', 'cta', 'hashtags', 'firstComment', 'suggestedVisualFormat', 'onImageText', 'altText'],
    },
    render: (input) => {
      const req = input as { directions?: boolean };
      const task = req.directions
        ? `Write 2 DISTINCT complete draft variants for this idea (e.g. contrarian vs story-driven) — return the FIRST variant only in the schema fields; a second call handles the other. Make the framing genuinely different from the current draft provided.`
        : `Write a complete LinkedIn post draft for the idea below, in the brand voice.`;
      return `${task}
Rules: hook-first writing, short paragraphs, no hashtags inside mainText, concrete and specific over generic.
Include: exactly 3 hook options (first = best), main post text, a shorter alternative, CTA, hashtags, a value-adding first comment, the best visual format, on-image text (headline max 90 chars + optional support line + optional short badge), 3-7 carousel slides (title+body+lucide icon) when the content suits a carousel, and accessibility alt text for the visual.

${JSON.stringify(input)}`;
    },
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
