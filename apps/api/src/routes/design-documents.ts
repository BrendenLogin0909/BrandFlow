import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  findLockedElementViolation,
  parseDesignDocument,
  validateDesignDocument,
  walkElements,
  type LockableElement,
} from '@brandflow/design-schema';
import { exportPageSvg, exportPptx } from '@brandflow/exporters';
import { importSvgString, importPptxBuffer } from '@brandflow/importers';
import { PolotnoAdapter } from '../adapters/polotno-adapter.js';
import { getAiProvider, activeProviderName } from '../ai/provider.js';
import { buildBrandContext } from '../ai/build-brand-context.js';
import { patchDesign } from '../services/design-patch.js';
import { VisualDirectionSchema } from '@brandflow/shared';

const engine = new PolotnoAdapter();

const LockBody = z.object({ elementIds: z.array(z.string()).min(1), locked: z.boolean() });

const PatchBody = z.object({
  instruction: z.string().min(1).max(2000),
  scope: z.enum(['element', 'page', 'document']).default('document'),
  /** Element ids (element scope) or page ids (page scope). */
  targetIds: z.array(z.string()).default([]),
  /** Extra ids to protect for this edit (doc-locked elements are always protected). */
  lockedElementIds: z.array(z.string()).default([]),
  contrastMode: z.enum(['enforce', 'warn']).default('enforce'),
  visualDirection: VisualDirectionSchema.optional(),
});

const RevertBody = z.object({ version: z.number().int().min(1) });

const ImportApplyBody = z.object({ document: z.unknown() });

function isSvgUpload(filename: string, mimetype: string | undefined): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith('.svg') || mimetype === 'image/svg+xml' || mimetype === 'text/xml';
}

function isPptxUpload(filename: string, mimetype: string | undefined): boolean {
  const lower = filename.toLowerCase();
  return (
    lower.endsWith('.pptx') ||
    mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  );
}

/** A compact, tenant-scoped brand view for the patch prompt. */
function brandPromptView(brand: Awaited<ReturnType<typeof buildBrandContext>>) {
  return {
    companyName: brand.companyName,
    voice: { toneDescriptors: brand.voice.toneDescriptors },
    styleGuide: {
      doRules: brand.styleGuide.doRules,
      dontRules: brand.styleGuide.dontRules,
      bannedPhrases: brand.styleGuide.bannedPhrases,
    },
    fonts: brand.kit.fonts,
  };
}

export async function designDocumentRoutes(app: FastifyInstance) {
  const read = { preHandler: app.tenantGuard({ requires: ['content:read'] }) };
  const edit = { preHandler: app.tenantGuard({ requires: ['design:edit'] }) };

  async function loadDoc(req: { tenant?: { clientCompanyId: string } }, id: string) {
    return app.prisma.designDocument.findFirst({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
    });
  }

  app.get('/:id', read, async (req, reply) => {
    const { id } = req.params as { id: string };
    const doc = await loadDoc(req, id);
    if (!doc) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    return doc;
  });

  /** Derived editor format for the embedded Polotno editor. */
  app.get('/:id/engine', read, async (req, reply) => {
    const { id } = req.params as { id: string };
    const doc = await loadDoc(req, id);
    if (!doc) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    return engine.toEngineFormat(parseDesignDocument(doc.internalDoc));
  });

  /** Save human edits. Server re-validates and enforces locked-element integrity. */
  app.put('/:id', edit, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await loadDoc(req, id);
    if (!existing) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });

    const base = parseDesignDocument(existing.internalDoc);
    let incoming;
    try {
      incoming = parseDesignDocument(req.body);
    } catch (err) {
      return reply.code(400).send({ error: { code: 'INVALID_DOCUMENT', details: String(err) } });
    }

    // Locked-element integrity: locked elements must be byte-identical to base.
    const violation = findLockedElementViolation(base, incoming);
    if (violation)
      return reply.code(409).send({ error: { code: 'LOCKED_ELEMENT_MODIFIED', elementId: violation } });

    const report = validateDesignDocument(incoming);
    // Human saves may carry rule errors (fixed later in-editor); approval/export block on them.
    const nextVersion = existing.version + 1;
    await app.prisma.$transaction([
      app.prisma.designDocument.update({
        where: { id },
        data: {
          internalDoc: incoming as object,
          engineDocCache: engine.toEngineFormat(incoming) as object,
          validationReport: report as unknown as object,
          version: nextVersion,
        },
      }),
      app.prisma.designRevision.create({
        data: {
          designDocumentId: id,
          version: nextVersion,
          internalDoc: incoming as object,
          createdById: req.tenant!.userId,
          reason: 'HUMAN_EDIT',
        },
      }),
    ]);
    return { version: nextVersion, validationReport: report };
  });

  app.post('/:id/validate', read, async (req, reply) => {
    const { id } = req.params as { id: string };
    const doc = await loadDoc(req, id);
    if (!doc) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    return validateDesignDocument(parseDesignDocument(doc.internalDoc));
  });

  /**
   * Licence-free editable exports: SVG opens as layered objects in
   * Figma/Inkscape/Penpot; PPTX opens as native editable objects in
   * PowerPoint/Google Slides/LibreOffice. These guarantee "editable
   * somewhere" independent of any design-SDK licence.
   */
  app.get('/:id/export.svg', read, async (req, reply) => {
    const { id } = req.params as { id: string };
    const pageIndex = Number((req.query as { page?: string }).page ?? 0);
    const doc = await loadDoc(req, id);
    if (!doc) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    const svg = exportPageSvg(parseDesignDocument(doc.internalDoc), pageIndex);
    return reply.type('image/svg+xml').send(svg);
  });

  app.get('/:id/export.pptx', read, async (req, reply) => {
    const { id } = req.params as { id: string };
    const doc = await loadDoc(req, id);
    if (!doc) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    const buf = await exportPptx(parseDesignDocument(doc.internalDoc));
    return reply
      .type('application/vnd.openxmlformats-officedocument.presentationml.presentation')
      .header('Content-Disposition', `attachment; filename="design-${id}.pptx"`)
      .send(buf);
  });

  /**
   * AI-directed scoped edit. The AI returns a small DesignPatch (operations
   * only); the server applies it under locked-element + scope guarantees with
   * up to 2 validation-guided repair rounds (services/design-patch.ts), then
   * persists a DesignRevision (reason AI_PATCH). Locked elements — and any
   * page not in scope for a page-scoped edit — are byte-identical afterwards.
   */
  app.post('/:id/patch', edit, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await loadDoc(req, id);
    if (!existing) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });

    let body;
    try {
      body = PatchBody.parse(req.body);
    } catch (err) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', details: String(err) } });
    }

    const base = parseDesignDocument(existing.internalDoc);

    // Brand context is assembled ONLY through buildBrandContext (tenant choke point).
    let brand;
    try {
      brand = await buildBrandContext(app.prisma, req.tenant!.clientCompanyId, existing.brandProfileId);
    } catch (err) {
      return reply.code(422).send({ error: { code: 'BRAND_CONTEXT_UNAVAILABLE', message: String(err) } });
    }

    const result = await patchDesign(
      getAiProvider(),
      base,
      {
        instruction: body.instruction,
        scope: body.scope,
        targetIds: body.targetIds,
        lockedElementIds: body.lockedElementIds,
        brand: brandPromptView(brand),
        visualDirection: body.visualDirection as Record<string, unknown> | undefined,
      },
      { bannedPhrases: brand.styleGuide.bannedPhrases, contrastMode: body.contrastMode },
    );

    if (!result)
      return reply.code(422).send({
        error: { code: 'PATCH_FAILED', message: 'The AI could not produce a valid scoped edit — try rephrasing the instruction' },
      });

    const next = result.document;

    // Server-side locked-element integrity: locked elements must be byte-identical to base.
    const violation = findLockedElementViolation(base, next);
    if (violation)
      return reply.code(409).send({ error: { code: 'LOCKED_ELEMENT_MODIFIED', elementId: violation } });

    next.version = existing.version + 1; // keep embedded + row versions in step
    await app.prisma.$transaction([
      app.prisma.designDocument.update({
        where: { id },
        data: {
          internalDoc: next as object,
          engineDocCache: engine.toEngineFormat(next) as object,
          validationReport: result.report as unknown as object,
          version: next.version,
        },
      }),
      app.prisma.designRevision.create({
        data: {
          designDocumentId: id,
          version: next.version,
          internalDoc: next as object,
          createdById: req.tenant!.userId,
          reason: 'AI_PATCH',
        },
      }),
    ]);

    return {
      version: next.version,
      validationReport: result.report,
      needsAttention: result.needsAttention,
      rationale: result.rationale,
      rejected: result.rejected,
      reimposedLockedIds: result.reimposedLockedIds,
      attempts: result.attempts,
      provider: activeProviderName(),
    };
  });

  app.post('/:id/lock-elements', edit, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = LockBody.parse(req.body);
    const existing = await loadDoc(req, id);
    if (!existing) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });

    const doc = parseDesignDocument(existing.internalDoc);
    for (const page of doc.pages)
      for (const el of walkElements(page.elements as LockableElement[]))
        if (body.elementIds.includes(el.id)) el.locked = body.locked;

    await app.prisma.designDocument.update({
      where: { id },
      data: { internalDoc: doc as object, engineDocCache: engine.toEngineFormat(doc) as object },
    });
    return { updated: body.elementIds.length, locked: body.locked };
  });

  /** List design revisions newest-first (Agent 12 — revision history). */
  app.get('/:id/revisions', read, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await loadDoc(req, id);
    if (!existing) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });

    const rows = await app.prisma.designRevision.findMany({
      where: { designDocumentId: id },
      orderBy: { version: 'desc' },
      take: 30,
      select: {
        id: true,
        version: true,
        reason: true,
        createdAt: true,
        createdById: true,
        internalDoc: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      version: r.version,
      reason: r.reason,
      createdAt: r.createdAt,
      createdById: r.createdById,
      pageCount: (r.internalDoc as { pages?: unknown[] })?.pages?.length ?? 0,
      internalDoc: r.internalDoc,
    }));
  });

  /** Revert to a prior revision version — writes a new REVERT revision. */
  app.post('/:id/revert', edit, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = RevertBody.parse(req.body);
    const existing = await loadDoc(req, id);
    if (!existing) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });

    const target = await app.prisma.designRevision.findFirst({
      where: { designDocumentId: id, version: body.version },
    });
    if (!target) return reply.code(404).send({ error: { code: 'REVISION_NOT_FOUND' } });

    const reverted = parseDesignDocument(target.internalDoc);
    const nextVersion = existing.version + 1;
    reverted.version = nextVersion;
    const report = validateDesignDocument(reverted);

    await app.prisma.$transaction([
      app.prisma.designDocument.update({
        where: { id },
        data: {
          internalDoc: reverted as object,
          engineDocCache: engine.toEngineFormat(reverted) as object,
          validationReport: report as unknown as object,
          version: nextVersion,
        },
      }),
      app.prisma.designRevision.create({
        data: {
          designDocumentId: id,
          version: nextVersion,
          internalDoc: reverted as object,
          createdById: req.tenant!.userId,
          reason: 'REVERT',
        },
      }),
    ]);

    return { version: nextVersion, validationReport: report };
  });

  /**
   * Preview an external SVG or PPTX import — parses and validates but does not persist.
   * User confirms via POST /import/apply.
   */
  app.post('/:id/import', edit, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await loadDoc(req, id);
    if (!existing) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });

    const file = await req.file();
    if (!file) return reply.code(400).send({ error: { code: 'NO_FILE', message: 'Upload a .svg or .pptx file' } });

    const buffer = await file.toBuffer();
    const filename = file.filename ?? 'upload';
    const base = parseDesignDocument(existing.internalDoc);

    try {
      let imported;
      if (isSvgUpload(filename, file.mimetype)) {
        imported = importSvgString(buffer.toString('utf8'), { base });
      } else if (isPptxUpload(filename, file.mimetype)) {
        imported = await importPptxBuffer(buffer, { base });
      } else {
        return reply.code(400).send({
          error: { code: 'UNSUPPORTED_FORMAT', message: 'Only .svg and .pptx imports are supported' },
        });
      }

      const next = parseDesignDocument({
        ...imported.document,
        id: base.id,
        brandProfileId: base.brandProfileId,
        clientCompanyId: base.clientCompanyId,
        layoutRecipeRef: base.layoutRecipeRef,
        format: base.format,
        brandTokens: base.brandTokens,
        version: base.version,
      });
      const validationReport = validateDesignDocument(next);
      return { document: next, importReport: imported.report, validationReport };
    } catch (err) {
      return reply.code(422).send({ error: { code: 'IMPORT_FAILED', message: String(err) } });
    }
  });

  /** Persist a confirmed import — writes DesignRevision reason EXTERNAL_IMPORT. */
  app.post('/:id/import/apply', edit, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await loadDoc(req, id);
    if (!existing) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });

    let body;
    try {
      body = ImportApplyBody.parse(req.body);
    } catch (err) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', details: String(err) } });
    }

    const base = parseDesignDocument(existing.internalDoc);
    let incoming;
    try {
      incoming = parseDesignDocument(body.document);
    } catch (err) {
      return reply.code(400).send({ error: { code: 'INVALID_DOCUMENT', details: String(err) } });
    }

    incoming.id = base.id;
    incoming.brandProfileId = base.brandProfileId;
    incoming.clientCompanyId = base.clientCompanyId;

    const violation = findLockedElementViolation(base, incoming);
    if (violation)
      return reply.code(409).send({ error: { code: 'LOCKED_ELEMENT_MODIFIED', elementId: violation } });

    const report = validateDesignDocument(incoming);
    const nextVersion = existing.version + 1;
    incoming.version = nextVersion;

    await app.prisma.$transaction([
      app.prisma.designDocument.update({
        where: { id },
        data: {
          internalDoc: incoming as object,
          engineDocCache: engine.toEngineFormat(incoming) as object,
          validationReport: report as unknown as object,
          version: nextVersion,
        },
      }),
      app.prisma.designRevision.create({
        data: {
          designDocumentId: id,
          version: nextVersion,
          internalDoc: incoming as object,
          createdById: req.tenant!.userId,
          reason: 'EXTERNAL_IMPORT',
        },
      }),
    ]);

    return { version: nextVersion, validationReport: report };
  });
}
