import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  PlaygroundSource,
  findLockedElementViolation,
  parseDesignDocument,
  walkElements,
  type InternalDesignDocument,
  type LockableElement,
} from '@brandflow/design-schema';
import {
  LockedElementError,
  PostPackageNotFoundError,
  syncStudioDesignToPackage,
} from '../services/design-persistence.js';

const SaveBody = z.object({
  name: z.string().min(1).max(120),
  internalDoc: z.unknown(),
  /** Studio session envelope (mode: recipe|freeform|hybrid, controls, idea). */
  playgroundSource: PlaygroundSource.optional(),
  ideaId: z.string().optional(),
  /** When designing a drafted post, links the save to its PostPackage. */
  postPackageId: z.string().optional(),
});
type SaveBodyT = z.infer<typeof SaveBody>;

const LockElementsBody = z.object({
  elementIds: z.array(z.string()).min(1),
  locked: z.boolean(),
});

/** The stored draft a save updates, with the fields the save path needs. */
type PriorDraft = { id: string; internalDoc: unknown; visualPackageId: string | null };

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

  /**
   * Hydrate a full studio session: the draft (internalDoc + playgroundSource),
   * its linked post package id, and the synced DesignDocument's latest
   * validation report so the studio can show live validation + gate state.
   */
  app.get('/:id', read, async (req, reply) => {
    const { id } = req.params as { id: string };
    const draft = await app.prisma.designDraft.findFirst({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
    });
    if (!draft) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });

    let designDocument: { id: string; version: number; validationReport: unknown } | null = null;
    if (draft.visualPackageId) {
      designDocument = await app.prisma.designDocument.findFirst({
        where: { visualPackageId: draft.visualPackageId, clientCompanyId: req.tenant!.clientCompanyId },
        select: { id: true, version: true, validationReport: true },
      });
    }
    return { ...draft, designDocument };
  });

  app.post('/', edit, async (req, reply) => {
    const body = SaveBody.parse(req.body);
    return saveDraft(app, req, reply, body, null);
  });

  app.put('/:id', edit, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = SaveBody.parse(req.body);
    const existing = await app.prisma.designDraft.findFirst({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
    });
    if (!existing) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    return saveDraft(app, req, reply, body, existing);
  });

  /**
   * Toggle locked state on element ids (studio lock UI). Locking is enforced at
   * every subsequent save (byte-identity). Updates the draft's document and, if
   * the draft is linked, the authoritative DesignDocument too.
   */
  app.post('/:id/lock-elements', edit, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = LockElementsBody.parse(req.body);
    const draft = await app.prisma.designDraft.findFirst({
      where: { id, clientCompanyId: req.tenant!.clientCompanyId },
    });
    if (!draft) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });

    const doc = parseDesignDocument(draft.internalDoc);
    const ids = new Set(body.elementIds);
    let touched = 0;
    for (const page of doc.pages)
      for (const el of walkElements(page.elements as LockableElement[]))
        if (ids.has(el.id)) {
          el.locked = body.locked;
          touched++;
        }

    await app.prisma.$transaction(async (tx) => {
      await tx.designDraft.update({ where: { id }, data: { internalDoc: doc as object } });
      if (draft.visualPackageId) {
        const linked = await tx.designDocument.findFirst({
          where: { visualPackageId: draft.visualPackageId, clientCompanyId: req.tenant!.clientCompanyId },
          select: { id: true },
        });
        if (linked)
          await tx.designDocument.update({ where: { id: linked.id }, data: { internalDoc: doc as object } });
      }
    });
    return { updated: touched, locked: body.locked };
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

/**
 * Unified save: validate + store the draft, enforce locked-element integrity,
 * and — when the draft is linked to a post package — materialise the
 * authoritative DesignDocument in the same transaction. Returns the draft plus
 * the linked design's validation report (present only for linked saves).
 */
async function saveDraft(
  app: FastifyInstance,
  req: { tenant?: { organisationId: string; clientCompanyId: string; userId: string } },
  reply: FastifyReply,
  body: SaveBodyT,
  existing: PriorDraft | null,
) {
  const tenant = req.tenant!;
  const doc = parseDesignDocument(body.internalDoc); // never store an invalid document

  // The draft this save updates: the PUT target, or — one design per idea — the
  // idea's existing draft (POST resave path). Resolved up front so locked-element
  // enforcement is uniform across POST and PUT, not just PUT.
  let prior = existing;
  if (!prior && body.ideaId) {
    prior = await app.prisma.designDraft.findFirst({
      where: { ideaId: body.ideaId, clientCompanyId: tenant.clientCompanyId },
    });
  }

  // Locked-element byte-identity vs the last stored draft (covers standalone
  // drafts; linked drafts are re-checked against the DesignDocument in sync).
  if (prior) {
    const base = parseDesignDocument(prior.internalDoc);
    const violation = findLockedElementViolation(base, doc);
    if (violation)
      return reply.code(409).send({ error: { code: 'LOCKED_ELEMENT_MODIFIED', elementId: violation } });
  }

  // Resolve the linked post package: explicit id wins, else the package drafted
  // from the same idea (so "design from a draft" links without an explicit id).
  let postPackageId = body.postPackageId;
  if (!postPackageId && body.ideaId) {
    const pkg = await app.prisma.postPackage.findFirst({
      where: { ideaId: body.ideaId, clientCompanyId: tenant.clientCompanyId },
      select: { id: true },
    });
    postPackageId = pkg?.id;
  }

  const source = (body.playgroundSource ?? undefined) as object | undefined;

  try {
    const out = await app.prisma.$transaction(async (tx) => {
      const draft = await upsertDraftRow(tx, tenant, body, doc, source, prior, postPackageId);

      if (!postPackageId) return { draft, validationReport: undefined };

      const sync = await syncStudioDesignToPackage({
        tx,
        tenant,
        postPackageId,
        document: doc,
        visualPackageId: prior?.visualPackageId ?? draft.visualPackageId,
      });
      const linked = await tx.designDraft.update({
        where: { id: draft.id },
        data: { postPackageId, visualPackageId: sync.visualPackageId },
      });
      return { draft: linked, validationReport: sync.validationReport };
    });

    return reply.code(existing ? 200 : 201).send({ ...out.draft, validationReport: out.validationReport });
  } catch (err) {
    if (err instanceof PostPackageNotFoundError)
      return reply.code(404).send({ error: { code: 'POST_PACKAGE_NOT_FOUND' } });
    if (err instanceof LockedElementError)
      return reply.code(409).send({ error: { code: 'LOCKED_ELEMENT_MODIFIED', elementId: err.elementId } });
    throw err;
  }
}

/**
 * Create the DesignDraft row, or update the prior one in place. One design per
 * idea: saving again for the same idea returns the user to their exact design.
 */
async function upsertDraftRow(
  tx: Prisma.TransactionClient,
  tenant: { organisationId: string; clientCompanyId: string; userId: string },
  body: SaveBodyT,
  doc: InternalDesignDocument,
  source: object | undefined,
  prior: PriorDraft | null,
  postPackageId: string | undefined,
) {
  const data = {
    name: body.name,
    internalDoc: doc as object,
    playgroundSource: source,
    postPackageId: postPackageId ?? null,
  };

  if (prior) return tx.designDraft.update({ where: { id: prior.id }, data });

  return tx.designDraft.create({
    data: {
      organisationId: tenant.organisationId,
      clientCompanyId: tenant.clientCompanyId,
      ideaId: body.ideaId,
      createdById: tenant.userId,
      ...data,
    },
  });
}
