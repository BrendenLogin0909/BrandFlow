/**
 * Asset provider adapters. Each returns licence-tagged results so nothing
 * is ever served without provenance. No-key providers work out of the box;
 * key-gated ones (stock photos) light up when their env key is set, exactly
 * like the AI provider.
 */
import { PROVIDERS, type AssetKind, type ProviderSpec } from './registry.js';
import { UNDRAW_MANIFEST } from './undraw-manifest.js';

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

// ---------- unDraw (flat scene illustrations, no key, bundled) ----------
// unDraw's per-illustration CDN URLs are hashed/unstable, so we bundle the SVG
// markup (undraw-manifest.ts) and serve it locally — no network at serve time.
// Each illustration carries the signature accent `#6c63ff`, which we recolour
// to a brand hue on the way out and deliver as a data URI.
const UNDRAW_ACCENT = /#6c63ff/gi; // unDraw's single signature colour
function searchUndraw(q: string, limit: number, brandHue = '#4f46e5'): AssetSearchResult[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = UNDRAW_MANIFEST.map((e) => {
    const hay = `${e.title} ${e.keywords.join(' ')}`.toLowerCase();
    const score = terms.reduce((n, t) => (hay.includes(t) ? n + 1 : n), 0);
    return { e, score };
  });
  const matched = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  // Fall back to the first N when nothing matches, so a search never comes back empty.
  const chosen = (matched.length ? matched.map((s) => s.e) : UNDRAW_MANIFEST).slice(0, limit);
  return chosen.map((e) => {
    const recoloured = e.svg.replace(UNDRAW_ACCENT, brandHue);
    const dataUri = 'data:image/svg+xml;utf8,' + encodeURIComponent(recoloured);
    return tag(PROVIDERS.undraw!, {
      providerId: e.slug,
      kind: 'illustration',
      contentUrl: dataUri,
      thumbUrl: dataUri,
      attributionRequired: false,
      mimeType: 'image/svg+xml',
      label: e.title,
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

// ---------- Openverse (CC0/PD photos + illustrations, no key, live) ----------
// https://api.openverse.org/ — filtered to cc0 + public-domain-mark so results
// are commercial-safe with no attribution.
async function searchOpenverse(q: string, limit: number): Promise<AssetSearchResult[]> {
  const res = await fetch(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm&page_size=${limit}&mature=false`,
    { headers: { 'User-Agent': 'BrandFlow/1.0 (asset-library)' } },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: { id: string; url: string; thumbnail: string; creator?: string; foreign_landing_url?: string; license: string; width?: number; height?: number }[];
  };
  return (data.results ?? []).map((p) =>
    tag(PROVIDERS.openverse!, {
      providerId: p.id,
      kind: 'photo',
      contentUrl: p.url,
      thumbUrl: p.thumbnail ?? p.url,
      sourceUrl: p.foreign_landing_url,
      creator: p.creator,
      licence: p.license?.toUpperCase() ?? 'CC0',
      attributionRequired: false, // cc0/pdm only
      mimeType: 'image/jpeg',
      width: p.width,
      height: p.height,
      label: p.creator ? `by ${p.creator}` : 'CC0 image',
    }),
  );
}

// ---------- Wikimedia Commons (PD/CC, no key, live) ----------
async function searchWikimedia(q: string, limit: number): Promise<AssetSearchResult[]> {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6` +
    `&gsrsearch=${encodeURIComponent(q)}&gsrlimit=${limit}&prop=imageinfo&iiprop=url|extmetadata` +
    `&iiurlwidth=400&format=json&origin=*`;
  const res = await fetch(url, { headers: { 'User-Agent': 'BrandFlow/1.0 (asset-library)' } });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    query?: { pages?: Record<string, { title: string; imageinfo?: { url: string; thumburl?: string; descriptionurl?: string; extmetadata?: { Artist?: { value?: string } } }[] }> };
  };
  const pages = Object.values(data.query?.pages ?? {});
  return pages
    .map((pg) => {
      const info = pg.imageinfo?.[0];
      if (!info || !/\.(jpe?g|png|svg)$/i.test(info.url)) return null;
      return tag(PROVIDERS.wikimedia!, {
        providerId: pg.title,
        kind: 'photo',
        contentUrl: info.url,
        thumbUrl: info.thumburl ?? info.url,
        sourceUrl: info.descriptionurl,
        creator: info.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, '').slice(0, 80),
        mimeType: 'image/jpeg',
        label: pg.title.replace(/^File:/, '').slice(0, 40),
      });
    })
    .filter((x): x is AssetSearchResult => x !== null)
    .slice(0, limit);
}

// ---------- Pollinations (free no-key AI image generation) ----------
export function pollinationsUrl(prompt: string, w = 1024, h = 1024, seed?: number): string {
  const s = seed ?? Math.abs([...prompt].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7));
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&seed=${s}`;
}
function generatePollinations(q: string, limit: number): AssetSearchResult[] {
  // a few seeded variations so the user can pick
  return Array.from({ length: Math.min(limit, 4) }, (_, i) => {
    const url = pollinationsUrl(q, 1024, 1024, i + 1);
    return tag(PROVIDERS.pollinations!, {
      providerId: `${q}#${i + 1}`,
      kind: 'ai',
      contentUrl: url,
      thumbUrl: pollinationsUrl(q, 384, 384, i + 1),
      mimeType: 'image/jpeg',
      label: `AI: ${q.slice(0, 30)}`,
    });
  });
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
    jobs.push(Promise.resolve(searchUndraw(q, limit)).catch(() => []));
    jobs.push(Promise.resolve(searchDicebear(q, Math.min(limit, 5))));
    jobs.push(searchPixabay(`${q} illustration`, limit).catch(() => []));
  }
  if (opts.kind === 'photo') {
    // free no-key sources first, then key-gated if configured
    jobs.push(searchOpenverse(q, limit).catch(() => []));
    jobs.push(searchWikimedia(q, Math.min(limit, 6)).catch(() => []));
    jobs.push(searchPexels(q, limit).catch(() => []));
    jobs.push(searchUnsplash(q, limit).catch(() => []));
    jobs.push(searchPixabay(q, limit).catch(() => []));
  }
  if (opts.kind === 'ai') jobs.push(Promise.resolve(generatePollinations(q, limit)));

  const results = (await Promise.all(jobs)).flat();
  return results.slice(0, limit * 2);
}
