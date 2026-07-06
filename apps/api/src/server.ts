/**
 * BrandFlow API server. Route modules follow docs/05-api-routes.md;
 * the modules below are the MVP skeleton — remaining domains
 * (calendars, ideas, exports, comments) register the same way.
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { PrismaClient } from '@prisma/client';
import tenantPlugin from './plugins/tenant.js';
import { authRoutes } from './routes/auth.js';
import { brandProfileRoutes } from './routes/brand-profiles.js';
import { designDocumentRoutes } from './routes/design-documents.js';
import { postPackageRoutes } from './routes/post-packages.js';
import { designDraftRoutes } from './routes/design-drafts.js';
import { ideaRoutes } from './routes/ideas.js';
import { composeRoutes } from './routes/compose.js';
import { assetRoutes } from './routes/assets.js';

export async function buildServer() {
  const app = Fastify({ logger: true });
  const prisma = new PrismaClient();

  app.decorate('prisma', prisma);
  await app.register(cors, { origin: process.env.CORS_ORIGIN ?? true });
  await app.register(jwt, { secret: process.env.JWT_SECRET ?? 'dev-only-secret' });
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });
  await app.register(tenantPlugin);

  // Audit interceptor: mutating responses on tenant routes write audit events.
  app.addHook('onResponse', async (req, reply) => {
    if (req.tenant && req.method !== 'GET' && reply.statusCode < 400) {
      await prisma.auditEvent.create({
        data: {
          organisationId: req.tenant.organisationId,
          clientCompanyId: req.tenant.clientCompanyId,
          userId: req.tenant.userId,
          entityType: 'http',
          entityId: req.url,
          action: `${req.method} ${req.routeOptions.url ?? req.url} -> ${reply.statusCode}`,
        },
      });
    }
  });

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(brandProfileRoutes, { prefix: '/api/clients/:clientId/brand-profiles' });
  await app.register(designDocumentRoutes, { prefix: '/api/clients/:clientId/design-documents' });
  await app.register(postPackageRoutes, { prefix: '/api/clients/:clientId/post-packages' });
  await app.register(designDraftRoutes, { prefix: '/api/clients/:clientId/design-drafts' });
  await app.register(ideaRoutes, { prefix: '/api/clients/:clientId/ideas' });
  await app.register(composeRoutes, { prefix: '/api/clients/:clientId' });
  await app.register(assetRoutes, { prefix: '/api/clients/:clientId/assets' });

  app.get('/api/health', async () => ({ ok: true }));
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

const isMain = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
if (isMain) {
  const app = await buildServer();
  await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' });
}
