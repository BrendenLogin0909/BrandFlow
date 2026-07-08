import type { BrandTokensSnapshot, Colour } from '@brandflow/design-schema';

const HEX = /^#([0-9a-fA-F]{6})$/;

export function normaliseHex(input: string | null | undefined): string | null {
  if (!input) return null;
  let h = input.trim();
  if (/^rgb\(/i.test(h)) {
    const m = h.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!m) return null;
    const toHex = (n: string) => Number(n).toString(16).padStart(2, '0');
    h = `#${toHex(m[1]!)}${toHex(m[2]!)}${toHex(m[3]!)}`;
  }
  if (h.startsWith('#') && h.length === 4) {
    h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  }
  return HEX.test(h) ? h.toLowerCase() : null;
}

/** Exact hex match → brand token; otherwise raw with allowedOverride false. */
export function hexToColour(hex: string, brand: BrandTokensSnapshot): Colour {
  const normal = normaliseHex(hex) ?? '#000000';
  for (const [token, value] of Object.entries(brand.colours)) {
    if (value.toLowerCase() === normal) return { kind: 'token', token };
  }
  return { kind: 'raw', hex: normal, allowedOverride: false };
}

export function fillFromSvgPaint(paint: string | null, brand: BrandTokensSnapshot): Colour {
  if (!paint || paint === 'none') return { kind: 'token', token: 'background' };
  if (paint.startsWith('url(')) return { kind: 'token', token: 'accent' };
  return hexToColour(paint, brand);
}
