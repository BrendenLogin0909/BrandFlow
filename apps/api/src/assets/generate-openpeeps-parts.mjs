/**
 * Generator for `openpeeps-parts.ts` — the vendored Open Peeps part geometry.
 *
 * ART PROVENANCE
 *   Artwork:  "Open Peeps" by Pablo Stanley — https://www.openpeeps.com/
 *   Licence:  CC0 1.0 Universal (public domain dedication).
 *             Verified 2026-08-24 from two independent authoritative sources:
 *               1. openpeeps.com — "Free for commercial and personal use under
 *                  CC0 License."
 *               2. `@dicebear/collection` v9.4.2 → `openPeeps.meta` →
 *                  { creator: 'Pablo Stanley', source: 'https://www.openpeeps.com/',
 *                    license: { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' } }
 *             CC0 requires no attribution; we record the creator anyway as
 *             provenance (and courtesy), per the registry's honesty rules.
 *
 *   Transcription: the machine-readable path data is read out of the npm package
 *   `react-peeps` v0.1.10 (MIT, (c) Emre Çakır — https://github.com/CeamKrier/react-peeps),
 *   which is a faithful React transcription of the CC0 Open Peeps source parts.
 *   Only the CC0 artwork geometry is vendored here; none of react-peeps' own
 *   MIT-licensed code ships in this repo.
 *
 * HOW TO RE-RUN
 *   The generator deps are intentionally NOT repo dependencies (React in a
 *   Fastify API would be noise). From any scratch directory:
 *
 *     npm i react@18 react-dom@18 react-peeps@0.1.10 svgo@4
 *     PEEPS_DEPS=<that dir>/package.json \
 *       node <repo>/apps/api/src/assets/generate-openpeeps-parts.mjs
 *
 *   Output is written to apps/api/src/assets/openpeeps-parts.ts.
 *
 * OUTPUT SHAPE
 *   Every part is an SVG fragment of <path> elements only (no external refs,
 *   no fonts, no images) using two placeholder colours:
 *     __FILL__  the part's solid fill  (clothing on a pose, head+hair on a hair
 *               part, lens on glasses) — the composer substitutes a real colour
 *     __INK__   the hand-drawn line art — always the dark neutral
 *   Coordinates are integers in the Open Peeps artboard space; `bbox` is the
 *   tight bounding box (Beziers flattened, not control-point hull) so the scene
 *   composer can fit a figure into a target rect with no runtime path parsing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const depsAnchor = process.env.PEEPS_DEPS
  ? path.resolve(process.env.PEEPS_DEPS)
  : fileURLToPath(import.meta.url);
const require = createRequire(depsAnchor);

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { optimize } = require('svgo');
const LIB = path.dirname(require.resolve('react-peeps/package.json')) + '/lib/peeps';

const FILL_PROBE = '#6c63ff';
const INK_PROBE = '#111827';

/** Curated subset — enough variety for a B2B scene pack without bloating the bundle. */
const SUBSET = {
  standing: [
    'BlazerPantsBW', 'BlazerPantsWB', 'CrossedArmsBW', 'CrossedArmsWB',
    'EasingBW', 'EasingWB', 'PointingFingerBW', 'PointingFingerWB',
    'RestingBW', 'ShirtPantsBW', 'ShirtPantsWB', 'WalkingBW', 'RoboDanceWB',
  ],
  sitting: ['ClosedLegBW', 'ClosedLegWB', 'CrossedLegs', 'OneLegUpWB'],
  bust: [
    'ArmsCrossed', 'Coffee', 'Device', 'Explaining', 'Geek', 'PointingUp',
    'Whatever', 'Killer', 'Paper', 'Hoodie', 'PocketShirt',
  ],
  hair: [
    'Afro', 'LongAfro', 'Bun', 'BunCurly', 'BantuKnots', 'CornRows', 'Twists',
    'Short', 'ShortCurly', 'ShortMessy', 'ShortVolumed', 'Medium', 'MediumBangs',
    'LongBangs', 'Bangs', 'Hijab', 'Turban', 'GrayMedium', 'FlatTop',
  ],
  face: [
    'Smile', 'SmileBig', 'SmileTeeth', 'Calm', 'Serious', 'Explaining',
    'Concerned', 'Driven', 'Awe', 'Cheeky', 'Suspicious', 'Solemn', 'EyesClosed',
  ],
  facialHair: ['Chin', 'Goatee', 'FullMedium', 'MoustacheThin'],
  accessories: ['GlassRound', 'GlassClubmaster', 'SunglassWayfarer'],
};

const DIRS = {
  standing: 'pose/standing',
  sitting: 'pose/sitting',
  bust: 'pose/bust',
  hair: 'hair',
  face: 'face',
  facialHair: 'facialHair',
  accessories: 'accessories',
};

// ---------------------------------------------------------------- rendering --
function renderPart(group, name) {
  const mod = require(path.join(LIB, DIRS[group], name + '.js'));
  const Comp = mod[name] ?? mod.default;
  if (!Comp) throw new Error(`react-peeps has no export ${name} in ${DIRS[group]}`);
  return renderToStaticMarkup(
    React.createElement(Comp, { strokeColor: INK_PROBE, backgroundColor: FILL_PROBE }),
  );
}

function optimiseFragment(fragment) {
  const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 850 1200">${fragment}</svg>`;
  const { data } = optimize(wrapped, {
    multipass: true,
    // Integer coordinates in an ~850x3100 artboard: sub-0.4px error at the
    // sizes these figures render at, and roughly halves the byte count.
    floatPrecision: 0,
    plugins: [{ name: 'preset-default', params: { overrides: { collapseGroups: false } } }],
  });
  return data.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
}

// ------------------------------------------------------------------- bboxes --
const ARG_COUNT = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

function cubicPoints(p0, p1, p2, p3, steps = 16) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return pts;
}

/** Flattened outline points of a path `d` (handles absolute + relative commands). */
function pathPoints(d) {
  const pts = [];
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  let x = 0, y = 0, sx = 0, sy = 0, px = 0, py = 0;
  let i = 0, cmd = null;
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) {
      cmd = tokens[i];
      i++;
      if (cmd.toLowerCase() === 'z') { x = sx; y = sy; pts.push([x, y]); continue; }
    }
    if (!cmd) break;
    const lower = cmd.toLowerCase();
    const n = ARG_COUNT[lower] ?? 2;
    const abs = cmd === cmd.toUpperCase();
    const args = tokens.slice(i, i + n).map(Number);
    if (args.length < n || args.some(Number.isNaN)) break;
    i += n;
    const rel = (v, base) => (abs ? v : base + v);
    if (lower === 'h') { x = rel(args[0], x); px = x; py = y; pts.push([x, y]); }
    else if (lower === 'v') { y = rel(args[0], y); px = x; py = y; pts.push([x, y]); }
    else if (lower === 'a') { x = rel(args[5], x); y = rel(args[6], y); px = x; py = y; pts.push([x, y]); }
    else if (lower === 'c' || lower === 's') {
      let c1, c2, end;
      if (lower === 'c') {
        c1 = [rel(args[0], x), rel(args[1], y)];
        c2 = [rel(args[2], x), rel(args[3], y)];
        end = [rel(args[4], x), rel(args[5], y)];
      } else {
        c1 = [2 * x - px, 2 * y - py];
        c2 = [rel(args[0], x), rel(args[1], y)];
        end = [rel(args[2], x), rel(args[3], y)];
      }
      pts.push(...cubicPoints([x, y], c1, c2, end));
      px = c2[0]; py = c2[1]; x = end[0]; y = end[1];
    } else if (lower === 'q' || lower === 't') {
      let c, end;
      if (lower === 'q') { c = [rel(args[0], x), rel(args[1], y)]; end = [rel(args[2], x), rel(args[3], y)]; }
      else { c = [2 * x - px, 2 * y - py]; end = [rel(args[0], x), rel(args[1], y)]; }
      // quadratic → cubic
      pts.push(...cubicPoints([x, y], [x + (2 / 3) * (c[0] - x), y + (2 / 3) * (c[1] - y)],
        [end[0] + (2 / 3) * (c[0] - end[0]), end[1] + (2 / 3) * (c[1] - end[1])], end));
      px = c[0]; py = c[1]; x = end[0]; y = end[1];
    } else {
      x = rel(args[0], x); y = rel(args[1], y); px = x; py = y; pts.push([x, y]);
      if (lower === 'm') { sx = x; sy = y; cmd = cmd === 'M' ? 'L' : 'l'; }
    }
  }
  return pts;
}

const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/g;

/** Tight bbox of a fragment; every transform in this art is a pure translate. */
function fragmentBbox(markup) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const stack = [[0, 0]];
  const re = /<(g|path)\b([^>]*?)(\/?)>|<\/g>/g;
  let m;
  while ((m = re.exec(markup))) {
    if (m[0] === '</g>') { if (stack.length > 1) stack.pop(); continue; }
    const [, tag, attrs = '', selfClose] = m;
    const [ox, oy] = stack[stack.length - 1];
    if (tag === 'g') {
      const t = /transform="translate\(([^)]*)\)"/.exec(attrs);
      let dx = 0, dy = 0;
      if (t) { const nums = t[1].match(NUM)?.map(Number) ?? []; dx = nums[0] ?? 0; dy = nums[1] ?? 0; }
      if (selfClose !== '/') stack.push([ox + dx, oy + dy]);
      continue;
    }
    const d = /\sd="([^"]+)"/.exec(attrs)?.[1];
    if (!d) continue;
    for (const [cx, cy] of pathPoints(d)) {
      const ax = cx + ox, ay = cy + oy;
      if (ax < minX) minX = ax;
      if (ax > maxX) maxX = ax;
      if (ay < minY) minY = ay;
      if (ay > maxY) maxY = ay;
    }
  }
  return [Math.round(minX), Math.round(minY), Math.round(maxX), Math.round(maxY)];
}

// -------------------------------------------------------------------- build --
const out = {};
let total = 0;
for (const [group, names] of Object.entries(SUBSET)) {
  out[group] = {};
  for (const name of names) {
    const raw = renderPart(group, name);
    const svg = optimiseFragment(raw)
      .replaceAll(FILL_PROBE, '__FILL__')
      .replaceAll(INK_PROBE, '__INK__');
    const bbox = fragmentBbox(optimiseFragment(raw));
    out[group][name] = { svg, bbox };
    total += svg.length;
  }
}

const banner = fs
  .readFileSync(fileURLToPath(import.meta.url), 'utf8')
  .split('*/')[0]
  .replace('Generator for `openpeeps-parts.ts` — the vendored Open Peeps part geometry.',
    'Vendored Open Peeps part geometry. GENERATED by generate-openpeeps-parts.mjs —\n * edit that script and re-run, never this file by hand.')
  .replace(/ \* HOW TO RE-RUN[\s\S]*? \* OUTPUT SHAPE/, ' * OUTPUT SHAPE');

const groupType = `export interface OpenPeepsPart {
  /** <path> fragment; __FILL__ / __INK__ are substituted by the composer. */
  svg: string;
  /** Tight bounds [minX, minY, maxX, maxY] in Open Peeps artboard units. */
  bbox: [number, number, number, number];
}
`;

let body = banner + '*/\n\n' + groupType + '\n';
for (const [group, parts] of Object.entries(out)) {
  const constName = 'OPENPEEPS_' + group.replace(/([A-Z])/g, '_$1').toUpperCase();
  body += `export const ${constName} = {\n`;
  for (const [name, p] of Object.entries(parts)) {
    body += `  ${name}: { bbox: [${p.bbox.join(', ')}], svg: \`${p.svg}\` },\n`;
  }
  body += `} satisfies Record<string, OpenPeepsPart>;\n\nexport type ${group[0].toUpperCase() + group.slice(1)}Part = keyof typeof ${constName};\n\n`;
}

const target = path.join(path.dirname(fileURLToPath(import.meta.url)), 'openpeeps-parts.ts');
fs.writeFileSync(target, body);
console.log(
  `wrote ${target}\n  parts: ${Object.entries(out).map(([g, p]) => `${g}=${Object.keys(p).length}`).join(' ')}\n  svg bytes: ${(total / 1024).toFixed(0)}k  file: ${(body.length / 1024).toFixed(0)}k`,
);
