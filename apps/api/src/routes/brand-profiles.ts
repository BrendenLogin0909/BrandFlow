import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const CreateBody = z.object({ name: z.string().min(1) });
const ApproveBody = z.object({
  decision: z.enum(['APPROVED', 'CHANGES_REQUESTED']),
  note: z.string().optional(),
});
const SetLogoBody = z.object({
  assetId: z.string().min(1),
  /** 'primary' by default; a future kit editor could add e.g. 'mark-only', 'dark-mode'. */
  kind: z.string().min(1).max(40).default('primary'),
});
/** Placeholder-safe kit defaults so "upload a logo" never requires the (separate, later) brand-kit editor first. */
const FALLBACK_KIT_COLOURS = { primary: '#1a3c8f', secondary: '#4a6fd4', accent: '#e8b23a', neutral: '#8a8f98', background: '#ffffff', text: '#101418' };
const FALLBACK_KIT_FONTS = { heading: 'Poppins', body: 'Inter' };

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

  // Content pillars — the brand's standing topics (feed idea generation)
  app.post('/:id/pillars', manage, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ name: z.string().min(1).max(80), description: z.string().max(300).optional() }).parse(req.body);
    const profile = await app.prisma.brandProfile.findFirst({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
      select: { id: true },
    });
    if (!profile) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    const pillar = await app.prisma.contentPillar.create({
      data: { brandProfileId: id, name: body.name, description: body.description },
    });
    return reply.code(201).send(pillar);
  });

  app.delete('/:id/pillars/:pillarId', manage, async (req, reply) => {
    const { id, pillarId } = req.params as { id: string; pillarId: string };
    const deleted = await app.prisma.contentPillar.deleteMany({
      where: { id: pillarId, brandProfile: { id, clientCompanyId: req.tenant!.clientCompanyId } },
    });
    if (deleted.count === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    return { ok: true };
  });

  /**
   * Set (or replace) one logo entry on the brand kit — e.g. the primary
   * logo used by the logo-top-left layout motif. Merges into
   * BrandKit.logos by `kind` (default 'primary'); other entries are left
   * untouched. Minimal by design — the full brand-kit editor (colours,
   * fonts, etc.) is a separate later workstream, so a missing BrandKit row
   * is created here with placeholder colours/fonts rather than blocking.
   */
  app.post('/:id/logo', manage, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = SetLogoBody.parse(req.body);

    const profile = await app.prisma.brandProfile.findFirst({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
      include: { brandKit: true },
    });
    if (!profile) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });

    // The asset must be one this tenant can actually see — org-scoped,
    // matching the pattern in routes/assets.ts (shared pool is org-wide).
    const asset = await app.prisma.assetLibraryItem.findFirst({
      where: {
        id: body.assetId,
        organisationId: req.tenant!.organisationId,
        OR: [{ clientCompanyId: req.tenant!.clientCompanyId }, { shared: true }],
      },
      select: { id: true },
    });
    if (!asset) return reply.code(404).send({ error: { code: 'ASSET_NOT_FOUND' } });

    const existingLogos = Array.isArray(profile.brandKit?.logos)
      ? (profile.brandKit!.logos as { assetId: string; kind: string }[])
      : [];
    const logos = [...existingLogos.filter((l) => l.kind !== body.kind), { assetId: body.assetId, kind: body.kind }];

    const kit = await app.prisma.brandKit.upsert({
      where: { brandProfileId: id },
      create: {
        brandProfileId: id,
        colours: FALLBACK_KIT_COLOURS,
        fonts: FALLBACK_KIT_FONTS,
        logos,
      },
      update: { logos },
    });
    return kit;
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
