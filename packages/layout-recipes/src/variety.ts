/**
 * Brand family variety guard — mechanically guarantees the
 * "brand family but not identical" acceptance test.
 * See docs/10-layout-recipe-system.md §5.
 */
import type { InternalDesignDocument } from '@brandflow/design-schema';
import type { VisualFormat } from '@brandflow/shared';
import type { LayoutRecipe } from './types.js';
import { recipesForFormat } from './registry.js';

export interface LayoutUsage {
  recipeId: string;
  variant: string;
}

export interface RecipeSelection {
  recipe: LayoutRecipe;
  variant: string;
  /** True when the exclusion window exhausted all candidates and was relaxed. */
  relaxed: boolean;
}

/** Default look-back window of prior visuals whose exact layout may not repeat. */
export const DEFAULT_VARIETY_WINDOW = 6;

/**
 * Select a recipe+variant for a new visual, excluding (recipeId, variant)
 * pairs used in the brand's recent history. `ranked` is step-6's preference
 * order (recipe ids); unknown ids are ignored.
 */
export function selectRecipe(
  format: VisualFormat,
  recentUsage: LayoutUsage[],
  ranked: string[] = [],
  rng: () => number = Math.random,
  window = DEFAULT_VARIETY_WINDOW,
): RecipeSelection {
  const candidates = recipesForFormat(format);
  if (candidates.length === 0) throw new Error(`No recipes registered for format "${format}"`);

  const used = new Set(recentUsage.slice(0, window).map((u) => `${u.recipeId}::${u.variant}`));
  const usedRecipeIds = new Set(recentUsage.slice(0, window).map((u) => u.recipeId));

  const pairs = candidates.flatMap((recipe) =>
    recipe.variants.map((v) => ({ recipe, variant: v.id, weight: v.weight })),
  );

  // Prefer: pair unused AND recipe unused > pair unused > any (relaxed).
  const tiers = [
    pairs.filter((p) => !used.has(`${p.recipe.id}::${p.variant}`) && !usedRecipeIds.has(p.recipe.id)),
    pairs.filter((p) => !used.has(`${p.recipe.id}::${p.variant}`)),
    pairs,
  ];
  const tierIndex = tiers.findIndex((t) => t.length > 0);
  const pool = tiers[tierIndex]!;

  // Apply step-6 ranking as a weight boost, then weighted random pick.
  const boosted = pool.map((p) => {
    const rank = ranked.indexOf(p.recipe.id);
    const boost = rank >= 0 ? (ranked.length - rank) * 2 : 1;
    return { ...p, weight: p.weight * boost };
  });
  const total = boosted.reduce((s, p) => s + p.weight, 0);
  let roll = rng() * total;
  for (const p of boosted) {
    roll -= p.weight;
    if (roll <= 0) return { recipe: p.recipe, variant: p.variant, relaxed: tierIndex === 2 };
  }
  const last = boosted[boosted.length - 1]!;
  return { recipe: last.recipe, variant: last.variant, relaxed: tierIndex === 2 };
}

export interface VarietyCheckResult {
  passed: boolean;
  duplicateLayouts: [number, number][]; // index pairs sharing (recipeId, variant)
  tokenMismatch: [number, number][]; // index pairs with differing brand token sets
}

/**
 * The automated brand-family-variety acceptance check: all documents must
 * share brand tokens (same family) and no two may share (recipeId, variant).
 */
export function checkBatchVariety(documents: InternalDesignDocument[]): VarietyCheckResult {
  const duplicateLayouts: [number, number][] = [];
  const tokenMismatch: [number, number][] = [];

  for (let i = 0; i < documents.length; i++) {
    for (let j = i + 1; j < documents.length; j++) {
      const a = documents[i]!;
      const b = documents[j]!;
      if (
        a.layoutRecipeRef.recipeId === b.layoutRecipeRef.recipeId &&
        a.layoutRecipeRef.variant === b.layoutRecipeRef.variant
      )
        duplicateLayouts.push([i, j]);
      if (JSON.stringify(a.brandTokens) !== JSON.stringify(b.brandTokens)) tokenMismatch.push([i, j]);
    }
  }
  return {
    passed: duplicateLayouts.length === 0 && tokenMismatch.length === 0,
    duplicateLayouts,
    tokenMismatch,
  };
}
