import type { VisualFormat } from '@brandflow/shared';
import type { LayoutRecipe } from './types.js';
import { quoteCard } from './recipes/quote-card.js';
import { statCard } from './recipes/stat-card.js';
import { bigHeadlineIcons } from './recipes/big-headline-icons.js';
import { numberedListCarousel } from './recipes/numbered-list-carousel.js';
import { problemInsightRecommendation } from './recipes/problem-insight-recommendation.js';
import { checklistCarousel } from './recipes/checklist-carousel.js';
import { photoHeroCard } from './recipes/photo-hero-card.js';
import { iconGridCard } from './recipes/icon-grid-card.js';

export const RECIPES: LayoutRecipe[] = [
  quoteCard,
  statCard,
  bigHeadlineIcons,
  photoHeroCard,
  iconGridCard,
  numberedListCarousel,
  problemInsightRecommendation,
  checklistCarousel,
];

export function getRecipe(id: string): LayoutRecipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

export function recipesForFormat(format: VisualFormat): LayoutRecipe[] {
  return RECIPES.filter((r) => r.formats.includes(format));
}
