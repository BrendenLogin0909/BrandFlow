import { describe, expect, it } from 'vitest';
import { parseDesignDocument, validateDesignDocument } from '@brandflow/design-schema';
import type { BrandTokensSnapshot } from '@brandflow/design-schema';
import { RECIPES } from './registry.js';
import { applyStyleDirectives, HEADLINE_TREATMENTS, MOTIFS } from './directives.js';
import type { LayoutContext, LayoutRecipe, RecipeFill } from './types.js';

// accent chosen dark enough that two-tone headlines pass large-text contrast
const brand: BrandTokensSnapshot = {
  colours: {
    primary: '#1a3c8f',
    secondary: '#4a6fd4',
    accent: '#b7791f',
    neutral: '#8a8f98',
    background: '#ffffff',
    text: '#101418',
  },
  fonts: { heading: 'Inter', body: 'Inter' },
  logoAssetIds: [],
};

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${(n++).toString(16).padStart(12, '0')}`;

function ctx(recipe: LayoutRecipe): LayoutContext {
  return {
    documentId: uuid(),
    brandProfileId: 'b',
    clientCompanyId: 'c',
    brandTokens: brand,
    variant: recipe.variants[0]!.id,
    seed: 3,
    newId: uuid,
  };
}

function fill(recipe: LayoutRecipe): RecipeFill {
  const slots: RecipeFill['slots'] = {};
  for (const slot of recipe.slots) {
    if (slot.kind === 'text')
      slots[slot.id] = {
        kind: 'text',
        text: 'A strong message that wraps onto multiple lines nicely'.slice(0, slot.maxChars),
      };
    else if (slot.kind === 'list')
      slots[slot.id] = {
        kind: 'list',
        items: [
          { title: 'One', text: 'First supporting sentence here.', iconName: 'zap' },
          { title: 'Two', text: 'Second supporting sentence here.', iconName: 'target' },
          { title: 'Three', text: 'Third supporting sentence here.', iconName: 'check' },
        ],
      };
    else if (slot.kind === 'colourTreatment')
      slots[slot.id] = { kind: 'colourTreatment', treatment: 'light' };
    else if (slot.kind === 'image') slots[slot.id] = { kind: 'image', assetId: 'a1' };
    else if (slot.kind === 'icon') slots[slot.id] = { kind: 'icon', provider: 'lucide', name: 'zap' };
  }
  return { slots };
}

describe('style directives', () => {
  for (const recipe of RECIPES) {
    for (const treatment of HEADLINE_TREATMENTS) {
      for (const motif of MOTIFS) {
        it(`${recipe.id} + ${treatment} + ${motif} stays valid`, () => {
          const base = recipe.layout(fill(recipe), ctx(recipe));
          const styled = applyStyleDirectives(base, { headlineTreatment: treatment, motif, motifIconName: 'route' }, uuid);
          const parsed = parseDesignDocument(styled);
          const report = validateDesignDocument(parsed);
          expect(report.errors, JSON.stringify(report.errors, null, 2)).toEqual([]);
        });
      }
    }
  }

  it('two-tone splits a multi-line headline into two colours', () => {
    const recipe = RECIPES.find((r) => r.id === 'big-headline-icons')!;
    const base = recipe.layout(fill(recipe), ctx(recipe));
    const styled = applyStyleDirectives(base, { headlineTreatment: 'two-tone', motif: 'none' }, uuid);
    const texts = styled.pages[0]!.elements.filter(
      (e) => e.type === 'text' && e.roleHint === 'headline',
    );
    expect(texts.length).toBe(2);
  });

  it('locked headlines are never restyled', () => {
    const recipe = RECIPES.find((r) => r.id === 'big-headline-icons')!;
    const base = recipe.layout(fill(recipe), ctx(recipe));
    for (const el of base.pages[0]!.elements) if (el.roleHint === 'headline') el.locked = true;
    const before = JSON.stringify(base.pages[0]!.elements.find((e) => e.roleHint === 'headline'));
    const styled = applyStyleDirectives(base, { headlineTreatment: 'two-tone', motif: 'none' }, uuid);
    const after = JSON.stringify(styled.pages[0]!.elements.find((e) => e.roleHint === 'headline'));
    expect(after).toBe(before);
  });

  it('motif elements are marked decoration and carry motif metadata', () => {
    const recipe = RECIPES.find((r) => r.id === 'quote-card')!;
    const base = recipe.layout(fill(recipe), ctx(recipe));
    const styled = applyStyleDirectives(base, { headlineTreatment: 'plain', motif: 'dot-grid' }, uuid);
    const dots = styled.pages[0]!.elements.filter((e) => e.meta['motif'] === true);
    expect(dots.length).toBe(16);
    expect(dots.every((d) => d.roleHint === 'decoration')).toBe(true);
  });
});
