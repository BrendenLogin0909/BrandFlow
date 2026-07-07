import { describe, expect, it } from 'vitest';
import type { BrandTokensSnapshot } from '@brandflow/design-schema';
import { RECIPES } from '@brandflow/layout-recipes';
import type { LayoutContext, LayoutRecipe, RecipeFill } from '@brandflow/layout-recipes';
import { exportAllPagesSvg, exportPageSvg } from './svg.js';
import { exportPptx } from './pptx.js';

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
      slots[slot.id] = { kind: 'text', text: 'Editable output everywhere'.slice(0, slot.maxChars) };
    else if (slot.kind === 'list')
      slots[slot.id] = {
        kind: 'list',
        items: [
          { title: 'First point', text: 'Short supporting sentence.', iconName: 'sparkles' },
          { title: 'Second point', text: 'Another supporting sentence.', iconName: 'target' },
          { title: 'Third point', text: 'A final supporting sentence.', iconName: 'check' },
        ],
      };
    else if (slot.kind === 'colourTreatment')
      slots[slot.id] = { kind: 'colourTreatment', treatment: 'light' };
    else if (slot.kind === 'image') slots[slot.id] = { kind: 'image', assetId: 'asset-demo-1' };
    else if (slot.kind === 'icon')
      slots[slot.id] = { kind: 'icon', provider: 'lucide', name: 'sparkles' };
  }
  return { slots };
}

describe('SVG exporter', () => {
  for (const recipe of RECIPES) {
    it(`${recipe.id}: every page exports layered, editable SVG`, () => {
      const doc = recipe.layout(fill(recipe), ctx(recipe));
      const svgs = exportAllPagesSvg(doc);
      expect(svgs).toHaveLength(doc.pages.length);
      for (const svg of svgs) {
        // real text elements (editable), not outlined paths
        expect(svg).toContain('<text');
        expect(svg).not.toMatch(/<path[^>]*data-role="headline"/);
        // brand token colours resolved to hex
        expect(svg).toMatch(/#(1a3c8f|101418|ffffff)/i);
        // element ids preserved for round-tripping and comments
        expect(svg).toContain('data-name=');
      }
    });
  }

  it('embeds a Google Fonts @import + fallback stack for webfont families', () => {
    const recipe = RECIPES.find((r) => r.id === 'quote-card')!;
    const doc = recipe.layout(fill(recipe), ctx(recipe)); // brand fonts = Inter
    const svg = exportPageSvg(doc, 0);
    expect(svg).toContain('fonts.googleapis.com/css2?family=Inter');
    expect(svg).toContain('@import');
    expect(svg).toContain("font-family=\"'Inter', sans-serif\"");
  });

  it('renders an asset-credits line only when attributions are present', () => {
    const recipe = RECIPES.find((r) => r.id === 'quote-card')!;
    const doc = recipe.layout(fill(recipe), ctx(recipe));
    expect(exportPageSvg(doc, 0)).not.toContain('asset-credits');
    doc.attributions = ['Jane Doe / openverse', 'Acme / wikimedia'];
    const svg = exportPageSvg(doc, 0);
    expect(svg).toContain('id="asset-credits"');
    expect(svg).toContain('Credits: Jane Doe / openverse · Acme / wikimedia');
  });

  it('escapes XML in text content', () => {
    const recipe = RECIPES.find((r) => r.id === 'quote-card')!;
    const f = fill(recipe);
    f.slots['quote'] = { kind: 'text', text: 'A < B & "C" > D' };
    const doc = recipe.layout(f, ctx(recipe));
    const svg = exportPageSvg(doc, 0);
    expect(svg).toContain('A &lt; B &amp; &quot;C&quot; &gt; D');
  });
});

describe('PPTX exporter', () => {
  it('exports a carousel as a valid PPTX (ZIP) with one slide per page', async () => {
    const recipe = RECIPES.find((r) => r.id === 'numbered-list-carousel')!;
    const doc = recipe.layout(fill(recipe), ctx(recipe));
    const buf = await exportPptx(doc);
    // PPTX files are ZIP archives: PK magic bytes
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(buf.length).toBeGreaterThan(5000);
    const raw = buf.toString('latin1');
    // one slide XML entry per page
    for (let i = 1; i <= doc.pages.length; i++) expect(raw).toContain(`slide${i}.xml`);
  });

  it('exports a single-image design', async () => {
    const recipe = RECIPES.find((r) => r.id === 'stat-card')!;
    const doc = recipe.layout(fill(recipe), ctx(recipe));
    const buf = await exportPptx(doc);
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
  });
});
