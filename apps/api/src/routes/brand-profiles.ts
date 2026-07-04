import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const CreateBody = z.object({ name: z.string().min(1) });
const ApproveBody = z.object({
  decision: z.enum(['APPROVED', 'CHANGES_REQUESTED']),
  note: z.string().optional(),
});

export async function brandProfileRoutes(app: FastifyInstance) {
  const read = { preHandler: app.tenantGuard({ requires: ['brand:read'] }) };
  const manage = { preHandler: app.tenantGuard({ requires: ['brand:manage'] }) };
  const approve = { preHandler: app.tenantGuard({ requires: ['brand:approve'] }) };

  app.get('/', read, async (req) => {
    return app.prisma.brandProfile.findMany({
      where: { clientCompanyId: req.tenant!.clientCompanyId },
      include: { brandKit: true, pillars: true, audiences: true },
    });
  });

  app.post('/', manage, async (req, reply) => {
    const body = CreateBody.parse(req.body);
    const profile = await app.prisma.brandProfile.create({
      data: {
        organisationId: req.tenant!.organisationId,
        clientCompanyId: req.tenant!.clientCompanyId,
        name: body.name,
      },
    });
    return reply.code(201).send(profile);
  });

  app.get('/:id', read, async (req, reply) => {
    const { id } = req.params as { id: string };
    const profile = await app.prisma.brandProfile.findFirst({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
      include: { brandKit: true, styleGuide: true, voiceProfile: true, pillars: true, audiences: true },
    });
    if (!profile) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    return profile;
  });

  app.post('/:id/submit', manage, async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await app.prisma.brandProfile.updateMany({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId, status: { in: ['DRAFT', 'CHANGES_REQUESTED'] } },
      data: { status: 'PENDING_APPROVAL' },
    });
    if (result.count === 0) return reply.code(409).send({ error: { code: 'ILLEGAL_TRANSITION' } });
    return { status: 'PENDING_APPROVAL' };
  });

  // Gate 1 — brand approval
  app.post('/:id/approve', approve, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = ApproveBody.parse(req.body);

    const profile = await app.prisma.brandProfile.findFirst({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId, status: 'PENDING_APPROVAL' },
    });
    if (!profile) return reply.code(409).send({ error: { code: 'NOT_PENDING_APPROVAL' } });

    const status = body.decision === 'APPROVED' ? 'APPROVED' : 'CHANGES_REQUESTED';
    await app.prisma.$transaction([
      app.prisma.brandProfile.update({
        where: { id },
        data: {
          status,
          approvedById: body.decision === 'APPROVED' ? req.tenant!.userId : null,
          approvedAt: body.decision === 'APPROVED' ? new Date() : null,
        },
      }),
      app.prisma.approvalRecord.create({
        data: {
          organisationId: req.tenant!.organisationId,
          clientCompanyId: req.tenant!.clientCompanyId,
          entityType: 'BRAND_PROFILE',
          entityId: id,
          gate: 1,
          decision: body.decision,
          decidedById: req.tenant!.userId,
          note: body.note,
        },
      }),
    ]);
    return { status };
  });

  // AI-assisted draft (queued job; see docs/08-ai-workflow-design.md steps 1-2)
  app.post('/:id/analyze', manage, async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = await app.prisma.generationJob.create({
      data: {
        organisationId: req.tenant!.organisationId,
        clientCompanyId: req.tenant!.clientCompanyId,
        kind: 'brand_analysis',
        input: { brandProfileId: id, sources: req.body ?? {} },
      },
    });
    // TODO(queue): enqueue BullMQ 'ai-generation' job with job.id
    return reply.code(202).send({ jobId: job.id });
  });
}
