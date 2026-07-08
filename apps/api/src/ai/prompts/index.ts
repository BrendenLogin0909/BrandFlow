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
    version: 'post_copy@3',
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
        visualDirection: {
          type: 'object',
          description: 'How the on-image / carousel visuals should LOOK — craft-level art direction',
          properties: {
            scene: { type: 'string', maxLength: 200, description: 'What is depicted — characters, objects, setting' },
            metaphor: { type: 'string', maxLength: 200, description: 'Central visual metaphor tying copy to image' },
            mood: { type: 'string', maxLength: 120, description: 'Emotional tone — bold, calm, urgent, playful…' },
            compositionHints: { type: 'string', maxLength: 400, description: 'Layout notes — two-tone headline, hero left, badge top-right, whitespace…' },
            colourMood: { type: 'string', maxLength: 120, description: 'Colour emphasis — primary headline, accent highlights, dark band…' },
            illustrationStyle: { type: 'string', maxLength: 120, description: 'Flat illustration, minimal icons, photo-led, chart-forward…' },
          },
        },
      },
      required: ['hooks', 'mainText', 'cta', 'hashtags', 'firstComment', 'suggestedVisualFormat', 'onImageText', 'altText', 'visualDirection'],
    },
    render: (input) => {
      const req = input as { directions?: boolean };
      const task = req.directions
        ? `Write 2 DISTINCT complete draft variants for this idea (e.g. contrarian vs story-driven) — return the FIRST variant only in the schema fields; a second call handles the other. Make the framing genuinely different from the current draft provided.`
        : `Write a complete LinkedIn post draft for the idea below, in the brand voice.`;
      return `${task}
Rules: hook-first writing, short paragraphs, no hashtags inside mainText, concrete and specific over generic.
Include: exactly 3 hook options (first = best), main post text, a shorter alternative, CTA, hashtags, a value-adding first comment, the best visual format, on-image text (headline max 90 chars + optional support line + optional short badge), 3-7 carousel slides (title+body+lucide icon) when the content suits a carousel, accessibility alt text for the visual, AND a visualDirection block.

visualDirection is critical — describe how the graphic should LOOK with craft (benchmark: bold LinkedIn carousels like 29FORWARD Australia: two-tone headlines, flat character illustrations, layered composition, accent colour blocks). Be specific about scene, metaphor, mood, composition, colour mood, and illustration style. This feeds the design composer and AI edit tools.

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
    version: 'design_freeform@3',
    jsonSchema: {
      type: 'object',
      properties: {
        format: { type: 'string' },
        canvasPreset: { type: 'string', enum: ['square', 'portrait', 'landscape'] },
        pages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              background: {
                type: 'object',
                properties: { kind: { type: 'string', enum: ['token'] }, token: { type: 'string' } },
                required: ['kind', 'token'],
              },
              elements: { type: 'array', items: { type: 'object' } },
            },
            required: ['name', 'background', 'elements'],
          },
        },
      },
      required: ['format', 'canvasPreset', 'pages'],
    },
    render: (input) =>
      `You are an award-winning social media art director. Design an ORIGINAL, visually rich LinkedIn graphic for the content below. You control the entire composition: placement, sizes, layering, colour blocking, decorative motifs.

## Element types (exact JSON shapes)
- TEXT: {"type":"text","text":"...","frame":{"x":0,"y":0,"width":0,"height":0,"rotation":0},"fontFamily":"<heading-or-body font>","fontSize":48,"fontWeight":800,"lineHeight":1.15,"align":"left|center|right","colour":{"kind":"token","token":"text"},"zIndex":5,"roleHint":"headline|subheadline|body|caption|cta|badge|data|decoration"}
- ICON (line artwork, any size — these are your illustrations): {"type":"icon","iconRef":{"provider":"lucide","name":"trophy"},"frame":{...},"colour":{"kind":"token","token":"accent"},"strokeWidth":1.5,"zIndex":3,"roleHint":"icon|decoration"}
- SHAPE: {"type":"shape","shape":"rect|ellipse|line|triangle|arrow","frame":{...},"fill":{"kind":"token","token":"primary"},"cornerRadius":24,"zIndex":1,"roleHint":"decoration|badge"} (arrow points right; rotate the frame for other directions; opacity 0.06-0.15 on big shapes makes soft background blobs)
- CHART (real data viz): {"type":"chart","chartType":"bar|donut|progress|stat","data":[{"label":"Before","value":38},{"label":"After","value":82}],"palette":[{"category":"colour","token":"primary"},{"category":"colour","token":"accent"}],"frame":{...},"zIndex":4}
- IMAGE (a real photo/illustration is fetched from the licensed asset library and dropped in for you): {"type":"image","frame":{...},"fit":"cover","cornerRadius":24,"isPlaceholder":true,"imageQuery":"<2-4 word subject, e.g. 'team celebrating win' or 'runner crossing finish line'>","zIndex":2,"roleHint":"image"} — ALWAYS include imageQuery describing the photo you want; use images for human/scene moments and icons for symbols.

## Composition craft (this is what separates you from a template)
- Build ILLUSTRATION SCENES from icons: ONE hero icon at 240-380px, strokeWidth 1.25-1.75, in a STRONG colour (token primary on light areas; token background when sitting on a filled primary/text panel or ellipse). Support it with 2-4 icons at 64-120px around it. Never draw hero icons in pale/accent-on-light — they must pop. Example scene: "winning" = 320px trophy in primary on a soft accent ellipse, medal + flag at 90px beside it, 5-8 small accent dots (10-16px ellipses) as confetti.
- TWO-TONE HEADLINES: two text elements STACKED WITHOUT OVERLAP — element 2's frame.y MUST equal element 1's frame.y + element 1's frame.height (they share x and width; line 1 token text, line 2 token primary).
- NO TEXT OVERLAPS ANYTHING: every text frame must be at least 16px clear of every other text/icon frame; when text sits on a busy area, put an opaque rect panel (zIndex below the text) behind it.
- Use ARROWS and LINES to connect ideas (before -> after, problem -> fix); rotate arrows via frame.rotation.
- Use CHARTS whenever numbers appear — a bar pair for before/after, donut for a share, progress for a percentage, stat for one big number.
- COLOUR-BLOCK the canvas: full-width bands, corner panels or diagonal rects (rotation ±6) in primary/accent behind sections; put text ON these blocks with contrasting token colours.
- Numbered chips (small accent circles + white numeral) for list points; badge pills (rounded rect + short uppercase text) for labels like "GUIDE" or "NEW".
- Aim for 14-30 elements per page with deliberate zIndex layering (background blobs 0-1, panels 2, illustration 3-5, text 6+). Vary alignment per page: left-anchored, centred hero, split halves, diagonal flow.

## Hard rules (violations are rejected and cost a retry)
- Colours ONLY as {"kind":"token","token":"primary|secondary|accent|neutral|background|text"}. Raw hex is forbidden.
- Fonts: only the brand's heading font (headlines/numbers) and body font (everything else).
- Keep readable content inside the 90px safe margins; only roleHint "decoration"/"background" may bleed off-canvas.
- Body text >=14px, captions >=12px, headlines >=24px.
- COLOUR PAIRING (memorise): on the page background use tokens text or primary for text; on a primary or text panel use token background for text; token accent is for shapes, chips, icons-on-dark and big bold numerals only — NEVER for sentences or captions on a light background.
- Fill the canvas with intent: no empty dead zone larger than ~25% of the page; balance the quadrants.
- Token neutral is for hairlines and small dividers only — big panels and bands use primary, text or accent (soft versions via opacity 0.06-0.15), never large grey slabs.
- Canvas: square 1080x1080, portrait 1080x1350 (best for feeds), landscape 1200x627. Coordinates are absolute pixels.
- Icon names must be real lucide names (e.g. trophy, rocket, target, flag, medal, users, brain, bug, shield-check, trending-up, alert-triangle, lightbulb, check-circle-2, x-circle, arrow-right, bar-chart-3, clock, zap, route, layers).

## Worked example of the expected level (structure only — NEVER copy it)
Page "Cover": background token background; big soft accent ellipse (700px, opacity 0.10) top-right, zIndex 0; kicker badge pill top-left; two-tone headline upper third ("WORLD'S GREATEST" in text + "TEST TEAM" in primary, 84px); hero scene centre-right: trophy icon 300px in accent on a primary ellipse panel, medal 90px and flag 80px flanking it, three 14px accent dots as confetti; bottom-left panel: rect primary, 5 numbered chips with short lines "5 moves to win the race"; arrow from panel pointing to the trophy.
Page "Data": diagonal primary band behind the top; headline; bar chart Before/After centre-left; two arrows pointing left and right to icon+caption pairs; progress chart 78% lower right; CTA pill bottom.

Now design for:
${JSON.stringify(input)}`,
  }),
  design_patch: template({
    version: 'design_patch@1',
    system: `${BASE_SYSTEM}
You are a precise design editor. You NEVER redesign a whole document — you emit
the SMALLEST set of operations that satisfies the instruction. You only ever
touch the elements/pages the instruction is scoped to, and you NEVER modify a
locked element. Preserve everything the instruction does not ask you to change.`,
    jsonSchema: {
      type: 'object',
      properties: {
        rationale: { type: 'string', description: 'One sentence on what you changed and why' },
        operations: {
          type: 'array',
          minItems: 1,
          maxItems: 40,
          description: 'The scoped edits to apply, in order',
          items: {
            type: 'object',
            properties: {
              op: {
                type: 'string',
                enum: [
                  'updateText', 'updateFrame', 'updateColour', 'replaceIcon', 'replaceImage',
                  'addElement', 'removeElement', 'reorderZ', 'updateBackground', 'updateOpacity',
                ],
              },
              elementId: { type: 'string', description: 'Target element id (element ops)' },
              pageId: { type: 'string', description: 'Target page id (addElement, updateBackground)' },
              // updateText
              text: { type: 'string' },
              fontFamily: { type: 'string' },
              fontSize: { type: 'number' },
              fontWeight: { type: 'integer' },
              fontStyle: { type: 'string', enum: ['normal', 'italic'] },
              lineHeight: { type: 'number' },
              letterSpacing: { type: 'number' },
              align: { type: 'string', enum: ['left', 'center', 'right'] },
              verticalAlign: { type: 'string', enum: ['top', 'middle', 'bottom'] },
              // updateFrame
              frame: {
                type: 'object',
                properties: {
                  x: { type: 'number' }, y: { type: 'number' },
                  width: { type: 'number' }, height: { type: 'number' },
                  rotation: { type: 'number' },
                },
              },
              // updateColour
              colour: {
                type: 'object',
                description: 'Brand token colour, e.g. {"kind":"token","token":"accent"}',
                properties: { kind: { type: 'string' }, token: { type: 'string' } },
              },
              on: { type: 'string', enum: ['auto', 'fill', 'stroke', 'border', 'text'] },
              // replaceIcon
              iconRef: {
                type: 'object',
                properties: {
                  provider: { type: 'string', enum: ['lucide', 'tabler', 'internal', 'custom'] },
                  name: { type: 'string' },
                },
              },
              // replaceImage
              assetId: { type: 'string' },
              src: { type: 'string' },
              imageQuery: { type: 'string', description: '2-4 word subject; leaves a placeholder for the asset pipeline' },
              // addElement
              element: { type: 'object', description: 'A full element (no id needed); same shapes as design_freeform' },
              // reorderZ
              zIndex: { type: 'integer' },
              // updateBackground
              background: {
                type: 'object',
                description: 'Page background fill (token colour or gradient)',
              },
              // updateOpacity
              opacity: { type: 'number' },
            },
            required: ['op'],
          },
        },
      },
      required: ['operations', 'rationale'],
    },
    render: (input) => {
      const req = input as {
        instruction?: string;
        scope?: string;
        targetIds?: string[];
        lockedElementIds?: string[];
        excerpt?: unknown;
        brand?: unknown;
        violations?: string[];
      };
      const retry = req.violations?.length
        ? `\n\n## Your previous attempt was rejected. Fix these validation errors and resubmit ONLY corrected operations:\n- ${req.violations.join('\n- ')}`
        : '';
      return `Apply this instruction as a SCOPED PATCH — a short list of operations — to the design below.

## Instruction
${req.instruction ?? ''}

## Scope
scope: ${req.scope ?? 'document'} (element = only edit the target ids; page = only edit elements on the target page(s); document = whole design)
targetIds (the ONLY ${req.scope === 'page' ? 'pages' : 'elements'} you may change): ${JSON.stringify(req.targetIds ?? [])}
lockedElementIds (NEVER modify or remove these): ${JSON.stringify(req.lockedElementIds ?? [])}

## Operation vocabulary
- updateText {elementId, text?, fontFamily?, fontSize?, fontWeight?, align?, lineHeight?, letterSpacing?} — text elements only
- updateFrame {elementId, frame:{x?,y?,width?,height?,rotation?}} — move/resize; keep inside 90px safe margins
- updateColour {elementId, colour:{kind:"token",token:"primary|secondary|accent|neutral|background|text"}, on?:"auto|fill|stroke|border|text"} — auto picks the right slot by element type
- replaceIcon {elementId, iconRef:{provider:"lucide",name:"<real lucide name>"}}
- replaceImage {elementId, imageQuery?:"2-4 word subject" | assetId? | src?}
- addElement {pageId, element:{...full element, same JSON shapes as a freeform compose...}}
- removeElement {elementId}
- reorderZ {elementId, zIndex}
- updateBackground {pageId, background:{kind:"token",token:"..."}}
- updateOpacity {elementId, opacity:0..1}

## Hard rules
- Emit the FEWEST operations that satisfy the instruction. Do not restyle things you were not asked to.
- Colours ONLY as brand tokens (never raw hex). Fonts only the brand heading/body fonts.
- Two-tone headline = TWO text elements stacked without overlap (line 2 y = line 1 y + line 1 height).
- Respect min sizes (headline >=24px, body >=14px, caption >=12px) and keep readable text inside safe margins.
- Never target a lockedElementId. Never target an element/page outside targetIds when scope is element/page.

## Design excerpt (ids, types, current values — the target of your edits)
${JSON.stringify(req.excerpt, null, 2)}

## Brand context
${JSON.stringify(req.brand)}${retry}`;
    },
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
