import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import argon2 from 'argon2';

const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(10),
  name: z.string().min(1),
  organisationName: z.string().min(1),
  organisationType: z.enum(['AGENCY', 'COMPANY']).default('COMPANY'),
});

const LoginBody = z.object({ email: z.string().email(), password: z.string() });

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (req, reply) => {
    const body = RegisterBody.parse(req.body);
    const existing = await app.prisma.user.findUnique({ where: { email: body.email } });
    if (existing) return reply.code(409).send({ error: { code: 'EMAIL_TAKEN' } });

    const user = await app.prisma.user.create({
      data: {
        email: body.email,
        passwordHash: await argon2.hash(body.password),
        name: body.name,
      },
    });
    const org = await app.prisma.organisation.create({
      data: { name: body.organisationName, type: body.organisationType },
    });
    // An in-house company is an organisation with one client company: itself.
    const client = await app.prisma.clientCompany.create({
      data: { organisationId: org.id, name: body.organisationName, slug: 'default' },
    });
    await app.prisma.membership.create({
      data: {
        userId: user.id,
        organisationId: org.id,
        clientCompanyId: body.organisationType === 'AGENCY' ? null : client.id,
        role: body.organisationType === 'AGENCY' ? 'AGENCY_ADMIN' : 'CLIENT_ADMIN',
      },
    });

    const accessToken = app.jwt.sign({ userId: user.id }, { expiresIn: '15m' });
    const refreshToken = app.jwt.sign({ userId: user.id, refresh: true }, { expiresIn: '7d' });
    return reply.code(201).send({ accessToken, refreshToken, organisationId: org.id });
  });

  app.post('/login', async (req, reply) => {
    const body = LoginBody.parse(req.body);
    const user = await app.prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !(await argon2.verify(user.passwordHash, body.password)))
      return reply.code(401).send({ error: { code: 'INVALID_CREDENTIALS' } });

    const accessToken = app.jwt.sign({ userId: user.id }, { expiresIn: '15m' });
    const refreshToken = app.jwt.sign({ userId: user.id, refresh: true }, { expiresIn: '7d' });
    return { accessToken, refreshToken };
  });

  app.get('/me', async (req) => {
    const { userId } = (await req.jwtVerify()) as { userId: string };
    const user = await app.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });
    const memberships = await app.prisma.membership.findMany({
      where: { userId },
      include: {
        organisation: { select: { id: true, name: true, type: true } },
        clientCompany: { select: { id: true, name: true, slug: true } },
      },
    });
    return { user, memberships };
  });
}
