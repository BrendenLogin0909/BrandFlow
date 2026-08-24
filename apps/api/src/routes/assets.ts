import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateAiImages, searchAssets } from '../assets/providers.js';
import { availableProviders, providerSpec, PROVIDERS } from '../assets/registry.js';
import { UNDRAW_MANIFEST } from '../assets/undraw-manifest.js';

const UNDRAW_ACCENT = /#6c63ff/gi;
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

const KIND_TO_TYPE = { icon: 'ICON', illustration: 'ILLUSTRATION', photo: 'PHOTO', texture: 'PHOTO', ai: 'ILLUSTRATION' } as const;

const SaveExternalBody = z.object({
  provider: z.string(),
  providerId: z.string(),
  kind: z.enum(['icon', 'illustration', 'photo', 'texture', 'ai']),
  // http(s) or data: URIs (AI images are stored as data URIs until object storage is wired)
  contentUrl: z.string().min(1),
  thumbUrl: z.string().optional(),
  sourceUrl: z.string().optional(),
  creator: z.string().optional(),
  label: z.string().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  mimeType: z.string().default('image/svg+xml'),
  tags: z.array(z.string()).default([]),
  restrictedFlags: z.array(z.string()).default([]),
  shared: z.boolean().default(false),
});

const GenerateBody = z.object({
  prompt: z.string().trim().min(20, 'Describe the image in at least ~20 characters (subject, style, mood, setting).'),
  count: z.number().int().min(1).max(2).default(1),
  shared: z.boolean().default(true),
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

  /** Live search across available whitelisted providers (Iconify 200k+, Lucide ~1.5k, Openverse CC0, flat pack).
   *  kind=ai does NOT spend credits — it lists previously generated/saved AI assets from the library. */
  app.get('/search', read, async (req) => {
    const { kind, q, limit } = req.query as { kind?: string; q?: string; limit?: string };
    const k = (['icon', 'illustration', 'photo', 'texture', 'ai'] as const).includes(kind as never)
      ? (kind as 'icon')
      : 'photo';
    const take = limit ? Math.min(Number(limit), 64) : 32;

    // AI tab: browse saved generations only (no OpenAI call)
    if (k === 'ai') {
      const needle = (q ?? '').trim().toLowerCase();
      const items = await app.prisma.assetLibraryItem.findMany({
        where: {
          organisationId: req.tenant!.organisationId,
          OR: [{ clientCompanyId: req.tenant!.clientCompanyId }, { shared: true }],
          provider: { in: ['ai', 'pollinations'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      const filtered = needle
        ? items.filter(
            (i) =>
              i.filename.toLowerCase().includes(needle) ||
              i.tags.some((t) => t.toLowerCase().includes(needle)) ||
              (i.allowedUseNotes ?? '').toLowerCase().includes(needle),
          )
        : items;
      return {
        results: filtered.slice(0, take).map((i) => ({
          provider: i.provider ?? 'ai',
          providerId: i.providerId ?? i.id,
          kind: 'ai' as const,
          contentUrl: i.contentUrl ?? '',
          thumbUrl: i.thumbUrl ?? i.contentUrl ?? '',
          sourceUrl: i.sourceUrl ?? undefined,
          creator: i.creator ?? undefined,
          licence: i.licence ?? 'generated',
          commercialUse: i.commercialUse,
          attributionRequired: i.attributionRequired,
          usageTier: (i.usageTier as 1 | 2 | 3) ?? 2,
          mimeType: i.mimeType,
          label: i.filename,
        })),
      };
    }

    const results = await searchAssets({ kind: k, query: q ?? '', limit: take });
    return { results };
  });

  /**
   * Explicit AI image generation. Requires a detailed prompt (≥20 chars).
   * Generates 1–2 images, auto-saves them to the library (shared by default),
   * and returns them. Clicking the AI filter alone never calls this.
   */
  app.post('/generate', manage, async (req, reply) => {
    const body = GenerateBody.parse(req.body);
    const generated = await generateAiImages(body.prompt, body.count);
    if (!generated.length) {
      return reply.code(502).send({
        error: {
          code: 'GENERATION_FAILED',
          message: 'No image returned. Check OPENAI_API_KEY or try a more specific prompt.',
        },
      });
    }

    const saved = [];
    for (const g of generated) {
      const spec = providerSpec(g.provider) ?? PROVIDERS.ai!;
      const item = await app.prisma.assetLibraryItem.create({
        data: {
          organisationId: req.tenant!.organisationId,
          clientCompanyId: body.shared ? null : req.tenant!.clientCompanyId,
          type: 'ILLUSTRATION',
          provider: g.provider,
          providerId: g.providerId,
          contentUrl: g.contentUrl,
          thumbUrl: g.thumbUrl,
          sourceUrl: g.sourceUrl,
          creator: g.creator ?? 'AI',
          licence: spec.licence,
          commercialUse: spec.commercialUse,
          attributionRequired: spec.attributionRequired,
          modificationAllowed: spec.modificationAllowed,
          restrictedFlags: ['ai_unclear_provenance'],
          usageTier: spec.tier,
          allowedUseNotes: `prompt: ${body.prompt.slice(0, 500)}`,
          retrievedAt: new Date(),
          shared: body.shared,
          filename: g.label || `AI: ${body.prompt.slice(0, 40)}`,
          mimeType: g.mimeType,
          width: g.width,
          height: g.height,
          tags: ['ai-generated', ...body.prompt.toLowerCase().split(/\s+/).slice(0, 8)],
          // AI is tier 2 — auto-approve for the generating user so they can use it immediately
          approved: true,
          allowInPrompts: true,
          uploadedById: req.tenant!.userId,
        },
      });
      saved.push(item);
    }

    return reply.code(201).send({
      results: generated,
      saved: saved.map((i) => ({ id: i.id, filename: i.filename, shared: i.shared })),
    });
  });

  /** Rough pool sizes for UI copy — live providers are unbounded; bundled counts are exact. */
  app.get('/catalog', read, async () => {
    const { UNDRAW_MANIFEST } = await import('../assets/undraw-manifest.js');
    return {
      pools: [
        { id: 'undraw', label: 'Flat illustrations', kind: 'illustration', approx: UNDRAW_MANIFEST.length, delivery: 'bundled', tier: 1 },
        { id: 'lucide', label: 'Lucide icons', kind: 'icon', approx: 1500, delivery: 'bundled', tier: 1 },
        { id: 'iconify', label: 'Iconify (open sets)', kind: 'icon', approx: 200_000, delivery: 'hotlink', tier: 2 },
        { id: 'dicebear', label: 'DiceBear figures', kind: 'illustration', approx: 5, delivery: 'hotlink', tier: 1, notes: 'Unlimited seeds × 5 styles' },
        { id: 'openverse', label: 'Openverse CC0/PDM', kind: 'photo', approx: 1_000_000, delivery: 'hotlink', tier: 2 },
        { id: 'wikimedia', label: 'Wikimedia Commons', kind: 'photo', approx: 100_000_000, delivery: 'hotlink', tier: 3 },
        { id: 'pollinations', label: 'Pollinations AI', kind: 'ai', approx: null, delivery: 'generated', tier: 2 },
        { id: 'unsplash', label: 'Unsplash', kind: 'photo', approx: null, delivery: 'hotlink', tier: 2, needsKey: true },
        { id: 'pexels', label: 'Pexels', kind: 'photo', approx: null, delivery: 'hotlink', tier: 2, needsKey: true },
        { id: 'pixabay', label: 'Pixabay', kind: 'photo', approx: null, delivery: 'hotlink', tier: 2, needsKey: true },
      ],
      providers: availableProviders().map((p) => p.id),
    };
  });

  /**
   * Serve bundled illustration SVG bytes (reliable for canvas vs huge data-URIs).
   * Optional `hue` recolours the signature accent (#6c63ff → brand colour).
   */
  app.get('/render/:provider/:providerId', read, async (req, reply) => {
    const { provider, providerId } = req.params as { provider: string; providerId: string };
    const { hue } = req.query as { hue?: string };
    const accent = hue && HEX_COLOUR.test(hue) ? hue : '#4f46e5';

    if (provider === 'undraw') {
      const entry = UNDRAW_MANIFEST.find((e) => e.slug === providerId);
      if (!entry) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
      const svg = entry.svg.replace(UNDRAW_ACCENT, accent);
      return reply
        .header('Cache-Control', 'public, max-age=86400')
        .type('image/svg+xml')
        .send(svg);
    }
    return reply.code(404).send({ error: { code: 'UNKNOWN_PROVIDER' } });
  });

  /**
   * Proxy remote asset bytes (Pollinations, DiceBear, Openverse, …) so the
   * Konva canvas can paint them without CORS failures → grey boxes.
   * Only http(s) URLs from known provider hosts are allowed.
   */
  app.get('/proxy', read, async (req, reply) => {
    const { url } = req.query as { url?: string };
    if (!url) return reply.code(400).send({ error: { code: 'MISSING_URL' } });
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return reply.code(400).send({ error: { code: 'BAD_URL' } });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return reply.code(400).send({ error: { code: 'BAD_URL' } });
    }
    const host = parsed.hostname.toLowerCase();
    const allowed =
      host === 'image.pollinations.ai' ||
      host.endsWith('.pollinations.ai') ||
      host === 'api.dicebear.com' ||
      host.endsWith('.dicebear.com') ||
      host === 'api.iconify.design' ||
      host.endsWith('.iconify.design') ||
      host.endsWith('.openverse.org') ||
      host === 'api.openverse.org' ||
      host.endsWith('wikimedia.org') ||
      host.endsWith('wikipedia.org') ||
      host.endsWith('unsplash.com') ||
      host.endsWith('pexels.com') ||
      host.endsWith('pixabay.com') ||
      host.endsWith('staticflickr.com') ||
      host.endsWith('flickr.com') ||
      // Openverse often hotlinks these CDNs
      host.endsWith('stocksnap.io') ||
      host.endsWith('rawpixel.com') ||
      host.endsWith('nappy.co') ||
      host.endsWith('burst.shopify.com') ||
      host.endsWith('shopify.com') ||
      host.endsWith('wp.com') ||
      host.endsWith('wordpress.com') ||
      host.endsWith('cloudfront.net') ||
      host.endsWith('googleusercontent.com') ||
      host.endsWith('ggpht.com') ||
      host.endsWith('imgur.com') ||
      host.endsWith('i.imgur.com');
    if (!allowed) return reply.code(403).send({ error: { code: 'HOST_NOT_ALLOWED' } });

    try {
      const upstream = await fetch(parsed.toString(), {
        headers: { 'User-Agent': 'BrandFlow/1.0 (asset-proxy)' },
        signal: AbortSignal.timeout(12_000),
      });
      if (!upstream.ok) {
        return reply.code(502).send({ error: { code: 'UPSTREAM', status: upstream.status } });
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      const type = upstream.headers.get('content-type') ?? 'image/jpeg';
      return reply
        .header('Cache-Control', 'private, max-age=3600')
        .type(type)
        .send(buf);
    } catch {
      return reply.code(502).send({ error: { code: 'UPSTREAM_FAILED' } });
    }
  });

  /** The client's library (its own assets + the shared pool). */
  app.get('/', read, async (req) => {
    const { type, approved } = req.query as { type?: string; approved?: string };
    return app.prisma.assetLibraryItem.findMany({
      where: {
        // Shared pool is org-wide, never platform-wide: an agency shares assets
        // across ITS clients, not with other organisations.
        organisationId: req.tenant!.organisationId,
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
      where: {
        id,
        organisationId: req.tenant!.organisationId,
        OR: [{ clientCompanyId: req.tenant!.clientCompanyId }, { shared: true }],
      },
      data: body,
    });
    if (updated.count === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    return app.prisma.assetLibraryItem.findUnique({ where: { id } });
  });

  app.delete('/:id', manage, async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = await app.prisma.assetLibraryItem.deleteMany({
      where: { id, organisationId: req.tenant!.organisationId, clientCompanyId: req.tenant!.clientCompanyId },
    });
    if (deleted.count === 0) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    return { ok: true };
  });
}
