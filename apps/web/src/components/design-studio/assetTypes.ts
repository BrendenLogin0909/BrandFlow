/** Shared asset pick types for Design Studio (mirrors asset library search). */

export type AssetKind = 'icon' | 'illustration' | 'photo' | 'ai';

/**
 * Bundled scene packs served by `GET /assets/render/:provider/:id`. They accept
 * a `hue` query param that recolours the pack accent (#6c63ff) to the brand
 * colour, so the canvas must go through the render endpoint rather than the
 * multi-KB data-URI returned by search.
 */
export const BUNDLED_SCENE_PROVIDERS = ['undraw', 'openpeeps'] as const;

export function isBundledSceneProvider(provider: string | undefined | null): provider is string {
  return (BUNDLED_SCENE_PROVIDERS as readonly string[]).includes(provider ?? '');
}

export interface AssetSearchResult {
  provider: string;
  providerId: string;
  kind: AssetKind;
  contentUrl: string;
  thumbUrl: string;
  sourceUrl?: string;
  creator?: string;
  licence: string;
  attributionRequired: boolean;
  usageTier: 1 | 2 | 3;
  label: string;
}

export interface AssetLibraryItem {
  id: string;
  type: string;
  provider: string | null;
  providerId: string | null;
  licence: string | null;
  usageTier: number;
  approved: boolean;
  shared: boolean;
  attributionRequired: boolean;
  contentUrl: string | null;
  thumbUrl: string | null;
  creator: string | null;
  filename: string;
  tags: string[];
  /** Present for customer uploads (bytes live in object storage, not at a public URL). */
  storageKey?: string | null;
}

/** Normalised pick applied onto a design element. */
export interface AssetPick {
  contentUrl: string;
  thumbUrl?: string;
  label: string;
  provider: string;
  providerId?: string;
  creator?: string;
  attributionRequired: boolean;
  libraryItemId?: string;
  kind: AssetKind;
  usageTier: 1 | 2 | 3;
}

export function pickFromSearch(r: AssetSearchResult): AssetPick {
  return {
    contentUrl: r.contentUrl,
    thumbUrl: r.thumbUrl,
    label: r.label,
    provider: r.provider,
    providerId: r.providerId,
    creator: r.creator,
    attributionRequired: r.attributionRequired,
    kind: r.kind,
    usageTier: r.usageTier,
  };
}

/**
 * Uploaded assets (provider 'upload') have no public contentUrl — bytes are
 * only reachable through the authed API. Derive the same URL the canvas
 * already knows how to load (useAssetImage's authed-blob fetch handles any
 * /api/ path) from the item id + active client scope.
 */
export function libraryItemContentUrl(item: AssetLibraryItem, clientId: string | null): string | null {
  if (item.contentUrl) return item.contentUrl;
  if (item.storageKey && clientId) return `/api/clients/${clientId}/assets/${item.id}/content`;
  return null;
}

export function pickFromLibrary(item: AssetLibraryItem, clientId: string | null = null): AssetPick | null {
  const contentUrl = libraryItemContentUrl(item, clientId);
  if (!contentUrl) return null;
  // LOGO (and anything else that isn't a plain photo/icon) maps to
  // 'illustration' so it gets fit:'contain' downstream — right for logos,
  // which must never be cropped.
  const kind: AssetKind =
    item.type === 'ICON' ? 'icon' : item.type === 'PHOTO' ? 'photo' : 'illustration';
  return {
    contentUrl,
    thumbUrl: item.thumbUrl ?? contentUrl,
    label: item.filename,
    provider: item.provider ?? 'library',
    providerId: item.providerId ?? undefined,
    attributionRequired: item.attributionRequired,
    libraryItemId: item.id,
    kind,
    usageTier: item.usageTier as 1 | 2 | 3,
    creator: item.creator ?? undefined,
  };
}

export function attributionLine(pick: AssetPick): string | null {
  if (!pick.attributionRequired) return null;
  const who = pick.creator ? ` by ${pick.creator}` : '';
  return `${pick.label}${who} (${pick.provider})`.slice(0, 200);
}

/** Canvas-safe URL for bundled illustrations (avoids multi-KB data-URIs that Konva fails to paint). */
export function assetRenderUrl(
  clientId: string,
  provider: string,
  providerId: string,
  hue = '#4f46e5',
): string {
  const q = new URLSearchParams({ hue });
  return `/api/clients/${clientId}/assets/render/${provider}/${encodeURIComponent(providerId)}?${q}`;
}

/** Same-origin proxy for remote CDN images (Pollinations etc.) — avoids CORS grey boxes. */
export function assetProxyUrl(clientId: string, remoteUrl: string): string {
  return `/api/clients/${clientId}/assets/proxy?url=${encodeURIComponent(remoteUrl)}`;
}

function needsProxy(url: string): boolean {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host.includes('pollinations') ||
      host.includes('dicebear') ||
      host.includes('openverse') ||
      host.includes('wikimedia') ||
      host.includes('wikipedia') ||
      host.includes('unsplash') ||
      host.includes('pexels') ||
      host.includes('pixabay') ||
      host.includes('iconify') ||
      host.includes('flickr') ||
      host.includes('stocksnap') ||
      host.includes('rawpixel') ||
      host.includes('nappy') ||
      host.includes('shopify') ||
      host.includes('wp.com') ||
      host.includes('wordpress.com') ||
      host.includes('cloudfront.net') ||
      host.includes('googleusercontent') ||
      host.includes('imgur')
    );
  } catch {
    return false;
  }
}

/** Prefer render/proxy endpoints so Konva can always paint the asset. */
export function resolveAssetContentUrl(pick: AssetPick, clientId: string | null, accentHue = '#4f46e5'): string {
  if (clientId && isBundledSceneProvider(pick.provider) && pick.providerId) {
    return assetRenderUrl(clientId, pick.provider, pick.providerId, accentHue);
  }
  if (clientId && needsProxy(pick.contentUrl)) {
    return assetProxyUrl(clientId, pick.contentUrl);
  }
  return pick.contentUrl;
}
