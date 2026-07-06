import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { canTransition, type WorkflowStatus } from '@brandflow/shared';
import { activeProviderName, getAiProvider } from '../ai/provider.js';

/**
 * What the AI returns for a complete post draft (mirrors post_copy@2).
 * String lengths are CLAMPED, not rejected — providers don't enforce
 * maxLength in tool schemas, and an overlong first comment shouldn't cost
 * a retry round.
 */
const clamp = (n: number) =>
  z.string().transform((s) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s));

const DraftCopy = z.object({
  hooks: z.array(clamp(200)).min(1).max(3),
  mainText: clamp(2800),
  shortVersion: clamp(900).optional(),
  cta: clamp(150),
  hashtags: z.array(clamp(40)).min(1).max(8),
  firstComment: clamp(500),
  suggestedVisualFormat: z.enum(['single_image', 'carousel', 'quote_card', 'statistic_card', 'announcement_graphic']),
  onImageText: z.object({
    headline: clamp(90),
    support: clamp(140).optional(),
    badge: clamp(20).optional(),
  }),
  slides: z
    .array(z.object({ title: clamp(60), body: clamp(180), iconName: clamp(40).optional() }))
    .min(3)
    .max(7)
    .optional(),
  altText: clamp(300),
});
type DraftCopyT = z.infer<typeof DraftCopy>;

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
    hookOptions: z.array(z.string().max(200)).max(3).optional(),
    onImageText: z
      .object({ headline: z.string().max(90), support: z.string().max(140).optional(), badge: z.string().max(20).optional() })
      .optional(),
    slideTexts: z
      .array(z.object({ title: z.string().max(60), body: z.string().max(180), iconName: z.string().max(40).optional() }))
      .max(7)
      .optional(),
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

/** Map an AI draft onto PostPackage columns. */
function draftToFields(copy: DraftCopyT) {
  return {
    hookOptions: copy.hooks as unknown as object,
    mainText: copy.mainText,
    shortVersion: copy.shortVersion,
    cta: copy.cta,
    hashtags: copy.hashtags,
    firstComment: copy.firstComment,
    suggestedVisualFormat: copy.suggestedVisualFormat,
    onImageText: copy.onImageText as unknown as object,
    slideTexts: (copy.slides ?? undefined) as unknown as object | undefined,
    altText: copy.altText,
  };
}

/**
 * Lightweight brand voice context for copywriting. Uses the approved brand
 * profile when one exists; otherwise falls back to the company name so
 * drafting works before brand onboarding is complete.
 */
async function brandVoiceContext(app: FastifyInstance, clientCompanyId: string) {
  const client = await app.prisma.clientCompany.findUnique({
    where: { id: clientCompanyId },
    select: { name: true, industry: true },
  });
  const profile = await app.prisma.brandProfile.findFirst({
    where: { clientCompanyId, status: 'APPROVED' },
    include: { voiceProfile: true, styleGuide: true, pillars: true },
  });
  return {
    companyName: client?.name,
    industry: client?.industry,
    toneDescriptors: profile?.voiceProfile?.toneDescriptors ?? [],
    doRules: profile?.styleGuide?.doRules ?? [],
    dontRules: profile?.styleGuide?.dontRules ?? [],
    bannedPhrases: profile?.styleGuide?.bannedPhrases ?? [],
    topics: profile?.pillars.map((p) => p.name) ?? [],
  };
}

async function recordCopyJob(
  app: FastifyInstance,
  req: { tenant?: { organisationId: string; clientCompanyId: string } },
  input: unknown,
  tokensUsed: number,
) {
  await app.prisma.generationJob.create({
    data: {
      organisationId: req.tenant!.organisationId,
      clientCompanyId: req.tenant!.clientCompanyId,
      kind: 'post_copy',
      status: 'succeeded',
      input: input as object,
      tokensUsed,
      finishedAt: new Date(),
    },
  });
}

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

  /**
   * Draft stage — one AI-written draft per idea (user decision). Drafting
   * again for the same idea regenerates into the SAME package, so edits,
   * locks and design links stay attached to one item.
   */
  app.post('/draft-sync', generate, async (req, reply) => {
    const { ideaId } = z.object({ ideaId: z.string() }).parse(req.body);
    const idea = await app.prisma.postIdea.findFirst({
      where: { id: ideaId, clientCompanyId: req.tenant!.clientCompanyId },
    });
    if (!idea) return reply.code(404).send({ error: { code: 'IDEA_NOT_FOUND' } });

    const brand = await brandVoiceContext(app, req.tenant!.clientCompanyId);
    const { data: copy, meta } = await getAiProvider().complete(
      'post_copy',
      { idea: { title: idea.title, angle: idea.angle, objective: idea.objective }, brand },
      DraftCopy,
    );

    const fields = draftToFields(copy);
    const existing = await app.prisma.postPackage.findFirst({
      where: { ideaId, clientCompanyId: req.tenant!.clientCompanyId },
      select: { id: true },
    });
    const pkg = existing
      ? await app.prisma.postPackage.update({ where: { id: existing.id }, data: { ...fields, status: 'GENERATED' } })
      : await app.prisma.postPackage.create({
          data: {
            organisationId: req.tenant!.organisationId,
            clientCompanyId: req.tenant!.clientCompanyId,
            brandProfileId: idea.brandProfileId,
            ideaId,
            internalTitle: idea.title,
            objective: idea.objective,
            status: 'GENERATED',
            ...fields,
          },
        });
    await recordCopyJob(app, req, { ideaId }, meta.tokensUsed);
    return { package: pkg, provider: activeProviderName() };
  });

  /**
   * Draft directions: two distinct alternative drafts for an existing
   * package — curated in the modal, applied via /apply-draft.
   */
  app.post('/:id/directions-sync', generate, async (req, reply) => {
    const { id } = req.params as { id: string };
    const pkg = await app.prisma.postPackage.findFirst({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
    });
    if (!pkg) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });

    const brand = await brandVoiceContext(app, req.tenant!.clientCompanyId);
    const currentDraft = {
      hook: (pkg.hookOptions as string[] | null)?.[0],
      mainText: pkg.mainText,
      cta: pkg.cta,
    };
    const base = {
      idea: { title: pkg.internalTitle, objective: pkg.objective },
      brand,
      currentDraft,
      directions: true,
    };
    let tokens = 0;
    const directions: DraftCopyT[] = [];
    for (const direction of ['a contrarian, against-the-grain', 'a concrete story-driven']) {
      const { data, meta } = await getAiProvider().complete('post_copy', { ...base, direction }, DraftCopy);
      directions.push(data);
      tokens += meta.tokensUsed;
    }
    await recordCopyJob(app, req, { directionsFor: id }, tokens);
    return {
      original: { ...currentDraft, onImageText: pkg.onImageText },
      directions,
      provider: activeProviderName(),
    };
  });

  /** Apply a chosen direction (or any external copy) onto the draft. */
  app.post('/:id/apply-draft', edit, async (req, reply) => {
    const { id } = req.params as { id: string };
    const copy = DraftCopy.parse(req.body);
    const updated = await app.prisma.postPackage.updateMany({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
      data: draftToFields(copy),
    });
    if (updated.count === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    return app.prisma.postPackage.findUnique({ where: { id } });
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
