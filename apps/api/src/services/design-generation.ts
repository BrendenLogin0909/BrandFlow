/**
 * DesignGenerationService — pipeline steps 6→8 for one visual package.
 *
 * Flow (docs/08-ai-workflow-design.md):
 *   1. buildBrandContext (sole tenant-data source for prompts)
 *   2. recipe selection: application code + variety guard, never the LLM
 *   3. AI step 7 fills recipe slots only (schema built from the recipe contract)
 *   4. deterministic recipe.layout() assembles the InternalDesignDocument
 *   5. validation; on failure, one scoped repair round, then deterministic
 *      truncation fallback flagged needsAttention
 *   6. persist document + AI_GENERATED revision
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { BrandTokensSnapshot, InternalDesignDocument, ValidationReport } from '@brandflow/design-schema';
import { validateDesignDocument } from '@brandflow/design-schema';
import {
  getRecipe,
  selectRecipe,
  type LayoutContext,
  type LayoutRecipe,
  type LayoutUsage,
  type RecipeFill,
} from '@brandflow/layout-recipes';
import type { VisualFormat } from '@brandflow/shared';
import type { AiProviderPort } from '../ports/index.js';
import { buildBrandContext, type BrandContext } from '../ai/build-brand-context.js';

export interface GenerateVisualInput {
  clientCompanyId: string;
  organisationId: string;
  brandProfileId: string;
  visualPackageId: string;
  format: VisualFormat;
  /** Post package content the design draws from (on-image text, outline...). */
  postContent: unknown;
  /** Optional explicit recipe override from the user. */
  recipeId?: string;
}

export interface GenerateVisualResult {
  document: InternalDesignDocument;
  report: ValidationReport;
  needsAttention: boolean;
}

export class DesignGenerationService {
  constructor(
    private prisma: PrismaClient,
    private ai: AiProviderPort,
  ) {}

  async generateVisual(input: GenerateVisualInput): Promise<GenerateVisualResult> {
    const brand = await buildBrandContext(this.prisma, input.clientCompanyId, input.brandProfileId);

    // --- recipe selection with the brand-family variety guard ---
    const recentUsage = await this.recentLayoutUsage(input.brandProfileId);
    let recipe: LayoutRecipe;
    let variant: string;
    if (input.recipeId) {
      const r = getRecipe(input.recipeId);
      if (!r) throw new Error(`Unknown recipe "${input.recipeId}"`);
      recipe = r;
      // still avoid repeating the exact variant where possible
      const usedVariants = new Set(
        recentUsage.filter((u) => u.recipeId === r.id).map((u) => u.variant),
      );
      variant = (r.variants.find((v) => !usedVariants.has(v.id)) ?? r.variants[0]!).id;
    } else {
      const sel = selectRecipe(input.format, recentUsage);
      recipe = sel.recipe;
      variant = sel.variant;
    }

    // --- AI fills the recipe slots (content only, never geometry) ---
    const fillSchema = buildFillSchema(recipe);
    const { data: fill } = await this.ai.complete(
      'design_fill',
      {
        recipe: { id: recipe.id, slots: recipe.slots },
        variant,
        post: input.postContent,
        brand: promptView(brand),
        approvedImageAssets: brand.promptableAssets.filter((a) => a.type === 'PHOTO'),
      },
      fillSchema,
    );

    // --- deterministic assembly + validation with one repair round ---
    const ctx = this.layoutContext(input, brand, recipe, variant);
    let document = recipe.layout(fill as RecipeFill, ctx);
    let report = this.validate(document, brand, recipe);
    let needsAttention = false;

    if (!report.passed) {
      const { data: repaired } = await this.ai.complete(
        'design_fill',
        {
          recipe: { id: recipe.id, slots: recipe.slots },
          variant,
          post: input.postContent,
          brand: promptView(brand),
          previousFill: fill,
          violations: report.errors.map((e) => e.message),
        },
        fillSchema,
      );
      document = recipe.layout(repaired as RecipeFill, this.layoutContext(input, brand, recipe, variant));
      report = this.validate(document, brand, recipe);
    }

    if (!report.passed) {
      // deterministic fallback: hard-truncate text to slot limits and retry once
      const truncated = truncateFill(fill as RecipeFill, recipe);
      document = recipe.layout(truncated, this.layoutContext(input, brand, recipe, variant));
      report = this.validate(document, brand, recipe);
      needsAttention = true;
    }

    // --- persist (never store a document that fails schema parse; rule
    //     errors are stored with the report so a human can fix them) ---
    await this.prisma.$transaction([
      this.prisma.designDocument.upsert({
        where: { visualPackageId: input.visualPackageId },
        create: {
          id: document.id,
          visualPackageId: input.visualPackageId,
          organisationId: input.organisationId,
          clientCompanyId: input.clientCompanyId,
          brandProfileId: input.brandProfileId,
          internalDoc: document as object,
          validationReport: report as unknown as object,
          version: 1,
        },
        update: {
          internalDoc: document as object,
          validationReport: report as unknown as object,
          version: { increment: 1 },
        },
      }),
      this.prisma.designRevision.create({
        data: {
          designDocumentId: document.id,
          version: document.version,
          internalDoc: document as object,
          reason: 'AI_GENERATED',
        },
      }),
      this.prisma.visualPackage.update({
        where: { id: input.visualPackageId },
        data: { format: input.format, layoutRecipeId: recipe.id, status: 'GENERATED' },
      }),
    ]);

    return { document, report, needsAttention };
  }

  private validate(doc: InternalDesignDocument, brand: BrandContext, recipe: LayoutRecipe) {
    return validateDesignDocument(doc, {
      bannedPhrases: brand.styleGuide.bannedPhrases,
      requiredSlotIds: recipe.constraints.requiredSlotIds.filter(
        (id) => recipe.slots.find((s) => s.id === id)?.kind !== 'list',
      ),
    });
  }

  private async recentLayoutUsage(brandProfileId: string): Promise<LayoutUsage[]> {
    const docs = await this.prisma.designDocument.findMany({
      where: { brandProfileId },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: { internalDoc: true },
    });
    return docs.map((d) => {
      const ref = (d.internalDoc as { layoutRecipeRef?: { recipeId: string; variant: string } })
        .layoutRecipeRef;
      return { recipeId: ref?.recipeId ?? '', variant: ref?.variant ?? '' };
    });
  }

  private layoutContext(
    input: GenerateVisualInput,
    brand: BrandContext,
    recipe: LayoutRecipe,
    variant: string,
  ): LayoutContext {
    const tokens: BrandTokensSnapshot = {
      colours: brand.kit.colours,
      fonts: brand.kit.fonts,
      logoAssetIds: [],
    };
    return {
      documentId: randomUUID(),
      brandProfileId: input.brandProfileId,
      clientCompanyId: input.clientCompanyId,
      brandTokens: tokens,
      variant,
      seed: Date.now() % 2 ** 31,
      newId: randomUUID,
    };
  }
}

// ---------- recipe fill schema (built from the recipe contract) ----------

/** The AI can only return content matching the recipe's slot contract. */
export function buildFillSchema(recipe: LayoutRecipe): z.ZodType<RecipeFill> {
  const slotSchemas: Record<string, z.ZodTypeAny> = {};
  for (const slot of recipe.slots) {
    let schema: z.ZodTypeAny;
    switch (slot.kind) {
      case 'text':
        schema = z.object({
          kind: z.literal('text'),
          text: z.string().min(1).max(slot.maxChars ?? 500),
        });
        break;
      case 'list':
        schema = z.object({
          kind: z.literal('list'),
          items: z
            .array(
              z.object({
                title: z.string().max(80).optional(),
                text: z.string().min(1).max(300),
                iconName: z.string().max(60).optional(),
              }),
            )
            .min(1)
            .max(slot.maxItems ?? 10),
        });
        break;
      case 'icon':
        schema = z.object({
          kind: z.literal('icon'),
          provider: z.enum(['lucide', 'tabler', 'internal']),
          name: z.string().min(1).max(60),
        });
        break;
      case 'image':
        schema = z.object({ kind: z.literal('image'), assetId: z.string().min(1) });
        break;
      case 'colourTreatment':
        schema = z.object({
          kind: z.literal('colourTreatment'),
          treatment: z.enum(['light', 'dark', 'accent']),
        });
        break;
    }
    slotSchemas[slot.id] = slot.required ? schema : schema.optional();
  }
  return z.object({ slots: z.object(slotSchemas) }) as z.ZodType<RecipeFill>;
}

/** Deterministic fallback: clamp every text to its slot limit. */
function truncateFill(fill: RecipeFill, recipe: LayoutRecipe): RecipeFill {
  const slots: RecipeFill['slots'] = {};
  for (const [id, value] of Object.entries(fill.slots)) {
    const slot = recipe.slots.find((s) => s.id === id);
    if (value.kind === 'text' && slot?.maxChars) {
      const max = Math.floor(slot.maxChars * 0.8);
      slots[id] = { kind: 'text', text: clamp(value.text, max) };
    } else if (value.kind === 'list' && slot) {
      slots[id] = {
        kind: 'list',
        items: value.items.slice(0, slot.maxItems ?? value.items.length).map((it) => ({
          ...it,
          title: it.title ? clamp(it.title, 48) : undefined,
          text: clamp(it.text, 140),
        })),
      };
    } else {
      slots[id] = value;
    }
  }
  return { slots };
}

function clamp(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

/** Brand data as it appears in prompts — everything here is tenant-scoped by construction. */
function promptView(brand: BrandContext) {
  return {
    companyName: brand.companyName,
    voice: brand.voice,
    styleGuide: brand.styleGuide,
    pillars: brand.pillars,
    audiences: brand.audiences,
    iconStyle: brand.kit.iconStyle,
    designDensity: brand.kit.designDensity,
  };
}
