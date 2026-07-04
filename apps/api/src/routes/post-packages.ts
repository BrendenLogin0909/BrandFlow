import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { canTransition, type WorkflowStatus } from '@brandflow/shared';

const EDITABLE_FIELDS = [
  'internalTitle',
  'mainText',
  'shortVersion',
  'longVersion',
  'cta',
  'hashtags',
  'firstComment',
  'altText',
] as const;

const PatchBody = z
  .object({
    internalTitle: z.string().min(1).optional(),
    mainText: z.string().optional(),
    shortVersion: z.string().optional(),
    longVersion: z.string().optional(),
    cta: z.string().optional(),
    hashtags: z.array(z.string()).optional(),
    firstComment: z.string().optional(),
    altText: z.string().optional(),
  })
  .strict();

const LockBody = z.object({ fields: z.array(z.enum(EDITABLE_FIELDS)).min(1), locked: z.boolean() });
const StatusBody = z.object({ status: z.custom<WorkflowStatus>() });
const ApproveBody = z.object({
  decision: z.enum(['APPROVED', 'CHANGES_REQUESTED']),
  note: z.string().optional(),
});
const RegenerateBody = z.object({
  part: z.enum(['hook', 'cta', 'mainText', 'hashtags', 'firstComment', 'onImageHeadline', 'all'])
    .or(z.string().regex(/^slide:\d+$/)),
});

export async function postPackageRoutes(app: FastifyInstance) {
  const read = { preHandler: app.tenantGuard({ requires: ['content:read'] }) };
  const edit = { preHandler: app.tenantGuard({ requires: ['content:edit'] }) };
  const review = { preHandler: app.tenantGuard({ requires: ['content:review'] }) };
  const approve = { preHandler: app.tenantGuard({ requires: ['content:approve'] }) };
  const generate = { preHandler: app.tenantGuard({ requires: ['content:generate'] }) };

  app.get('/', read, async (req) => {
    const { status, brandProfileId } = req.query as { status?: WorkflowStatus; brandProfileId?: string };
    return app.prisma.postPackage.findMany({
      where: {
        clientCompanyId: req.tenant!.clientCompanyId,
        ...(status ? { status } : {}),
        ...(brandProfileId ? { brandProfileId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  });

  app.get('/:id', read, async (req, reply) => {
    const { id } = req.params as { id: string };
    const pkg = await app.prisma.postPackage.findFirst({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
      include: { visualPackages: { include: { designDocument: { select: { id: true, version: true, validationReport: true } } } }, revisions: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    if (!pkg) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    return pkg;
  });

  /** Edit fields; locked fields reject; every save snapshots a revision. */
  app.patch('/:id', edit, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = PatchBody.parse(req.body);
    const pkg = await app.prisma.postPackage.findFirst({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
    });
    if (!pkg) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });

    const touchedLocked = Object.keys(body).filter((f) => pkg.lockedFields.includes(f));
    if (touchedLocked.length)
      return reply.code(409).send({ error: { code: 'FIELD_LOCKED', fields: touchedLocked } });

    const updated = await app.prisma.$transaction(async (tx) => {
      const u = await tx.postPackage.update({ where: { id }, data: body });
      await tx.revision.create({
        data: { postPackageId: id, snapshot: body as object, createdById: req.tenant!.userId, reason: 'HUMAN_EDIT' },
      });
      return u;
    });
    return updated;
  });

  app.post('/:id/lock', edit, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = LockBody.parse(req.body);
    const pkg = await app.prisma.postPackage.findFirst({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
      select: { lockedFields: true },
    });
    if (!pkg) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });

    const next = new Set(pkg.lockedFields);
    for (const f of body.fields) body.locked ? next.add(f) : next.delete(f);
    await app.prisma.postPackage.update({ where: { id }, data: { lockedFields: [...next] } });
    return { lockedFields: [...next] };
  });

  /** Workflow transitions (submit for review, request changes...); Gate 3 uses /approve. */
  app.post('/:id/status', review, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = StatusBody.parse(req.body);
    if (body.status === 'APPROVED')
      return reply.code(409).send({ error: { code: 'USE_APPROVE_ENDPOINT' } });

    const pkg = await app.prisma.postPackage.findFirst({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
      select: { status: true },
    });
    if (!pkg) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    if (!canTransition(pkg.status as WorkflowStatus, body.status))
      return reply
        .code(409)
        .send({ error: { code: 'ILLEGAL_TRANSITION', from: pkg.status, to: body.status } });

    await app.prisma.postPackage.update({ where: { id }, data: { status: body.status } });
    return { status: body.status };
  });

  /** Gate 3 — package + visual approval. Blocks while the design has validation errors. */
  app.post('/:id/approve', approve, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = ApproveBody.parse(req.body);
    const pkg = await app.prisma.postPackage.findFirst({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
      include: { visualPackages: { include: { designDocument: { select: { validationReport: true } } } } },
    });
    if (!pkg) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    if (pkg.status !== 'IN_REVIEW')
      return reply.code(409).send({ error: { code: 'NOT_IN_REVIEW', status: pkg.status } });

    if (body.decision === 'APPROVED') {
      const failing = pkg.visualPackages.some((vp) => {
        const report = vp.designDocument?.validationReport as { errors?: unknown[] } | null;
        return (report?.errors?.length ?? 0) > 0;
      });
      if (failing)
        return reply
          .code(422)
          .send({ error: { code: 'DESIGN_VALIDATION_ERRORS', message: 'Resolve design validation errors before approval' } });
    }

    const status = body.decision === 'APPROVED' ? 'APPROVED' : 'NEEDS_CHANGES';
    await app.prisma.$transaction([
      app.prisma.postPackage.update({ where: { id }, data: { status } }),
      app.prisma.approvalRecord.create({
        data: {
          organisationId: req.tenant!.organisationId,
          clientCompanyId: req.tenant!.clientCompanyId,
          entityType: 'POST_PACKAGE',
          entityId: id,
          gate: 3,
          decision: body.decision,
          decidedById: req.tenant!.userId,
          note: body.note,
        },
      }),
    ]);
    return { status };
  });

  /** Part-level regeneration: locked fields are never touched (docs/08 §4). */
  app.post('/:id/regenerate', generate, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = RegenerateBody.parse(req.body);
    const pkg = await app.prisma.postPackage.findFirst({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
      select: { lockedFields: true, brandProfileId: true },
    });
    if (!pkg) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    if (typeof body.part === 'string' && pkg.lockedFields.includes(body.part))
      return reply.code(409).send({ error: { code: 'FIELD_LOCKED', fields: [body.part] } });

    const job = await app.prisma.generationJob.create({
      data: {
        organisationId: req.tenant!.organisationId,
        clientCompanyId: req.tenant!.clientCompanyId,
        kind: 'post_copy',
        input: { postPackageId: id, part: body.part, lockedFields: pkg.lockedFields },
      },
    });
    // TODO(queue): enqueue BullMQ 'ai-generation' job with job.id
    return reply.code(202).send({ jobId: job.id });
  });
}
