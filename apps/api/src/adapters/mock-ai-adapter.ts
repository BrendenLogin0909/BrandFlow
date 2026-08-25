/**
 * MockAiAdapter — AiProviderPort fallback used when ANTHROPIC_API_KEY is not
 * configured. Returns plausible canned output (validated against the same
 * schemas) so the product flow is fully testable offline; responses are
 * flagged so the UI can label them as samples.
 */
import type { z } from 'zod';
import type { AiCompletionMeta, AiProviderPort, PipelineStep } from '../ports/index.js';

const IDEA_TEMPLATES = [
  { title: 'The real cost of {theme} nobody budgets for', angle: 'Contrarian cost breakdown with one hard number per point', objective: 'educational' },
  { title: 'What we learned shipping {theme} for 12 months', angle: 'Founder retrospective, honest about the misses', objective: 'founder_insight' },
  { title: '{theme}: 5 signs you are doing it backwards', angle: 'Checklist of anti-patterns the audience will recognise', objective: 'thought_leadership' },
  { title: 'Stop measuring {theme} by activity', angle: 'Argue outcomes over output; propose one better metric', objective: 'industry_commentary' },
  { title: 'A before/after story from a recent {theme} project', angle: 'Anonymised client result with a concrete stat', objective: 'case_study' },
  { title: 'The 10-minute {theme} audit anyone can run', angle: 'Actionable micro-framework, save-worthy', objective: 'educational' },
  { title: 'Why we say no to some {theme} work', angle: 'Positioning through standards; builds trust', objective: 'thought_leadership' },
  { title: 'Three questions to ask before starting {theme}', angle: 'Buyer-enablement angle for decision makers', objective: 'educational' },
  { title: 'The myth slowing down your {theme} results', angle: 'Myth vs reality format, punchy', objective: 'industry_commentary' },
  { title: 'Meet the team behind our {theme} practice', angle: 'Hiring/culture angle with a human face', objective: 'hiring' },
];

const DIRECTION_SUFFIXES = [
  { suffix: 'the contrarian take', angle: 'Argue against the common wisdom; lead with the uncomfortable truth' },
  { suffix: 'the story version', angle: 'Tell it through one concrete anecdote with a person, a problem and a number' },
];

// ---------- composition pipeline stages 1 + 2 (docs/18 §4) ----------

/** Concept-page purposes: open, turn, land — a set that builds. */
const CONCEPT_PURPOSES = [
  'Stop the scroll and state the claim',
  'Show the cost in one number',
  'Name the move that changes it',
  'Answer the objection the reader is already making',
  'Ask for the next step',
];

/** Copy-role → region role + type-scale step, mirroring the real stage 2. */
const REGION_BY_TYPE_ROLE: Record<string, { role: string; emphasis: number }> = {
  display: { role: 'stat', emphasis: 1 },
  headline: { role: 'headline', emphasis: 2 },
  subhead: { role: 'subhead', emphasis: 3 },
  bodyLarge: { role: 'body', emphasis: 4 },
  body: { role: 'body', emphasis: 5 },
  caption: { role: 'kicker', emphasis: 6 },
};

const MOCK_TEXT_ROLES = ['kicker', 'headline', 'subhead', 'body', 'stat', 'cta'];

/** Three genuinely different skeletons — the plan must not repeat a structure. */
const MOCK_SKELETONS = [
  { textCol: { start: 1, span: 7 }, textTop: 8, imgCol: { start: 8, span: 5 }, imgRow: { start: 2, span: 6 }, bg: 'background' },
  { textCol: { start: 5, span: 8 }, textTop: 1, imgCol: { start: 1, span: 4 }, imgRow: { start: 8, span: 7 }, bg: 'background' },
  { textCol: { start: 2, span: 10 }, textTop: 6, imgCol: { start: 1, span: 12 }, imgRow: { start: 1, span: 5 }, bg: 'primary' },
];

const MOVE_NEEDS_ROLE: Record<string, string> = {
  'oversized-numeral': 'stat',
  'crop-circle': 'image',
  'full-bleed-block': 'block',
  'rule-accent': 'headline',
};

type MockRegion = {
  id: string;
  role: string;
  col: { start: number; span: number };
  row: { start: number; span: number };
  emphasis: number;
  colour?: string;
  align?: string;
  contentRef?: string;
  imageQuery?: string;
};

/** One plan page for one concept page. Grid cells only — never a pixel. */
function mockLayoutPage(copy: { role: string; text: string }[], i: number, move: string) {
  const skel = MOCK_SKELETONS[i % MOCK_SKELETONS.length]!;
  const onDarkBg = skel.bg === 'primary' || skel.bg === 'text';
  const textColour = onDarkBg ? 'background' : 'text';
  const n = Math.max(copy.length, 1);
  const avail = 17 - skel.textTop;
  const tailSpan = avail - 2 * (n - 1) >= 2 ? 2 : 1;
  const heroSpan = Math.max(1, avail - tailSpan * (n - 1));

  // The band's cells are a function of the page index, so no two pages in a
  // set ever share a structural fingerprint.
  const block: MockRegion = {
    id: 'band',
    role: 'block',
    col: { start: 1, span: 12 },
    row: { start: 1 + Math.floor(i / 4), span: 2 + (i % 4) },
    emphasis: 3,
    colour: 'accent',
  };
  const image: MockRegion = {
    id: 'hero-image',
    role: 'image',
    col: skel.imgCol,
    row: skel.imgRow,
    emphasis: 2,
    imageQuery: 'team reviewing dashboard',
  };
  const regions: MockRegion[] = [block, image];

  let y = skel.textTop;
  copy.forEach((c, j) => {
    const map = REGION_BY_TYPE_ROLE[c.role] ?? { role: 'body', emphasis: 5 };
    const span = j === 0 ? heroSpan : tailSpan;
    regions.push({
      id: j === 0 ? 'focal' : `copy-${j}`,
      role: map.role,
      col: skel.textCol,
      row: { start: y, span },
      // the focal region carries the step-1-or-2 element every page needs
      emphasis: j === 0 ? Math.min(map.emphasis, 2) : map.emphasis,
      colour: textColour,
      align: 'left',
      contentRef: String(j),
    });
    y += span;
  });

  // At most 4 of the 6 type steps on a page (docs/18 §3).
  const text = regions.filter((r) => MOCK_TEXT_ROLES.includes(r.role));
  const steps = [...new Set(text.map((r) => r.emphasis))].sort((a, b) => a - b);
  if (steps.length > 4) {
    const keep = steps.slice(0, 4);
    for (const r of text) if (!keep.includes(r.emphasis)) r.emphasis = keep[3]!;
  }

  // Nominate a region the compositor can actually perform the move on.
  const need = MOVE_NEEDS_ROLE[move];
  let signatureRegionId = image.id;
  if (need) {
    const found = regions.find((r) => r.role === need);
    const focal = regions.find((r) => r.id === 'focal');
    if (found) signatureRegionId = found.id;
    else if (focal && (need === 'stat' || need === 'headline')) {
      focal.role = need;
      signatureRegionId = focal.id;
    } else if (need === 'block') signatureRegionId = block.id;
  }

  return { background: skel.bg, regions, signatureRegionId };
}

export class MockAiAdapter implements AiProviderPort {
  async complete<T>(
    step: PipelineStep,
    input: unknown,
    schema: z.ZodType<T>,
  ): Promise<{ data: T; meta: AiCompletionMeta }> {
    const raw = this.generate(step, input);
    const data = schema.parse(raw);
    return { data, meta: { model: 'mock', promptVersion: `${step}@mock`, tokensUsed: 0 } };
  }

  private generate(step: PipelineStep, input: unknown): unknown {
    const req = (input ?? {}) as {
      theme?: string;
      topics?: string[];
      count?: number;
      expandFrom?: { title: string; angle?: string | null }[];
    };

    if (step === 'post_ideas') {
      if (req.expandFrom?.length) {
        return {
          ideas: req.expandFrom.flatMap((idea, parentIndex) =>
            DIRECTION_SUFFIXES.map((d) => ({
              title: `${idea.title} — ${d.suffix}`,
              angle: d.angle,
              objective: 'thought_leadership',
              score: 0.7,
              parentIndex,
            })),
          ),
        };
      }
      const topics = req.topics?.length ? req.topics : [req.theme?.trim() || 'your core service'];
      const count = Math.min(Math.max(req.count ?? 5, 1), 10);
      return {
        // one topic → whole batch on it; several → cycled across the batch
        ideas: Array.from({ length: count }, (_, i) => {
          const t = IDEA_TEMPLATES[i % IDEA_TEMPLATES.length]!;
          const topic = topics[i % topics.length]!;
          return {
            title: t.title.replaceAll('{theme}', topic),
            angle: t.angle,
            objective: t.objective,
            score: 0.75 - i * 0.03,
          };
        }),
      };
    }

    if (step === 'post_copy') {
      const r = (input ?? {}) as {
        idea?: { title?: string };
        direction?: string;
        brand?: { companyName?: string };
      };
      const title = r.idea?.title ?? 'Your topic';
      const flavour = r.direction?.includes('story') ? 'Here is what actually happened.' : 'Everyone gets this backwards.';
      return {
        hooks: [
          `${title} — ${flavour}`,
          `The uncomfortable truth about ${title.toLowerCase()}`,
          `We changed how we think about ${title.toLowerCase()}. Results below.`,
        ],
        mainText: `${flavour}\n\n${title} is not about doing more — it is about doing the right things in the right order.\n\nThree things we see work:\n1. Start from outcomes, not activity.\n2. Make the invisible visible with one simple metric.\n3. Review weekly, adjust monthly.\n\nThe teams that do this consistently outperform the ones chasing tools.`,
        shortVersion: `${title}: start from outcomes, measure one thing, review weekly. That is the whole playbook.`,
        cta: 'What would you add? Tell us in the comments.',
        hashtags: ['#QualityEngineering', '#Leadership', '#ContinuousImprovement'],
        firstComment: 'We wrote a longer breakdown of this framework — happy to share it, just ask below.',
        suggestedVisualFormat: 'carousel',
        onImageText: {
          headline: title.slice(0, 90),
          support: 'Three moves that change the outcome',
          badge: 'GUIDE',
        },
        slides: [
          { title: 'Start from outcomes', body: 'Define what better looks like before touching tools.', iconName: 'target' },
          { title: 'Make it visible', body: 'One simple metric everyone can see beats ten dashboards.', iconName: 'eye' },
          { title: 'Review weekly', body: 'Small consistent corrections outperform big resets.', iconName: 'calendar-check' },
        ],
        altText: `Carousel about ${title}: three practical steps with icons.`,
        visualDirection: {
          scene: `Flat illustration of a team reviewing a simple dashboard beside ${title.toLowerCase()}`,
          metaphor: 'Clarity emerging from chaos — one metric cutting through noise',
          mood: 'Bold, confident, approachable',
          compositionHints: 'Two-tone headline upper-left; hero illustration centre-right; accent pill badge; numbered chips bottom-left with arrow to hero',
          colourMood: 'Primary headline + accent highlights on soft background',
          illustrationStyle: 'Flat vector characters, minimal scene, LinkedIn carousel craft',
        },
      };
    }

    if (step === 'design_patch') {
      const r = (input ?? {}) as {
        instruction?: string;
        targetIds?: string[];
        excerpt?: { elements?: { id: string; type: string }[] };
        violations?: string[];
      };
      const instruction = (r.instruction ?? '').toLowerCase();
      // pick a target: first requested id, else first element in the excerpt
      const firstText = r.excerpt?.elements?.find((e) => e.type === 'text');
      const targetId = r.targetIds?.[0] ?? firstText?.id ?? r.excerpt?.elements?.[0]?.id;
      const operations: Record<string, unknown>[] = [];
      if (targetId) {
        if (/colou?r|accent|primary|secondary/.test(instruction)) {
          const token = instruction.includes('primary')
            ? 'primary'
            : instruction.includes('secondary')
              ? 'secondary'
              : 'accent';
          operations.push({ op: 'updateColour', elementId: targetId, colour: { kind: 'token', token }, on: 'auto' });
        } else {
          // default: rewrite the target's text (sample edit)
          operations.push({
            op: 'updateText',
            elementId: targetId,
            text: (r.instruction ?? 'Updated by AI').slice(0, 80) || 'Updated by AI',
          });
        }
      } else {
        operations.push({ op: 'updateOpacity', elementId: 'none', opacity: 1 });
      }
      return { operations, rationale: `Sample scoped edit for: ${r.instruction ?? 'instruction'}` };
    }

    if (step === 'design_concept') {
      const r = (input ?? {}) as {
        brief?: { idea?: { title?: string }; title?: string; onImageText?: { headline?: string } };
        pageCount?: number;
      };
      const rawTitle =
        r.brief?.onImageText?.headline ?? r.brief?.idea?.title ?? r.brief?.title ?? 'the work nobody counts';
      // strip terminal punctuation: bigIdea has to stay one sentence
      const topic = rawTitle.replace(/[.!?]+/g, ' ').replace(/\s+/g, ' ').trim() || 'the work nobody counts';
      const headline = topic.split(' ').slice(0, 8).join(' ');
      const subject = headline.toLowerCase();
      const pages = Math.min(Math.max(r.pageCount ?? 3, 1), 20);

      const page = (idx: number) => {
        if (idx === 0)
          return {
            purpose: CONCEPT_PURPOSES[0],
            copy: [
              { role: 'headline', text: headline },
              { role: 'body', text: `Nobody argues with ${subject}. They just stop measuring it.` },
            ],
          };
        if (idx === pages - 1)
          return {
            purpose: CONCEPT_PURPOSES[4],
            copy: [
              { role: 'headline', text: 'Measure the part that hurts' },
              { role: 'body', text: 'Pick one number this week and put it where the whole team can see it.' },
            ],
          };
        return {
          purpose: CONCEPT_PURPOSES[1 + ((idx - 1) % 3)],
          copy: [
            { role: 'display', text: `${38 + idx}%` },
            { role: 'subhead', text: 'of the cost lands after everyone has signed off' },
            { role: 'body', text: `The number nobody puts in the plan is the one that decides ${subject}.` },
          ],
        };
      };

      return {
        bigIdea: `The cost of ${subject} shows up long after anyone is still measuring it`,
        metaphor: 'A stopwatch still running on an empty desk after the meeting has moved on',
        focalPoint: 'one running stopwatch',
        register: 'bold',
        // exactly one — a stat-led set when the brief carries a number
        signatureMove: /\d/.test(JSON.stringify(r.brief ?? '')) ? 'oversized-numeral' : 'full-bleed-block',
        pages: Array.from({ length: pages }, (_, i) => page(i)),
      };
    }

    if (step === 'design_art_direction') {
      const r = (input ?? {}) as {
        concept?: { signatureMove?: string; pages?: { copy?: { role: string; text: string }[] }[] };
      };
      const move = r.concept?.signatureMove ?? 'bleed-edge';
      const conceptPages = r.concept?.pages?.length
        ? r.concept.pages
        : [{ copy: [{ role: 'headline', text: 'Sample page' }] }];
      return { pages: conceptPages.map((p, i) => mockLayoutPage(p.copy ?? [], i, move)) };
    }

    throw new Error(`MockAiAdapter has no canned output for step "${step}"`);
  }
}
