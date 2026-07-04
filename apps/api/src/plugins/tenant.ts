/**
 * Tenant + capability enforcement. Every client-scoped route registers with
 * `requires` capabilities; this plugin resolves the JWT, verifies membership
 * for the :clientId path param, and attaches the tenant context.
 * Missing membership → 404 (cross-tenant existence is never revealed).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { PrismaClient } from '@prisma/client';
import { roleHas, type Capability, type Role } from '@brandflow/shared';

declare module 'fastify' {
  interface FastifyRequest {
    tenant?: {
      userId: string;
      organisationId: string;
      clientCompanyId: string;
      role: Role;
    };
  }
}

export interface TenantGuardOptions {
  requires: Capability[];
}

export default fp(async function tenantPlugin(app: FastifyInstance) {
  const prisma = app.getDecorator<PrismaClient>('prisma');

  app.decorate(
    'tenantGuard',
    (opts: TenantGuardOptions) =>
      async (req: FastifyRequest, reply: FastifyReply) => {
        const { userId } = (await req.jwtVerify()) as { userId: string };
        const clientId = (req.params as { clientId?: string }).clientId;
        if (!clientId) return reply.code(400).send({ error: { code: 'MISSING_CLIENT' } });

        // Direct client membership, or org-wide membership covering this client.
        const membership = await prisma.membership.findFirst({
          where: {
            userId,
            OR: [
              { clientCompanyId: clientId },
              { clientCompanyId: null, organisation: { clients: { some: { id: clientId } } } },
            ],
          },
          include: { organisation: true },
        });
        if (!membership) return reply.code(404).send({ error: { code: 'NOT_FOUND' } });

        for (const cap of opts.requires) {
          if (!roleHas(membership.role as Role, cap))
            return reply.code(403).send({ error: { code: 'FORBIDDEN', message: `Requires ${cap}` } });
        }

        req.tenant = {
          userId,
          organisationId: membership.organisationId,
          clientCompanyId: clientId,
          role: membership.role as Role,
        };
      },
  );
});

declare module 'fastify' {
  interface FastifyInstance {
    tenantGuard: (opts: TenantGuardOptions) => (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  }
}
