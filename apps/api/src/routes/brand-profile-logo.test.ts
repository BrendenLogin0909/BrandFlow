/**
 * Brand-profile "set primary logo" integration tests (feat/asset-upload):
 * POST /:id/logo merges into BrandKit.logos by kind (never clobbers other
 * entries), creates a placeholder-safe BrandKit when one doesn't exist yet,
 * and only accepts an assetId the tenant can actually see (org-scoped,
 * mirrors routes/assets.ts). Fixture/teardown pattern copied from
 * assets-tenancy.test.ts.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';

const A = { org: randomUUID(), user: randomUUID(), client: randomUUID(), profile: randomUUID(), asset: randomUUID(), asset2: randomUUID() };
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
    await app.prisma.organisation.create({ data: { id: ids.org, name: `Logo Org ${side}` } });
    await app.prisma.user.create({
      data: { id: ids.user, email: `logo-${ids.user}@test.local`, passwordHash: 'x', name: `Logo ${side}` },
    });
    await app.prisma.clientCompany.create({
      data: { id: ids.client, organisationId: ids.org, name: `Logo Client ${side}`, slug: `logo-${ids.client}` },
    });
    await app.prisma.membership.create({
      data: { userId: ids.user, organisationId: ids.org, clientCompanyId: ids.client, role: 'CLIENT_ADMIN' },
    });
  }

  // Org A: a brand profile with no BrandKit yet, and two of its own assets.
  await app.prisma.brandProfile.create({
    data: { id: A.profile, organisationId: A.org, clientCompanyId: A.client, name: 'Acme Test Brand' },
  });
  await app.prisma.assetLibraryItem.create({
    data: {
      id: A.asset, organisationId: A.org, clientCompanyId: A.client, shared: false,
      type: 'LOGO', provider: 'upload', storageKey: `org/${A.org}/client/${A.client}/${A.asset}.png`,
      filename: 'logo.png', mimeType: 'image/png', sizeBytes: 10, tags: [], restrictedFlags: [],
      approved: true, allowInPrompts: true,
    },
  });
  await app.prisma.assetLibraryItem.create({
    data: {
      id: A.asset2, organisationId: A.org, clientCompanyId: A.client, shared: false,
      type: 'LOGO', provider: 'upload', storageKey: `org/${A.org}/client/${A.client}/${A.asset2}.png`,
      filename: 'logo-dark.png', mimeType: 'image/png', sizeBytes: 10, tags: [], restrictedFlags: [],
      approved: true, allowInPrompts: true,
    },
  });
});

afterAll(async () => {
  const p = app.prisma;
  await p.brandKit.deleteMany({ where: { brandProfileId: A.profile } });
  await p.brandProfile.deleteMany({ where: { id: A.profile } });
  await p.assetLibraryItem.deleteMany({ where: { organisationId: { in: [A.org, B.org] } } });
  await p.auditEvent.deleteMany({ where: { organisationId: { in: [A.org, B.org] } } });
  await p.membership.deleteMany({ where: { organisationId: { in: [A.org, B.org] } } });
  await p.clientCompany.deleteMany({ where: { id: { in: [A.client, B.client] } } });
  await p.user.deleteMany({ where: { id: { in: [A.user, B.user] } } });
  await p.organisation.deleteMany({ where: { id: { in: [A.org, B.org] } } });
  await app.close();
});

describe('brand profile logo', () => {
  it('sets the primary logo, creating a placeholder-safe BrandKit when none existed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/clients/${A.client}/brand-profiles/${A.profile}/logo`,
      headers: auth(tokenA),
      payload: { assetId: A.asset },
    });
    expect(res.statusCode).toBe(200);
    const kit = res.json() as { logos: { assetId: string; kind: string }[]; colours: object; fonts: object };
    expect(kit.logos).toEqual([{ assetId: A.asset, kind: 'primary' }]);
    expect(kit.colours).toBeTruthy();
    expect(kit.fonts).toBeTruthy();
  });

  it('setting a different kind merges, does not clobber the existing primary entry', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/clients/${A.client}/brand-profiles/${A.profile}/logo`,
      headers: auth(tokenA),
      payload: { assetId: A.asset2, kind: 'mark-only' },
    });
    expect(res.statusCode).toBe(200);
    const kit = res.json() as { logos: { assetId: string; kind: string }[] };
    expect(kit.logos).toEqual(
      expect.arrayContaining([
        { assetId: A.asset, kind: 'primary' },
        { assetId: A.asset2, kind: 'mark-only' },
      ]),
    );
    expect(kit.logos).toHaveLength(2);
  });

  it('re-setting the same kind replaces only that entry', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/clients/${A.client}/brand-profiles/${A.profile}/logo`,
      headers: auth(tokenA),
      payload: { assetId: A.asset2, kind: 'primary' },
    });
    expect(res.statusCode).toBe(200);
    const kit = res.json() as { logos: { assetId: string; kind: string }[] };
    expect(kit.logos).toEqual(
      expect.arrayContaining([
        { assetId: A.asset2, kind: 'primary' },
        { assetId: A.asset2, kind: 'mark-only' },
      ]),
    );
    expect(kit.logos).toHaveLength(2);
  });

  it('rejects an assetId the tenant cannot see (404, never 403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/clients/${A.client}/brand-profiles/${A.profile}/logo`,
      headers: auth(tokenA),
      payload: { assetId: randomUUID() },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('ASSET_NOT_FOUND');
  });

  it('org B cannot set a logo on org A\'s brand profile (404, never 403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/clients/${B.client}/brand-profiles/${A.profile}/logo`,
      headers: auth(tokenB),
      payload: { assetId: A.asset },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /brand-profiles list includes the brand kit logos', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/clients/${A.client}/brand-profiles`,
      headers: auth(tokenA),
    });
    expect(res.statusCode).toBe(200);
    const profiles = res.json() as { id: string; brandKit: { logos: { assetId: string; kind: string }[] } | null }[];
    const mine = profiles.find((p) => p.id === A.profile);
    expect(mine?.brandKit?.logos).toEqual(expect.arrayContaining([{ assetId: A.asset2, kind: 'primary' }]));
  });
});
