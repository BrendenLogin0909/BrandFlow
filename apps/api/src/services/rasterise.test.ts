/**
 * Rasteriser tests. The important one is the blank-render guard: resvg with no
 * matching font renders text as NOTHING and still returns a valid PNG, so a
 * naive "did it produce a buffer" check passes while the critic grades an empty
 * page. Byte length is the cheap proxy that catches it.
 */
import { describe, expect, it } from 'vitest';
import {
  CRITIC_RENDER_WIDTH,
  RasteriseError,
  rasterisePage,
  referencedFontFamilies,
  stripWebfontImports,
} from './rasterise.js';

const PAGE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <title>Test page</title>
  <defs>
    <style type="text/css"><![CDATA[
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap');
    ]]></style>
  </defs>
  <rect id="page-background" width="1080" height="1350" fill="#0f172a"/>
  <text id="h" text-anchor="start" font-family="'Poppins', sans-serif" font-size="96" font-weight="800" fill="#ffffff">
    <tspan x="90" y="300">STOP BLAMING</tspan>
    <tspan x="90" dy="110">THE TESTER</tspan>
  </text>
  <text id="b" text-anchor="start" font-family="Arial" font-size="30" fill="#94a3b8">
    <tspan x="90" y="620">Three moves that change the outcome for your team.</tspan>
  </text>
  <rect id="panel" x="90" y="760" width="520" height="360" rx="24" fill="#22d3ee"/>
  <ellipse id="blob" cx="820" cy="420" rx="200" ry="200" fill="#f59e0b" opacity="0.2"/>
</svg>`;

/** Renders to a valid PNG, but with almost no ink — the blank-page case. */
const NEARLY_EMPTY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080"><rect width="1080" height="1080" fill="#ffffff"/></svg>`;

describe('rasterisePage', () => {
  it('produces a PNG at the requested width, preserving aspect ratio', async () => {
    const out = await rasterisePage(PAGE_SVG, { width: 700, resolveRemoteImages: false });
    expect(out.width).toBe(700);
    // 1080x1350 is 4:5, so 700 wide is 875 tall
    expect(out.height).toBe(875);
    expect(out.png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });

  it('defaults to the critic render width', async () => {
    const out = await rasterisePage(PAGE_SVG, { resolveRemoteImages: false });
    expect(out.width).toBe(CRITIC_RENDER_WIDTH);
  });

  it('renders real ink, not a silently blank page', async () => {
    const out = await rasterisePage(PAGE_SVG, { resolveRemoteImages: false });
    // a blank 700px page compresses to a few hundred bytes; a page with two
    // headline lines, body copy and two shapes is an order of magnitude bigger
    expect(out.png.length).toBeGreaterThan(5000);
  });

  it('downscales: the 700px render is much smaller than the full-size one', async () => {
    const small = await rasterisePage(PAGE_SVG, { width: 700, resolveRemoteImages: false });
    const full = await rasterisePage(PAGE_SVG, { width: 1080, resolveRemoteImages: false });
    expect(small.png.length).toBeLessThan(full.png.length);
  });

  it('reports a font it could not load instead of pretending it rendered', async () => {
    // Uses a family that cannot exist. The curated Google faces (Poppins et al)
    // are now bundled in apps/api/.fonts and DO resolve, so testing with a real
    // brand font would assert the very defect we fixed.
    const svg = PAGE_SVG.replace(/font-family="[^"]*"/g, 'font-family="Nonexistent Brand Face"');
    const out = await rasterisePage(svg, { resolveRemoteImages: false });
    expect(out.fontFallbacks).toContain('Nonexistent Brand Face');
  });

  it('resolves the bundled brand fonts, so typography critiques are meaningful', async () => {
    // Regression guard for the fix: if apps/api/.fonts is missing or the files
    // are named so the matcher cannot recover the family, this fails.
    const out = await rasterisePage(PAGE_SVG, { resolveRemoteImages: false });
    expect(out.fontFallbacks).not.toContain('Poppins');
  });

  it('does not report generic families or the pinned fallbacks as missing', async () => {
    const out = await rasterisePage(PAGE_SVG, { resolveRemoteImages: false });
    expect(out.fontFallbacks).not.toContain('sans-serif');
    expect(out.fontFallbacks).not.toContain('Arial');
  });

  it('reports remote images it could not fetch', async () => {
    const withImage = PAGE_SVG.replace(
      '</svg>',
      '<image x="600" y="800" width="300" height="300" href="https://127.0.0.1:9/missing.png"/></svg>',
    );
    const out = await rasterisePage(withImage, { resolveRemoteImages: false });
    expect(out.unresolvedImages).toHaveLength(1);
    expect(out.unresolvedImages[0]).toContain('missing.png');
  });

  it('throws RasteriseError on an unparseable SVG rather than returning junk', async () => {
    await expect(rasterisePage('<svg>this is not closed')).rejects.toBeInstanceOf(RasteriseError);
  });

  it('throws RasteriseError when the render comes back blank', async () => {
    await expect(rasterisePage(NEARLY_EMPTY_SVG, { resolveRemoteImages: false })).rejects.toBeInstanceOf(
      RasteriseError,
    );
  });
});

describe('stripWebfontImports', () => {
  it('removes the style block resvg cannot use', () => {
    const out = stripWebfontImports(PAGE_SVG);
    expect(out).not.toContain('@import');
    expect(out).not.toContain('<style');
    expect(out).toContain('STOP BLAMING'); // content untouched
  });
});

describe('referencedFontFamilies', () => {
  it('splits font stacks and skips generic families', () => {
    expect(referencedFontFamilies(PAGE_SVG)).toEqual(['Poppins', 'Arial']);
  });

  it('de-duplicates families that differ only in quoting or case', () => {
    const svg = `<svg><text font-family="'Inter', sans-serif"/><text font-family="Inter"/><text font-family="inter"/></svg>`;
    expect(referencedFontFamilies(svg)).toEqual(['Inter']);
  });

  it('returns nothing for an SVG with no text', () => {
    expect(referencedFontFamilies('<svg><rect width="10" height="10"/></svg>')).toEqual([]);
  });
});
