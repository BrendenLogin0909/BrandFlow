import type { LayoutRecipe } from '../types.js';
import { textSlot, listSlot, treatmentSlot } from '../types.js';
import { assemble, page, shape, text, treatmentColours } from '../helpers.js';
import { coverSlide, ctaSlide, slideProgress } from './carousel-common.js';

export const numberedListCarousel: LayoutRecipe = {
  id: 'numbered-list-carousel',
  version: 1,
  name: 'Numbered list carousel',
  formats: ['carousel', 'educational_carousel'],
  kind: 'carousel',
  canvas: { width: 1080, height: 1350 },
  safeArea: { top: 90, right: 90, bottom: 90, left: 90 },
  slideRange: { min: 4, max: 9 },
  slots: [
    { id: 'hook', kind: 'text', required: true, maxChars: 90, guidance: 'Cover hook, curiosity-driven' },
    { id: 'kicker', kind: 'text', required: false, maxChars: 30, guidance: 'Small category label above the hook' },
    { id: 'items', kind: 'list', required: true, maxItems: 7, guidance: '3-7 items, each: title (max 60 chars) + body (max 180 chars)' },
    { id: 'cta', kind: 'text', required: true, maxChars: 120, guidance: 'Closing call to action' },
    { id: 'treatment', kind: 'colourTreatment', required: false, guidance: 'Deck treatment' },
  ],
  variants: [
    { id: 'left-number-rail', description: 'Large number in a left rail', weight: 1 },
    { id: 'top-number-chip', description: 'Number in a rounded chip top-left', weight: 1 },
  ],
  constraints: { requiredSlotIds: ['hook', 'items', 'cta'] },
  layout(fill, ctx) {
    const c = treatmentColours(treatmentSlot(fill, 'treatment'));
    const { heading, body } = ctx.brandTokens.fonts;
    const items = listSlot(fill, 'items').slice(0, 7);
    const rail = ctx.variant === 'left-number-rail';
    const total = items.length + 2;

    const itemSlides = items.map((item, i) => {
      const n = `${i + 1}`;
      const elements = rail
        ? [
            shape(ctx, 'rect', { x: 0, y: 0, width: 240, height: 1350 }, { fill: c.accent, z: 1, role: 'decoration' }),
            // sits inside the decorative rail, so exempt from safe-margin rules
            text(ctx, n, { x: 40, y: 560, width: 160, height: 200 }, {
              role: 'decoration', font: heading, size: 140, minSize: 80, weight: 800, colour: c.bg, align: 'center', lineHeight: 1, z: 2,
            }),
            text(ctx, item.title ?? item.text, { x: 320, y: 420, width: 640, height: 260 }, {
              role: 'headline', slotId: `items.${i}.title`, font: heading, size: 56, minSize: 30, weight: 700,
              colour: c.fg, lineHeight: 1.2, z: 3,
            }),
            text(ctx, item.text, { x: 320, y: 720, width: 640, height: 340 }, {
              role: 'body', slotId: `items.${i}.body`, font: body, size: 32, minSize: 18, colour: c.fg, lineHeight: 1.45, z: 3,
            }),
          ]
        : [
            shape(ctx, 'rect', { x: 100, y: 130, width: 140, height: 140 }, { fill: c.accent, z: 2, cornerRadius: 70 }),
            text(ctx, n, { x: 100, y: 160, width: 140, height: 90 }, {
              role: 'data', font: heading, size: 72, minSize: 44, weight: 800, colour: c.bg, align: 'center', lineHeight: 1, z: 3,
            }),
            text(ctx, item.title ?? item.text, { x: 100, y: 360, width: 860, height: 260 }, {
              role: 'headline', slotId: `items.${i}.title`, font: heading, size: 60, minSize: 32, weight: 700,
              colour: c.fg, lineHeight: 1.2, z: 3,
            }),
            text(ctx, item.text, { x: 100, y: 660, width: 860, height: 380 }, {
              role: 'body', slotId: `items.${i}.body`, font: body, size: 34, minSize: 18, colour: c.fg, lineHeight: 1.45, z: 3,
            }),
          ];
      elements.push(slideProgress(ctx, c, i + 2, total));
      return page(ctx, this, `Item ${n}`, c.bg, elements);
    });

    return assemble(ctx, this, 'carousel', [
      coverSlide(ctx, this, c, textSlot(fill, 'hook'), fill.slots['kicker']?.kind === 'text' ? textSlot(fill, 'kicker') : null),
      ...itemSlides,
      ctaSlide(ctx, this, c, textSlot(fill, 'cta')),
    ]);
  },
};
