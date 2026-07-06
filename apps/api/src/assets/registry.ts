/**
 * Licence-aware asset-source registry.
 *
 * Per the asset strategy: this is a SOURCE WHITELIST, not web/image search.
 * Every provider here has a vetted licence and a usage tier. Nothing enters
 * the product from outside this table.
 *
 * Tiers:
 *   1 auto-safe            — usable in generated designs without review
 *   2 usable-with-metadata — store provenance; avoid sensitive uses
 *   3 manual-review-only   — a human must approve before use
 */
export type AssetKind = 'icon' | 'illustration' | 'photo' | 'texture' | 'ai';

export interface ProviderSpec {
  id: string;
  label: string;
  kinds: AssetKind[];
  licence: string;
  commercialUse: boolean;
  attributionRequired: boolean;
  modificationAllowed: boolean;
  tier: 1 | 2 | 3;
  /** Live hotlink CDN (no bytes stored) vs must be bundled/copied. */
  delivery: 'hotlink' | 'bundled' | 'generated';
  /** Registration / API key needed before use. */
  needsKey: boolean;
  /** Env var holding the key, when needsKey. */
  keyEnv?: string;
  notes: string;
}

export const PROVIDERS: Record<string, ProviderSpec> = {
  // ---- Icons (tier 1: open-source, MIT/ISC, no attribution) ----
  lucide: {
    id: 'lucide', label: 'Lucide', kinds: ['icon'], licence: 'ISC',
    commercialUse: true, attributionRequired: false, modificationAllowed: true,
    tier: 1, delivery: 'bundled', needsKey: false,
    notes: 'Bundled (lucide-static). Retain ISC notice in package records.',
  },
  iconify: {
    id: 'iconify', label: 'Iconify', kinds: ['icon'], licence: 'per-set',
    commercialUse: true, attributionRequired: false, modificationAllowed: true,
    tier: 2, delivery: 'hotlink', needsKey: false,
    notes: 'Aggregates 200+ sets; licence VARIES PER SET — store the set licence per icon. No key for the public API.',
  },
  // ---- Illustrations (tier 1) ----
  undraw: {
    id: 'undraw', label: 'unDraw', kinds: ['illustration'], licence: 'unDraw (MIT-like, no attribution)',
    commercialUse: true, attributionRequired: false, modificationAllowed: true,
    tier: 1, delivery: 'bundled', needsKey: false,
    notes: 'Free SVG illustrations, no attribution. Recolourable to a single brand hue.',
  },
  dicebear: {
    id: 'dicebear', label: 'DiceBear', kinds: ['illustration'], licence: 'CC0 / per-style',
    commercialUse: true, attributionRequired: false, modificationAllowed: true,
    tier: 1, delivery: 'hotlink', needsKey: false,
    notes: 'Avatar/figure API, no key. Most styles CC0; a few need attribution — store per style.',
  },
  // ---- Stock photos (tier 2: free commercial, keys required) ----
  openverse: {
    id: 'openverse', label: 'Openverse', kinds: ['photo', 'illustration'], licence: 'CC/PD (varies)',
    commercialUse: true, attributionRequired: true, modificationAllowed: true,
    tier: 3, delivery: 'hotlink', needsKey: false,
    notes: 'CC/public-domain aggregator. Licence VARIES PER ITEM — verify before publish; treat as review-only.',
  },
  unsplash: {
    id: 'unsplash', label: 'Unsplash', kinds: ['photo'], licence: 'Unsplash',
    commercialUse: true, attributionRequired: false, modificationAllowed: true,
    tier: 2, delivery: 'hotlink', needsKey: true, keyEnv: 'UNSPLASH_ACCESS_KEY',
    notes: 'Free commercial, no attribution required (credit appreciated). Do NOT compile to replicate a competing stock service. Must trigger a download event per API terms.',
  },
  pexels: {
    id: 'pexels', label: 'Pexels', kinds: ['photo'], licence: 'Pexels',
    commercialUse: true, attributionRequired: false, modificationAllowed: true,
    tier: 2, delivery: 'hotlink', needsKey: true, keyEnv: 'PEXELS_API_KEY',
    notes: 'Free commercial, no attribution. No reselling unmodified; no implying endorsement.',
  },
  pixabay: {
    id: 'pixabay', label: 'Pixabay', kinds: ['photo', 'illustration'], licence: 'Pixabay',
    commercialUse: true, attributionRequired: false, modificationAllowed: true,
    tier: 2, delivery: 'hotlink', needsKey: true, keyEnv: 'PIXABAY_API_KEY',
    notes: 'Free commercial. No standalone resale; no trademark/logo/misleading use.',
  },
  // ---- Uploaded + AI-generated ----
  upload: {
    id: 'upload', label: 'Customer upload', kinds: ['photo', 'illustration', 'icon'], licence: 'customer-owned',
    commercialUse: true, attributionRequired: false, modificationAllowed: true,
    tier: 1, delivery: 'bundled', needsKey: false,
    notes: 'Customer warrants rights (ToS). Brand logos live here.',
  },
  ai: {
    id: 'ai', label: 'AI-generated', kinds: ['ai', 'illustration', 'photo'], licence: 'generated',
    commercialUse: true, attributionRequired: false, modificationAllowed: true,
    tier: 2, delivery: 'generated', needsKey: true, keyEnv: 'OPENAI_API_KEY',
    notes: 'Store prompt + model. Reusable across clients when in the shared pool. Watch provenance for public figures/brands.',
  },
};

/** Default risk flags to avoid in automated LinkedIn designs (per strategy). */
export const AVOID_BY_DEFAULT = [
  'identifiable_person',
  'children',
  'medical_setting',
  'political_figure',
  'brand_logo',
  'trademarked_product',
  'private_property_interior',
  'news_event',
  'ai_unclear_provenance',
] as const;

export function providerSpec(provider: string): ProviderSpec | undefined {
  // 'ai:gpt-image-1' → 'ai'
  return PROVIDERS[provider.split(':')[0]!];
}

/** Providers currently usable given which API keys are configured. */
export function availableProviders(): ProviderSpec[] {
  return Object.values(PROVIDERS).filter(
    (p) => !p.needsKey || Boolean(process.env[p.keyEnv ?? '']?.trim()),
  );
}

/** Is this asset safe to auto-use in generated designs (no human review)? */
export function isAutoSafe(item: {
  usageTier?: number | null;
  restrictedFlags?: string[] | null;
  approved?: boolean;
}): boolean {
  if (item.approved) return true; // human already blessed it
  if ((item.usageTier ?? 3) > 1) return false;
  const flags = item.restrictedFlags ?? [];
  return !flags.some((f) => (AVOID_BY_DEFAULT as readonly string[]).includes(f));
}
