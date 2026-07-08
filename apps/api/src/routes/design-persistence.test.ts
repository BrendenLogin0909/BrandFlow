/**
 * Integration test for the unified studio save path (docs/17 Agent 2).
 *
 * Exercises the real Fastify app + Prisma against the dev Postgres:
 *  - a linked studio save materialises a DesignDocument + HUMAN_EDIT revision;
 *  - Gate 3 approval is blocked while that document has validation errors (P5-D)
 *    and passes once a clean design is resaved;
 *  - locked elements cannot be modified by a subsequent save (byte-identity).
 *
 * Fixtures are scoped to a throwaway org/client and torn down afterwards, so it
 * is safe to run against the shared dev database.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';

let counter = 0;
function uuid(): string {
  const n = (counter++).toString(16).padStart(12, '0');
  return `10000000-0000-4000-8000-${n}`;
}

// Random per-run so a crashed prior run (which skipped teardown) never blocks a
// rerun on a unique-constraint collision.
const ORG_ID = randomUUID();
const USER_ID = randomUUID();
const CLIENT_ID = randomUUID();
const IDEA_ID = randomUUID();
const PKG_ID = randomUUID();

const COLOURS = {
  primary: '#1a3c8f',
  secondary: '#4a6fd4',
  accent: '#e8b23a',
  neutral: '#8a8f98',
  background: '#ffffff',
  text: '#101418',
};

/** A parseable document whose only validation error (if any) is a too-small headline. */
function makeDoc(opts: {
  headlineSize?: number;
  headlineX?: number;
  headlineLocked?: boolean;
  panelX?: number;
}) {
  const headline = {
    id: uuid(),
    name: 'Headline',
    frame: { x: opts.headlineX ?? 100, y: 100, width: 880, height: 200, rotation: 0 },
    opacity: 1,
    locked: opts.headlineLocked ?? false,
    visible: true,
    zIndex: 1,
    roleHint: 'headline' as const,
    tokenRefs: [],
    recipeSlotId: null,
    meta: {},
    type: 'text' as const,
    text: 'Stop posting. Start compounding.',
    fontFamily: 'Poppins',
    fontSize: opts.headlineSize ?? 60,
    fontWeight: 700,
    fontStyle: 'normal' as const,
    lineHeight: 1.2,
    letterSpacing: 0,
    align: 'left' as const,
    verticalAlign: 'top' as const,
    colour: { kind: 'token' as const, token: 'text' },
    autoFit: false,
  };
  const panel = {
    id: uuid(),
    name: 'Panel',
    frame: { x: opts.panelX ?? 100, y: 760, width: 880, height: 240, rotation: 0 },
    opacity: 1,
    locked: false,
    visible: true,
    zIndex: 0,
    roleHint: 'decoration' as const,
    tokenRefs: [],
    recipeSlotId: null,
    meta: {},
    type: 'shape' as const,
    shape: 'rect' as const,
    fill: { kind: 'token' as const, token: 'accent' },
    strokeWidth: 0,
    cornerRadius: 0,
  };
  return {
    id: uuid(),
    schemaVersion: 1 as const,
    version: 1,
    brandProfileId: 'playground',
    clientCompanyId: CLIENT_ID,
    layoutRecipeRef: { recipeId: 'test-recipe', recipeVersion: 1, variant: 'a' },
    format: 'single_image',
    canvas: { width: 1080, height: 1080, unit: 'px' as const, dpi: 96 },
    brandTokens: { colours: COLOURS, fonts: { heading: 'Poppins', body: 'Inter' }, logoAssetIds: [] },
    pages: [
      {
        id: uuid(),
        name: 'Page 1',
        background: { kind: 'token' as const, token: 'background' },
        safeArea: { top: 64, right: 64, bottom: 64, left: 64 },
        elements: [panel, headline],
      },
    ],
  };
}

let app: FastifyInstance;
let token: string;
const auth = () => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });
const base = () => `/api/clients/${CLIENT_ID}`;

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
  token = app.jwt.sign({ userId: USER_ID });

  await app.prisma.organisation.create({ data: { id: ORG_ID, name: 'Persist Test Org' } });
  await app.prisma.user.create({
    data: { id: USER_ID, email: `persist-${USER_ID}@test.local`, passwordHash: 'x', name: 'Persist Tester' },
  });
  await app.prisma.clientCompany.create({
    data: { id: CLIENT_ID, organisationId: ORG_ID, name: 'Persist Client', slug: `persist-${CLIENT_ID}` },
  });
  await app.prisma.membership.create({
    data: { userId: USER_ID, organisationId: ORG_ID, clientCompanyId: CLIENT_ID, role: 'CLIENT_ADMIN' },
  });
  await app.prisma.postIdea.create({
    data: { id: IDEA_ID, organisationId: ORG_ID, clientCompanyId: CLIENT_ID, title: 'Compounding content', objective: 'thought_leadership' },
  });
  await app.prisma.postPackage.create({
    data: {
      id: PKG_ID,
      organisationId: ORG_ID,
      clientCompanyId: CLIENT_ID,
      ideaId: IDEA_ID,
      internalTitle: 'Compounding content',
      objective: 'thought_leadership',
      status: 'GENERATED',
      suggestedVisualFormat: 'single_image',
    },
  });
});

afterAll(async () => {
  const p = app.prisma;
  const docs = await p.designDocument.findMany({ where: { clientCompanyId: CLIENT_ID }, select: { id: true } });
  const docIds = docs.map((d) => d.id);
  const pkgs = await p.postPackage.findMany({ where: { clientCompanyId: CLIENT_ID }, select: { id: true } });
  const pkgIds = pkgs.map((x) => x.id);
  const cals = await p.contentCalendar.findMany({ where: { clientCompanyId: CLIENT_ID }, select: { id: true } });
  const calIds = cals.map((c) => c.id);

  if (calIds.length) await p.calendarSlot.deleteMany({ where: { calendarId: { in: calIds } } });
  await p.contentCalendar.deleteMany({ where: { clientCompanyId: CLIENT_ID } });
  if (docIds.length) await p.designRevision.deleteMany({ where: { designDocumentId: { in: docIds } } });
  await p.designDraft.deleteMany({ where: { clientCompanyId: CLIENT_ID } });
  await p.designDocument.deleteMany({ where: { clientCompanyId: CLIENT_ID } });
  if (pkgIds.length) {
    await p.visualPackage.deleteMany({ where: { postPackageId: { in: pkgIds } } });
    await p.revision.deleteMany({ where: { postPackageId: { in: pkgIds } } });
  }
  await p.approvalRecord.deleteMany({ where: { clientCompanyId: CLIENT_ID } });
  await p.postPackage.deleteMany({ where: { clientCompanyId: CLIENT_ID } });
  await p.postIdea.deleteMany({ where: { clientCompanyId: CLIENT_ID } });
  await p.generationJob.deleteMany({ where: { clientCompanyId: CLIENT_ID } });
  await p.auditEvent.deleteMany({ where: { organisationId: ORG_ID } });
  await p.membership.deleteMany({ where: { clientCompanyId: CLIENT_ID } });
  await p.clientCompany.deleteMany({ where: { id: CLIENT_ID } });
  await p.user.deleteMany({ where: { id: USER_ID } });
  await p.organisation.deleteMany({ where: { id: ORG_ID } });
  await app.close();
});

describe('unified studio save + Gate 3 + lock enforcement', () => {
  it('materialises a DesignDocument + HUMAN_EDIT revision and blocks approval on validation errors', async () => {
    // Save a linked design with a too-small headline (one validation error).
    const failing = await app.inject({
      method: 'POST',
      url: `${base()}/design-drafts`,
      headers: auth(),
      payload: { name: 'Persist design', internalDoc: makeDoc({ headlineSize: 10 }), ideaId: IDEA_ID, postPackageId: PKG_ID },
    });
    expect(failing.statusCode).toBe(201);
    const failingBody = failing.json();
    expect(failingBody.visualPackageId).toBeTruthy();
    expect(failingBody.validationReport.errors.length).toBeGreaterThan(0);

    // The authoritative DesignDocument + revision exist.
    const doc = await app.prisma.designDocument.findFirst({
      where: { visualPackageId: failingBody.visualPackageId },
      include: { revisions: true },
    });
    expect(doc).toBeTruthy();
    expect(doc!.revisions.some((r) => r.reason === 'HUMAN_EDIT')).toBe(true);

    // Move to review, then Gate 3 must refuse while errors stand.
    const toReview = await app.inject({
      method: 'POST',
      url: `${base()}/post-packages/${PKG_ID}/status`,
      headers: auth(),
      payload: { status: 'IN_REVIEW' },
    });
    expect(toReview.statusCode).toBe(200);

    const blocked = await app.inject({
      method: 'POST',
      url: `${base()}/post-packages/${PKG_ID}/approve`,
      headers: auth(),
      payload: { decision: 'APPROVED' },
    });
    expect(blocked.statusCode).toBe(422);
    expect(blocked.json().error.code).toBe('DESIGN_VALIDATION_ERRORS');
  });

  it('clears the block after a clean resave and approves', async () => {
    const clean = await app.inject({
      method: 'POST',
      url: `${base()}/design-drafts`,
      headers: auth(),
      payload: { name: 'Persist design', internalDoc: makeDoc({ headlineSize: 60 }), ideaId: IDEA_ID, postPackageId: PKG_ID },
    });
    expect(clean.statusCode).toBeLessThan(300);
    expect(clean.json().validationReport.errors.length).toBe(0);

    const approved = await app.inject({
      method: 'POST',
      url: `${base()}/post-packages/${PKG_ID}/approve`,
      headers: auth(),
      payload: { decision: 'APPROVED' },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().status).toBe('APPROVED');
  });

  it('rejects a save that modifies a locked element but allows unlocked edits', async () => {
    // Build the base doc ONCE so element ids are stable across resaves — the
    // byte-identity check keys locked elements by id. elements = [panel, headline].
    const baseDoc = makeDoc({ headlineLocked: true });

    // Standalone draft (no package) with a locked headline.
    const created = await app.inject({
      method: 'POST',
      url: `${base()}/design-drafts`,
      headers: auth(),
      payload: { name: 'Locked design', internalDoc: baseDoc },
    });
    expect(created.statusCode).toBe(201);
    const draftId = created.json().id;

    // Moving the locked headline is rejected.
    const movedLocked = structuredClone(baseDoc);
    movedLocked.pages[0]!.elements[1]!.frame.x = 300;
    const violated = await app.inject({
      method: 'PUT',
      url: `${base()}/design-drafts/${draftId}`,
      headers: auth(),
      payload: { name: 'Locked design', internalDoc: movedLocked },
    });
    expect(violated.statusCode).toBe(409);
    expect(violated.json().error.code).toBe('LOCKED_ELEMENT_MODIFIED');

    // Moving an unlocked element (the panel), headline untouched, succeeds.
    const movedPanel = structuredClone(baseDoc);
    movedPanel.pages[0]!.elements[0]!.frame.x = 150;
    const okEdit = await app.inject({
      method: 'PUT',
      url: `${base()}/design-drafts/${draftId}`,
      headers: auth(),
      payload: { name: 'Locked design', internalDoc: movedPanel },
    });
    expect(okEdit.statusCode).toBe(200);
  });
});
