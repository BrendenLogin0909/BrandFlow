/**
 * Load raster/vector artwork into an HTMLImageElement for Konva's <Image>.
 * Two sources:
 *   - a URL (photo `src`)               → loaded directly (or via /assets/proxy)
 *   - an IconElement's iconRef          → resolved to a lucide SVG string
 *     (reusing the exporter's resolveIconSvg/styleIconSvg so canvas and export
 *     match), recoloured, then turned into a data-URI image.
 *
 * Returns `null` while loading or on failure; the caller draws a placeholder
 * in that case. A tiny module cache dedupes repeat loads of the same key.
 */
import { useEffect, useState } from 'react';
import type { IconElement } from '@brandflow/design-schema';
import { resolveIconSvg, styleIconSvg } from '@brandflow/exporters/icons';
import { getAccessToken, getActiveClientId } from '../../lib/api';
import { assetProxyUrl } from './assetTypes';

const cache = new Map<string, HTMLImageElement>();

function needsProxyHost(url: string): boolean {
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

async function fetchAuthedBlobUrl(apiPath: string): Promise<string> {
  const token = getAccessToken();
  const res = await fetch(apiPath, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Asset fetch ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

async function resolveLoadSrc(src: string): Promise<string> {
  // Same-origin API paths need the JWT (render + proxy).
  const isApi =
    src.startsWith('/api/') ||
    (typeof window !== 'undefined' && src.startsWith(`${window.location.origin}/api/`));
  if (isApi) {
    const path = src.startsWith('http') ? new URL(src).pathname + new URL(src).search : src;
    return fetchAuthedBlobUrl(path);
  }
  // Hotlinked CDNs often block canvas CORS → grey box. Route through our proxy.
  if (needsProxyHost(src)) {
    const clientId = getActiveClientId();
    if (clientId) return fetchAuthedBlobUrl(assetProxyUrl(clientId, src));
  }
  return src;
}

function loadImage(key: string, src: string): Promise<HTMLImageElement> {
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  return (async () => {
    const loadSrc = await resolveLoadSrc(src);
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image();
      // data:/blob: must not set crossOrigin. Remote http(s) may need it for export,
      // but CORS-blocked CDNs fail — prefer /assets/proxy for those instead.
      if (loadSrc.startsWith('http://') || loadSrc.startsWith('https://')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        cache.set(key, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 80)}`));
      img.src = loadSrc;
    });
  })();
}

/** Load a photo/image URL. Returns null while loading or on failure. */
export function useImageSrc(src: string | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(() => (src ? cache.get(src) ?? null : null));
  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }
    let live = true;
    loadImage(src, src)
      .then((img) => live && setImage(img))
      .catch(() => live && setImage(null));
    return () => {
      live = false;
    };
  }, [src]);
  return image;
}

export type ImageLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Like useImageSrc but distinguishes loading vs failed (for canvas placeholders). */
export function useImageSrcStatus(src: string | undefined): {
  image: HTMLImageElement | null;
  status: ImageLoadStatus;
} {
  const [image, setImage] = useState<HTMLImageElement | null>(() => (src ? cache.get(src) ?? null : null));
  const [status, setStatus] = useState<ImageLoadStatus>(() =>
    !src ? 'idle' : cache.has(src) ? 'ready' : 'loading',
  );
  useEffect(() => {
    if (!src) {
      setImage(null);
      setStatus('idle');
      return;
    }
    if (cache.has(src)) {
      setImage(cache.get(src)!);
      setStatus('ready');
      return;
    }
    let live = true;
    setStatus('loading');
    loadImage(src, src)
      .then((img) => {
        if (!live) return;
        setImage(img);
        setStatus('ready');
      })
      .catch(() => {
        if (!live) return;
        setImage(null);
        setStatus('error');
      });
    return () => {
      live = false;
    };
  }, [src]);
  return { image, status };
}

/** Build a standalone, recoloured SVG data-URI for an icon (viewBox 0 0 24 24,
 *  matching the exporter). Returns null for an unresolvable icon. */
export function iconDataUri(icon: IconElement, colourHex: string): string | null {
  const artwork = resolveIconSvg(icon.iconRef);
  if (!artwork) return null;
  const inner = styleIconSvg(artwork, colourHex, icon.strokeWidth)
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${colourHex}" stroke-width="${icon.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Load an icon element's artwork as an image, recoloured to `colourHex`. */
export function useIconImage(icon: IconElement, colourHex: string): HTMLImageElement | null {
  const uri = iconDataUri(icon, colourHex);
  const key = uri ? `${icon.iconRef.provider}/${icon.iconRef.name}/${colourHex}/${icon.strokeWidth}` : '';
  const [image, setImage] = useState<HTMLImageElement | null>(() => (key ? cache.get(key) ?? null : null));
  useEffect(() => {
    if (!uri || !key) {
      setImage(null);
      return;
    }
    let live = true;
    loadImage(key, uri)
      .then((img) => live && setImage(img))
      .catch(() => live && setImage(null));
    return () => {
      live = false;
    };
  }, [uri, key]);
  return image;
}
