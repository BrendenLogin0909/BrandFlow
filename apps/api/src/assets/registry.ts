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
  /** Original artist, when the source art has a known creator (recorded even
   *  for CC0, where attribution is not legally required). */
  creator?: string;
  /** Authoritative licence/provenance page for the source art. */
  sourceUrl?: string;
  notes: string;
}

export const PROVIDERS: Record<string, ProviderSpec> = {
  // ---- Icons (tier 1: open-source, MIT/ISC, no attribution) ----
  lucide: {
    id: 'lucide', label: 'Lucide', kinds: ['icon'], licence: 'ISC',
    commercialUse: true, attributionRequired: false, modificationAllowed: true,
    tier: 1, delivery: 'bundled', needsKey: false,
    notes: 'Bundled (lucide-static, ~1500 icons). Searchable via /assets/search?kind=icon. Retain ISC notice in package records.',
  },
  iconify: {
    id: 'iconify', label: 'Iconify', kinds: ['icon'], licence: 'per-set',
    commercialUse: true, attributionRequired: false, modificationAllowed: true,
    tier: 2, delivery: 'hotlink', needsKey: false,
    notes: 'Public API — 200k+ icons / 200+ sets (no key). Search prefers lucide/tabler/mdi/ph/heroicons/carbon. Licence VARIES PER SET — store set licence on save.',
  },
  // ---- Illustrations (tier 1) ----
  undraw: {
    id: 'undraw', label: 'Flat illustrations', kinds: ['illustration'], licence: 'BrandFlow original (CC0-equivalent, no attribution)',
    commercialUse: true, attributionRequired: false, modificationAllowed: true,
    tier: 1, delivery: 'bundled', needsKey: false,
    notes: 'Bundled flat single-accent scene illustrations (undraw-manifest.ts), recolourable to a brand hue. ORIGINAL art in the unDraw style (characters, charts, B2B metaphors) — not unDraw\'s library — so unencumbered, no attribution. Expanded for 29FORWARD-style LinkedIn carousels. Do NOT scrape real unDraw/Storyset into this pool (licence forbids competing redistribution).',
  },
  openpeeps: {
    id: 'openpeeps', label: 'Open Peeps characters', kinds: ['illustration'], licence: 'CC0 1.0',
    commercialUse: true, attributionRequired: false, modificationAllowed: true,
    tier: 1, delivery: 'bundled', needsKey: false,
    creator: 'Pablo Stanley',
    sourceUrl: 'https://www.openpeeps.com/',
    notes: 'Bundled B2B scenes built from the CC0 "Open Peeps" hand-drawn character library by Pablo Stanley (openpeeps.com). Licence verified 2026-08-24 against openpeeps.com ("Free for commercial and personal use under CC0 License") and the licence metadata inside @dicebear/collection v9.4.2 (openPeeps.meta → CC0 1.0). CC0 = public domain: no attribution required, commercial use and modification allowed, redistribution allowed. Creator recorded as provenance only. Scene layouts/props around the characters are original to this repo. RECOLOUR MODEL: only props, panels, charts and background washes carry the #6c63ff accent that recolours to the brand hue — the characters deliberately carry none. The source art makes this unavoidable: an Open Peeps pose is two merged paths (one line-art, one covering the whole interior), so the same region holds the neck, hands, forearms and ankles AND part of the outfit. Skin colour and clothing colour therefore cannot coexist on a figure. This pack paints that region with the skin tone so anatomy is always right, and casts only poses whose top falls in the line-art path, so clothing reads dark. Painting it with the accent instead gives every figure brand-coloured hands, neck and ankles against a skin-toned face — that was a real defect, fixed 2026-08-25; do not reintroduce it. Line art and skin tones are never recoloured.',
  },
  dicebear: {
    id: 'dicebear', label: 'DiceBear', kinds: ['illustration'], licence: 'CC0 / per-style',
    commercialUse: true, attributionRequired: false, modificationAllowed: true,
    tier: 1, delivery: 'hotlink', needsKey: false,
    notes: 'Avatar/figure API, no key. Most styles CC0; a few need attribution — store per style.',
  },
  // ---- Stock photos (tier 2: free commercial, keys required) ----
  openverse: {
    id: 'openverse', label: 'Openverse', kinds: ['photo', 'illustration'], licence: 'CC0 / Public Domain',
    commercialUse: true, attributionRequired: false, modificationAllowed: true,
    tier: 2, delivery: 'hotlink', needsKey: false,
    notes: 'CC/PD aggregator (millions of works), no key. Filtered to CC0 + Public-Domain-Mark only. Used for photo + illustration search. Watch faces/trademarks per item.',
  },
  wikimedia: {
    id: 'wikimedia', label: 'Wikimedia Commons', kinds: ['photo', 'illustration'], licence: 'PD / CC (varies)',
    commercialUse: true, attributionRequired: true, modificationAllowed: true,
    tier: 3, delivery: 'hotlink', needsKey: false,
    notes: 'Public-domain and CC media, no key. Licence varies per file — review before use.',
  },
  pollinations: {
    id: 'pollinations', label: 'Pollinations AI', kinds: ['ai', 'illustration', 'photo'], licence: 'AI-generated (open models)',
    commercialUse: true, attributionRequired: false, modificationAllowed: true,
    tier: 2, delivery: 'generated', needsKey: false,
    notes: 'Free no-key AI image generation (open Flux/SD models). Store the prompt. Provenance for public figures/brands is the users responsibility.',
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
