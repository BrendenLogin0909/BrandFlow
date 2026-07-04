import type { Element } from '@brandflow/design-schema';
import type { LayoutRecipe } from '../types.js';
import { textSlot, optionalTextSlot, treatmentSlot } from '../types.js';
import { assemble, page, shape, text, treatmentColours } from '../helpers.js';

export const quoteCard: LayoutRecipe = {
  id: 'quote-card',
  version: 1,
  name: 'Quote card with author attribution',
  formats: ['quote_card', 'founder_insight_card', 'single_image'],
  kind: 'single',
  canvas: { width: 1080, height: 1080 },
  safeArea: { top: 80, right: 80, bottom: 80, left: 80 },
  slots: [
    { id: 'quote', kind: 'text', required: true, maxChars: 220, guidance: 'The quote itself, punchy, no surrounding quote marks' },
    { id: 'authorName', kind: 'text', required: true, maxChars: 40, guidance: 'Person being quoted' },
    { id: 'authorTitle', kind: 'text', required: false, maxChars: 60, guidance: 'Role and company' },
    { id: 'treatment', kind: 'colourTreatment', required: false, guidance: 'light, dark or accent card treatment' },
  ],
  variants: [
    { id: 'serif-centered', description: 'Centered quote, large quotation mark above', weight: 1 },
    { id: 'left-bar-accent', description: 'Left-aligned with vertical accent bar', weight: 1 },
  ],
  constraints: { requiredSlotIds: ['quote', 'authorName'] },
  layout(fill, ctx) {
    const quote = textSlot(fill, 'quote');
    const author = textSlot(fill, 'authorName');
    const title = optionalTextSlot(fill, 'authorTitle');
    const c = treatmentColours(treatmentSlot(fill, 'treatment'));
    const { heading, body } = ctx.brandTokens.fonts;
    const centered = ctx.variant === 'serif-centered';
    const align = centered ? ('center' as const) : ('left' as const);
    const x = centered ? 140 : 200;
    const width = centered ? 800 : 760;

    const elements: Element[] = [
      // oversized decorative quotation mark
      text(ctx, '“', { x: centered ? 490 : 120, y: 96, width: 140, height: 180 }, {
        role: 'decoration', font: heading, size: 160, minSize: 160, weight: 700, colour: c.accent,
        align, lineHeight: 1.0, z: 2,
      }),
      text(ctx, quote, { x, y: 300, width, height: 420 }, {
        role: 'headline', slotId: 'quote', font: heading, size: 54, minSize: 32, weight: 600,
        colour: c.fg, align, lineHeight: 1.35, z: 3,
      }),
      text(ctx, author, { x, y: 780, width, height: 50 }, {
        role: 'attribution', slotId: 'authorName', font: body, size: 30, minSize: 18, weight: 700, colour: c.fg, align, z: 3,
      }),
    ];
    if (title)
      elements.push(
        text(ctx, title, { x, y: 836, width, height: 44 }, {
          role: 'caption', slotId: 'authorTitle', font: body, size: 24, minSize: 14, colour: c.accent, align, z: 3,
        }),
      );
    if (!centered)
      elements.push(
        shape(ctx, 'rect', { x: 120, y: 300, width: 12, height: 420 }, { fill: c.accent, z: 2, cornerRadius: 6 }),
      );

    return assemble(ctx, this, 'quote_card', [page(ctx, this, 'Quote', c.bg, elements)]);
  },
};
