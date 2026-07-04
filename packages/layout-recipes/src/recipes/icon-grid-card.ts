/**
 * Icon-heavy recipe: a dense grid of icon tiles (4–8 concepts), each an
 * independent icon + label pair the reviewer can retile, recolour or delete.
 */
import type { Element } from '@brandflow/design-schema';
import type { LayoutRecipe } from '../types.js';
import { textSlot, listSlot, treatmentSlot } from '../types.js';
import { assemble, icon, page, shape, text, treatmentColours } from '../helpers.js';

export const iconGridCard: LayoutRecipe = {
  id: 'icon-grid-card',
  version: 1,
  name: 'Icon grid (icon-led)',
  formats: ['single_image', 'educational_carousel', 'mini_framework'],
  kind: 'single',
  canvas: { width: 1080, height: 1080 },
  safeArea: { top: 80, right: 80, bottom: 80, left: 80 },
  slots: [
    { id: 'headline', kind: 'text', required: true, maxChars: 70, guidance: 'What the grid covers, e.g. "Everything a launch touches"' },
    { id: 'items', kind: 'list', required: true, maxItems: 8, guidance: '4-8 concepts, each: label (max 3 words) + a lucide icon name' },
    { id: 'treatment', kind: 'colourTreatment', required: false, guidance: 'Card treatment' },
  ],
  variants: [
    { id: 'tiles', description: 'Filled square tiles, 3 per row', weight: 1 },
    { id: 'chips', description: 'Full-width horizontal chip rows', weight: 1 },
  ],
  constraints: { requiredSlotIds: ['headline', 'items'] },
  layout(fill, ctx) {
    const headline = textSlot(fill, 'headline');
    const items = listSlot(fill, 'items').slice(0, 8);
    const c = treatmentColours(treatmentSlot(fill, 'treatment'));
    const { heading, body } = ctx.brandTokens.fonts;
    const tiles = ctx.variant === 'tiles';

    const elements: Element[] = [
      text(ctx, headline, { x: 100, y: 110, width: 880, height: 150 }, {
        role: 'headline', slotId: 'headline', font: heading, size: 56, minSize: 30, weight: 800,
        colour: c.fg, lineHeight: 1.15, z: 3,
      }),
    ];

    if (tiles) {
      const cols = 3;
      const gap = 24;
      const tile = (880 - gap * (cols - 1)) / cols; // ≈277
      const rows = Math.ceil(items.length / cols);
      // grid area runs 300..1000; shrink tile height so any row count fits the safe area
      const h = Math.min(tile * 0.82, (700 - (rows - 1) * gap) / rows);
      items.forEach((item, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = 100 + col * (tile + gap);
        const y = 300 + row * (h + gap);
        elements.push(
          shape(ctx, 'rect', { x, y, width: tile, height: h }, { fill: c.accent, z: 2, cornerRadius: 28 }),
          icon(ctx, item.iconName ?? 'sparkles', { x: x + tile / 2 - 36, y: y + 34, width: 72, height: 72 }, {
            colour: c.bg, z: 3, slotId: 'items',
          }),
          text(ctx, item.text, { x: x + 12, y: y + h - 76, width: tile - 24, height: 60 }, {
            role: 'caption', font: body, size: 24, minSize: 14, weight: 700, colour: c.bg, align: 'center', z: 3,
          }),
        );
      });
    } else {
      const shown = items.slice(0, 6);
      shown.forEach((item, i) => {
        const y = 300 + i * 116;
        elements.push(
          shape(ctx, 'rect', { x: 100, y, width: 880, height: 96 }, { fill: c.accent, z: 2, cornerRadius: 48 }),
          icon(ctx, item.iconName ?? 'sparkles', { x: 128, y: y + 24, width: 48, height: 48 }, {
            colour: c.bg, z: 3, slotId: 'items',
          }),
          text(ctx, item.text, { x: 200, y: y + 26, width: 740, height: 48 }, {
            role: 'body', font: body, size: 30, minSize: 16, weight: 600, colour: c.bg, z: 3,
          }),
        );
      });
    }

    return assemble(ctx, this, 'single_image', [page(ctx, this, 'Icon grid', c.bg, elements)]);
  },
};
