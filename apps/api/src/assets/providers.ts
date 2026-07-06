/**
 * Asset provider adapters. Each returns licence-tagged results so nothing
 * is ever served without provenance. No-key providers work out of the box;
 * key-gated ones (stock photos) light up when their env key is set, exactly
 * like the AI provider.
 */
import { PROVIDERS, type AssetKind, type ProviderSpec } from './registry.js';

export interface AssetSearchResult {
  provider: string;
  providerId: string;
  kind: AssetKind;
  /** Direct bytes URL (CDN hotlink) or data URI. */
  contentUrl: string;
  thumbUrl: string;
  sourceUrl?: string; // attribution/page link
  creator?: string;
  licence: string;
  commercialUse: boolean;
  attributionRequired: boolean;
  usageTier: 1 | 2 | 3;
  width?: number;
  height?: number;
  mimeType: string;
  label: string;
}

function tag(spec: ProviderSpec, extra: Partial<AssetSearchResult>): AssetSearchResult {
  return {
    provider: spec.id,
    providerId: '',
    kind: spec.kinds[0]!,
    contentUrl: '',
    thumbUrl: '',
    licence: spec.licence,
    commercialUse: spec.commercialUse,
    attributionRequired: spec.attributionRequired,
    usageTier: spec.tier,
    mimeType: 'image/svg+xml',
    label: '',
    ...extra,
  };
}

// ---------- Iconify (icons, no key, live) ----------
// https://iconify.design/docs/api/
async function searchIconify(q: string, limit: number): Promise<AssetSearchResult[]> {
  const res = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=${limit}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { icons?: string[] };
  return (data.icons ?? []).slice(0, limit).map((full) => {
    const [prefix, name] = full.split(':');
    return tag(PROVIDERS.iconify!, {
      providerId: full,
      kind: 'icon',
      contentUrl: `https://api.iconify.design/${prefix}/${name}.svg`,
      thumbUrl: `https://api.iconify.design/${prefix}/${name}.svg?height=48`,
      sourceUrl: `https://icon-sets.iconify.design/${prefix}/${name}/`,
      label: `${name} (${prefix})`,
    });
  });
}

// ---------- DiceBear (figures/avatars, no key, live) ----------
// https://www.dicebear.com/ — seed-based; we vary the seed by the query.
const DICEBEAR_STYLES = ['open-peeps', 'personas', 'notionists', 'avataaars', 'micah'];
function searchDicebear(q: string, limit: number): AssetSearchResult[] {
  return DICEBEAR_STYLES.slice(0, limit).map((style) => {
    const seed = encodeURIComponent(`${q}-${style}`);
    const url = `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}`;
    return tag(PROVIDERS.dicebear!, {
      providerId: `${style}:${seed}`,
      kind: 'illustration',
      contentUrl: url,
      thumbUrl: url,
      sourceUrl: 'https://www.dicebear.com/',
      label: `${style} figure`,
    });
  });
}

// ---------- Pexels (photos, key-gated) ----------
async function searchPexels(q: string, limit: number): Promise<AssetSearchResult[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${limit}`, {
    headers: { Authorization: key },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    photos?: { id: number; src: { large: string; medium: string }; photographer: string; url: string; width: number; height: number }[];
  };
  return (data.photos ?? []).map((p) =>
    tag(PROVIDERS.pexels!, {
      providerId: String(p.id),
      kind: 'photo',
      contentUrl: p.src.large,
      thumbUrl: p.src.medium,
      sourceUrl: p.url,
      creator: p.photographer,
      mimeType: 'image/jpeg',
      width: p.width,
      height: p.height,
      label: `Photo by ${p.photographer}`,
    }),
  );
}

// ---------- Unsplash (photos, key-gated) ----------
async function searchUnsplash(q: string, limit: number): Promise<AssetSearchResult[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return [];
  const res = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=${limit}&client_id=${key}`,
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: { id: string; urls: { regular: string; small: string }; user: { name: string }; links: { html: string }; width: number; height: number }[];
  };
  return (data.results ?? []).map((p) =>
    tag(PROVIDERS.unsplash!, {
      providerId: p.id,
      kind: 'photo',
      contentUrl: p.urls.regular,
      thumbUrl: p.urls.small,
      sourceUrl: p.links.html,
      creator: p.user.name,
      mimeType: 'image/jpeg',
      width: p.width,
      height: p.height,
      label: `Photo by ${p.user.name}`,
    }),
  );
}

// ---------- Pixabay (photos/illustrations, key-gated) ----------
async function searchPixabay(q: string, limit: number): Promise<AssetSearchResult[]> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];
  const res = await fetch(
    `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(q)}&per_page=${Math.max(3, limit)}&safesearch=true`,
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    hits?: { id: number; webformatURL: string; previewURL: string; pageURL: string; user: string; imageWidth: number; imageHeight: number }[];
  };
  return (data.hits ?? []).slice(0, limit).map((p) =>
    tag(PROVIDERS.pixabay!, {
      providerId: String(p.id),
      kind: 'photo',
      contentUrl: p.webformatURL,
      thumbUrl: p.previewURL,
      sourceUrl: p.pageURL,
      creator: p.user,
      mimeType: 'image/jpeg',
      width: p.imageWidth,
      height: p.imageHeight,
      label: `Photo by ${p.user}`,
    }),
  );
}

export interface SearchOptions {
  kind: AssetKind;
  query: string;
  limit?: number;
}

/**
 * Search all AVAILABLE providers for a kind, in parallel. Returns
 * licence-tagged results; a failing provider is skipped, never fatal.
 */
export async function searchAssets(opts: SearchOptions): Promise<AssetSearchResult[]> {
  const limit = opts.limit ?? 12;
  const q = opts.query.trim() || 'abstract';
  const jobs: Promise<AssetSearchResult[]>[] = [];

  if (opts.kind === 'icon') jobs.push(searchIconify(q, limit).catch(() => []));
  if (opts.kind === 'illustration') {
    jobs.push(Promise.resolve(searchDicebear(q, Math.min(limit, 5))));
    jobs.push(searchPixabay(`${q} illustration`, limit).catch(() => []));
  }
  if (opts.kind === 'photo') {
    jobs.push(searchPexels(q, limit).catch(() => []));
    jobs.push(searchUnsplash(q, limit).catch(() => []));
    jobs.push(searchPixabay(q, limit).catch(() => []));
  }

  const results = (await Promise.all(jobs)).flat();
  return results.slice(0, limit * 2);
}
