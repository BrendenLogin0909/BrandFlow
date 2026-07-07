/**
 * Load raster/vector artwork into an HTMLImageElement for Konva's <Image>.
 * Two sources:
 *   - a URL (photo `src`)               → loaded directly
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

const cache = new Map<string, HTMLImageElement>();

function loadImage(key: string, src: string): Promise<HTMLImageElement> {
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      cache.set(key, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

/** Load a photo/image URL. */
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
