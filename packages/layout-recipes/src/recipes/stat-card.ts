import type { LayoutRecipe } from '../types.js';
import { textSlot, optionalTextSlot, treatmentSlot } from '../types.js';
import { assemble, page, shape, text, treatmentColours } from '../helpers.js';

export const statCard: LayoutRecipe = {
  id: 'stat-card',
  version: 1,
  name: 'Data point / statistic card',
  formats: ['statistic_card', 'single_image', 'case_study_graphic'],
  kind: 'single',
  canvas: { width: 1080, height: 1080 },
  safeArea: { top: 80, right: 80, bottom: 80, left: 80 },
  slots: [
    { id: 'statValue', kind: 'text', required: true, maxChars: 12, guidance: 'The number itself, e.g. "73%" or "4.2x"' },
    { id: 'statLabel', kind: 'text', required: true, maxChars: 60, guidance: 'What the number measures' },
    { id: 'context', kind: 'text', required: false, maxChars: 120, guidance: 'One-line source or implication' },
    { id: 'treatment', kind: 'colourTreatment', required: false, guidance: 'Card treatment' },
  ],
  variants: [
    { id: 'number-hero', description: 'Giant centred number', weight: 1 },
    { id: 'donut-side', description: 'Number left, progress ring right', weight: 1 },
  ],
  constraints: { requiredSlotIds: ['statValue', 'statLabel'] },
  layout(fill, ctx) {
    const value = textSlot(fill, 'statValue');
    const label = textSlot(fill, 'statLabel');
    const context = optionalTextSlot(fill, 'context');
    const c = treatmentColours(treatmentSlot(fill, 'treatment'));
    const { heading, body } = ctx.brandTokens.fonts;
    const hero = ctx.variant === 'number-hero';

    const elements = hero
      ? [
          text(ctx, value, { x: 140, y: 280, width: 800, height: 300 }, {
            role: 'data', slotId: 'statValue', font: heading, size: 240, minSize: 120, weight: 800,
            colour: c.accent, align: 'center', lineHeight: 1, z: 3,
          }),
          text(ctx, label, { x: 190, y: 620, width: 700, height: 140 }, {
            role: 'headline', slotId: 'statLabel', font: heading, size: 44, minSize: 24, weight: 600,
            colour: c.fg, align: 'center', z: 3,
          }),
        ]
      : [
          text(ctx, value, { x: 100, y: 380, width: 520, height: 240 }, {
            role: 'data', slotId: 'statValue', font: heading, size: 180, minSize: 96, weight: 800,
            colour: c.accent, lineHeight: 1, z: 3,
          }),
          text(ctx, label, { x: 100, y: 640, width: 520, height: 160 }, {
            role: 'headline', slotId: 'statLabel', font: heading, size: 40, minSize: 24, weight: 600, colour: c.fg, z: 3,
          }),
          // progress ring rendered as concentric ellipses (stays vector-editable)
          shape(ctx, 'ellipse', { x: 660, y: 400, width: 320, height: 320 }, { fill: c.accent, z: 2 }),
          shape(ctx, 'ellipse', { x: 700, y: 440, width: 240, height: 240 }, { fill: c.bg, z: 3 }),
        ];

    if (context)
      elements.push(
        text(ctx, context, { x: 140, y: 890, width: 800, height: 80 }, {
          role: 'caption', slotId: 'context', font: body, size: 24, minSize: 14, colour: c.fg,
          align: hero ? 'center' : 'left', z: 3,
        }),
      );
    elements.push(
      shape(ctx, 'rect', { x: 0, y: 1040, width: 1080, height: 40 }, { fill: c.accent, z: 1, role: 'decoration' }),
    );

    return assemble(ctx, this, 'statistic_card', [page(ctx, this, 'Stat', c.bg, elements)]);
  },
};
