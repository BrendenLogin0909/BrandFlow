import type { LayoutRecipe } from '../types.js';
import { textSlot, listSlot, treatmentSlot } from '../types.js';
import { assemble, icon, page, shape, text, treatmentColours } from '../helpers.js';
import { coverSlide, ctaSlide, slideProgress } from './carousel-common.js';

export const checklistCarousel: LayoutRecipe = {
  id: 'checklist-carousel',
  version: 1,
  name: 'Checklist carousel',
  formats: ['carousel', 'checklist_carousel', 'educational_carousel'],
  kind: 'carousel',
  canvas: { width: 1080, height: 1350 },
  safeArea: { top: 90, right: 90, bottom: 90, left: 90 },
  slideRange: { min: 3, max: 9 },
  slots: [
    { id: 'hook', kind: 'text', required: true, maxChars: 90, guidance: 'Cover hook, e.g. "The pre-launch checklist"' },
    { id: 'items', kind: 'list', required: true, maxItems: 12, guidance: 'Checklist items: title (max 50) + optional detail (max 140)' },
    { id: 'cta', kind: 'text', required: true, maxChars: 120, guidance: 'Closing call to action' },
    { id: 'treatment', kind: 'colourTreatment', required: false, guidance: 'Deck treatment' },
  ],
  variants: [
    { id: 'one-per-slide', description: 'One checklist item per slide with large check', weight: 1 },
    { id: 'grouped-3', description: 'Three items per slide as check rows', weight: 1 },
  ],
  constraints: { requiredSlotIds: ['hook', 'items', 'cta'] },
  layout(fill, ctx) {
    const c = treatmentColours(treatmentSlot(fill, 'treatment'));
    const { heading, body } = ctx.brandTokens.fonts;
    const items = listSlot(fill, 'items').slice(0, 12);
    const grouped = ctx.variant === 'grouped-3';

    const contentSlides = grouped
      ? chunk(items, 3).map((group, gi, all) => {
          const elements = group.flatMap((item, i) => [
            shape(ctx, 'rect', { x: 100, y: 200 + i * 360, width: 100, height: 100 }, { fill: c.accent, z: 2, cornerRadius: 24 }),
            icon(ctx, 'check', { x: 122, y: 222 + i * 360, width: 56, height: 56 }, { colour: c.bg, z: 3 }),
            text(ctx, item.title ?? item.text, { x: 240, y: 205 + i * 360, width: 720, height: 110 }, {
              role: 'headline', slotId: `items.${gi * 3 + i}.title`, font: heading, size: 42, minSize: 24,
              weight: 700, colour: c.fg, lineHeight: 1.2, z: 3,
            }),
            text(ctx, item.text, { x: 240, y: 325 + i * 360, width: 720, height: 170 }, {
              role: 'body', slotId: `items.${gi * 3 + i}.body`, font: body, size: 28, minSize: 16, colour: c.fg, lineHeight: 1.4, z: 3,
            }),
          ]);
          elements.push(slideProgress(ctx, c, gi + 2, all.length + 2));
          return page(ctx, this, `Checklist ${gi + 1}`, c.bg, elements);
        })
      : items.map((item, i) => {
          const elements = [
            shape(ctx, 'rect', { x: 100, y: 160, width: 170, height: 170 }, { fill: c.accent, z: 2, cornerRadius: 44 }),
            icon(ctx, 'check', { x: 140, y: 200, width: 90, height: 90 }, { colour: c.bg, z: 3 }),
            text(ctx, item.title ?? item.text, { x: 100, y: 440, width: 860, height: 280 }, {
              role: 'headline', slotId: `items.${i}.title`, font: heading, size: 62, minSize: 32, weight: 700,
              colour: c.fg, lineHeight: 1.2, z: 3,
            }),
            text(ctx, item.text, { x: 100, y: 760, width: 860, height: 360 }, {
              role: 'body', slotId: `items.${i}.body`, font: body, size: 34, minSize: 18, colour: c.fg, lineHeight: 1.45, z: 3,
            }),
            slideProgress(ctx, c, i + 2, items.length + 2),
          ];
          return page(ctx, this, `Item ${i + 1}`, c.bg, elements);
        });

    return assemble(ctx, this, 'carousel', [
      coverSlide(ctx, this, c, textSlot(fill, 'hook')),
      ...contentSlides,
      ctaSlide(ctx, this, c, textSlot(fill, 'cta')),
    ]);
  },
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
