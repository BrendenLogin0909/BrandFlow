/**
 * Image-heavy recipe: layered photo composition — background photo,
 * tinted scrim, badge chip, kicker, headline. Demonstrates images-under-
 * elements layering; the photo is an editable ImageElement the reviewer
 * can replace from the asset library.
 */
import type { Element } from '@brandflow/design-schema';
import type { LayoutRecipe, RecipeFill } from '../types.js';
import { textSlot, optionalTextSlot } from '../types.js';
import { assemble, image, page, shape, text, token } from '../helpers.js';

function imageSlot(fill: RecipeFill, id: string): string | undefined {
  const v = fill.slots[id];
  return v?.kind === 'image' ? v.assetId : undefined;
}

export const photoHeroCard: LayoutRecipe = {
  id: 'photo-hero-card',
  version: 1,
  name: 'Photo hero card (image-led)',
  formats: ['single_image', 'event_promo', 'announcement_graphic', 'case_study_graphic'],
  kind: 'single',
  canvas: { width: 1080, height: 1350 },
  safeArea: { top: 90, right: 90, bottom: 90, left: 90 },
  slots: [
    { id: 'photo', kind: 'image', required: false, guidance: 'Approved library photo matching the post subject; a placeholder is used when none fits' },
    { id: 'headline', kind: 'text', required: true, maxChars: 90, guidance: 'Hero statement over the photo' },
    { id: 'kicker', kind: 'text', required: false, maxChars: 30, guidance: 'Small category label above the headline' },
    { id: 'badge', kind: 'text', required: false, maxChars: 20, guidance: 'Short badge chip, e.g. "NEW" or an event date' },
  ],
  variants: [
    { id: 'full-bleed-scrim', description: 'Full-bleed photo, dark scrim, text bottom-left', weight: 1 },
    { id: 'split-top-image', description: 'Photo top 55%, solid brand panel below with text', weight: 1 },
  ],
  constraints: { requiredSlotIds: ['headline'] },
  layout(fill, ctx) {
    const headline = textSlot(fill, 'headline');
    const kicker = optionalTextSlot(fill, 'kicker');
    const badge = optionalTextSlot(fill, 'badge');
    const assetId = imageSlot(fill, 'photo');
    const { heading, body } = ctx.brandTokens.fonts;
    const fullBleed = ctx.variant === 'full-bleed-scrim';

    const elements: Element[] = [];

    if (fullBleed) {
      // photo covers the canvas; translucent scrim guarantees legibility;
      // page background is dark so validation's contrast baseline matches the scrim
      elements.push(
        image(ctx, { x: 0, y: 0, width: 1080, height: 1350 }, { z: 1, assetId, role: 'background', slotId: 'photo' }),
        shape(ctx, 'rect', { x: 0, y: 640, width: 1080, height: 710 }, {
          fill: token('text'), z: 2, role: 'decoration',
        }),
      );
      // soften the scrim's top edge
      elements[1]!.opacity = 0.82;
      elements.push(
        text(ctx, headline, { x: 100, y: 880, width: 880, height: 300 }, {
          role: 'headline', slotId: 'headline', font: heading, size: 76, minSize: 40, weight: 800,
          colour: token('background'), lineHeight: 1.12, z: 4,
        }),
      );
      if (kicker)
        elements.push(
          text(ctx, kicker.toUpperCase(), { x: 100, y: 800, width: 700, height: 56 }, {
            role: 'caption', slotId: 'kicker', font: body, size: 26, minSize: 14, weight: 700,
            colour: token('accent'), z: 4,
          }),
        );
    } else {
      elements.push(
        image(ctx, { x: 0, y: 0, width: 1080, height: 742 }, { z: 1, assetId, role: 'background', slotId: 'photo' }),
        shape(ctx, 'rect', { x: 0, y: 742, width: 1080, height: 608 }, {
          fill: token('primary'), z: 2, role: 'decoration',
        }),
        // accent keyline where photo meets panel
        shape(ctx, 'rect', { x: 0, y: 742, width: 1080, height: 10 }, { fill: token('accent'), z: 3 }),
        text(ctx, headline, { x: 100, y: 850, width: 880, height: 300 }, {
          role: 'headline', slotId: 'headline', font: heading, size: 72, minSize: 38, weight: 800,
          colour: token('background'), lineHeight: 1.15, z: 4,
        }),
      );
      if (kicker)
        elements.push(
          text(ctx, kicker.toUpperCase(), { x: 100, y: 790, width: 700, height: 50 }, {
            role: 'caption', slotId: 'kicker', font: body, size: 24, minSize: 14, weight: 700,
            colour: token('accent'), z: 4,
          }),
        );
    }

    if (badge)
      elements.push(
        shape(ctx, 'rect', { x: 100, y: 120, width: 260, height: 76 }, {
          fill: token('accent'), z: 5, cornerRadius: 38, role: 'badge',
        }),
        text(ctx, badge.toUpperCase(), { x: 120, y: 138, width: 220, height: 44 }, {
          role: 'badge', slotId: 'badge', font: body, size: 26, minSize: 14, weight: 800,
          colour: token('text'), align: 'center', z: 6,
        }),
      );

    const background = fullBleed ? token('text') : token('background');
    return assemble(ctx, this, 'single_image', [page(ctx, this, 'Hero', background, elements)]);
  },
};
