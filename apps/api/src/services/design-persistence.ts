/**
 * Design persistence — the single unified save path for the Design Studio.
 *
 * A DesignDraft is the studio's convenience copy (controls + internalDoc) and
 * always exists. When that draft is designed for a drafted post (linked via
 * postPackageId), saving ALSO materialises the authoritative DesignDocument on
 * a VisualPackage of that PostPackage — so the rest of the pipeline (Gate 3
 * approval, exports, revisions) has the artifact it expects.
 *
 * This is P0-2 in docs/17-design-editing-plan.md: the draft and document save
 * paths are unified so a studio save is one round-trip that keeps both in sync,
 * enforces locked-element byte-identity, and records a HUMAN_EDIT revision.
 *
 * Deliberately does NOT touch the Polotno adapter (plan §12): engineDocCache is
 * left null; the InternalDesignDocument is the only authoritative format.
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  findLockedElementViolation,
  parseDesignDocument,
  validateDesignDocument,
  type InternalDesignDocument,
  type ValidationReport,
} from '@brandflow/design-schema';

/** A locked element was modified between the stored document and the incoming save. */
export class LockedElementError extends Error {
  constructor(public readonly elementId: string) {
    super(`Locked element ${elementId} was modified`);
    this.name = 'LockedElementError';
  }
}

/** The linked PostPackage does not exist for this tenant. */
export class PostPackageNotFoundError extends Error {
  constructor() {
    super('Linked post package not found');
    this.name = 'PostPackageNotFoundError';
  }
}

export interface SyncStudioDesignArgs {
  tx: Prisma.TransactionClient;
  tenant: { organisationId: string; clientCompanyId: string; userId: string };
  postPackageId: string;
  document: InternalDesignDocument;
  /** VisualPackage the draft synced into previously, to reuse it on resave. */
  visualPackageId?: string | null;
}

export interface SyncStudioDesignResult {
  visualPackageId: string;
  designDocumentId: string;
  version: number;
  validationReport: ValidationReport;
}

/**
 * Create or update the DesignDocument that mirrors a studio draft onto its
 * linked PostPackage, enforcing locked-element integrity and recording a
 * HUMAN_EDIT revision. Runs inside the caller's transaction.
 *
 * @throws PostPackageNotFoundError when the package is not visible to the tenant
 * @throws LockedElementError       when a previously locked element was changed
 */
export async function syncStudioDesignToPackage(
  args: SyncStudioDesignArgs,
): Promise<SyncStudioDesignResult> {
  const { tx, tenant, postPackageId, document } = args;

  const pkg = await tx.postPackage.findFirst({
    where: { id: postPackageId, clientCompanyId: tenant.clientCompanyId },
    select: {
      id: true,
      brandProfileId: true,
      visualPackages: {
        select: {
          id: true,
          designDocument: { select: { id: true, internalDoc: true, version: true } },
        },
      },
    },
  });
  if (!pkg) throw new PostPackageNotFoundError();

  // Reuse the draft's prior VisualPackage, else the package's first one, else
  // create one. One design per draft → one VisualPackage is enough.
  const preferred =
    (args.visualPackageId && pkg.visualPackages.find((vp) => vp.id === args.visualPackageId)) ||
    pkg.visualPackages[0] ||
    null;

  let visualPackageId: string;
  let existingDoc: { id: string; internalDoc: unknown; version: number } | null;
  if (preferred) {
    visualPackageId = preferred.id;
    existingDoc = preferred.designDocument;
  } else {
    const created = await tx.visualPackage.create({
      data: {
        postPackageId: pkg.id,
        format: document.format,
        layoutRecipeId: document.layoutRecipeRef.recipeId,
        status: 'GENERATED',
      },
      select: { id: true },
    });
    visualPackageId = created.id;
    existingDoc = null;
  }

  // Locked-element byte-identity: locked elements must be unchanged vs the last
  // stored document (same guarantee as design-documents PUT).
  if (existingDoc) {
    const base = parseDesignDocument(existingDoc.internalDoc);
    const violation = findLockedElementViolation(base, document);
    if (violation) throw new LockedElementError(violation);
  }

  const validationReport = validateDesignDocument(document);
  const brandProfileId = pkg.brandProfileId ?? document.brandProfileId;

  let designDocumentId: string;
  let version: number;
  if (existingDoc) {
    designDocumentId = existingDoc.id;
    version = existingDoc.version + 1;
    await tx.designDocument.update({
      where: { id: existingDoc.id },
      data: {
        internalDoc: document as object,
        validationReport: validationReport as unknown as object,
        version,
        brandProfileId,
      },
    });
  } else {
    designDocumentId = randomUUID();
    version = 1;
    await tx.designDocument.create({
      data: {
        id: designDocumentId,
        visualPackageId,
        organisationId: tenant.organisationId,
        clientCompanyId: tenant.clientCompanyId,
        brandProfileId,
        internalDoc: document as object,
        validationReport: validationReport as unknown as object,
        version,
      },
    });
  }

  await tx.designRevision.create({
    data: {
      designDocumentId,
      version,
      internalDoc: document as object,
      createdById: tenant.userId,
      reason: 'HUMAN_EDIT',
    },
  });

  return { visualPackageId, designDocumentId, version, validationReport };
}
