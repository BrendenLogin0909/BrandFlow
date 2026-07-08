import { describe, expect, it } from 'vitest';
import type { BrandTokensSnapshot } from '@brandflow/design-schema';
import { RECIPES } from '@brandflow/layout-recipes';
import type { LayoutContext, LayoutRecipe, RecipeFill } from '@brandflow/layout-recipes';
import { exportPageSvg, exportPptx } from '@brandflow/exporters';
import { importSvgString } from './svg.js';
import { importPptxBuffer } from './pptx.js';

const brand: BrandTokensSnapshot = {
  colours: {
    primary: '#1a3c8f',
    secondary: '#4a6fd4',
    accent: '#e8b23a',
    neutral: '#8a8f98',
    background: '#ffffff',
    text: '#101418',
  },
  fonts: { heading: 'Inter', body: 'Inter' },
  logoAssetIds: [],
};

let idCounter = 0;
const uuid = () => `00000000-0000-4000-8000-${(idCounter++).toString(16).padStart(12, '0')}`;

function ctx(recipe: LayoutRecipe): LayoutContext {
  return {
    documentId: uuid(),
    brandProfileId: 'brand-1',
    clientCompanyId: 'client-1',
    brandTokens: brand,
    variant: recipe.variants[0]!.id,
    seed: 1,
    newId: uuid,
  };
}

function fill(recipe: LayoutRecipe): RecipeFill {
  const slots: RecipeFill['slots'] = {};
  for (const slot of recipe.slots) {
    if (slot.kind === 'text')
      slots[slot.id] = { kind: 'text', text: 'Round trip headline'.slice(0, slot.maxChars) };
    else if (slot.kind === 'list')
      slots[slot.id] = {
        kind: 'list',
        items: [{ title: 'Point', text: 'Supporting copy.', iconName: 'sparkles' }],
      };
    else if (slot.kind === 'colourTreatment')
      slots[slot.id] = { kind: 'colourTreatment', treatment: 'light' };
    else if (slot.kind === 'image') slots[slot.id] = { kind: 'image', assetId: 'asset-demo-1' };
    else if (slot.kind === 'icon') slots[slot.id] = { kind: 'icon', provider: 'lucide', name: 'sparkles' };
  }
  return { slots };
}

describe('SVG round-trip', () => {
  it('preserves text elements from a recipe export', () => {
    const recipe = RECIPES.find((r) => r.id === 'quote-card')!;
    const doc = recipe.layout(fill(recipe), ctx(recipe));
    const svg = exportPageSvg(doc, 0);
    const { document: imported, report } = importSvgString(svg, { base: doc, newId: uuid });
    expect(report.matchedElements).toBeGreaterThan(0);
    const texts = imported.pages[0]!.elements.filter((e) => e.type === 'text');
    expect(texts.some((t) => t.type === 'text' && t.text.includes('Round trip'))).toBe(true);
  });
});

describe('PPTX round-trip (beta)', () => {
  it('imports text from a BrandFlow-exported deck', async () => {
    const recipe = RECIPES.find((r) => r.id === 'quote-card')!;
    const doc = recipe.layout(fill(recipe), ctx(recipe));
    const buf = await exportPptx(doc);
    const { document: imported, report } = await importPptxBuffer(buf, { base: doc, newId: uuid });
    expect(report.beta).toBe(true);
    expect(report.matchedElements).toBeGreaterThan(0);
    expect(imported.pages[0]!.elements.length).toBeGreaterThan(0);
  });
});
