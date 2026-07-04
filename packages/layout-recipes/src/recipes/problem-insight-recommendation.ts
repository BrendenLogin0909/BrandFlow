import type { LayoutRecipe } from '../types.js';
import { textSlot, treatmentSlot } from '../types.js';
import { assemble, icon, page, shape, text, treatmentColours } from '../helpers.js';
import { coverSlide, ctaSlide, slideProgress } from './carousel-common.js';

const SECTIONS = [
  { slot: 'problem', label: 'The problem', icon: 'alert-triangle' },
  { slot: 'insight', label: 'The insight', icon: 'lightbulb' },
  { slot: 'recommendation', label: 'What to do', icon: 'target' },
] as const;

export const problemInsightRecommendation: LayoutRecipe = {
  id: 'problem-insight-recommendation',
  version: 1,
  name: 'Problem → insight → recommendation carousel',
  formats: ['carousel', 'problem_solution', 'educational_carousel'],
  kind: 'carousel',
  canvas: { width: 1080, height: 1350 },
  safeArea: { top: 90, right: 90, bottom: 90, left: 90 },
  slideRange: { min: 5, max: 5 },
  slots: [
    { id: 'hook', kind: 'text', required: true, maxChars: 90, guidance: 'Cover hook naming the pain' },
    { id: 'problemTitle', kind: 'text', required: true, maxChars: 60, guidance: 'Problem headline' },
    { id: 'problem', kind: 'text', required: true, maxChars: 220, guidance: 'Problem body' },
    { id: 'insightTitle', kind: 'text', required: true, maxChars: 60, guidance: 'Insight headline' },
    { id: 'insight', kind: 'text', required: true, maxChars: 220, guidance: 'Insight body' },
    { id: 'recommendationTitle', kind: 'text', required: true, maxChars: 60, guidance: 'Recommendation headline' },
    { id: 'recommendation', kind: 'text', required: true, maxChars: 220, guidance: 'Actionable recommendation body' },
    { id: 'cta', kind: 'text', required: true, maxChars: 120, guidance: 'Closing call to action' },
    { id: 'treatment', kind: 'colourTreatment', required: false, guidance: 'Deck treatment' },
  ],
  variants: [
    { id: 'icon-anchored', description: 'Large section icon top-left of each slide', weight: 1 },
    { id: 'colour-block', description: 'Full-width colour band behind the section label', weight: 1 },
  ],
  constraints: {
    requiredSlotIds: ['hook', 'problem', 'insight', 'recommendation', 'cta'],
  },
  layout(fill, ctx) {
    const c = treatmentColours(treatmentSlot(fill, 'treatment'));
    const { heading, body } = ctx.brandTokens.fonts;
    const iconAnchored = ctx.variant === 'icon-anchored';

    const sectionSlides = SECTIONS.map((s, i) => {
      const title = textSlot(fill, `${s.slot}Title`);
      const bodyText = textSlot(fill, s.slot);
      const elements = [
        ...(iconAnchored
          ? [
              shape(ctx, 'rect', { x: 100, y: 130, width: 150, height: 150 }, { fill: c.accent, z: 2, cornerRadius: 36 }),
              icon(ctx, s.icon, { x: 137, y: 167, width: 76, height: 76 }, { colour: c.bg, z: 3 }),
              text(ctx, s.label.toUpperCase(), { x: 290, y: 180, width: 500, height: 50 }, {
                role: 'caption', font: body, size: 26, minSize: 14, weight: 700, colour: c.accent, z: 3,
              }),
            ]
          : [
              shape(ctx, 'rect', { x: 0, y: 140, width: 1080, height: 120 }, { fill: c.accent, z: 1, role: 'decoration' }),
              text(ctx, s.label.toUpperCase(), { x: 100, y: 175, width: 700, height: 54 }, {
                role: 'caption', font: body, size: 30, minSize: 16, weight: 700, colour: c.bg, z: 3,
              }),
            ]),
        text(ctx, title, { x: 100, y: 400, width: 860, height: 240 }, {
          role: 'headline', slotId: `${s.slot}Title`, font: heading, size: 60, minSize: 32, weight: 700,
          colour: c.fg, lineHeight: 1.2, z: 3,
        }),
        text(ctx, bodyText, { x: 100, y: 680, width: 860, height: 420 }, {
          role: 'body', slotId: s.slot, font: body, size: 34, minSize: 18, colour: c.fg, lineHeight: 1.45, z: 3,
        }),
        slideProgress(ctx, c, i + 2, 5),
      ];
      return page(ctx, this, s.label, c.bg, elements);
    });

    return assemble(ctx, this, 'carousel', [
      coverSlide(ctx, this, c, textSlot(fill, 'hook')),
      ...sectionSlides,
      ctaSlide(ctx, this, c, textSlot(fill, 'cta')),
    ]);
  },
};
