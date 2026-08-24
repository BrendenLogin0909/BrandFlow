/**
 * Tenant-isolation regression tests for the asset library (invariant §6.3:
 * strict tenant isolation, cross-tenant access returns 404 — never 403).
 *
 * The shared asset pool is ORG-WIDE, not platform-wide: organisation B must
 * never see organisation A's shared items (AI generations store their prompt
 * text in allowedUseNotes, so a cross-org leak exposes client strategy).
 *
 * Runs against the real Fastify app + shared dev Postgres; fixtures are
 * random per run and torn down afterwards (same pattern as
 * design-persistence.test.ts).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';

const A = {
  org: randomUUID(),
  user: randomUUID(),
  client: randomUUID(),
  sharedItem: randomUUID(),
  clientItem: randomUUID(),
};
const B = { org: randomUUID(), user: randomUUID(), client: randomUUID() };

let app: FastifyInstance;
let tokenA: string;
let tokenB: string;
const auth = (token: string) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
  tokenA = app.jwt.sign({ userId: A.user });
  tokenB = app.jwt.sign({ userId: B.user });

  for (const [side, ids] of [
    ['A', A],
    ['B', B],
  ] as const) {
    await app.prisma.organisation.create({ data: { id: ids.org, name: `Tenancy Org ${side}` } });
    await app.prisma.user.create({
      data: { id: ids.user, email: `tenancy-${ids.user}@test.local`, passwordHash: 'x', name: `Tenancy ${side}` },
    });
    await app.prisma.clientCompany.create({
      data: { id: ids.client, organisationId: ids.org, name: `Tenancy Client ${side}`, slug: `tenancy-${ids.client}` },
    });
    await app.prisma.membership.create({
      data: { userId: ids.user, organisationId: ids.org, clientCompanyId: ids.client, role: 'CLIENT_ADMIN' },
    });
  }

  // Org A's assets: one org-wide shared AI generation, one client-scoped stock save.
  await app.prisma.assetLibraryItem.create({
    data: {
      id: A.sharedItem,
      organisationId: A.org,
      clientCompanyId: null,
      shared: true,
      type: 'ILLUSTRATION',
      provider: 'ai',
      providerId: 'gpt-image:secret-campaign#1',
      contentUrl: 'data:image/png;base64,AAAA',
      filename: 'AI: secret Q4 campaign visual',
      mimeType: 'image/png',
      allowedUseNotes: 'prompt: confidential Q4 product launch for Acme',
      usageTier: 2,
      approved: true,
      tags: ['ai-generated'],
      restrictedFlags: [],
    },
  });
  await app.prisma.assetLibraryItem.create({
    data: {
      id: A.clientItem,
      organisationId: A.org,
      clientCompanyId: A.client,
      shared: false,
      type: 'PHOTO',
      provider: 'openverse',
      providerId: 'ov-123',
      contentUrl: 'https://example.org/photo.jpg',
      filename: 'openverse-ov-123',
      mimeType: 'image/jpeg',
      usageTier: 2,
      tags: [],
      restrictedFlags: [],
    },
  });
});

afterAll(async () => {
  const p = app.prisma;
  await p.assetLibraryItem.deleteMany({ where: { organisationId: { in: [A.org, B.org] } } });
  await p.auditEvent.deleteMany({ where: { organisationId: { in: [A.org, B.org] } } });
  await p.membership.deleteMany({ where: { organisationId: { in: [A.org, B.org] } } });
  await p.clientCompany.deleteMany({ where: { id: { in: [A.client, B.client] } } });
  await p.user.deleteMany({ where: { id: { in: [A.user, B.user] } } });
  await p.organisation.deleteMany({ where: { id: { in: [A.org, B.org] } } });
  await app.close();
});

describe('asset library tenant isolation', () => {
  it('org A sees its own client and shared items', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/clients/${A.client}/assets`,
      headers: auth(tokenA),
    });
    expect(res.statusCode).toBe(200);
    const ids = (res.json() as { id: string }[]).map((i) => i.id);
    expect(ids).toContain(A.sharedItem);
    expect(ids).toContain(A.clientItem);
  });

  it('org B never sees org A items — not even shared ones', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/clients/${B.client}/assets`,
      headers: auth(tokenB),
    });
    expect(res.statusCode).toBe(200);
    const ids = (res.json() as { id: string }[]).map((i) => i.id);
    expect(ids).not.toContain(A.sharedItem);
    expect(ids).not.toContain(A.clientItem);
  });

  it('org B AI search does not list org A generations', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/clients/${B.client}/assets/search?kind=ai&q=`,
      headers: auth(tokenB),
    });
    expect(res.statusCode).toBe(200);
    const results = (res.json() as { results: { providerId: string }[] }).results;
    expect(results.some((r) => r.providerId === 'gpt-image:secret-campaign#1')).toBe(false);
  });

  it('org B cannot modify org A shared item (404, unchanged)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/clients/${B.client}/assets/${A.sharedItem}`,
      headers: auth(tokenB),
      payload: { approved: false },
    });
    expect(res.statusCode).toBe(404);
    const item = await app.prisma.assetLibraryItem.findUnique({ where: { id: A.sharedItem } });
    expect(item?.approved).toBe(true);
  });

  it('org B addressing org A client path returns 404, never 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/clients/${A.client}/assets`,
      headers: auth(tokenB),
    });
    expect(res.statusCode).toBe(404);
  });
});
