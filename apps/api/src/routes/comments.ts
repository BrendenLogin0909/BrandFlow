import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const ListQuery = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
});

const CreateBody = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  body: z.string().min(1).max(2000),
  elementId: z.string().optional(),
  parentId: z.string().optional(),
});

const PatchCommentBody = z.object({
  resolved: z.boolean().optional(),
  body: z.string().min(1).max(2000).optional(),
});

/** Element-anchored review comments (Agent 12, P5-C). */
export async function commentRoutes(app: FastifyInstance) {
  const read = { preHandler: app.tenantGuard({ requires: ['content:read'] }) };
  const review = { preHandler: app.tenantGuard({ requires: ['content:review'] }) };

  app.get('/', read, async (req) => {
    const q = ListQuery.parse(req.query);
    return app.prisma.comment.findMany({
      where: {
        clientCompanyId: req.tenant!.clientCompanyId,
        entityType: q.entityType,
        entityId: q.entityId,
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  });

  app.post('/', review, async (req) => {
    const body = CreateBody.parse(req.body);
    return app.prisma.comment.create({
      data: {
        organisationId: req.tenant!.organisationId,
        clientCompanyId: req.tenant!.clientCompanyId,
        entityType: body.entityType,
        entityId: body.entityId,
        body: body.body,
        elementId: body.elementId ?? null,
        parentId: body.parentId ?? null,
        authorId: req.tenant!.userId,
      },
    });
  });

  app.patch('/:id', review, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = PatchCommentBody.parse(req.body);
    const updated = await app.prisma.comment.updateMany({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
      data: {
        ...(body.resolved !== undefined ? { resolved: body.resolved } : {}),
        ...(body.body !== undefined ? { body: body.body } : {}),
      },
    });
    if (updated.count === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    return app.prisma.comment.findFirst({ where: { id } });
  });
}
