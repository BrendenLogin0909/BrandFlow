import type { Element } from '@brandflow/design-schema';
import type { LayoutRecipe } from '../types.js';
import { textSlot, listSlot, treatmentSlot } from '../types.js';
import { assemble, icon, page, shape, text, treatmentColours } from '../helpers.js';

export const bigHeadlineIcons: LayoutRecipe = {
  id: 'big-headline-icons',
  version: 1,
  name: 'Big headline + supporting text + icon cluster',
  formats: ['single_image', 'announcement_graphic', 'problem_solution', 'educational_carousel'],
  kind: 'single',
  canvas: { width: 1080, height: 1350 },
  safeArea: { top: 90, right: 90, bottom: 90, left: 90 },
  slots: [
    { id: 'headline', kind: 'text', required: true, maxChars: 80, guidance: 'Big claim or hook, max 8 words works best' },
    { id: 'support', kind: 'text', required: true, maxChars: 140, guidance: 'One supporting sentence' },
    { id: 'icons', kind: 'list', required: true, maxItems: 5, guidance: '3-5 items, each: short label (max 3 words) + a lucide icon name matching the concept' },
    { id: 'treatment', kind: 'colourTreatment', required: false, guidance: 'Card treatment' },
  ],
  variants: [
    { id: 'icons-bottom-row', description: 'Headline top, icon row bottom', weight: 1 },
    { id: 'icons-right-column', description: 'Headline left, icon column right', weight: 1 },
  ],
  constraints: { requiredSlotIds: ['headline', 'support', 'icons'] },
  layout(fill, ctx) {
    const headline = textSlot(fill, 'headline');
    const support = textSlot(fill, 'support');
    const items = listSlot(fill, 'icons').slice(0, 5);
    const c = treatmentColours(treatmentSlot(fill, 'treatment'));
    const { heading, body } = ctx.brandTokens.fonts;
    const bottomRow = ctx.variant === 'icons-bottom-row';

    const elements: Element[] = [
      text(ctx, headline, bottomRow
        ? { x: 100, y: 140, width: 880, height: 320 }
        : { x: 100, y: 140, width: 600, height: 460 }, {
        role: 'headline', slotId: 'headline', font: heading, size: 84, minSize: 44, weight: 800,
        colour: c.fg, lineHeight: 1.12, z: 3,
      }),
      text(ctx, support, bottomRow
        ? { x: 100, y: 500, width: 780, height: 140 }
        : { x: 100, y: 640, width: 600, height: 180 }, {
        role: 'body', slotId: 'support', font: body, size: 32, minSize: 18, colour: c.fg, lineHeight: 1.4, z: 3,
      }),
    ];

    items.forEach((item, i) => {
      const f = bottomRow
        ? { x: 100 + i * (880 / Math.max(items.length, 1)), y: 900 }
        : { x: 780, y: 160 + i * 200 };
      const cell = bottomRow ? 880 / items.length : 200;
      elements.push(
        shape(ctx, 'rect', { x: f.x, y: f.y, width: 120, height: 120 }, { fill: c.accent, z: 2, cornerRadius: 28 }),
        icon(ctx, item.iconName ?? 'sparkles', { x: f.x + 30, y: f.y + 30, width: 60, height: 60 }, {
          colour: c.bg, z: 3, slotId: 'icons',
        }),
        text(ctx, item.text, { x: Math.max(f.x - 20, 92), y: f.y + 136, width: Math.max(cell - 20, 160), height: 70 }, {
          role: 'caption', font: body, size: 24, minSize: 14, weight: 600, colour: c.fg,
          align: bottomRow ? 'center' : 'left', z: 3,
        }),
      );
    });

    return assemble(ctx, this, 'single_image', [page(ctx, this, 'Main', c.bg, elements)]);
  },
};
