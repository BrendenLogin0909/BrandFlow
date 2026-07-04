import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseDesignDocument, validateDesignDocument } from '@brandflow/design-schema';
import { exportPageSvg, exportPptx } from '@brandflow/exporters';
import { PolotnoAdapter } from '../adapters/polotno-adapter.js';

const engine = new PolotnoAdapter();

const LockBody = z.object({ elementIds: z.array(z.string()).min(1), locked: z.boolean() });

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
    const lockedBase = collectLocked(base);
    for (const [elId, baseJson] of lockedBase) {
      const incomingEl = findById(incoming, elId);
      if (!incomingEl || JSON.stringify(incomingEl) !== baseJson)
        return reply.code(409).send({ error: { code: 'LOCKED_ELEMENT_MODIFIED', elementId: elId } });
    }

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

  app.post('/:id/lock-elements', edit, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = LockBody.parse(req.body);
    const existing = await loadDoc(req, id);
    if (!existing) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });

    const doc = parseDesignDocument(existing.internalDoc);
    for (const page of doc.pages)
      for (const el of walk(page.elements))
        if (body.elementIds.includes(el.id)) el.locked = body.locked;

    await app.prisma.designDocument.update({
      where: { id },
      data: { internalDoc: doc as object, engineDocCache: engine.toEngineFormat(doc) as object },
    });
    return { updated: body.elementIds.length, locked: body.locked };
  });
}

type AnyElement = { id: string; locked?: boolean; type: string; children?: AnyElement[] };

function* walk(elements: AnyElement[]): Generator<AnyElement> {
  for (const el of elements) {
    yield el;
    if (el.type === 'group' && el.children) yield* walk(el.children);
  }
}

function collectLocked(doc: { pages: { elements: AnyElement[] }[] }): Map<string, string> {
  const out = new Map<string, string>();
  for (const page of doc.pages)
    for (const el of walk(page.elements)) if (el.locked) out.set(el.id, JSON.stringify(el));
  return out;
}

function findById(doc: { pages: { elements: AnyElement[] }[] }, id: string): AnyElement | undefined {
  for (const page of doc.pages) for (const el of walk(page.elements)) if (el.id === id) return el;
  return undefined;
}
