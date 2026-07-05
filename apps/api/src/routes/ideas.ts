import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CONTENT_OBJECTIVES } from '@brandflow/shared';

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  angle: z.string().max(500).optional(),
  objective: z.enum(CONTENT_OBJECTIVES),
  brandProfileId: z.string().optional(),
  sourceMaterial: z.unknown().optional(),
});

const PatchBody = z.object({
  title: z.string().min(1).max(200).optional(),
  angle: z.string().max(500).optional(),
  objective: z.enum(CONTENT_OBJECTIVES).optional(),
  status: z.enum(['SUGGESTED', 'APPROVED', 'REJECTED', 'EDITED']).optional(),
});

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

  /** AI idea suggestions (docs/08 step 4) — queued; needs ANTHROPIC_API_KEY. */
  app.post('/suggest', generate, async (req, reply) => {
    const job = await app.prisma.generationJob.create({
      data: {
        organisationId: req.tenant!.organisationId,
        clientCompanyId: req.tenant!.clientCompanyId,
        kind: 'post_ideas',
        input: (req.body ?? {}) as object,
      },
    });
    // TODO(queue): enqueue BullMQ 'ai-generation' job with job.id
    return reply.code(202).send({ jobId: job.id });
  });
}
