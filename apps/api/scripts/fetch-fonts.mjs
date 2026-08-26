/**
 * Download the curated Google Fonts as TTF files so the rasteriser can render
 * real brand typography.
 *
 * Why this exists: @resvg/resvg-js does not execute the @import in the SVG
 * exporter's <style> block and never fetches webfonts. Without local files every
 * brand face silently falls back — and resvg then picks the alphabetically
 * first system family, which on Windows is a condensed display face, distorting
 * headline weight badly enough to make any critique of typography worthless.
 *
 * Fonts land in apps/api/.fonts (gitignored — this fetches ~30 families, which
 * does not belong in git). All curated families are OFL or Apache-2.0 licensed
 * and redistributable; the licence for each is recorded in LICENCES.txt.
 *
 *   node scripts/fetch-fonts.mjs            # missing families only
 *   node scripts/fetch-fonts.mjs --force    # re-download everything
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', '.fonts');
const FORCE = process.argv.includes('--force');

// Weights the exporter actually emits (400 body, 700 headline).
const WEIGHTS = [400, 700];

const FAMILIES = [
  'Inter', 'Poppins', 'Montserrat', 'Roboto', 'Open Sans', 'Lato', 'Work Sans',
  'Nunito Sans', 'Raleway', 'Manrope', 'DM Sans', 'Archivo', 'Sora', 'Figtree',
  'Plus Jakarta Sans', 'Playfair Display', 'Merriweather', 'Lora',
  'Source Serif 4', 'Libre Baskerville', 'PT Serif', 'Bitter', 'Fraunces',
  'Oswald', 'Bebas Neue', 'Anton', 'Archivo Black', 'Roboto Mono',
  'JetBrains Mono', 'Space Mono',
];

// A UA with no woff2 support makes the CSS API hand back plain TTF, which is
// what resvg wants.
const TTF_UA = 'Mozilla/5.0 (Windows NT 5.1)';

async function cssFor(family) {
  const axis = `${encodeURIComponent(family)}:wght@${WEIGHTS.join(';')}`;
  const url = `https://fonts.googleapis.com/css2?family=${axis}&display=swap`;
  const res = await fetch(url, { headers: { 'User-Agent': TTF_UA } });
  if (res.ok) return res.text();
  // Single-weight families (Bebas Neue, Anton, Archivo Black) reject wght@
  const plain = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`;
  const res2 = await fetch(plain, { headers: { 'User-Agent': TTF_UA } });
  if (!res2.ok) throw new Error(`css ${res2.status}`);
  return res2.text();
}

const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, '');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const licences = [];
  let downloaded = 0;
  let skipped = 0;
  const failed = [];

  for (const family of FAMILIES) {
    try {
      const css = await cssFor(family);
      // Name files by their real weight (Family-Regular / Family-Bold). The
      // rasteriser's font matcher strips known weight suffixes to recover the
      // family name, so an arbitrary suffix like "-0" would make every family
      // unmatchable and silently fall back — which is the bug this fixes.
      const faces = [];
      for (const block of css.split('@font-face')) {
        const url = /url\((https:\/\/[^)]+\.ttf)\)/.exec(block)?.[1];
        if (!url) continue;
        const weight = Number(/font-weight:\s*(?:\d+\s+)?(\d+)/.exec(block)?.[1] ?? 400);
        faces.push({ url, weight });
      }
      if (!faces.length) throw new Error('no ttf url in css');
      const seen = new Set();
      const unique = faces.filter((f) => !seen.has(f.url) && seen.add(f.url));
      for (const { url, weight } of unique) {
        const suffix = weight >= 700 ? 'Bold' : 'Regular';
        const file = path.join(OUT, `${slug(family)}-${suffix}.ttf`);
        if (!FORCE && fs.existsSync(file)) { skipped++; continue; }
        const bin = await fetch(url, { headers: { 'User-Agent': TTF_UA } });
        if (!bin.ok) throw new Error(`ttf ${bin.status}`);
        fs.writeFileSync(file, Buffer.from(await bin.arrayBuffer()));
        downloaded++;
      }
      licences.push(`${family} — https://fonts.google.com/specimen/${encodeURIComponent(family)} (OFL or Apache-2.0; redistributable)`);
      process.stdout.write(`  ok  ${family}\n`);
    } catch (err) {
      failed.push(`${family}: ${err.message}`);
      process.stdout.write(`  FAIL ${family} — ${err.message}\n`);
    }
  }

  fs.writeFileSync(
    path.join(OUT, 'LICENCES.txt'),
    `Google Fonts used for server-side rasterisation.\nFetched by scripts/fetch-fonts.mjs.\n\n${licences.join('\n')}\n`,
  );
  console.log(`\ndownloaded ${downloaded}, already present ${skipped}, failed ${failed.length}`);
  if (failed.length) { console.log(failed.join('\n')); process.exitCode = 1; }
}

main().catch((e) => { console.error(e); process.exit(1); });
