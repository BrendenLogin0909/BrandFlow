/**
 * buildBrandContext — the SINGLE choke point through which tenant data flows
 * into AI prompts. No other module may assemble brand data for prompting.
 * This is the primary defence against cross-client prompt contamination
 * (docs/07-permission-model.md §3.5, docs/14-risks-and-mitigations.md risk 1).
 */
import type { PrismaClient } from '@prisma/client';

export interface BrandContext {
  /** Stamped for audit; every GenerationJob records these. */
  clientCompanyId: string;
  brandProfileId: string;
  companyName: string;
  kit: {
    colours: Record<string, string>;
    fonts: { heading: string; body: string; accent?: string };
    iconStyle: string;
    designDensity: string;
  };
  voice: {
    toneDescriptors: string[];
    writingExamples: unknown;
    exampleLinkedInPosts: unknown;
  };
  styleGuide: {
    doRules: string[];
    dontRules: string[];
    approvedPhrases: string[];
    bannedPhrases: string[];
    complianceRules: string[];
    ctaStyles: string[];
  };
  pillars: { name: string; description: string | null }[];
  audiences: { name: string; description: string | null; painPoints: string[]; goals: string[] }[];
  /** Only assets explicitly flagged allowInPrompts AND approved. */
  promptableAssets: { id: string; type: string; filename: string; tags: string[] }[];
}

export async function buildBrandContext(
  prisma: PrismaClient,
  clientCompanyId: string,
  brandProfileId: string,
): Promise<BrandContext> {
  const profile = await prisma.brandProfile.findFirst({
    where: { id: brandProfileId, clientCompanyId }, // tenant scoping is structural, not incidental
    include: {
      clientCompany: true,
      brandKit: true,
      styleGuide: true,
      voiceProfile: true,
      pillars: true,
      audiences: true,
    },
  });
  if (!profile) throw new TenantScopeError(clientCompanyId, brandProfileId);
  if (profile.status !== 'APPROVED')
    throw new Error(`Brand profile ${brandProfileId} is not approved (Gate 1)`);

  const promptableAssets = await prisma.assetLibraryItem.findMany({
    where: { clientCompanyId, approved: true, allowInPrompts: true },
    select: { id: true, type: true, filename: true, tags: true },
  });

  const kit = profile.brandKit;
  const colours = (kit?.colours ?? {}) as Record<string, string>;
  const fonts = (kit?.fonts ?? { heading: 'Inter', body: 'Inter' }) as BrandContext['kit']['fonts'];

  return {
    clientCompanyId,
    brandProfileId,
    companyName: profile.clientCompany.name,
    kit: {
      colours,
      fonts,
      iconStyle: kit?.iconStyle ?? 'outline',
      designDensity: kit?.designDensity ?? 'balanced',
    },
    voice: {
      toneDescriptors: profile.voiceProfile?.toneDescriptors ?? [],
      writingExamples: profile.voiceProfile?.writingExamples ?? [],
      exampleLinkedInPosts: profile.voiceProfile?.exampleLinkedInPosts ?? [],
    },
    styleGuide: {
      doRules: profile.styleGuide?.doRules ?? [],
      dontRules: profile.styleGuide?.dontRules ?? [],
      approvedPhrases: profile.styleGuide?.approvedPhrases ?? [],
      bannedPhrases: profile.styleGuide?.bannedPhrases ?? [],
      complianceRules: profile.styleGuide?.complianceRules ?? [],
      ctaStyles: profile.styleGuide?.ctaStyles ?? [],
    },
    pillars: profile.pillars.map((p) => ({ name: p.name, description: p.description })),
    audiences: profile.audiences.map((a) => ({
      name: a.name,
      description: a.description,
      painPoints: a.painPoints,
      goals: a.goals,
    })),
    promptableAssets,
  };
}

export class TenantScopeError extends Error {
  constructor(clientCompanyId: string, brandProfileId: string) {
    super(`Brand profile ${brandProfileId} not found in client ${clientCompanyId}`);
    this.name = 'TenantScopeError';
  }
}
