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
  /** The active brand profile's primary uploaded logo (BrandKit.logos, kind:'primary'), if any. */
  logoAssetId?: string | null;
  /** Resolved, renderable URL for that same logo (typically /api/clients/:id/assets/:assetId/content). */
  logoUrl?: string | null;
}

export interface BuildDocumentResult {
  doc: InternalDesignDocument | null;
  report: ValidationReport | null;
  svgs: string[];
  error: string | null;
}

/**
 * The logo-top-left directive only sets `assetId` + clears `isPlaceholder`
 * (packages/layout-recipes has no HTTP/clientId concept, so it can't
 * resolve bytes) — this fills in `src` so the canvas actually paints the
 * real logo instead of the grey placeholder rect. No-ops when there's no
 * matching element (e.g. no logo motif selected) or no resolved URL yet.
 */
function withResolvedLogo(doc: InternalDesignDocument, logoUrl: string | null | undefined): InternalDesignDocument {
  if (!logoUrl) return doc;
  return {
    ...doc,
    pages: doc.pages.map((page) => ({
      ...page,
      elements: page.elements.map((el) =>
        el.type === 'image' && el.roleHint === 'logo' && !el.src
          ? { ...el, src: logoUrl, isPlaceholder: false }
          : el,
      ),
    })),
  };
}

/** Shared recipe → InternalDesignDocument path used by the playground and AI pipeline. */
export function buildRecipeDocument(input: BuildDocumentInput): BuildDocumentResult {
  const newId = input.newId ?? (() => crypto.randomUUID());
  const tokens: BrandTokensSnapshot = {
    colours: input.brand,
    fonts: input.fonts,
    logoAssetIds: input.logoAssetId ? [input.logoAssetId] : [],
  };
  const contrastMode = input.bestPractices ? 'enforce' : 'warn';

  if (input.composedDoc) {
    try {
      const doc: InternalDesignDocument = withResolvedLogo(
        { ...input.composedDoc, brandTokens: tokens },
        input.logoUrl,
      );
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
    const styled = applyStyleDirectives(
      base,
      {
        headlineTreatment: input.treatment,
        motif: input.motif,
        motifIconName: 'route',
        relaxContrast: !input.bestPractices,
      },
      newId,
    );
    const doc = withResolvedLogo(styled, input.logoUrl);
    const report = validateDesignDocument(doc, { contrastMode });
    const svgs = doc.pages.map((_, i) => exportPageSvg(doc, i));
    return { doc, report, svgs, error: null };
  } catch (e) {
    return { doc: null, report: null, svgs: [], error: String(e) };
  }
}
