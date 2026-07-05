import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseDesignDocument } from '@brandflow/design-schema';

const SaveBody = z.object({
  name: z.string().min(1).max(120),
  internalDoc: z.unknown(),
  playgroundSource: z.unknown().optional(),
  ideaId: z.string().optional(),
});

export async function designDraftRoutes(app: FastifyInstance) {
  const read = { preHandler: app.tenantGuard({ requires: ['content:read'] }) };
  const edit = { preHandler: app.tenantGuard({ requires: ['design:edit'] }) };

  app.get('/', read, async (req) => {
    return app.prisma.designDraft.findMany({
      where: { clientCompanyId: req.tenant!.clientCompanyId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  });

  app.get('/:id', read, async (req, reply) => {
    const { id } = req.params as { id: string };
    const draft = await app.prisma.designDraft.findFirst({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
    });
    if (!draft) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    return draft;
  });

  app.post('/', edit, async (req, reply) => {
    const body = SaveBody.parse(req.body);
    const doc = parseDesignDocument(body.internalDoc); // never store an invalid document

    // One design per idea: saving again for the same idea updates the
    // existing draft, so the user always returns to their exact design.
    if (body.ideaId) {
      const existing = await app.prisma.designDraft.findFirst({
        where: { ideaId: body.ideaId, clientCompanyId: req.tenant!.clientCompanyId },
      });
      if (existing) {
        const updated = await app.prisma.designDraft.update({
          where: { id: existing.id },
          data: {
            name: body.name,
            internalDoc: doc as object,
            playgroundSource: (body.playgroundSource ?? undefined) as object | undefined,
          },
        });
        return reply.code(200).send(updated);
      }
    }

    const draft = await app.prisma.designDraft.create({
      data: {
        organisationId: req.tenant!.organisationId,
        clientCompanyId: req.tenant!.clientCompanyId,
        ideaId: body.ideaId,
        name: body.name,
        internalDoc: doc as object,
        playgroundSource: (body.playgroundSource ?? undefined) as object | undefined,
        createdById: req.tenant!.userId,
      },
    });
    return reply.code(201).send(draft);
  });

  app.put('/:id', edit, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = SaveBody.parse(req.body);
    const doc = parseDesignDocument(body.internalDoc);
    const updated = await app.prisma.designDraft.updateMany({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
      data: {
        name: body.name,
        internalDoc: doc as object,
        playgroundSource: (body.playgroundSource ?? undefined) as object | undefined,
      },
    });
    if (updated.count === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    return { ok: true };
  });

  app.delete('/:id', edit, async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = await app.prisma.designDraft.deleteMany({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
    });
    if (deleted.count === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    return { ok: true };
  });
}
