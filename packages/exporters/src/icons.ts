/**
 * Icon artwork resolution — turns an iconRef into real vector artwork.
 * Uses lucide-static (ISC licence, ~1500 line icons). Works in Node and
 * the browser. TODO(perf): whole-library import; see docs/16-backlog.md #5.
 */
import * as lucide from 'lucide-static';

const cache = new Map<string, string | null>();

/** Full lucide SVG for a kebab-case name ("bar-chart-3"), or null. */
export function lucideSvg(name: string): string | null {
  if (cache.has(name)) return cache.get(name)!;
  const pascal = name
    .split(/[-_ ]+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join('');
  const svg = (lucide as unknown as Record<string, unknown>)[pascal];
  const value = typeof svg === 'string' ? svg : null;
  cache.set(name, value);
  return value;
}

/** Resolve any iconRef to SVG artwork (explicit svg wins, then lucide). */
export function resolveIconSvg(iconRef: { provider: string; name: string; svg?: string }): string | null {
  if (iconRef.svg) return iconRef.svg;
  if (iconRef.provider === 'lucide' || iconRef.provider === 'internal' || iconRef.provider === 'tabler')
    return lucideSvg(iconRef.name) ?? lucideSvg('sparkles');
  return null;
}

/** Recolour + restroke a lucide SVG string. */
export function styleIconSvg(svg: string, colourHex: string, strokeWidth: number): string {
  return svg
    .replace(/<\?xml[^>]*\?>\s*/, '')
    .replace(/currentColor/g, colourHex)
    .replace(/stroke-width="[^"]*"/g, `stroke-width="${strokeWidth}"`);
}
