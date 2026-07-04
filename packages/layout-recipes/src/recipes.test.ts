import { describe, expect, it } from 'vitest';
import { parseDesignDocument, validateDesignDocument } from '@brandflow/design-schema';
import type { BrandTokensSnapshot } from '@brandflow/design-schema';
import { RECIPES } from './registry.js';
import { checkBatchVariety, selectRecipe } from './variety.js';
import type { LayoutContext, LayoutRecipe, RecipeFill } from './types.js';

const fixtureBrand: BrandTokensSnapshot = {
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
function makeCtx(recipe: LayoutRecipe, variant?: string): LayoutContext {
  return {
    documentId: uuid(),
    brandProfileId: 'brand-1',
    clientCompanyId: 'client-1',
    brandTokens: fixtureBrand,
    variant: variant ?? recipe.variants[0]!.id,
    seed: 42,
    newId: uuid,
  };
}
function uuid(): string {
  const n = (idCounter++).toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${n}`;
}

function fixtureFill(recipe: LayoutRecipe): RecipeFill {
  const slots: RecipeFill['slots'] = {};
  for (const slot of recipe.slots) {
    if (slot.kind === 'text') {
      slots[slot.id] = { kind: 'text', text: sampleText(slot.maxChars ?? 60) };
    } else if (slot.kind === 'list') {
      slots[slot.id] = {
        kind: 'list',
        items: Array.from({ length: Math.min(slot.maxItems ?? 3, 4) }, (_, i) => ({
          title: `Point number ${i + 1}`,
          text: 'A short supporting sentence that explains this point clearly.',
          iconName: 'sparkles',
        })),
      };
    } else if (slot.kind === 'colourTreatment') {
      slots[slot.id] = { kind: 'colourTreatment', treatment: 'light' };
    } else if (slot.kind === 'image') {
      slots[slot.id] = { kind: 'image', assetId: 'asset-demo-1' };
    } else if (slot.kind === 'icon') {
      slots[slot.id] = { kind: 'icon', provider: 'lucide', name: 'sparkles' };
    }
  }
  return { slots };
}

function sampleText(maxChars: number): string {
  const base = 'Strong clear message that fits the layout well and reads naturally';
  return base.slice(0, Math.max(10, Math.min(maxChars - 1, base.length)));
}

describe('layout recipes', () => {
  for (const recipe of RECIPES) {
    for (const variant of recipe.variants) {
      it(`${recipe.id} / ${variant.id} produces a valid document`, () => {
        const doc = recipe.layout(fixtureFill(recipe), makeCtx(recipe, variant.id));
        // parse-time validity
        const parsed = parseDesignDocument(doc);
        // rule-time validity
        const report = validateDesignDocument(parsed, {
          requiredSlotIds: recipe.constraints.requiredSlotIds.filter(
            // list slots expand to items.N.* ids; presence checked via list content
            (id) => recipe.slots.find((s) => s.id === id)?.kind !== 'list',
          ),
        });
        expect(report.errors, JSON.stringify(report.errors, null, 2)).toEqual([]);
      });
    }
  }

  it('carousel slide counts stay within recipe slideRange', () => {
    for (const recipe of RECIPES.filter((r) => r.kind === 'carousel')) {
      const doc = recipe.layout(fixtureFill(recipe), makeCtx(recipe));
      expect(doc.pages.length).toBeGreaterThanOrEqual(recipe.slideRange!.min);
      expect(doc.pages.length).toBeLessThanOrEqual(recipe.slideRange!.max);
    }
  });
});

describe('brand family variety test (acceptance criterion F)', () => {
  it('a batch of 5 selections never repeats a (recipe, variant) layout, 20 seeds', () => {
    for (let seed = 0; seed < 20; seed++) {
      let s = seed + 1;
      const rng = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
      const usage: { recipeId: string; variant: string }[] = [];
      const docs = [];

      for (let i = 0; i < 5; i++) {
        // alternate single/carousel formats as a realistic mixed batch
        const format = i % 2 === 0 ? ('single_image' as const) : ('carousel' as const);
        const sel = selectRecipe(format, usage, [], rng);
        usage.unshift({ recipeId: sel.recipe.id, variant: sel.variant });
        docs.push(sel.recipe.layout(fixtureFill(sel.recipe), makeCtx(sel.recipe, sel.variant)));
      }

      const result = checkBatchVariety(docs);
      expect(result.duplicateLayouts).toEqual([]);
      expect(result.tokenMismatch).toEqual([]);
      expect(result.passed).toBe(true);
    }
  });
});
