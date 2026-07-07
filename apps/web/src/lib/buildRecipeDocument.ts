import type { BrandTokensSnapshot, InternalDesignDocument, ValidationReport } from '@brandflow/design-schema';
import { validateDesignDocument } from '@brandflow/design-schema';
import { exportPageSvg } from '@brandflow/exporters/svg';
import { applyStyleDirectives } from '@brandflow/layout-recipes';
import type { HeadlineTreatment, LayoutRecipe, Motif, RecipeFill } from '@brandflow/layout-recipes';

export interface BuildDocumentInput {
  recipe: LayoutRecipe;
  activeVariant: string;
  brand: BrandTokensSnapshot['colours'];
  fonts: BrandTokensSnapshot['fonts'];
  fill: RecipeFill;
  treatment: HeadlineTreatment;
  motif: Motif;
  bestPractices: boolean;
  /** When set, recipe geometry is skipped and this doc is retinted to current brand tokens. */
  composedDoc?: InternalDesignDocument | null;
  newId?: () => string;
}

export interface BuildDocumentResult {
  doc: InternalDesignDocument | null;
  report: ValidationReport | null;
  svgs: string[];
  error: string | null;
}

/** Shared recipe → InternalDesignDocument path used by the playground and AI pipeline. */
export function buildRecipeDocument(input: BuildDocumentInput): BuildDocumentResult {
  const newId = input.newId ?? (() => crypto.randomUUID());
  const tokens: BrandTokensSnapshot = {
    colours: input.brand,
    fonts: input.fonts,
    logoAssetIds: [],
  };
  const contrastMode = input.bestPractices ? 'enforce' : 'warn';

  if (input.composedDoc) {
    try {
      const doc: InternalDesignDocument = { ...input.composedDoc, brandTokens: tokens };
      const report = validateDesignDocument(doc, { contrastMode });
      const svgs = doc.pages.map((_, i) => exportPageSvg(doc, i));
      return { doc, report, svgs, error: null };
    } catch (e) {
      return { doc: null, report: null, svgs: [], error: String(e) };
    }
  }

  try {
    const base: InternalDesignDocument = input.recipe.layout(input.fill, {
      documentId: crypto.randomUUID(),
      brandProfileId: 'playground',
      clientCompanyId: 'playground',
      brandTokens: tokens,
      variant: input.activeVariant,
      seed: 7,
      newId,
    });
    const doc = applyStyleDirectives(
      base,
      {
        headlineTreatment: input.treatment,
        motif: input.motif,
        motifIconName: 'route',
        relaxContrast: !input.bestPractices,
      },
      newId,
    );
    const report = validateDesignDocument(doc, { contrastMode });
    const svgs = doc.pages.map((_, i) => exportPageSvg(doc, i));
    return { doc, report, svgs, error: null };
  } catch (e) {
    return { doc: null, report: null, svgs: [], error: String(e) };
  }
}
