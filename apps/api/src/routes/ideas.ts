import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CONTENT_OBJECTIVES } from '@brandflow/shared';
import { activeProviderName, getAiProvider } from '../ai/provider.js';

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  angle: z.string().max(500).optional(),
  objective: z.enum(CONTENT_OBJECTIVES),
  brandProfileId: z.string().optional(),
  sourceMaterial: z.unknown().optional(),
});

const GeneratedIdea = z.object({
  title: z.string().min(1).max(200),
  angle: z.string().max(500).optional(),
  objective: z.enum(CONTENT_OBJECTIVES),
  score: z.number().min(0).max(1).optional(),
});
const GeneratedIdeas = z.object({ ideas: z.array(GeneratedIdea).min(1).max(24) });

const SuggestBody = z.object({
  /** Brand topics (content pillars) to generate around: one topic focuses
   *  the whole batch on it; several spread ideas across them for variety. */
  topics: z.array(z.string().min(1).max(80)).max(12).optional(),
  theme: z.string().max(300).optional(),
  count: z.number().int().min(1).max(10).default(5),
});

const BulkBody = z.object({ ideas: z.array(GeneratedIdea).min(1).max(24) });

const ExpandBody = z.object({ ideaIds: z.array(z.string()).min(1).max(10) });

const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  angle: z.string().max(500).optional(),
  objective: z.enum(CONTENT_OBJECTIVES).optional(),
  status: z.enum(['SUGGESTED', 'APPROVED', 'REJECTED', 'EDITED']).optional(),
});

/** Recent titles (any status, incl. rejected) so the AI avoids re-treading old ground. */
async function recentIdeaTitles(app: FastifyInstance, clientCompanyId: string): Promise<string[]> {
  const rows = await app.prisma.postIdea.findMany({
    where: { clientCompanyId },
    orderBy: { createdAt: 'desc' },
    take: 150,
    select: { title: true },
  });
  return rows.map((r) => r.title);
}

async function recordJob(
  app: FastifyInstance,
  req: { tenant?: { organisationId: string; clientCompanyId: string } },
  kind: string,
  input: unknown,
  tokensUsed: number,
) {
  await app.prisma.generationJob.create({
    data: {
      organisationId: req.tenant!.organisationId,
      clientCompanyId: req.tenant!.clientCompanyId,
      kind,
      status: 'succeeded',
      input: input as object,
      tokensUsed,
      finishedAt: new Date(),
    },
  });
}

export async function ideaRoutes(app: FastifyInstance) {
  const read = { preHandler: app.tenantGuard({ requires: ['content:read'] }) };
  const edit = { preHandler: app.tenantGuard({ requires: ['content:edit'] }) };
  const generate = { preHandler: app.tenantGuard({ requires: ['content:generate'] }) };

  app.get('/', read, async (req) => {
    const { status } = req.query as { status?: string };
    return app.prisma.postIdea.findMany({
      where: {
        clientCompanyId: req.tenant!.clientCompanyId,
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  });

  app.post('/', edit, async (req, reply) => {
    const body = CreateBody.parse(req.body);
    // Human-captured ideas are born EDITED (already human-owned);
    // AI suggestions arrive as SUGGESTED via the suggest pipeline.
    const idea = await app.prisma.postIdea.create({
      data: {
        organisationId: req.tenant!.organisationId,
        clientCompanyId: req.tenant!.clientCompanyId,
        brandProfileId: body.brandProfileId,
        title: body.title,
        angle: body.angle,
        objective: body.objective,
        sourceMaterial: (body.sourceMaterial ?? undefined) as object | undefined,
        status: 'EDITED',
      },
    });
    return reply.code(201).send(idea);
  });

  app.patch('/:id', edit, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = PatchBody.parse(req.body);
    const updated = await app.prisma.postIdea.updateMany({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
      data: body,
    });
    if (updated.count === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    return app.prisma.postIdea.findUnique({ where: { id } });
  });

  app.delete('/:id', edit, async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = await app.prisma.postIdea.deleteMany({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
    });
    if (deleted.count === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    return { ok: true };
  });

  /**
   * Interactive AI idea batch (docs/08 step 4): returns candidates for the
   * user to tick yes/no — nothing is saved until /bulk. Uses the real
   * provider when ANTHROPIC_API_KEY is set, otherwise labelled samples.
   */
  app.post('/suggest-sync', generate, async (req) => {
    const body = SuggestBody.parse(req.body ?? {});
    const existingTitles = await recentIdeaTitles(app, req.tenant!.clientCompanyId);
    const { data, meta } = await getAiProvider().complete(
      'post_ideas',
      {
        existingTitles,
        topics: body.topics,
        topicInstruction:
          body.topics?.length === 1
            ? `Every idea must centre on the topic "${body.topics[0]}", each from a genuinely different angle.`
            : body.topics?.length
              ? `Spread the ideas across these brand topics (vary which topic each idea draws from): ${body.topics.join(', ')}.`
              : undefined,
        theme: body.theme,
        count: body.count,
        clientCompanyId: req.tenant!.clientCompanyId,
      },
      GeneratedIdeas,
    );
    await recordJob(app, req, 'post_ideas', body, meta.tokensUsed);
    return { ideas: data.ideas.slice(0, body.count), provider: activeProviderName() };
  });

  /** Save the user's selected candidates onto the ideation board. */
  app.post('/bulk', edit, async (req, reply) => {
    const body = BulkBody.parse(req.body);
    await app.prisma.postIdea.createMany({
      data: body.ideas.map((i) => ({
        organisationId: req.tenant!.organisationId,
        clientCompanyId: req.tenant!.clientCompanyId,
        title: i.title,
        angle: i.angle,
        objective: i.objective,
        score: i.score,
        status: 'SUGGESTED' as const,
      })),
    });
    return reply.code(201).send({ added: body.ideas.length });
  });

  /**
   * Further ideation: expand selected ideas into two distinct directions
   * each (a single angle is never enough to choose from). Returns the
   * candidate directions WITHOUT saving — the user curates them in the
   * same tick-to-keep modal as suggestions, then saves via /bulk.
   */
  app.post('/expand-sync', generate, async (req, reply) => {
    const body = ExpandBody.parse(req.body);
    const parents = await app.prisma.postIdea.findMany({
      where: { id: { in: body.ideaIds }, clientCompanyId: req.tenant!.clientCompanyId },
      select: { id: true, title: true, angle: true, objective: true },
    });
    if (parents.length === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });

    const existingTitles = await recentIdeaTitles(app, req.tenant!.clientCompanyId);
    const { data, meta } = await getAiProvider().complete(
      'post_ideas',
      { expandFrom: parents, existingTitles, clientCompanyId: req.tenant!.clientCompanyId },
      GeneratedIdeas,
    );
    await recordJob(app, req, 'post_ideas', { expand: body.ideaIds }, meta.tokensUsed);
    return { ideas: data.ideas, provider: activeProviderName() };
  });
}
