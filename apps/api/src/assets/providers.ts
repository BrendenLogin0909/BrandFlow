/**
 * Asset provider adapters. Each returns licence-tagged results so nothing
 * is ever served without provenance. No-key providers work out of the box;
 * key-gated ones (stock photos) light up when their env key is set, exactly
 * like the AI provider.
 *
 * Live no-key pools (thousands+ of assets):
 *   - Lucide (~1.5k ISC icons, bundled)
 *   - Iconify public API (200k+ icons across 200+ sets)
 *   - Open Peeps character scenes (bundled openpeeps-manifest, CC0, ~80)
 *   - Flat illustration pack (bundled undraw-manifest, 300+)
 *   - DiceBear figures (Open Peeps etc.)
 *   - Openverse CC0/PDM photos + illustrations
 *   - Wikimedia (tier 3), Pollinations AI
 * Key-gated: Unsplash / Pexels / Pixabay when env keys are set.
 */
import { PROVIDERS, type AssetKind, type ProviderSpec } from './registry.js';
import { UNDRAW_MANIFEST } from './undraw-manifest.js';
import { OPENPEEPS_MANIFEST } from './openpeeps-manifest.js';
import { lucideSvg } from '@brandflow/exporters/icons';

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

// ---------- Lucide (bundled ISC icons, ~1500, no key) ----------
// Prefer Lucide for icon search so AI/users get tier-1 auto-safe results first.
let _lucideNames: string[] | null = null;
function lucideIconNames(): string[] {
  if (_lucideNames) return _lucideNames;
  // Probe common kebab names via lucideSvg; build from a curated + dynamic list.
  // lucide-static exports PascalCase keys — we keep a searchable kebab catalog.
  const seed = [
    'activity','airplay','alarm-clock','alert-circle','alert-triangle','align-center','align-left','align-right',
    'anchor','aperture','archive','arrow-big-down','arrow-big-left','arrow-big-right','arrow-big-up','arrow-down',
    'arrow-down-left','arrow-down-right','arrow-left','arrow-left-right','arrow-right','arrow-up','arrow-up-down',
    'arrow-up-left','arrow-up-right','at-sign','award','axe','badge','badge-check','badge-alert','ban','banknote',
    'bar-chart','bar-chart-2','bar-chart-3','bar-chart-4','battery','battery-charging','beaker','bell','bell-off',
    'bike','binary','bitcoin','bluetooth','bold','book','book-open','bookmark','bot','box','briefcase','brush',
    'bug','building','building-2','bus','calculator','calendar','calendar-check','calendar-days','camera','car',
    'cast','check','check-check','check-circle','check-circle-2','check-square','chevron-down','chevron-left',
    'chevron-right','chevron-up','chevrons-down','chevrons-left','chevrons-right','chevrons-up','chrome','circle',
    'clipboard','clipboard-check','clipboard-list','clock','cloud','cloud-download','cloud-lightning','cloud-off',
    'cloud-rain','cloud-snow','cloud-upload','code','code-2','codepen','codesandbox','coffee','cog','coins',
    'columns','command','compass','component','contact','contrast','cookie','copy','copyright','credit-card',
    'crop','crosshair','crown','cup-soda','database','delete','disc','divide','dollar-sign','download','droplet',
    'dumbbell','ear','edit','edit-2','edit-3','egg','equal','euro','expand','external-link','eye','eye-off',
    'facebook','factory','fast-forward','feather','figma','file','file-check','file-code','file-plus','file-text',
    'film','filter','fingerprint','flag','flame','flash','flashlight','flask-conical','flower','folder',
    'folder-open','folder-plus','form-input','forward','frame','frown','fuel','function-square','gamepad','gauge',
    'gavel','gem','ghost','gift','git-branch','git-commit','git-merge','git-pull-request','github','gitlab','globe',
    'globe-2','graduation-cap','grape','grid','grip','hammer','hand','hard-drive','hard-hat','hash','haze','heading',
    'headphones','heart','heart-handshake','help-circle','hexagon','highlighter','history','home','hourglass',
    'image','image-plus','inbox','indent','indian-rupee','infinity','info','inspect','instagram','italic','japanese-yen',
    'joystick','key','keyboard','lamp','landmark','languages','laptop','laptop-2','lasso','layers','layout',
    'layout-dashboard','layout-grid','layout-list','layout-template','leaf','library','life-buoy','lightbulb',
    'line-chart','link','link-2','linkedin','list','list-checks','list-ordered','list-todo','loader','loader-2',
    'locate','lock','lock-open','log-in','log-out','mail','mail-open','map','map-pin','maximize','maximize-2',
    'medal','megaphone','meh','menu','message-circle','message-square','mic','mic-off','microscope','minimize',
    'minimize-2','minus','minus-circle','monitor','monitor-smartphone','moon','more-horizontal','more-vertical',
    'mountain','mouse','mouse-pointer','move','music','navigation','network','newspaper','octagon','option',
    'package','package-check','package-open','paintbrush','palette','paperclip','parenthesis','parking-circle',
    'party-popper','pause','pause-circle','pen','pen-tool','pencil','percent','person-standing','phone','phone-call',
    'phone-forwarded','phone-incoming','phone-missed','phone-off','phone-outgoing','pie-chart','piggy-bank','pin',
    'pipette','pizza','plane','play','play-circle','plug','plug-2','plus','plus-circle','pocket','podcast','pointer',
    'pound-sterling','power','presentation','printer','puzzle','qr-code','quote','radio','receipt','rectangle-horizontal',
    'rectangle-vertical','recycle','redo','redo-2','refresh-ccw','refresh-cw','regex','remove-formatting','repeat',
    'reply','rewind','rocket','rotate-ccw','rotate-cw','route','rss','ruler','russian-ruble','save','scale','scan',
    'scissors','screen-share','search','send','separator-horizontal','separator-vertical','server','settings',
    'settings-2','share','share-2','sheet','shield','shield-alert','shield-check','shield-off','ship','shopping-bag',
    'shopping-cart','shovel','shower-head','shrink','shrub','shuffle','sidebar','sigma','signal','siren','skip-back',
    'skip-forward','skull','slack','slash','sliders','sliders-horizontal','smartphone','smile','snowflake','sofa',
    'sort-asc','sort-desc','speaker','spline','sprout','square','star','stethoscope','sticker','sticky-note','stop-circle',
    'stretch-horizontal','stretch-vertical','strikethrough','subscript','sun','sunrise','sunset','superscript','swiss-franc',
    'switch-camera','sword','swords','syringe','table','tablet','tag','target','tent','terminal','thermometer','thumbs-down',
    'thumbs-up','ticket','timer','toggle-left','toggle-right','tornado','toy-brick','train','trash','trash-2','tree-deciduous',
    'tree-pine','trees','trello','trending-down','trending-up','triangle','trophy','truck','tv','twitch','twitter','type',
    'umbrella','underline','undo','undo-2','unlink','unlock','upload','usb','user','user-check','user-cog','user-minus',
    'user-plus','user-x','users','utensils','variable','vegan','verified','vibrate','video','video-off','view','voicemail',
    'volume','volume-1','volume-2','volume-x','wallet','wand','wand-2','watch','waves','webcam','wifi','wifi-off','wind',
    'wine','workflow','wrench','x','x-circle','x-octagon','x-square','youtube','zap','zap-off','zoom-in','zoom-out',
    'brain','sparkles','bot','cpu','hard-drive','server-cog','blocks','waypoints','radar','scan-search','chart-no-axes-combined',
    'chart-column','chart-column-increasing','chart-line','chart-pie','chart-bar','chart-area','circle-check-big','circle-alert',
    'circle-x','circle-help','badge-percent','handshake','building','factory','store','warehouse','forklift','container',
  ];
  const names = seed.filter((n) => lucideSvg(n) != null);
  // Dedupe while preserving order
  _lucideNames = [...new Set(names)];
  return _lucideNames;
}

function searchLucide(q: string, limit: number): AssetSearchResult[] {
  const terms = q.toLowerCase().split(/[\s,_-]+/).filter(Boolean);
  const names = lucideIconNames();
  const scored = names
    .map((name) => {
      const hay = name.toLowerCase();
      let score = 0;
      let exact = false;
      for (const t of terms) {
        if (hay === t) {
          score += 100;
          exact = true;
        } else if (hay.startsWith(t)) score += 40;
        else if (hay.split('-').includes(t)) score += 80;
      }
      return { name, score, exact };
    })
    .filter((s) => (terms.length ? s.score > 0 : true))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score || a.name.localeCompare(b.name));
  const chosen = (
    terms.length === 0
      ? names.map((name) => ({ name, score: 0, exact: false }))
      : scored
  ).slice(0, limit);
  return chosen.map(({ name }) => {
    const svg = lucideSvg(name)!;
    const dataUri = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    return tag(PROVIDERS.lucide!, {
      providerId: name,
      kind: 'icon',
      contentUrl: dataUri,
      thumbUrl: dataUri,
      sourceUrl: `https://lucide.dev/icons/${name}`,
      label: name,
      width: 24,
      height: 24,
    });
  });
}

// ---------- Iconify (icons, no key, live — 200k+ across 200+ sets) ----------
// https://iconify.design/docs/api/
// Prefer commercially-safe open sets when filtering; store per-set licence on save.
const ICONIFY_PREFERRED = 'lucide,tabler,mdi,ph,heroicons,carbon,bi,bx,ri,fluent,material-symbols';
async function searchIconify(q: string, limit: number): Promise<AssetSearchResult[]> {
  const capped = Math.min(Math.max(limit, 1), 64);
  const url =
    `https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=${capped}` +
    `&prefixes=${ICONIFY_PREFERRED}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { icons?: string[]; total?: number };
  return (data.icons ?? []).slice(0, capped).map((full) => {
    const [prefix, name] = full.split(':');
    return tag(PROVIDERS.iconify!, {
      providerId: full,
      kind: 'icon',
      contentUrl: `https://api.iconify.design/${prefix}/${name}.svg`,
      thumbUrl: `https://api.iconify.design/${prefix}/${name}.svg?height=64`,
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

/**
 * Score a term against haystack.
 * Exact token/title/slug match ranks far above partial (prefix) matches.
 * Substring-inside-word matches (cat⊂scatter) score 0.
 */
function keywordScore(hay: string, term: string, title: string, slug: string): number {
  if (!term) return 0;
  const tokens = hay.split(/[\s_-]+/).filter(Boolean);
  const titleL = title.toLowerCase();
  const slugL = slug.toLowerCase();
  // Exact: full title, full slug, or exact keyword/token
  if (titleL === term || slugL === term || slugL === term.replace(/\s+/g, '-')) return 100;
  let score = 0;
  if (tokens.includes(term)) score += 80;
  // Prefer scenes whose name starts with the query (team… before …team…)
  if (titleL.startsWith(term) || slugL.startsWith(term.replace(/\s+/g, '-'))) score += 50;
  else if (tokens.some((t) => t.startsWith(term) && t !== term)) score += 20;
  return score;
}

/**
 * Search one bundled scene pack. Both bundled packs (the original flat pack and
 * the Open Peeps character pack) share this scorer so ranking stays consistent
 * and neither pack dumps unrelated scenes on a miss.
 */
/** Fallback when no brand colour is supplied (bundled packs' own accent). */
export const DEFAULT_PACK_HUE = '#4f46e5';
/** Accept only a full #rrggbb hex; anything else falls back to the pack default. */
const HEX6 = /^#[0-9a-fA-F]{6}$/;
export function normaliseHue(hue: string | undefined): string {
  return hue && HEX6.test(hue) ? hue : DEFAULT_PACK_HUE;
}

function searchBundledPack(
  manifest: readonly { slug: string; title: string; keywords: string[]; svg: string }[],
  spec: ProviderSpec,
  q: string,
  limit: number,
  brandHue = DEFAULT_PACK_HUE,
): AssetSearchResult[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = manifest.map((e) => {
    const hay = `${e.slug.replace(/-/g, ' ')} ${e.title} ${e.keywords.join(' ')}`.toLowerCase();
    const score = terms.reduce((n, t) => n + keywordScore(hay, t, e.title, e.slug), 0);
    const exact = terms.some(
      (t) =>
        e.title.toLowerCase() === t ||
        e.slug === t ||
        e.slug === t.replace(/\s+/g, '-') ||
        e.keywords.map((k) => k.toLowerCase()).includes(t),
    );
    return { e, score, exact };
  });
  const matched = scored
    .filter((s) => s.score > 0)
    // Exact matches first, then by score, then title
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score || a.e.title.localeCompare(b.e.title));
  // Empty query → browse the pack. No keyword match → empty (don't dump unrelated scenes).
  const chosen = (terms.length === 0 ? manifest : matched.map((s) => s.e)).slice(0, limit);
  return chosen.map((e) => {
    const recoloured = e.svg.replace(UNDRAW_ACCENT, brandHue);
    const dataUri = 'data:image/svg+xml;utf8,' + encodeURIComponent(recoloured);
    return tag(spec, {
      providerId: e.slug,
      kind: 'illustration',
      contentUrl: dataUri,
      thumbUrl: dataUri,
      sourceUrl: spec.sourceUrl,
      creator: spec.creator,
      attributionRequired: spec.attributionRequired,
      mimeType: 'image/svg+xml',
      label: e.title,
    });
  });
}

const searchUndraw = (q: string, limit: number, brandHue = DEFAULT_PACK_HUE) =>
  searchBundledPack(UNDRAW_MANIFEST, PROVIDERS.undraw!, q, limit, brandHue);

/** Open Peeps character scenes (CC0 art, bundled) — the preferred people pool. */
const searchOpenpeeps = (q: string, limit: number, brandHue = DEFAULT_PACK_HUE) =>
  searchBundledPack(OPENPEEPS_MANIFEST, PROVIDERS.openpeeps!, q, limit, brandHue);

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
// are commercial-safe with no attribution. Millions of CC0/PDM works.
async function searchOpenverse(
  q: string,
  limit: number,
  category?: 'illustration' | 'photograph' | 'digitized_artwork',
): Promise<AssetSearchResult[]> {
  const capped = Math.min(Math.max(limit, 1), 40);
  const params = new URLSearchParams({
    q,
    license: 'cc0,pdm',
    page_size: String(capped),
    mature: 'false',
  });
  if (category) params.set('category', category);
  const res = await fetch(`https://api.openverse.org/v1/images/?${params}`, {
    headers: { 'User-Agent': 'BrandFlow/1.0 (asset-library; commercial LinkedIn content tool)' },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: {
      id: string;
      url: string;
      thumbnail: string;
      creator?: string;
      foreign_landing_url?: string;
      license: string;
      width?: number;
      height?: number;
      category?: string;
    }[];
  };
  return (data.results ?? []).map((p) =>
    tag(PROVIDERS.openverse!, {
      providerId: p.id,
      kind: category === 'illustration' || p.category === 'illustration' ? 'illustration' : 'photo',
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

/** OpenAI Images — preferred when OPENAI_API_KEY is set (Pollinations is often blocked/slow). */
async function generateOpenAiImages(q: string, limit: number): Promise<AssetSearchResult[]> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key.length < 20 || key.includes('...')) return [];
  const n = Math.min(Math.max(limit, 1), 4);
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: q.slice(0, 1000) || 'abstract colourful geometric shapes, flat design',
        n,
        size: '1024x1024',
        quality: 'low',
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      // Fall back to dall-e-3 single image if gpt-image-1 unavailable
      if (res.status === 400 || res.status === 404) {
        const res2 = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'dall-e-3',
            prompt: q.slice(0, 1000) || 'abstract colourful geometric shapes, flat design',
            n: 1,
            size: '1024x1024',
            response_format: 'b64_json',
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!res2.ok) return [];
        const data2 = (await res2.json()) as { data?: { b64_json?: string; url?: string }[] };
        return (data2.data ?? []).map((img, i) => {
          const contentUrl = img.b64_json
            ? `data:image/png;base64,${img.b64_json}`
            : img.url ?? '';
          return tag(PROVIDERS.ai!, {
            providerId: `dalle3:${q.slice(0, 40)}#${i + 1}`,
            kind: 'ai',
            contentUrl,
            thumbUrl: contentUrl,
            mimeType: 'image/png',
            label: `AI: ${q.slice(0, 30)}`,
          });
        }).filter((r) => r.contentUrl);
      }
      return [];
    }
    const data = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
    return (data.data ?? []).map((img, i) => {
      const contentUrl = img.b64_json
        ? `data:image/png;base64,${img.b64_json}`
        : img.url ?? '';
      return tag(PROVIDERS.ai!, {
        providerId: `gpt-image:${q.slice(0, 40)}#${i + 1}`,
        kind: 'ai',
        contentUrl,
        thumbUrl: contentUrl,
        mimeType: 'image/png',
        label: `AI: ${q.slice(0, 30)}`,
      });
    }).filter((r) => r.contentUrl);
  } catch {
    return [];
  }
}

export interface SearchOptions {
  kind: AssetKind;
  query: string;
  limit?: number;
  /**
   * Brand colour used to recolour the bundled packs' accent (#6c63ff).
   * Without it every composed post gets the same default indigo whatever
   * the brand palette is — see docs/16-backlog.md item A1.
   */
  brandHue?: string;
}

/**
 * Search whitelisted providers. AI generation is NOT triggered here —
 * use `generateAiImages()` / POST /assets/generate so credits are spent
 * only on an explicit user action with a detailed prompt.
 */
export async function searchAssets(opts: SearchOptions): Promise<AssetSearchResult[]> {
  const limit = Math.min(Math.max(opts.limit ?? 24, 1), 64);
  const q = opts.query.trim();
  const browse = q.length === 0;
  // Fall back to the packs' own default when no brand colour is supplied.
  const hue = normaliseHue(opts.brandHue);
  const jobs: Promise<AssetSearchResult[]>[] = [];

  if (opts.kind === 'icon') {
    jobs.push(Promise.resolve(searchLucide(q || 'arrow', limit)));
    if (!browse) jobs.push(searchIconify(q, limit).catch(() => []));
  }
  if (opts.kind === 'illustration') {
    jobs.push(Promise.resolve(searchOpenpeeps(q, limit, hue)).catch(() => []));
    jobs.push(Promise.resolve(searchUndraw(q, limit, hue)).catch(() => []));
    if (!browse) jobs.push(Promise.resolve(searchDicebear(q, Math.min(limit, 4))));
    if (!browse) {
      jobs.push(searchOpenverse(q, limit, 'illustration').catch(() => []));
      jobs.push(searchPixabay(`${q} illustration`, limit).catch(() => []));
    }
  }
  if (opts.kind === 'photo') {
    const photoQ = q || 'business';
    jobs.push(searchOpenverse(photoQ, limit, 'photograph').catch(() => []));
    jobs.push(searchWikimedia(photoQ, Math.min(limit, 8)).catch(() => []));
    jobs.push(searchPexels(photoQ, limit).catch(() => []));
    jobs.push(searchUnsplash(photoQ, limit).catch(() => []));
    jobs.push(searchPixabay(photoQ, limit).catch(() => []));
  }
  // kind === 'ai' → no live generation from search; UI uses /generate + library

  const results = (await Promise.all(jobs)).flat();
  // Bundled packs first (tier 1, no network, recolourable). The hand-drawn Open
  // Peeps character scenes outrank the geometric flat pack — they are the
  // 29FORWARD-grade hero art — then avatars, then everything else.
  const rank = (r: AssetSearchResult) =>
    r.provider === 'openpeeps'
      ? 0
      : r.provider === 'undraw'
        ? 1
        : r.provider === 'dicebear'
          ? 3
          : r.kind === 'illustration'
            ? 2
            : 4;
  results.sort((a, b) => rank(a) - rank(b));

  const seen = new Set<string>();
  const deduped: AssetSearchResult[] = [];
  for (const r of results) {
    if (!r.contentUrl || seen.has(r.contentUrl)) continue;
    seen.add(r.contentUrl);
    deduped.push(r);
  }
  return deduped.slice(0, limit * 3);
}

/** Explicit AI image generation (OpenAI preferred). Caller must supply a detailed prompt. */
export async function generateAiImages(
  prompt: string,
  count = 1,
): Promise<AssetSearchResult[]> {
  const p = prompt.trim();
  if (p.length < 12) return [];
  const n = Math.min(Math.max(count, 1), 2);
  const openai = await generateOpenAiImages(p, n);
  if (openai.length) return openai;
  return generatePollinations(p, n);
}
