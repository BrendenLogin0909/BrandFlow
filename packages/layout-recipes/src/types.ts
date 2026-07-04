/**
 * Layout recipe framework. A recipe is a contract (slots the AI fills) plus a
 * deterministic layout function that assembles an InternalDesignDocument.
 * See docs/10-layout-recipe-system.md.
 */
import type { BrandTokensSnapshot, InternalDesignDocument, Insets } from '@brandflow/design-schema';
import type { VisualFormat } from '@brandflow/shared';

export interface RecipeSlot {
  id: string;
  kind: 'text' | 'icon' | 'image' | 'colourTreatment' | 'list';
  required: boolean;
  maxChars?: number;
  maxItems?: number;
  maxLines?: number;
  /** Injected into the AI step-7 prompt to guide the fill. */
  guidance: string;
}

export interface RecipeVariant {
  id: string;
  description: string;
  weight: number;
}

export interface RecipeConstraints {
  requiredSlotIds: string[];
}

/** What the AI returns for step 7 — content only, never geometry. */
export interface RecipeFill {
  slots: Record<string, SlotValue>;
}
export type SlotValue =
  | { kind: 'text'; text: string }
  | { kind: 'list'; items: { title?: string; text: string; iconName?: string }[] }
  | { kind: 'icon'; provider: 'lucide' | 'tabler' | 'internal'; name: string }
  | { kind: 'image'; assetId: string }
  | { kind: 'colourTreatment'; treatment: 'light' | 'dark' | 'accent' };

export interface LayoutContext {
  documentId: string;
  brandProfileId: string;
  clientCompanyId: string;
  brandTokens: BrandTokensSnapshot;
  variant: string;
  /** Seed for any weighted choices inside layout(); recorded for reproducibility. */
  seed: number;
  /** Deterministic UUID factory (seeded in tests, crypto in production). */
  newId: () => string;
}

export interface LayoutRecipe {
  id: string;
  version: number;
  name: string;
  formats: VisualFormat[];
  kind: 'single' | 'carousel';
  canvas: { width: number; height: number };
  safeArea: Insets;
  slideRange?: { min: number; max: number };
  slots: RecipeSlot[];
  variants: RecipeVariant[];
  constraints: RecipeConstraints;
  layout: (fill: RecipeFill, ctx: LayoutContext) => InternalDesignDocument;
}

export function textSlot(fill: RecipeFill, id: string): string {
  const v = fill.slots[id];
  if (v?.kind !== 'text') throw new Error(`Slot "${id}" missing or not text`);
  return v.text;
}

export function listSlot(fill: RecipeFill, id: string) {
  const v = fill.slots[id];
  if (v?.kind !== 'list') throw new Error(`Slot "${id}" missing or not a list`);
  return v.items;
}

export function optionalTextSlot(fill: RecipeFill, id: string): string | null {
  const v = fill.slots[id];
  return v?.kind === 'text' ? v.text : null;
}

export function treatmentSlot(fill: RecipeFill, id: string): 'light' | 'dark' | 'accent' {
  const v = fill.slots[id];
  return v?.kind === 'colourTreatment' ? v.treatment : 'light';
}
