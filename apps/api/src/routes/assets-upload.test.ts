/**
 * Customer upload integration tests (feat/asset-upload): multipart POST
 * /upload → MinIO via StoragePort → GET /:id/content round-trips the exact
 * bytes. Fixture/teardown pattern copied from assets-tenancy.test.ts.
 *
 * Requires MinIO reachable at STORAGE_ENDPOINT (docker compose up -d minio)
 * — these are NOT mocked, they exercise the real adapter end to end.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { getStorage, isStorageReady } from '../storage/index.js';

const A = { org: randomUUID(), user: randomUUID(), client: randomUUID() };
const B = { org: randomUUID(), user: randomUUID(), client: randomUUID() };

let app: FastifyInstance;
let tokenA: string;
let tokenB: string;
const createdStorageKeys: string[] = [];

/** Build a raw multipart/form-data body — no test-only dependency needed. */
function multipartBody(
  filename: string,
  contentType: string,
  data: Buffer,
): { body: Buffer; contentTypeHeader: string } {
  const boundary = `bftest${randomUUID().replace(/-/g, '')}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([head, data, tail]), contentTypeHeader: `multipart/form-data; boundary=${boundary}` };
}

function authHeaders(token: string, contentTypeHeader: string) {
  return { authorization: `Bearer ${token}`, 'content-type': contentTypeHeader };
}

// Minimal-but-valid PNG (1x1 transparent pixel).
const PNG_1PX = Buffer.from(
  '89504e470d0a1a0a0000000d494844520000000100000001080600000' +
    '01f15c4890000000a49444154789c6360000002000100ffff03000006000557bf3d5c0000000049454e44ae426082',
  'hex',
);

async function upload(
  token: string,
  clientId: string,
  file: Buffer,
  contentType: string,
  query = 'type=LOGO',
) {
  const mp = multipartBody('logo.png', contentType, file);
  const res = await app.inject({
    method: 'POST',
    url: `/api/clients/${clientId}/assets/upload?${query}`,
    headers: authHeaders(token, mp.contentTypeHeader),
    payload: mp.body,
  });
  return res;
}

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
  tokenA = app.jwt.sign({ userId: A.user });
  tokenB = app.jwt.sign({ userId: B.user });

  for (const [side, ids] of [
    ['A', A],
    ['B', B],
  ] as const) {
    await app.prisma.organisation.create({ data: { id: ids.org, name: `Upload Org ${side}` } });
    await app.prisma.user.create({
      data: { id: ids.user, email: `upload-${ids.user}@test.local`, passwordHash: 'x', name: `Upload ${side}` },
    });
    await app.prisma.clientCompany.create({
      data: { id: ids.client, organisationId: ids.org, name: `Upload Client ${side}`, slug: `upload-${ids.client}` },
    });
    await app.prisma.membership.create({
      data: { userId: ids.user, organisationId: ids.org, clientCompanyId: ids.client, role: 'CLIENT_ADMIN' },
    });
  }
});

afterAll(async () => {
  const p = app.prisma;
  for (const key of createdStorageKeys) {
    await getStorage().delete(key).catch(() => {});
  }
  await p.assetLibraryItem.deleteMany({ where: { organisationId: { in: [A.org, B.org] } } });
  await p.auditEvent.deleteMany({ where: { organisationId: { in: [A.org, B.org] } } });
  await p.membership.deleteMany({ where: { organisationId: { in: [A.org, B.org] } } });
  await p.clientCompany.deleteMany({ where: { id: { in: [A.client, B.client] } } });
  await p.user.deleteMany({ where: { id: { in: [A.user, B.user] } } });
  await p.organisation.deleteMany({ where: { id: { in: [A.org, B.org] } } });
  await app.close();
});

describe('asset upload (requires MinIO — docker compose up -d minio)', () => {
  it('MinIO is reachable in this environment', () => {
    // Fails loudly rather than letting every test below fail with a confusing 503.
    expect(isStorageReady()).toBe(true);
  });

  it('multipart upload → 201, AssetLibraryItem created with correct org/client + storage key', async () => {
    const res = await upload(tokenA, A.client, PNG_1PX, 'image/png', 'type=LOGO');
    expect(res.statusCode).toBe(201);
    const item = res.json() as {
      id: string;
      organisationId: string;
      clientCompanyId: string | null;
      type: string;
      provider: string;
      storageKey: string;
      mimeType: string;
      sizeBytes: number;
      shared: boolean;
      approved: boolean;
      allowInPrompts: boolean;
    };
    expect(item.organisationId).toBe(A.org);
    expect(item.clientCompanyId).toBe(A.client);
    expect(item.type).toBe('LOGO');
    expect(item.provider).toBe('upload');
    expect(item.shared).toBe(false);
    expect(item.approved).toBe(true);
    expect(item.allowInPrompts).toBe(true);
    expect(item.mimeType).toBe('image/png');
    expect(item.sizeBytes).toBe(PNG_1PX.length);
    expect(item.storageKey).toMatch(new RegExp(`^org/${A.org}/client/${A.client}/[0-9a-f-]+\\.png$`));
    createdStorageKeys.push(item.storageKey);
  });

  it('GET /:id/content round-trips the exact bytes with the correct content type', async () => {
    const uploadRes = await upload(tokenA, A.client, PNG_1PX, 'image/png', 'type=PHOTO&shared=true');
    const item = uploadRes.json() as { id: string; storageKey: string };
    createdStorageKeys.push(item.storageKey);

    const res = await app.inject({
      method: 'GET',
      url: `/api/clients/${A.client}/assets/${item.id}/content`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(res.rawPayload, PNG_1PX)).toBe(0);
  });

  it('cross-org content fetch → 404 (never 403), even for a shared item', async () => {
    const uploadRes = await upload(tokenA, A.client, PNG_1PX, 'image/png', 'type=PHOTO&shared=true');
    const item = uploadRes.json() as { id: string; storageKey: string };
    createdStorageKeys.push(item.storageKey);

    const res = await app.inject({
      method: 'GET',
      url: `/api/clients/${B.client}/assets/${item.id}/content`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('oversized upload → 400', async () => {
    const big = Buffer.alloc(6 * 1024 * 1024, 1); // 6MB > 5MB cap
    const res = await upload(tokenA, A.client, big, 'image/png');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('FILE_TOO_LARGE');
  });

  it('wrong content type → 400', async () => {
    const res = await upload(tokenA, A.client, Buffer.from('%PDF-1.4 not an image'), 'application/pdf');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('UNSUPPORTED_TYPE');
  });

  it('no file attached → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/clients/${A.client}/assets/upload?type=LOGO`,
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
