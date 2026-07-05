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
          ideas: req.expandFrom.flatMap((idea) =>
            DIRECTION_SUFFIXES.map((d) => ({
              title: `${idea.title} — ${d.suffix}`,
              angle: d.angle,
              objective: 'thought_leadership',
              score: 0.7,
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

    throw new Error(`MockAiAdapter has no canned output for step "${step}"`);
  }
}
