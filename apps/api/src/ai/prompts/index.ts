/**
 * Versioned prompt templates, one per pipeline step.
 * Templates are provider-neutral; the adapter owns model selection.
 * Full template bodies are developed alongside golden-fixture tests
 * (docs/13-testing-strategy.md §3); the design_fill template below shows
 * the recipe-contract pattern the others follow.
 */
import type { PipelineStep } from '../../ports/index.js';

/** A rendered image to attach to the user message (vision steps only). */
export interface PromptImage {
  /** Raw base64, no data: prefix. */
  base64: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp';
}

export interface PromptTemplate {
  version: string;
  system: string;
  /** JSON Schema for the tool definition (mirrors the step's Zod schema). */
  jsonSchema: Record<string, unknown>;
  render: (input: unknown) => string;
  /**
   * Vision templates only: pull the images out of the step input so the
   * adapter can build a multimodal message. Templates without this stay
   * text-only and the adapters behave exactly as before.
   */
  images?: (input: unknown) => PromptImage[];
}

const BASE_SYSTEM = `You are BrandFlow's content engine. You work for exactly one brand at a time;
the brand context in the user message is the ONLY brand information that exists.
Never invent brand colours, fonts, phrases or facts not present in the context.
Respect every do/don't rule, banned phrase and compliance rule.
Always respond via the submit_result tool with JSON matching its schema exactly.`;

function template(partial: Omit<PromptTemplate, 'system'> & { system?: string }): PromptTemplate {
  return { system: partial.system ?? BASE_SYSTEM, ...partial };
}

/** One rubric criterion: a 1-5 score plus the one line that justifies it. */
function criterionSchema(description: string): Record<string, unknown> {
  return {
    type: 'object',
    description,
    properties: {
      score: { type: 'integer', minimum: 1, maximum: 5 },
      note: { type: 'string', maxLength: 200, description: 'One line justifying the score, describing what is actually on the page' },
    },
    required: ['score', 'note'],
  };
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
    version: 'design_freeform@5',
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

## Visual benchmark (memorise)
Match the craft of bold B2B LinkedIn carousels like 29FORWARD Australia: strong headline treatments that VARY from post to post, FLAT CARTOON CHARACTER illustrations as the hero visual, layered colour blocks, and charts when numbers matter. Do NOT default to a lonely Lucide icon as the hero — that looks sparse and template-y. No two posts should share the same composition or headline treatment.

## Element types (exact JSON shapes)
- TEXT: {"type":"text","text":"...","frame":{"x":0,"y":0,"width":0,"height":0,"rotation":0},"fontFamily":"<heading-or-body font>","fontSize":48,"fontWeight":800,"lineHeight":1.15,"align":"left|center|right","colour":{"kind":"token","token":"text"},"zIndex":5,"roleHint":"headline|subheadline|body|caption|cta|badge|data|decoration"}
- IMAGE (PREFERRED hero visual — a licensed flat illustration or photo is fetched for you): {"type":"image","frame":{...},"fit":"contain","cornerRadius":16,"isPlaceholder":true,"imageQuery":"<2-5 word subject>","zIndex":3,"roleHint":"image"} — ALWAYS include imageQuery. Use fit "contain" for illustrations (characters/scenes/charts); "cover" only for photos.
- ICON (supporting symbols only, NOT the main hero): {"type":"icon","iconRef":{"provider":"lucide","name":"trophy"},"frame":{...},"colour":{"kind":"token","token":"accent"},"strokeWidth":1.5,"zIndex":3,"roleHint":"icon|decoration"}
- SHAPE: {"type":"shape","shape":"rect|ellipse|line|triangle|arrow","frame":{...},"fill":{"kind":"token","token":"primary"},"cornerRadius":24,"zIndex":1,"roleHint":"decoration|badge"} (arrow points right; rotate the frame for other directions; opacity 0.06-0.15 on big shapes makes soft background blobs)
- CHART (real data viz): {"type":"chart","chartType":"bar|donut|progress|stat","data":[{"label":"Before","value":38},{"label":"After","value":82}],"palette":[{"category":"colour","token":"primary"},{"category":"colour","token":"accent"}],"frame":{...},"zIndex":4}

## imageQuery vocabulary (the asset pipeline matches these keywords)
Pick queries from this vocabulary so the right flat illustration is found:
- People/characters: "qa tester bug", "developer coding", "team huddle", "person thinking", "person celebrating", "person presenting", "manager pointing", "mentor coaching", "data analyst", "diverse team", "customer support", "remote worker", "person stressed", "two people debate"
- Charts/process: "growth chart", "funnel chart", "before after bars", "maturity ladder", "process flow", "kpi gauge", "analytics dashboard", "timeline milestones", "comparison scales", "warning alert"
- Metaphors: "rocket launch", "bright idea", "secure shield", "handshake deal", "bridge gap", "broken chain", "target goal", "checklist", "connected network", "audience reach"
You may combine 2-4 words (e.g. "team celebrating win", "qa root cause"). Prefer character/scene queries over abstract nouns.

## Composition craft
- HERO = IMAGE: every cover/key page should place ONE large illustration image (420-560px wide, fit contain) as the visual anchor — usually a flat character or scene. Soft accent ellipse or colour panel behind it. Support with 1-3 small Lucide icons (48-96px) and accent dots — icons are garnish, not the main art.
- HEADLINE TREATMENT — choose ONE per page and vary across the carousel (two-tone is one option, never a rule): (a) solid single-colour headline; (b) TWO-TONE stacked — two text elements WITHOUT OVERLAP, element 2's frame.y MUST equal element 1's frame.y + element 1's frame.height, shared x and width, line 1 token text, line 2 token primary; (c) small uppercase kicker line in accent above a solid headline; (d) headline sitting on a filled colour panel or band.
- NO TEXT OVERLAPS ANYTHING: every text frame must be at least 16px clear of every other text/icon/image frame; when text sits on a busy area, put an opaque rect panel (zIndex below the text) behind it.
- Use ARROWS and LINES to connect ideas (before -> after, problem -> fix); rotate arrows via frame.rotation.
- Use CHART elements whenever concrete numbers appear — bar for before/after, donut for a share, progress for a percentage, stat for one big number. You may ALSO place an IMAGE with a chart-themed imageQuery as a decorative metaphor beside real chart data.
- COLOUR-BLOCK the canvas: full-width bands, corner panels or diagonal rects (rotation ±6) in primary/accent behind sections; put text ON these blocks with contrasting token colours.
- Numbered chips (small accent circles + white numeral) for list points; badge pills (rounded rect + short uppercase text) for labels like "GUIDE" or "NEW".
- Aim for 14-30 elements per page with deliberate zIndex layering (background blobs 0-1, panels 2, illustration/image 3-5, text 6+). Vary alignment per page: left-anchored, centred hero, split halves, diagonal flow.
- Carousel variety: cover = character illustration + a bold headline treatment of your choice; middle pages = chart/process or list; closing = CTA + metaphor illustration. Vary the headline treatment and alignment across pages.

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
- At least ONE image placeholder with imageQuery on every page that is not a pure text/list slide. Cover pages MUST have a character or scene imageQuery.

## Worked example of the expected level (structure only — NEVER copy it)
Page "Cover": background token background; soft accent ellipse (700px, opacity 0.10) top-right; kicker badge; two-tone headline ("STOP BLAMING" + "THE TESTER", 72-84px); HERO IMAGE centre-right 480x360 fit contain imageQuery "qa tester bug"; two small icons (bug, alert-triangle) as garnish; bottom colour band with short supporting line.
Page "Data": diagonal primary band; headline; bar chart Before/After; IMAGE imageQuery "maturity ladder" beside it; numbered chips; CTA pill.

Now design for:
${JSON.stringify(input)}`,
  }),

  // ---------- composition pipeline stage 1 (docs/18 §4) ----------
  design_concept: template({
    version: 'design_concept@1',
    system: `${BASE_SYSTEM}
You are the concept lead on a design team — the person who decides what a page
is ABOUT before anyone draws a rectangle. You do not lay anything out, and you
never mention position, size, font or colour: someone else does that, and they
cannot rescue a weak idea. Your output is the idea and the words, nothing else.`,
    jsonSchema: {
      type: 'object',
      properties: {
        bigIdea: {
          type: 'string',
          maxLength: 220,
          description: 'The single message of the whole post, in ONE sentence. A claim with a subject and a verb, not a topic label.',
        },
        metaphor: {
          type: 'string',
          maxLength: 220,
          description: 'The visual idea carrying the big idea — something a designer could draw or photograph. Specific to this brand and this post.',
        },
        focalPoint: {
          type: 'string',
          maxLength: 60,
          description: 'The one thing that must dominate the page. THREE WORDS OR FEWER, e.g. "the number 4%", "one cracked stopwatch".',
        },
        register: {
          type: 'string',
          enum: ['bold', 'calm', 'urgent', 'playful', 'authoritative'],
          description: 'The emotional key the whole set is played in.',
        },
        signatureMove: {
          type: 'string',
          enum: ['bleed-edge', 'oversized-numeral', 'overlap', 'full-bleed-block', 'crop-circle', 'rule-accent'],
          description: 'EXACTLY ONE move for the set. Not an array. Two moves is noise.',
        },
        pages: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: {
            type: 'object',
            properties: {
              purpose: {
                type: 'string',
                maxLength: 200,
                description: 'What this page does for the reader, one line. Pages must build, not restate.',
              },
              copy: {
                type: 'array',
                minItems: 1,
                maxItems: 8,
                description: 'The actual words that will appear ON this page, in reading order.',
                items: {
                  type: 'object',
                  properties: {
                    role: {
                      type: 'string',
                      enum: ['display', 'headline', 'subhead', 'bodyLarge', 'body', 'caption'],
                      description: 'Type-scale role. At most 4 distinct roles per page; every page needs a display or headline item.',
                    },
                    text: { type: 'string', maxLength: 280 },
                  },
                  required: ['role', 'text'],
                },
              },
            },
            required: ['purpose', 'copy'],
          },
        },
      },
      required: ['bigIdea', 'metaphor', 'focalPoint', 'register', 'signatureMove', 'pages'],
    },
    render: (input) => {
      const req = input as {
        pageCount?: number;
        format?: string;
        violations?: string[];
      };
      const retry = req.violations?.length
        ? `## YOUR PREVIOUS CONCEPT WAS REJECTED
Fix every point below and submit a fresh concept. Do not argue, do not repeat the rejected wording:
- ${req.violations.join('\n- ')}

`
        : '';
      const pages = req.pageCount ?? 1;
      const pageBrief =
        pages > 1
          ? `${pages} pages. Across the set the pages must BUILD — set up, turn, land. Page 1 earns the swipe; the last page asks for something. Never restate the headline on a later page.`
          : `1 page. Everything the reader needs, and nothing else, in one look.`;
      return `${retry}Find the ONE visual idea that carries this post, then write the words page by page.

## What you are deciding
- bigIdea — the single message, in ONE sentence, as a claim. "Most QA teams measure the wrong thing" is a big idea. "QA metrics" is a topic; topics are not ideas.
- metaphor — the VISUAL idea that carries the claim. A concrete object, a scene, or a spatial relationship a designer could draw. TEST IT: if the same metaphor would work unchanged for a different company in a different industry, it is wrong — bin it and write another. A picture that sits politely beside the point is decoration; yours must ARGUE the point.
- focalPoint — the one thing that must dominate, nameable in THREE WORDS OR FEWER. "The number 4%". "One cracked stopwatch". "The empty chair". If you need a sentence, you have not decided yet.
- register — the emotional key: bold, calm, urgent, playful or authoritative.
- signatureMove — exactly one, from the table below.
- pages — purpose plus the on-page copy.

## Where good concepts come from
Take the tension already in the brief and make THAT the picture: the thing the reader will disagree with, the cost nobody budgeted for, the step everyone skips, the gap between what was promised and what happened. If the brief contains a number, that number is a candidate focal point. If it contains a before/after, the contrast IS the concept. Prefer the specific noun in the brief over any abstraction you could invent.

## Rejected on sight — these cost a retry
- Stock phrasing anywhere: "in today's fast-paced world", "in a world where", "let's dive in", "unlock", "supercharge", "elevate", "game-changer", "seamless", "revolutionise", "harness the power of", "the secret to", "at the end of the day", "take it to the next level", "synergy", "leverage" as a verb, "journey" as a metaphor.
- Exhausted metaphors: lightbulb = idea; puzzle piece or jigsaw = fit; handshake = partnership; rocket = growth; iceberg = hidden depth; chess piece = strategy; ladder or staircase = progress; mountain summit or finish line = success; dominoes; gears turning; magnifying glass = insight; maze = confusion; tug of war; needle in a haystack; a growing tree; a team looking at a laptop.
- A metaphor that is really just a description of the copy. "An illustration of a person reviewing metrics" is not a visual idea.

## Signature move — choose exactly ONE for the set
| Move | What it does | Choose it when |
|---|---|---|
| bleed-edge | the element runs past the safe area to the canvas edge | the subject should not be politely contained |
| oversized-numeral | one number set enormous and cropped by the canvas | a single figure IS the story |
| overlap | the element overlaps an adjacent image or block | two things must be read as one |
| full-bleed-block | a colour block spans the full canvas behind content | you are stating a position, or dividing before/after |
| crop-circle | an image masked to a circle larger than its column | one face or object should feel like a spotlight |
| rule-accent | a heavy accent rule anchored to the headline baseline | one line needs a drumbeat under it |
ONE. The compositor executes only the move you name, and a second move reads as noise.

## Pages and copy
- ${pageBrief}
- Copy items are the words that appear ON the page — not the post caption. Each carries a type role: display (one word or a numeral), headline (the hook), subhead (secondary line or slide title), bodyLarge (lead line, pull quote), body (supporting copy, list item), caption (source, label, footnote).
- At most 4 distinct roles on a page, and every page needs at least one display or headline item — the big-to-small gap is where hierarchy comes from.
- Headlines 8 words or fewer. Body items 20 words or fewer. Delete every word that is not load-bearing. Write for a reader scrolling past at speed.
- Copy stays in the brand voice and obeys every banned phrase and compliance rule in the context.

## Brief, brand context and visual direction
${JSON.stringify(input)}`;
    },
  }),

  // ---------- composition pipeline stage 2 (docs/18 §4) ----------
  design_art_direction: template({
    version: 'design_art_direction@3',
    system: `${BASE_SYSTEM}
You are the art director. You compose on a grid and you speak ONLY in grid
cells, emphasis levels and token names. You never emit a pixel, an x/y, a width,
a font size or a colour value — a deterministic compositor turns your plan into
geometry, and anything it cannot place on the grid is rejected outright.
Your job is the structure: what dominates, what recedes, where the eye lands
first and where it is sent next.`,
    jsonSchema: {
      type: 'object',
      properties: {
        pages: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: {
            type: 'object',
            properties: {
              background: {
                type: 'string',
                enum: ['background', 'primary', 'accent', 'text'],
                description: 'Page background, token name only.',
              },
              regions: {
                type: 'array',
                minItems: 2,
                maxItems: 14,
                description: 'At least one region must have role "image" or "chart", unless the page is a deliberate type-only statement — in that case set typeOnlyReason on the page saying why.',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', maxLength: 40, description: 'Short, unique on this page, descriptive: "hook", "big-number", "hero".' },
                    role: {
                      type: 'string',
                      enum: ['kicker', 'headline', 'subhead', 'body', 'stat', 'cta', 'image', 'chart', 'icon', 'block'],
                    },
                    col: {
                      type: 'object',
                      description: 'Grid columns, 1-indexed. start + span - 1 must be <= 12.',
                      properties: {
                        start: { type: 'integer', minimum: 1, maximum: 12 },
                        span: { type: 'integer', minimum: 1, maximum: 12 },
                      },
                      required: ['start', 'span'],
                    },
                    row: {
                      type: 'object',
                      description: 'Grid rows, 1-indexed. start + span - 1 must be <= 16.',
                      properties: {
                        start: { type: 'integer', minimum: 1, maximum: 16 },
                        span: { type: 'integer', minimum: 1, maximum: 16 },
                      },
                      required: ['start', 'span'],
                    },
                    emphasis: {
                      type: 'integer',
                      minimum: 1,
                      maximum: 6,
                      description: 'Type-scale step: 1 display, 2 headline, 3 subhead, 4 bodyLarge, 5 body, 6 caption. Never a font size.',
                    },
                    colour: {
                      type: 'string',
                      enum: ['text', 'primary', 'secondary', 'accent', 'neutral', 'background'],
                      description: 'Token name only. Never a hex value.',
                    },
                    align: { type: 'string', enum: ['left', 'center', 'right'] },
                    contentRef: {
                      type: 'string',
                      maxLength: 8,
                      description: 'Required on text roles: the 0-based index of the copy item on the SAME page of the concept, as a string ("0", "1", "2").',
                    },
                    imageQuery: {
                      type: 'string',
                      maxLength: 60,
                      description: 'Required on image regions: 2-5 words naming a CONCRETE subject that serves the page metaphor — a person, scene, object or named chart type. Never a bare abstract noun like "business", "success" or "technology": those resolve to generic stock.',
                    },
                  },
                  required: ['id', 'role', 'col', 'row', 'emphasis'],
                  additionalProperties: false,
                },
              },
              signatureRegionId: {
                type: 'string',
                maxLength: 40,
                description: 'The id of the ONE region on this page that carries the concept signature move.',
              },
              typeOnlyReason: {
                type: 'string',
                maxLength: 160,
                description: 'ONLY on a page you have deliberately built from type alone, with no image or chart region: a few words saying why art would not help. Omit it on every other page.',
              },
            },
            required: ['background', 'regions', 'signatureRegionId'],
          },
        },
      },
      required: ['pages'],
    },
    render: (input) => {
      const req = input as {
        concept?: {
          bigIdea?: string;
          metaphor?: string;
          focalPoint?: string;
          register?: string;
          signatureMove?: string;
          pages?: { purpose?: string; copy?: { role: string; text: string }[] }[];
        };
        violations?: string[];
      };
      const retry = req.violations?.length
        ? `## YOUR PREVIOUS PLAN WAS REJECTED
Fix every point below and submit a corrected plan for ALL pages:
- ${req.violations.join('\n- ')}

`
        : '';
      const conceptPages = req.concept?.pages ?? [];
      // Number the copy explicitly so contentRef indices are unambiguous.
      const copyTable = conceptPages
        .map((p, i) => {
          const items = (p.copy ?? [])
            .map((c, j) => `  copy[${j}] (${c.role}): ${JSON.stringify(c.text)}`)
            .join('\n');
          return `PAGE ${i + 1} — purpose: ${p.purpose ?? ''}\n${items}`;
        })
        .join('\n\n');
      const move = req.concept?.signatureMove ?? 'bleed-edge';
      return `${retry}Compose this concept on the grid. Emit one plan page per concept page, in order.

## The grid — the only geometry that exists
12 columns x 16 rows inside the safe area.
- col.start 1-12, col.span >= 1, col.start + col.span - 1 <= 12.
- row.start 1-16, row.span >= 1, row.start + row.span - 1 <= 16.
There are no pixels, no x/y, no width/height, no font sizes and no hex colours anywhere in your output. Adding any such field fails the schema and costs a retry. The compositor derives every measurement from these cells and snaps it to an 8px baseline — that is where the alignment guarantee comes from, and it only works if you stay on the grid.

## emphasis IS the type scale — never a size
| emphasis | name | use |
|---|---|---|
| 1 | display | one-word statement, oversized numeral |
| 2 | headline | the main hook |
| 3 | subhead | secondary line, slide title |
| 4 | bodyLarge | lead line, pull quote |
| 5 | body | supporting copy, list item |
| 6 | caption | source, footnote, label |
Hard rules: at most 4 of the 6 levels on any page, and EVERY page must carry at least one region at emphasis 1 or 2. On image, chart, icon and block regions emphasis means visual weight on the same 1-6 scale.

## Colour
background and colour are token NAMES only: text, primary, secondary, accent, neutral, background. On a primary or text background, text regions must be colour "background". Accent is for blocks, rules, icons and big numerals — never for sentences on a light page. Token neutral is for hairlines and small dividers, never a large slab.

## Imagery — every page needs deliberate art, or an explicit reason it does not
At least one region on EVERY page must have role "image" or "chart". A page of type alone can
be the right call — but only when you decide it on purpose, not when imagery simply did not
occur to you. If you make that call, you must say so: give ANY region on that page an id that
set the page's typeOnlyReason to a few words saying why, e.g. "one number is the whole page,
art would compete with it". A page with no image/chart region and no typeOnlyReason is rejected
as an omission, not read as a choice — this is a hard requirement, not a suggestion.
When you do place an image, the imageQuery must argue the metaphor, not label the topic. "business",
"success", "technology", "growth" and other bare abstract nouns resolve to interchangeable stock and
are rejected outright — name a person, a scene, an object or a named chart type instead (see the
vocabulary below and under Regions).

## The rubric you are graded against (stage 4 scores every page 1-5 on it)
1. HIERARCHY — one unmistakable focal point; the eye knows what to read first, second, third. It comes from DRAMATIC size contrast, not many gradual steps. A page whose regions all sit at emphasis 3-5 scores 1.
2. ALIGNMENT — everything relates to a shared structure. Share column edges on purpose; do not scatter starts at random.
3. ACTIVE WHITESPACE — generous, DELIBERATE emptiness, placed where you want it. Note the difference: leftover empty rows at the bottom of a page read as unfinished and score 1; a big quiet block around the focal point is the opposite and scores 5. Occupy at least 12 of the 16 rows on every page.
4. RESTRAINT — few emphasis levels, few colours, consistent spans.
5. CONCEPT — the layout must make the metaphor visible, with the ONE signature move carried by the region you name in signatureRegionId.
6. VARIETY — no two pages in this set may share a structure.

## Compose like an art director, not a template
- DRAMATIC CONTRAST: the focal region should be several times the area of everything supporting it. One emphasis-1 or -2 region spanning 8-12 columns against captions at emphasis 5-6 is a design; four stacked emphasis-3 bands is a form.
- DELIBERATE ASYMMETRY: put the weight off-centre. Do NOT stack full-width (start 1, span 12) bands down the page — that default is exactly what made every earlier post look identical. Split the columns 7/5, 4/8, 3/9. Let a region start at column 5 and run to the edge. Leave a whole column empty as a gutter of air.
- ACTIVE WHITESPACE: decide where the emptiness goes — one large quiet area, never a thin even margin plus a dead band at the bottom.
- DO NOT DEFAULT TO HEADLINE-TOP / IMAGE-RIGHT. Across the set, headlines must sit at different heights: low-left on one page, upper-right on another, centred on a third. If every page opens with its biggest text in rows 1-3, the whole set is rejected.
- Structural starting points — rotate through them, never repeat one, and invent better: full-bleed statement with one line and enormous air; two-column split with the image bleeding an edge; a huge numeral in the top-left quadrant and copy in the lower-right; a horizontal band across the middle with copy above and below; a bottom-anchored stack under a large image; a diagonal reading order from a top-left kicker to a bottom-right CTA.
- LAYERING: block, image and chart regions render BEHIND text. Two TEXT regions must never occupy the same cell — the single exception is the signature region, which may overlap by design.

## The signature move for this set: ${move}
Nominate exactly one region per page in signatureRegionId and leave it room to perform:
- bleed-edge — put the region against an outer column or row so it has an edge to run past.
- oversized-numeral — the region must have role "stat"; give it at least 5 columns and 4 rows, and keep its neighbours quiet.
- overlap — place it adjacent to the image or block it should overlap.
- full-bleed-block — the region must have role "block"; text placed on it must use colour "background".
- crop-circle — the region must have role "image"; give it a roughly square footprint away from the page edge it grows into.
- rule-accent — nominate the headline region and leave one empty row under it.

## Regions
- id: short, unique on the page, descriptive.
- role: kicker | headline | subhead | body | stat | cta | image | chart | icon | block. Every page needs at least one "image" or "chart" region unless the page sets typeOnlyReason.
- contentRef: REQUIRED on kicker, headline, subhead, body, stat and cta. It is the 0-based index of the copy item on the SAME page of the concept, as a string. Place every concept copy item exactly once — do not invent copy and do not drop any.
- imageQuery: REQUIRED on image regions. 2-5 words naming a CONCRETE subject that argues the metaphor — never a bare abstract noun ("business", "success", "technology", "growth" on their own). The asset pipeline matches vocabulary like: "developer coding", "team huddle", "person thinking", "person presenting", "data analyst", "customer support", "growth chart", "funnel chart", "before after bars", "process flow", "analytics dashboard", "timeline milestones", "warning alert", "bright idea", "secure shield", "broken chain", "target goal", "checklist", "connected network". Prefer a character or scene over an abstract noun, and make it serve the metaphor, not just label the topic.
- align: left | center | right. Default left; centring everything is a tell.

## The concept you are laying out
bigIdea: ${JSON.stringify(req.concept?.bigIdea ?? '')}
metaphor: ${JSON.stringify(req.concept?.metaphor ?? '')}
focalPoint: ${JSON.stringify(req.concept?.focalPoint ?? '')} — this is what must dominate every page it appears on
register: ${req.concept?.register ?? ''}
signatureMove: ${move}

## Copy to place (contentRef indices are exactly these)
${copyTable}

## Full input
${JSON.stringify(input)}`;
    },
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
  design_critique: template({
    version: 'design_critique@1',
    system: `You are a senior art director reviewing a rendered page. You are looking at a
picture, not reading code: judge what the eye actually sees. You are honest and specific —
a vague note like "improve the hierarchy" is worthless and counts as a failure to do the job.

You do not redesign. You name what is wrong and prescribe the smallest set of REGION-LEVEL
changes that fixes it. You never emit pixel coordinates, font sizes, hex colours or element
geometry of any kind — regions live on a 12-column x 16-row grid and carry a named type step,
and those are the only levers you have. A page that is already good gets few or no adjustments;
inventing changes to look busy makes the page worse.`,
    jsonSchema: {
      type: 'object',
      properties: {
        scores: {
          type: 'object',
          description: 'All seven rubric criteria, scored 1-5, each with a one-line justification',
          properties: {
            hierarchy: criterionSchema('One unmistakable focal point; dramatic size contrast, not gradual steps'),
            alignment: criterionSchema('Everything relates to a shared structure, visible or not'),
            activeWhitespace: criterionSchema('Generous DELIBERATE emptiness; accidental dead space at the bottom is the failure, not emptiness itself'),
            restraint: criterionSchema('Few sizes, few colours, consistent spacing'),
            concept: criterionSchema('A visual idea carrying the message, not decoration beside it'),
            signatureMove: criterionSchema('Exactly one signature move on the page. Zero is generic, two is noise'),
            variety: criterionSchema('This page is not structured like the other pages in the set'),
          },
          required: ['hierarchy', 'alignment', 'activeWhitespace', 'restraint', 'concept', 'signatureMove', 'variety'],
        },
        biggestProblem: {
          type: 'string',
          maxLength: 300,
          description: 'The SINGLE biggest problem with this page, in one concrete sentence. If the page is genuinely good, say so plainly.',
        },
        verdict: {
          type: 'string',
          enum: ['good', 'generic', 'amateur', 'broken'],
          description: 'good = restraint AND concept. generic = restraint without concept or signature move. amateur = concept without restraint. broken = unreadable or structurally failed.',
        },
        adjustments: {
          type: 'array',
          maxItems: 6,
          description: 'Region-level fixes, most important first. Empty when the page needs no change.',
          items: {
            type: 'object',
            properties: {
              regionId: { type: 'string', description: 'id of a region listed in the plan below' },
              action: {
                type: 'string',
                enum: ['move', 'resize', 'emphasise', 'deemphasise', 'recolour', 'remove'],
              },
              to: {
                type: 'object',
                description: 'Target for move/resize/recolour. Grid cells and token names only — never pixels.',
                properties: {
                  col: {
                    type: 'object',
                    properties: {
                      start: { type: 'integer', minimum: 1, maximum: 12 },
                      span: { type: 'integer', minimum: 1, maximum: 12 },
                    },
                  },
                  row: {
                    type: 'object',
                    properties: {
                      start: { type: 'integer', minimum: 1, maximum: 16 },
                      span: { type: 'integer', minimum: 1, maximum: 16 },
                    },
                  },
                  colour: {
                    type: 'string',
                    enum: ['text', 'primary', 'secondary', 'accent', 'neutral', 'background'],
                  },
                  align: { type: 'string', enum: ['left', 'center', 'right'] },
                  emphasis: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 6,
                    description: 'Type-scale STEP (1 display .. 6 caption), not a font size. Optional: emphasise/deemphasise move one step by default.',
                  },
                },
              },
              why: { type: 'string', maxLength: 200, description: 'One line: what the eye sees now, and what this fixes' },
            },
            required: ['regionId', 'action', 'why'],
          },
        },
      },
      required: ['scores', 'biggestProblem', 'verdict', 'adjustments'],
    },
    images: (input) => {
      const req = input as { image?: PromptImage };
      return req.image ? [req.image] : [];
    },
    render: (input) => {
      const req = input as {
        format?: string;
        pageIndex?: number;
        pageCount?: number;
        purpose?: string;
        bigIdea?: string;
        signatureMove?: string;
        signatureRegionId?: string;
        background?: string;
        regions?: unknown[];
        otherPages?: string[];
        occupancy?: {
          coveragePercent: number;
          topRow: number;
          bottomRow: number;
          emptyRowsBelow: number;
          emptyRowsAbove: number;
        };
        renderNotes?: string[];
      };
      const page = `page ${(req.pageIndex ?? 0) + 1} of ${req.pageCount ?? 1}`;
      const notes = req.renderNotes?.length
        ? `\n## Render caveats — do NOT mark the design down for these
${req.renderNotes.map((n) => `- ${n}`).join('\n')}`
        : '';
      const set = req.otherPages?.length
        ? `\n## The other pages in this set (for criterion 7 only)
${req.otherPages.map((p, i) => `- page ${i + 1}: ${p}`).join('\n')}`
        : '';
      const occ = req.occupancy
        ? `\n## Measured coverage — these are FACTS, not impressions. Do not re-estimate them by eye.
The grid is 16 rows tall. Content occupies rows ${req.occupancy.topRow}-${req.occupancy.bottomRow}, i.e. ${req.occupancy.coveragePercent}% of the page height.
Empty rows above the content: ${req.occupancy.emptyRowsAbove}. Empty rows below the content: ${req.occupancy.emptyRowsBelow}.
The target is at least 75% coverage with no accidental dead band.
${req.occupancy.emptyRowsBelow >= 3 ? `>>> ${req.occupancy.emptyRowsBelow} of 16 rows at the BOTTOM of this page are empty. That is the accidental dead space described above, and it is the failure this pipeline exists to fix. Score criterion 3 accordingly — 2 or lower unless you can point to a specific compositional reason the page ends where it does. Do not describe it as breathing room.` : `Coverage is within tolerance; judge whitespace on how deliberate it looks, not on how much there is.`}`
        : '';

      return `Critique the rendered page in the image. It is ${page}${req.format ? ` of a ${req.format}` : ''}.

## The rubric — score every criterion 1-5

GOOD (all four are gradeable):

1. **Hierarchy** — one unmistakable focal point; the eye knows what to read first, second, third. Comes from *dramatic* size contrast, not many gradual steps.
2. **Alignment** — everything relates to a shared structure, visible or not.
3. **Active whitespace** — generous, *deliberate* emptiness. Note the distinction: the failure in the assessed posts was accidental empty space at the bottom, which reads as unfinished. Intentional negative space around a focal point is the opposite, and is good.
4. **Restraint** — few sizes, few colours, consistent spacing.

DISTINCTIVE (what stops it being generic):

5. **A concept** — a visual idea carrying the message, not decoration beside it.
6. **Exactly one signature move per page** — an oversized numeral cropped by the edge, type overlapping an image, a colour block running off-canvas. One. Two is noise.
7. **Variety across a set** — no two pages in a carousel, and no two posts in a brand's feed, structured alike.

Generic = restraint without concept or signature move. Amateur = concept without restraint.

## What "active whitespace" means here — read this twice
Do NOT simply demand the page be filled. Emptiness around the focal point is the design working.
Score criterion 3 DOWN only for space that reads as *accidental*: a dead band across the bottom
where the content ran out, an orphaned strip beside a column, margins that are unequal by mistake.
Score it UP for space that is clearly deliberate and doing a job. "Add something to fill the gap"
is the wrong instinct and is how pages become cluttered — if the bottom is dead, the usual fix is
to let the focal region grow into it or to re-balance the existing regions, not to add new ones.

## Scoring
1 = fails badly, 3 = competent but unremarkable, 5 = an art director would ship it unchanged.
Be willing to give 2s. A page where everything scores 4 tells the pipeline nothing.

## Adjustments — the only edits you may prescribe
- move {regionId, to:{col,row}} — put the region in different grid cells
- resize {regionId, to:{col,row}} — change its span
- emphasise / deemphasise {regionId} — step it one place up or down the type scale (add to.emphasis for a specific step)
- recolour {regionId, to:{colour}} — a named brand token
- remove {regionId} — delete the region entirely; use it, clutter is real

The grid is 12 columns across and 16 rows down. col.start/row.start are 1-based.
NEVER return pixels, font sizes, hex colours, or new regions — you cannot add content, only
rearrange, re-rank, recolour and delete what is there. At most 6 adjustments; fewer is better.
If the page is good, return an empty adjustments array and say so in biggestProblem.

## The page plan you are looking at
concept / big idea: ${req.bigIdea ?? '(not supplied)'}
page purpose: ${req.purpose ?? '(not supplied)'}
page background: ${req.background ?? '(not supplied)'}
intended signature move: ${req.signatureMove ?? '(none declared)'} on region "${req.signatureRegionId ?? '(none)'}"
regions (id, role, grid cells, type step):
${JSON.stringify(req.regions ?? [], null, 2)}${occ}${set}${notes}`;
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
