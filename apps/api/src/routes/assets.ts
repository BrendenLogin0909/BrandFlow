import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { searchAssets } from '../assets/providers.js';
import { availableProviders, providerSpec } from '../assets/registry.js';

const KIND_TO_TYPE = { icon: 'ICON', illustration: 'ILLUSTRATION', photo: 'PHOTO', texture: 'PHOTO', ai: 'ILLUSTRATION' } as const;

const SaveExternalBody = z.object({
  provider: z.string(),
  providerId: z.string(),
  kind: z.enum(['icon', 'illustration', 'photo', 'texture', 'ai']),
  contentUrl: z.string().url(),
  thumbUrl: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
  creator: z.string().optional(),
  label: z.string().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  mimeType: z.string().default('image/svg+xml'),
  tags: z.array(z.string()).default([]),
  restrictedFlags: z.array(z.string()).default([]),
  shared: z.boolean().default(false),
});

export async function assetRoutes(app: FastifyInstance) {
  const read = { preHandler: app.tenantGuard({ requires: ['assets:read'] }) };
  const manage = { preHandler: app.tenantGuard({ requires: ['assets:manage'] }) };

  /** Which providers are usable right now (given configured keys). */
  app.get('/providers', read, async () =>
    availableProviders().map((p) => ({
      id: p.id, label: p.label, kinds: p.kinds, licence: p.licence, tier: p.tier,
      attributionRequired: p.attributionRequired, needsKey: p.needsKey, notes: p.notes,
    })),
  );

  /** Live search across available whitelisted providers. */
  app.get('/search', read, async (req) => {
    const { kind, q, limit } = req.query as { kind?: string; q?: string; limit?: string };
    const k = (['icon', 'illustration', 'photo', 'texture', 'ai'] as const).includes(kind as never)
      ? (kind as 'icon')
      : 'photo';
    const results = await searchAssets({ kind: k, query: q ?? '', limit: limit ? Number(limit) : 12 });
    return { results };
  });

  /** The client's library (its own assets + the shared pool). */
  app.get('/', read, async (req) => {
    const { type, approved } = req.query as { type?: string; approved?: string };
    return app.prisma.assetLibraryItem.findMany({
      where: {
        OR: [{ clientCompanyId: req.tenant!.clientCompanyId }, { shared: true }],
        ...(type ? { type: type as never } : {}),
        ...(approved != null ? { approved: approved === 'true' } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  });

  /** Persist a searched external asset into the library, with provenance. */
  app.post('/save-external', manage, async (req, reply) => {
    const body = SaveExternalBody.parse(req.body);
    const spec = providerSpec(body.provider);
    if (!spec) return reply.code(400).send({ error: { code: 'UNKNOWN_PROVIDER' } });

    const item = await app.prisma.assetLibraryItem.create({
      data: {
        organisationId: req.tenant!.organisationId,
        clientCompanyId: body.shared ? null : req.tenant!.clientCompanyId,
        type: KIND_TO_TYPE[body.kind],
        provider: body.provider,
        providerId: body.providerId,
        contentUrl: body.contentUrl,
        thumbUrl: body.thumbUrl,
        sourceUrl: body.sourceUrl,
        creator: body.creator,
        licence: spec.licence,
        commercialUse: spec.commercialUse,
        attributionRequired: spec.attributionRequired,
        modificationAllowed: spec.modificationAllowed,
        restrictedFlags: body.restrictedFlags,
        usageTier: spec.tier,
        allowedUseNotes: spec.notes,
        retrievedAt: new Date(),
        shared: body.shared,
        filename: body.label ?? `${body.provider}-${body.providerId}`,
        mimeType: body.mimeType,
        width: body.width,
        height: body.height,
        tags: body.tags,
        // tier-1 auto-approves; tier-2/3 need a human tick before generation use
        approved: spec.tier === 1,
        allowInPrompts: spec.tier === 1,
        uploadedById: req.tenant!.userId,
      },
    });
    return reply.code(201).send(item);
  });

  app.patch('/:id', manage, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({ approved: z.boolean().optional(), allowInPrompts: z.boolean().optional(), tags: z.array(z.string()).optional(), restrictedFlags: z.array(z.string()).optional() })
      .parse(req.body);
    const updated = await app.prisma.assetLibraryItem.updateMany({
      where: { id, OR: [{ clientCompanyId: req.tenant!.clientCompanyId }, { shared: true }] },
      data: body,
    });
    if (updated.count === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    return app.prisma.assetLibraryItem.findUnique({ where: { id } });
  });

  app.delete('/:id', manage, async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = await app.prisma.assetLibraryItem.deleteMany({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
    });
    if (deleted.count === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    return { ok: true };
  });
}
