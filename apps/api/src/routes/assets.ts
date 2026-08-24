import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generateAiImages, searchAssets } from '../assets/providers.js';
import { availableProviders, providerSpec, PROVIDERS, type AssetKind } from '../assets/registry.js';
import { UNDRAW_MANIFEST } from '../assets/undraw-manifest.js';
import { getStorage, withStorage } from '../storage/index.js';

const UNDRAW_ACCENT = /#6c63ff/gi;
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

const KIND_TO_TYPE = { icon: 'ICON', illustration: 'ILLUSTRATION', photo: 'PHOTO', texture: 'PHOTO', ai: 'ILLUSTRATION' } as const;

// ---------- Customer upload (logos/photos → MinIO via StoragePort) ----------

/** png/jpeg/svg/webp only — mimetype → storage-key extension. */
const UPLOAD_EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // ~5MB cap
const STORAGE_UNAVAILABLE = {
  error: { code: 'STORAGE_UNAVAILABLE', message: 'Object storage is unreachable — try again shortly.' },
} as const;

const UploadQuery = z.object({
  type: z.enum(['LOGO', 'PHOTO']).default('PHOTO'),
  shared: z.coerce.boolean().default(false),
});

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
    // Pre-existing type hole fixed in passing (main): casting to a single
    // literal ('icon') made every other member of the includes() check
    // untyped dead code from TS's perspective, even though 'illustration'/
    // 'texture'/'ai' are all real runtime values used right below.
    const k = (['icon', 'illustration', 'photo', 'texture', 'ai'] as const).includes(kind as never)
      ? (kind as AssetKind)
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

  /**
   * Customer upload (multipart) — the actual bytes go to MinIO/S3 via
   * StoragePort; only the storageKey is persisted on the AssetLibraryItem
   * row (contentUrl stays null; bytes are served back via GET /:id/content).
   * `type` (LOGO|PHOTO, default PHOTO) and `shared` (default false — a
   * client logo belongs to that client) are query params rather than
   * multipart fields, so they're always available before the file stream
   * is read regardless of multipart field ordering.
   */
  app.post('/upload', manage, async (req, reply) => {
    const query = UploadQuery.safeParse(req.query);
    if (!query.success) {
      return reply.code(400).send({ error: { code: 'BAD_QUERY', message: query.error.issues[0]?.message } });
    }

    let file;
    try {
      file = await req.file({ limits: { fileSize: MAX_UPLOAD_BYTES }, throwFileSizeLimit: true });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.code(400).send({
          error: { code: 'FILE_TOO_LARGE', message: `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit` },
        });
      }
      if (code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') {
        return reply.code(400).send({ error: { code: 'NOT_MULTIPART', message: 'Send a multipart/form-data request with a "file" field' } });
      }
      throw err;
    }
    if (!file) return reply.code(400).send({ error: { code: 'NO_FILE', message: 'Attach a file under the "file" field' } });

    const ext = UPLOAD_EXT_BY_MIME[file.mimetype];
    if (!ext) {
      return reply.code(400).send({
        error: {
          code: 'UNSUPPORTED_TYPE',
          message: `Unsupported type "${file.mimetype}". Allowed: PNG, JPEG, SVG, WEBP.`,
        },
      });
    }

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch (err) {
      if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.code(400).send({
          error: { code: 'FILE_TOO_LARGE', message: `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit` },
        });
      }
      throw err;
    }
    if (buffer.length === 0) return reply.code(400).send({ error: { code: 'EMPTY_FILE' } });

    const { type, shared } = query.data;
    const spec = providerSpec('upload')!;
    const scopeSegment = shared ? 'shared' : req.tenant!.clientCompanyId;
    const key = `org/${req.tenant!.organisationId}/client/${scopeSegment}/${randomUUID()}.${ext}`;

    const stored = await withStorage(() => getStorage().put(key, buffer, file!.mimetype));
    if (!stored.ok) {
      req.log.warn(`asset upload: storage.put failed — ${stored.error}`);
      return reply.code(503).send(STORAGE_UNAVAILABLE);
    }

    const item = await app.prisma.assetLibraryItem.create({
      data: {
        organisationId: req.tenant!.organisationId,
        clientCompanyId: shared ? null : req.tenant!.clientCompanyId,
        type,
        storageKey: key,
        provider: 'upload',
        licence: spec.licence,
        commercialUse: spec.commercialUse,
        attributionRequired: spec.attributionRequired,
        modificationAllowed: spec.modificationAllowed,
        usageTier: spec.tier,
        shared,
        filename: file.filename || `upload.${ext}`,
        mimeType: file.mimetype,
        sizeBytes: buffer.length,
        tags: [],
        restrictedFlags: [],
        // customer's own property — auto-approved and immediately usable
        approved: true,
        allowInPrompts: true,
        uploadedById: req.tenant!.userId,
      },
    });
    return reply.code(201).send(item);
  });

  /**
   * Stream uploaded bytes back through the API (org-scoped tenant check —
   * same shape as the list/patch queries: organisationId + client-or-shared).
   * Cross-org access is a 404, never a 403 (existence isn't revealed).
   * Registered before /:id so it isn't shadowed by it (find-my-way already
   * disambiguates by segment count/method, but keep them adjacent for
   * readability — /:id only handles PATCH/DELETE, no GET, so there's no
   * actual collision either way).
   */
  app.get('/:id/content', read, async (req, reply) => {
    const { id } = req.params as { id: string };
    const item = await app.prisma.assetLibraryItem.findFirst({
      where: {
        id,
        organisationId: req.tenant!.organisationId,
        OR: [{ clientCompanyId: req.tenant!.clientCompanyId }, { shared: true }],
      },
    });
    if (!item || !item.storageKey) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });

    const fetched = await withStorage(() => getStorage().get(item.storageKey!));
    if (!fetched.ok) {
      req.log.warn(`asset content: storage.get failed — ${fetched.error}`);
      return reply.code(503).send(STORAGE_UNAVAILABLE);
    }

    return reply
      .header('Cache-Control', 'private, max-age=3600')
      .type(item.mimeType)
      .send(fetched.value);
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
    // Look up storageKey first — uploads own real bytes in MinIO that would
    // otherwise be orphaned once the DB row is gone.
    const existing = await app.prisma.assetLibraryItem.findFirst({
      where: { id, organisationId: req.tenant!.organisationId, clientCompanyId: req.tenant!.clientCompanyId },
      select: { storageKey: true },
    });
    if (!existing) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });

    await app.prisma.assetLibraryItem.deleteMany({
      where: { id, organisationId: req.tenant!.organisationId, clientCompanyId: req.tenant!.clientCompanyId },
    });

    if (existing.storageKey) {
      // Best-effort: the library row is already gone (the part the user
      // sees); a storage hiccup here shouldn't turn into a failed delete.
      const cleanup = await withStorage(() => getStorage().delete(existing.storageKey!));
      if (!cleanup.ok) req.log.warn(`asset delete: storage.delete failed for ${existing.storageKey} — ${cleanup.error}`);
    }
    return { ok: true };
  });
}
