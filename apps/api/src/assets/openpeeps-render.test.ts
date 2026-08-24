/**
 * End-to-end check that the Open Peeps pack is actually reachable through the
 * bundled-asset render route with the brand-hue recolour applied.
 *
 * Runs against the real Fastify app + shared dev Postgres; fixtures are random
 * per run and torn down afterwards (same pattern as assets-tenancy.test.ts).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { OPENPEEPS_MANIFEST } from './openpeeps-manifest.js';

const ids = { org: randomUUID(), user: randomUUID(), client: randomUUID() };

let app: FastifyInstance;
let token: string;

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
  token = app.jwt.sign({ userId: ids.user });
  await app.prisma.organisation.create({ data: { id: ids.org, name: 'Peeps Render Org' } });
  await app.prisma.user.create({
    data: { id: ids.user, email: `peeps-${ids.user}@test.local`, passwordHash: 'x', name: 'Peeps Tester' },
  });
  await app.prisma.clientCompany.create({
    data: { id: ids.client, organisationId: ids.org, name: 'Peeps Client', slug: `peeps-${ids.client}` },
  });
  await app.prisma.membership.create({
    data: { userId: ids.user, organisationId: ids.org, clientCompanyId: ids.client, role: 'CLIENT_ADMIN' },
  });
});

afterAll(async () => {
  const p = app.prisma;
  await p.auditEvent.deleteMany({ where: { organisationId: ids.org } });
  await p.membership.deleteMany({ where: { organisationId: ids.org } });
  await p.clientCompany.deleteMany({ where: { id: ids.client } });
  await p.user.deleteMany({ where: { id: ids.user } });
  await p.organisation.deleteMany({ where: { id: ids.org } });
  await app.close();
});

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });

describe('GET /assets/render/openpeeps/:slug', () => {
  it('serves a scene recoloured to the requested brand hue', async () => {
    const slug = OPENPEEPS_MANIFEST[0]!.slug;
    const res = await get(`/api/clients/${ids.client}/assets/render/openpeeps/${slug}?hue=%230a66c2`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/svg+xml');
    const svg = res.body;
    expect(svg.startsWith('<svg')).toBe(true);
    // recoloured: pack accent gone, brand hue present
    expect(svg).not.toContain('#6c63ff');
    expect(svg).toContain('#0a66c2');
    // fixed roles survive the swap: line art and skin tone
    expect(svg).toContain('#3f3d56');
    expect(svg).toMatch(/#ffd9c0|#f3b98d|#d69963|#a86b3c|#7a4a24/);
  });

  it('falls back to the default hue when none is supplied', async () => {
    const slug = OPENPEEPS_MANIFEST[1]!.slug;
    const res = await get(`/api/clients/${ids.client}/assets/render/openpeeps/${slug}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('#4f46e5');
  });

  it('still serves the original flat pack (existing slugs are API)', async () => {
    const res = await get(`/api/clients/${ids.client}/assets/render/undraw/growth-chart?hue=%230a66c2`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('#0a66c2');
  });

  it('404s an unknown scene and an unknown provider', async () => {
    expect((await get(`/api/clients/${ids.client}/assets/render/openpeeps/not-a-scene`)).statusCode).toBe(404);
    expect((await get(`/api/clients/${ids.client}/assets/render/nope/peep-team-huddle`)).statusCode).toBe(404);
  });

  it('lists the pack in the catalog with its real size', async () => {
    const res = await get(`/api/clients/${ids.client}/assets/catalog`);
    expect(res.statusCode).toBe(200);
    const pool = res.json().pools.find((p: { id: string }) => p.id === 'openpeeps');
    expect(pool).toBeDefined();
    expect(pool.approx).toBe(OPENPEEPS_MANIFEST.length);
    expect(pool.tier).toBe(1);
    expect(pool.delivery).toBe('bundled');
  });

  it('advertises the provider with its CC0 licence', async () => {
    const res = await get(`/api/clients/${ids.client}/assets/providers`);
    const spec = res.json().find((p: { id: string }) => p.id === 'openpeeps');
    expect(spec).toBeDefined();
    expect(spec.licence).toBe('CC0 1.0');
    expect(spec.tier).toBe(1);
    expect(spec.attributionRequired).toBe(false);
    expect(spec.needsKey).toBe(false);
  });
});
