/** Shared cover and CTA slide builders for carousel recipes. */
import type { Page } from '@brandflow/design-schema';
import type { LayoutContext, LayoutRecipe } from '../types.js';
import { page, shape, text, treatmentColours } from '../helpers.js';

type Colours = ReturnType<typeof treatmentColours>;

export function coverSlide(
  ctx: LayoutContext,
  recipe: LayoutRecipe,
  c: Colours,
  hook: string,
  kicker?: string | null,
): Page {
  const { heading, body } = ctx.brandTokens.fonts;
  const elements = [
    shape(ctx, 'rect', { x: 0, y: 0, width: 24, height: 1350 }, { fill: c.accent, z: 1, role: 'decoration' }),
    text(ctx, hook, { x: 110, y: 420, width: 860, height: 460 }, {
      role: 'headline', slotId: 'hook', font: heading, size: 88, minSize: 48, weight: 800,
      colour: c.fg, lineHeight: 1.12, z: 3,
    }),
    text(ctx, 'Swipe →', { x: 110, y: 1180, width: 300, height: 60 }, {
      role: 'cta', font: body, size: 28, minSize: 16, weight: 600, colour: c.accent, z: 3,
    }),
  ];
  if (kicker)
    elements.push(
      text(ctx, kicker.toUpperCase(), { x: 110, y: 330, width: 700, height: 60 }, {
        role: 'caption', slotId: 'kicker', font: body, size: 26, minSize: 14, weight: 700, colour: c.accent, z: 3,
      }),
    );
  return page(ctx, recipe, 'Cover', c.bg, elements);
}

export function ctaSlide(ctx: LayoutContext, recipe: LayoutRecipe, c: Colours, cta: string): Page {
  const { heading, body } = ctx.brandTokens.fonts;
  return page(ctx, recipe, 'CTA', c.bg, [
    shape(ctx, 'rect', { x: 0, y: 1100, width: 1080, height: 250 }, { fill: c.accent, z: 1, role: 'decoration' }),
    text(ctx, cta, { x: 110, y: 480, width: 860, height: 360 }, {
      role: 'headline', slotId: 'cta', font: heading, size: 64, minSize: 36, weight: 700,
      colour: c.fg, lineHeight: 1.2, z: 3,
    }),
    text(ctx, 'Follow for more', { x: 110, y: 1160, width: 500, height: 60 }, {
      role: 'cta', font: body, size: 30, minSize: 16, weight: 600, colour: c.bg, z: 3,
    }),
  ]);
}

export function slideProgress(
  ctx: LayoutContext,
  c: Colours,
  index: number,
  total: number,
) {
  const { body } = ctx.brandTokens.fonts;
  return text(ctx, `${index} / ${total}`, { x: 850, y: 100, width: 130, height: 44 }, {
    role: 'caption', font: body, size: 24, minSize: 14, colour: c.accent, align: 'right', z: 3,
  });
}
