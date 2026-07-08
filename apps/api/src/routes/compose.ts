import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { composeFreeform } from '../services/freeform.js';
import { activeProviderName } from '../ai/provider.js';
import { VisualDirectionSchema, formatVisualDirectionBrief } from '@brandflow/shared';

const ComposeBody = z.object({
  /** What to design: idea/draft text, on-image copy, style notes. */
  brief: z.string().min(1).max(4000),
  format: z.string().max(40).optional(),
  visualDirection: VisualDirectionSchema.optional(),
  /** The playground's current brand tokens (validated hex + fonts). */
  brandTokens: z.object({
    colours: z.record(z.string().regex(/^#[0-9a-fA-F]{6}$/)),
    fonts: z.object({ heading: z.string().min(1), body: z.string().min(1) }),
  }),
  contrastMode: z.enum(['enforce', 'warn']).default('enforce'),
});

export async function composeRoutes(app: FastifyInstance) {
  const generate = { preHandler: app.tenantGuard({ requires: ['content:generate'] }) };

  /**
   * Interactive freeform composition: the AI invents the full layout for
   * the brief, bounded by brand tokens + the validation engine (one
   * violation-guided repair round). Nothing is persisted — the playground
   * shows the result and the user decides whether to save.
   */
  app.post('/compose-sync', generate, async (req, reply) => {
    const body = ComposeBody.parse(req.body);
    const vdBrief = formatVisualDirectionBrief(body.visualDirection);
    const brief = vdBrief ? `${body.brief}\n\nVisual direction:\n${vdBrief}` : body.brief;
    const result = await composeFreeform(
      {
        brief,
        format: body.format,
        visualDirection: body.visualDirection,
        brandTokens: Object.keys(body.brandTokens.colours),
        fonts: body.brandTokens.fonts,
      },
      {
        brandProfileId: 'playground',
        clientCompanyId: req.tenant!.clientCompanyId,
        brandTokens: { ...body.brandTokens, logoAssetIds: [] },
      },
      { contrastMode: body.contrastMode },
    );
    if (!result)
      return reply
        .code(422)
        .send({ error: { code: 'COMPOSE_FAILED', message: 'The AI could not produce a valid composition — try again or adjust the brief' } });

    await app.prisma.generationJob.create({
      data: {
        organisationId: req.tenant!.organisationId,
        clientCompanyId: req.tenant!.clientCompanyId,
        kind: 'design_freeform',
        status: 'succeeded',
        input: { brief: body.brief.slice(0, 500) },
        finishedAt: new Date(),
      },
    });
    return { ...result, provider: activeProviderName() };
  });
}
