/**
 * Open Peeps character scene pack — hand-drawn CC0 characters composed into
 * flat B2B scenes, served bundled (no network at serve time).
 *
 * ART + LICENCE
 *   Characters: "Open Peeps" by Pablo Stanley (https://www.openpeeps.com/),
 *   CC0 1.0 Universal. Verified 2026-08-24 against openpeeps.com ("Free for
 *   commercial and personal use under CC0 License") and against the licence
 *   metadata shipped inside `@dicebear/collection` v9.4.2 (`openPeeps.meta`).
 *   CC0 needs no attribution; the registry still records Pablo Stanley as the
 *   creator so provenance travels with every asset. Part geometry is vendored
 *   in `openpeeps-parts.ts` (see that file's header for the full chain).
 *
 *   Props, layouts and backgrounds in this file are ORIGINAL to this repo — the
 *   characters are the licensed art, the scene around them is ours.
 *
 * RECOLOUR CONTRACT (must stay compatible with GET /assets/render/:provider/:id)
 *   The render route find-replaces the literal accent `#6c63ff` with the brand
 *   hue. Every scene therefore paints exactly these roles:
 *     #6c63ff  RECOLOURED — character clothing, prop key surfaces, accent
 *              shapes. Soft washes are the same hex at low `opacity`, so a
 *              brand hue stays tonally consistent.
 *     #3f3d56  FIXED ink — all hand-drawn line art, facial features, outlines.
 *              Never recoloured: line art must stay legible on any brand hue.
 *     #ffd9c0 / #f3b98d / #d69963 / #a86b3c / #7a4a24
 *              FIXED skin tones, varied per character. Never recoloured —
 *              tying skin to a brand colour would be both ugly and wrong.
 *     #a0a0b8 / #e6e6e6 / #f2f2f2 / #ffffff
 *              FIXED neutrals — ground shadows, paper, secondary bars.
 *   Poses come in BW/WB pairs (which garment takes the fill vs the ink), so a
 *   group of characters reads as two-tone rather than one flat block of hue.
 *
 * OUTPUT
 *   Every entry is a self-contained `<svg viewBox="0 0 400 300">` string: paths,
 *   rects, circles and lines only — no external references, no fonts, no
 *   embedded images, no <text>. Scenes are assembled at module load from the
 *   shared part table, so ~90 scenes cost roughly one copy of the artwork
 *   instead of ninety.
 */
import type { UndrawEntry } from './undraw-manifest.js';
import {
  OPENPEEPS_ACCESSORIES,
  OPENPEEPS_BUST,
  OPENPEEPS_FACE,
  OPENPEEPS_FACIAL_HAIR,
  OPENPEEPS_HAIR,
  OPENPEEPS_SITTING,
  OPENPEEPS_STANDING,
  type AccessoriesPart,
  type BustPart,
  type FacePart,
  type FacialHairPart,
  type HairPart,
  type OpenPeepsPart,
  type SittingPart,
  type StandingPart,
} from './openpeeps-parts.js';

// ------------------------------------------------------------------ palette --
/** Recoloured to the brand hue at serve time. */
const ACCENT = '#6c63ff';
/** Fixed dark neutral — every stroke of the hand-drawn line art. */
const INK = '#3f3d56';
const MID = '#a0a0b8';
const LIGHT = '#e6e6e6';
const PALE = '#f2f2f2';
const WHITE = '#ffffff';

/** Fixed, deliberately varied skin tones (never recoloured). */
const SKINS = ['#ffd9c0', '#f3b98d', '#d69963', '#a86b3c', '#7a4a24'] as const;
type SkinIndex = 0 | 1 | 2 | 3 | 4;

const VB = '0 0 400 300';

// --------------------------------------------------------------- characters --
/** Offsets baked into the Open Peeps artboard (head sits at +225 on the body). */
const HEAD_OFFSET: [number, number] = [225, 0];
const FACE_OFFSET: [number, number] = [225 + 159, 186];
const FACIAL_HAIR_OFFSET: [number, number] = [225 + 123, 338];
const ACCESSORY_OFFSET: [number, number] = [225 + 47, 241];

export interface PeepSpec {
  /** Full-body standing pose. */
  standing?: StandingPart;
  /** Seated pose (floor / stool). */
  sitting?: SittingPart;
  /** Head-and-shoulders pose — reads best when the figure is large. */
  bust?: BustPart;
  hair: HairPart;
  face: FacePart;
  beard?: FacialHairPart;
  glasses?: AccessoriesPart;
  skin?: SkinIndex;
  /** Mirror the character (so two figures can face each other). */
  flip?: boolean;
}

/** Target rectangle in scene coordinates; the figure is fitted bottom-aligned. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function paint(part: OpenPeepsPart | undefined, fill: string): string {
  if (!part) return '';
  return part.svg.replaceAll('__FILL__', fill).replaceAll('__INK__', INK);
}

function union(
  box: [number, number, number, number] | null,
  part: OpenPeepsPart | undefined,
  [dx, dy]: [number, number],
): [number, number, number, number] | null {
  if (!part) return box;
  const [x0, y0, x1, y1] = part.bbox;
  const next: [number, number, number, number] = [x0 + dx, y0 + dy, x1 + dx, y1 + dy];
  if (!box) return next;
  return [
    Math.min(box[0], next[0]),
    Math.min(box[1], next[1]),
    Math.max(box[2], next[2]),
    Math.max(box[3], next[3]),
  ];
}

function bodyPart(spec: PeepSpec): OpenPeepsPart | undefined {
  if (spec.standing) return OPENPEEPS_STANDING[spec.standing];
  if (spec.sitting) return OPENPEEPS_SITTING[spec.sitting];
  if (spec.bust) return OPENPEEPS_BUST[spec.bust];
  return undefined;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Fit one character into `rect`: scaled to contain, horizontally centred and
 * bottom-aligned so feet (or the bust crop) land on the scene's ground line.
 */
function peep(spec: PeepSpec, rect: Rect): string {
  const body = bodyPart(spec);
  const hair = OPENPEEPS_HAIR[spec.hair];
  const face = OPENPEEPS_FACE[spec.face];
  const beard = spec.beard ? OPENPEEPS_FACIAL_HAIR[spec.beard] : undefined;
  const glasses = spec.glasses ? OPENPEEPS_ACCESSORIES[spec.glasses] : undefined;
  const skin = SKINS[spec.skin ?? 0]!;

  let box = union(null, body, [0, 0]);
  box = union(box, hair, HEAD_OFFSET);
  box = union(box, face, FACE_OFFSET);
  box = union(box, beard, FACIAL_HAIR_OFFSET);
  box = union(box, glasses, ACCESSORY_OFFSET);
  if (!box) return '';

  const bw = box[2] - box[0];
  const bh = box[3] - box[1];
  const s = Math.min(rect.w / bw, rect.h / bh);
  const tx = rect.x + (rect.w - bw * s) / 2 - box[0] * s;
  const ty = rect.y + (rect.h - bh * s) - box[1] * s;

  const inner =
    paint(body, ACCENT) +
    `<g transform="translate(${HEAD_OFFSET[0]} ${HEAD_OFFSET[1]})">` +
    paint(hair, skin) +
    `<g transform="translate(159 186)">${paint(face, INK)}</g>` +
    (beard ? `<g transform="translate(123 338)">${paint(beard, INK)}</g>` : '') +
    (glasses ? `<g transform="translate(47 241)">${paint(glasses, PALE)}</g>` : '') +
    '</g>';

  const mirror = spec.flip ? `translate(${r2(2 * (rect.x + rect.w / 2))} 0) scale(-1 1) ` : '';
  return `<g transform="${mirror}translate(${r2(tx)} ${r2(ty)}) scale(${r2(s)})">${inner}</g>`;
}

// ------------------------------------------------------------------- props ---
// Original flat props. They stay deliberately simple: the licensed character is
// the hero, the prop is the sentence it is saying.

const ground = (cx = 200, cy = 274, rx = 150) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="11" fill="${LIGHT}"/>`;

/** Soft accent wash behind the hero — recolours with the brand hue. */
const blob = (cx: number, cy: number, r: number, o = 0.14) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${ACCENT}" opacity="${o}"/>`;

/** Bounded accent plate — never a full-bleed strip across a character's body. */
const strip = (x: number, y: number, w: number, h: number, o = 0.1) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${ACCENT}" opacity="${o}"/>`;

/** Floor plate: sits under the whole cast, below the shoulder line. */
const floorPlate = (o = 0.08) =>
  `<rect x="0" y="248" width="400" height="52" fill="${ACCENT}" opacity="${o}"/>`;

const panel = (x: number, y: number, w: number, h: number, fill = PALE, r = 8) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;

const outline = (x: number, y: number, w: number, h: number, r = 8, sw = 2.5) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="${INK}" stroke-width="${sw}"/>`;

const line = (x1: number, y1: number, x2: number, y2: number, stroke = INK, w = 2.5) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;

const dot = (cx: number, cy: number, r: number, fill = ACCENT) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;

const textLines = (x: number, y: number, w: number, rows: number, gap = 11, fill = MID) =>
  Array.from({ length: rows }, (_, i) =>
    `<rect x="${x}" y="${y + i * gap}" width="${i % 2 ? Math.round(w * 0.66) : w}" height="5" rx="2.5" fill="${fill}"/>`,
  ).join('');

/** Framed board / screen with a soft ink outline. */
const board = (x: number, y: number, w: number, h: number, body = '') =>
  panel(x, y, w, h, WHITE) + outline(x, y, w, h) + body;

const barChart = (x: number, y: number, w: number, h: number, vals: number[]) => {
  const max = Math.max(...vals);
  const bw = (w / vals.length) * 0.62;
  const gap = (w - bw * vals.length) / (vals.length - 1 || 1);
  return (
    vals
      .map((v, i) => {
        const bh = Math.max(4, (v / max) * h);
        return `<rect x="${r2(x + i * (bw + gap))}" y="${r2(y + h - bh)}" width="${r2(bw)}" height="${r2(bh)}" rx="2" fill="${i === vals.length - 1 ? ACCENT : MID}"/>`;
      })
      .join('') + line(x - 4, y + h + 3, x + w + 4, y + h + 3, INK, 2)
  );
};

const lineChart = (x: number, y: number, w: number, h: number, vals: number[]) => {
  const max = Math.max(...vals);
  const pts = vals.map((v, i) => [
    r2(x + (i * w) / (vals.length - 1)),
    r2(y + h - (v / max) * h),
  ]);
  const last = pts[pts.length - 1]!;
  return (
    `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${ACCENT}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M${last[0]! - 9} ${last[1]! + 4} L${last[0]} ${last[1]! - 4} L${last[0]! + 8} ${last[1]! + 5} Z" fill="${ACCENT}"/>` +
    pts.slice(0, -1).map((p) => dot(p[0]!, p[1]!, 3, ACCENT)).join('')
  );
};

const donut = (cx: number, cy: number, r: number, frac: number) => {
  const a = -Math.PI / 2 + frac * Math.PI * 2;
  const large = frac > 0.5 ? 1 : 0;
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${LIGHT}" stroke-width="${r * 0.44}"/>` +
    `<path d="M${cx} ${cy - r} A${r} ${r} 0 ${large} 1 ${r2(cx + r * Math.cos(a))} ${r2(cy + r * Math.sin(a))}" fill="none" stroke="${ACCENT}" stroke-width="${r * 0.44}" stroke-linecap="round"/>`
  );
};

const gauge = (cx: number, cy: number, r: number, frac: number) => {
  const a = Math.PI * (1 - frac);
  return (
    `<path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="${LIGHT}" stroke-width="${r * 0.3}" stroke-linecap="round"/>` +
    `<path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${r2(cx + r * Math.cos(a))} ${r2(cy - r * Math.sin(a))}" fill="none" stroke="${ACCENT}" stroke-width="${r * 0.3}" stroke-linecap="round"/>` +
    line(cx, cy, r2(cx + r * 0.8 * Math.cos(a)), r2(cy - r * 0.8 * Math.sin(a)), INK, 3) +
    dot(cx, cy, 4, INK)
  );
};

const laptop = (x: number, y: number, w: number) => {
  const h = w * 0.62;
  return (
    panel(x, y, w, h, INK, 4) +
    panel(x + 4, y + 4, w - 8, h - 8, ACCENT, 2) +
    `<path d="M${x - w * 0.1} ${y + h + 8} h${w * 1.2} l-6-8 h${-w * 1.2 + 12} Z" fill="${MID}"/>`
  );
};

const phone = (x: number, y: number, w: number) =>
  panel(x, y, w, w * 1.9, INK, 5) + panel(x + 3, y + 7, w - 6, w * 1.9 - 16, PALE, 2);

const bubble = (x: number, y: number, w: number, h: number, tail: 'left' | 'right', fill = WHITE) =>
  panel(x, y, w, h, fill, 10) +
  outline(x, y, w, h, 10, 2.5) +
  (tail === 'left'
    ? `<path d="M${x + 14} ${y + h} l0 14 l16-14 Z" fill="${fill}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`
    : `<path d="M${x + w - 14} ${y + h} l0 14 l-16-14 Z" fill="${fill}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`);

const thought = (cx: number, cy: number, r: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${WHITE}" stroke="${INK}" stroke-width="2.5"/>` +
  `<circle cx="${cx - r * 0.75}" cy="${cy + r * 0.95}" r="${r2(r * 0.22)}" fill="${WHITE}" stroke="${INK}" stroke-width="2"/>` +
  `<circle cx="${cx - r * 0.98}" cy="${cy + r * 1.35}" r="${r2(r * 0.12)}" fill="${WHITE}" stroke="${INK}" stroke-width="1.6"/>`;

const bulb = (cx: number, cy: number, r: number) =>
  `<path d="M${cx} ${cy - r} a${r} ${r} 0 0 1 ${r2(r * 0.6)} ${r2(r * 1.82)} l0 ${r2(r * 0.3)} h${r2(-r * 1.2)} l0 ${r2(-r * 0.3)} A${r} ${r} 0 0 1 ${cx} ${cy - r} Z" fill="${ACCENT}"/>` +
  `<rect x="${r2(cx - r * 0.42)}" y="${r2(cy + r * 1.15)}" width="${r2(r * 0.84)}" height="${r2(r * 0.2)}" rx="2" fill="${INK}"/>` +
  `<rect x="${r2(cx - r * 0.32)}" y="${r2(cy + r * 1.42)}" width="${r2(r * 0.64)}" height="${r2(r * 0.18)}" rx="2" fill="${INK}"/>` +
  `<g stroke="${ACCENT}" stroke-width="3" stroke-linecap="round">${line(cx, r2(cy - r * 1.75), cx, r2(cy - r * 1.35), ACCENT, 3)}${line(r2(cx - r * 1.6), cy, r2(cx - r * 1.25), cy, ACCENT, 3)}${line(r2(cx + r * 1.25), cy, r2(cx + r * 1.6), cy, ACCENT, 3)}</g>`;

const rocket = (cx: number, cy: number, s: number) =>
  `<path d="M${cx} ${cy - 34 * s} c${16 * s} ${18 * s} ${20 * s} ${44 * s} ${13 * s} ${64 * s} h${-26 * s} c${-7 * s} ${-20 * s} ${-3 * s} ${-46 * s} ${13 * s} ${-64 * s} Z" fill="${PALE}" stroke="${INK}" stroke-width="2.2"/>` +
  `<circle cx="${cx}" cy="${r2(cy - 6 * s)}" r="${r2(8 * s)}" fill="${ACCENT}" stroke="${INK}" stroke-width="2"/>` +
  `<path d="M${r2(cx - 13 * s)} ${r2(cy + 14 * s)} l${-12 * s} ${13 * s} l${5 * s} ${10 * s} l${15 * s} ${-8 * s} Z" fill="${ACCENT}"/>` +
  `<path d="M${r2(cx + 13 * s)} ${r2(cy + 14 * s)} l${12 * s} ${13 * s} l${-5 * s} ${10 * s} l${-15 * s} ${-8 * s} Z" fill="${ACCENT}"/>` +
  `<path d="M${r2(cx - 8 * s)} ${r2(cy + 30 * s)} h${16 * s} l${-8 * s} ${20 * s} Z" fill="${ACCENT}" opacity="0.55"/>`;

const shield = (cx: number, cy: number, s: number) =>
  `<path d="M${cx} ${r2(cy - 40 * s)} l${34 * s} ${13 * s} v${26 * s} c0 ${22 * s} ${-14 * s} ${34 * s} ${-34 * s} ${41 * s} c${-20 * s} ${-7 * s} ${-34 * s} ${-19 * s} ${-34 * s} ${-41 * s} v${-26 * s} Z" fill="${ACCENT}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>` +
  `<path d="M${r2(cx - 12 * s)} ${r2(cy - 2 * s)} l${9 * s} ${10 * s} l${16 * s} ${-19 * s}" fill="none" stroke="${WHITE}" stroke-width="${r2(4 * s)}" stroke-linecap="round" stroke-linejoin="round"/>`;

const target = (cx: number, cy: number, r: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${LIGHT}"/>` +
  `<circle cx="${cx}" cy="${cy}" r="${r2(r * 0.66)}" fill="${WHITE}" stroke="${MID}" stroke-width="2"/>` +
  `<circle cx="${cx}" cy="${cy}" r="${r2(r * 0.34)}" fill="${ACCENT}"/>` +
  `<path d="M${r2(cx + r * 1.15)} ${r2(cy - r * 1.15)} L${r2(cx + r * 0.16)} ${r2(cy - r * 0.16)}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` +
  `<path d="M${r2(cx + r * 0.1)} ${r2(cy - r * 0.1)} l${r2(r * 0.2)} ${r2(r * 0.02)} l${r2(-r * 0.03)} ${r2(-r * 0.2)} Z" fill="${INK}"/>`;

const trophy = (cx: number, cy: number, s: number) =>
  `<path d="M${r2(cx - 16 * s)} ${r2(cy - 24 * s)} h${32 * s} v${16 * s} a${16 * s} ${16 * s} 0 0 1 ${-32 * s} 0 Z" fill="${ACCENT}"/>` +
  `<path d="M${r2(cx - 16 * s)} ${r2(cy - 20 * s)} h${-9 * s} a${9 * s} ${9 * s} 0 0 0 ${9 * s} ${13 * s}" fill="none" stroke="${INK}" stroke-width="2.2"/>` +
  `<path d="M${r2(cx + 16 * s)} ${r2(cy - 20 * s)} h${9 * s} a${9 * s} ${9 * s} 0 0 1 ${-9 * s} ${13 * s}" fill="none" stroke="${INK}" stroke-width="2.2"/>` +
  `<rect x="${r2(cx - 3 * s)}" y="${r2(cy + 6 * s)}" width="${6 * s}" height="${10 * s}" fill="${INK}"/>` +
  `<rect x="${r2(cx - 14 * s)}" y="${r2(cy + 16 * s)}" width="${28 * s}" height="${6 * s}" rx="2" fill="${INK}"/>`;

const bug = (cx: number, cy: number, r: number) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r2(r * 1.18)}" fill="${ACCENT}"/>` +
  `<path d="M${r2(cx - r)} ${cy} h${r2(2 * r)}" stroke="${INK}" stroke-width="2"/>` +
  `<circle cx="${cx}" cy="${r2(cy - r * 1.35)}" r="${r2(r * 0.5)}" fill="${INK}"/>` +
  `<g stroke="${INK}" stroke-width="2.4" stroke-linecap="round">` +
  line(r2(cx - r), r2(cy - r * 0.5), r2(cx - r * 1.8), r2(cy - r * 0.95), INK, 2.4) +
  line(r2(cx - r), cy, r2(cx - r * 1.9), cy, INK, 2.4) +
  line(r2(cx - r), r2(cy + r * 0.5), r2(cx - r * 1.8), r2(cy + r * 0.95), INK, 2.4) +
  line(r2(cx + r), r2(cy - r * 0.5), r2(cx + r * 1.8), r2(cy - r * 0.95), INK, 2.4) +
  line(r2(cx + r), cy, r2(cx + r * 1.9), cy, INK, 2.4) +
  line(r2(cx + r), r2(cy + r * 0.5), r2(cx + r * 1.8), r2(cy + r * 0.95), INK, 2.4) +
  `</g>`;

const gear = (cx: number, cy: number, r: number, fill = ACCENT) => {
  const teeth = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return `<rect x="${r2(cx - r * 0.16)}" y="${r2(cy - r * 1.32)}" width="${r2(r * 0.32)}" height="${r2(r * 0.36)}" rx="2" fill="${fill}" transform="rotate(${i * 45} ${cx} ${cy})"/>`;
  }).join('');
  return (
    teeth +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r2(r * 0.42)}" fill="${WHITE}"/>`
  );
};

const megaphone = (x: number, y: number, s: number) =>
  `<path d="M${x} ${y} l${44 * s} ${-20 * s} v${58 * s} l${-44 * s} ${-20 * s} Z" fill="${ACCENT}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>` +
  `<rect x="${r2(x - 16 * s)}" y="${r2(y + 2 * s)}" width="${16 * s}" height="${14 * s}" rx="3" fill="${INK}"/>` +
  `<g stroke="${ACCENT}" stroke-width="3" stroke-linecap="round">` +
  line(r2(x + 54 * s), r2(y - 2 * s), r2(x + 68 * s), r2(y - 10 * s), ACCENT, 3) +
  line(r2(x + 56 * s), r2(y + 9 * s), r2(x + 72 * s), r2(y + 9 * s), ACCENT, 3) +
  line(r2(x + 54 * s), r2(y + 20 * s), r2(x + 68 * s), r2(y + 28 * s), ACCENT, 3) +
  `</g>`;

const magnifier = (cx: number, cy: number, r: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${ACCENT}" opacity="0.25"/>` +
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${INK}" stroke-width="3.5"/>` +
  line(r2(cx + r * 0.72), r2(cy + r * 0.72), r2(cx + r * 1.5), r2(cy + r * 1.5), INK, 5);

const clock = (cx: number, cy: number, r: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${WHITE}" stroke="${INK}" stroke-width="3"/>` +
  line(cx, cy, cx, r2(cy - r * 0.55), ACCENT, 3.5) +
  line(cx, cy, r2(cx + r * 0.42), cy, INK, 3) +
  dot(cx, cy, 2.6, INK);

const calendar = (x: number, y: number, w: number, h: number) =>
  panel(x, y, w, h, WHITE) +
  outline(x, y, w, h) +
  `<rect x="${x}" y="${y}" width="${w}" height="${r2(h * 0.24)}" rx="8" fill="${ACCENT}"/>` +
  `<rect x="${x}" y="${r2(y + h * 0.14)}" width="${w}" height="${r2(h * 0.1)}" fill="${ACCENT}"/>` +
  Array.from({ length: 8 }, (_, i) => {
    const c = i % 4;
    const rw = Math.floor(i / 4);
    return dot(r2(x + w * 0.2 + c * w * 0.2), r2(y + h * 0.45 + rw * h * 0.26), 4, i === 5 ? ACCENT : LIGHT);
  }).join('');

const checklistCard = (x: number, y: number, w: number, h: number, done = 2, rows = 4) =>
  panel(x, y, w, h, WHITE) +
  outline(x, y, w, h) +
  Array.from({ length: rows }, (_, i) => {
    const cy = y + (h / (rows + 1)) * (i + 1);
    const box = `<rect x="${r2(x + 12)}" y="${r2(cy - 7)}" width="14" height="14" rx="3" fill="${i < done ? ACCENT : LIGHT}"/>`;
    const tick =
      i < done
        ? `<path d="M${r2(x + 15.5)} ${r2(cy)} l3 3.5 l6.5 -7.5" fill="none" stroke="${WHITE}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`
        : '';
    return box + tick + `<rect x="${r2(x + 33)}" y="${r2(cy - 3)}" width="${r2(w - 46)}" height="6" rx="3" fill="${MID}"/>`;
  }).join('');

const stickies = (x: number, y: number, cols: number, rows: number, s = 26) =>
  Array.from({ length: cols * rows }, (_, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    return `<rect x="${r2(x + c * (s + 6))}" y="${r2(y + r * (s + 6))}" width="${s}" height="${s}" rx="3" fill="${i % 3 === 0 ? ACCENT : i % 3 === 1 ? LIGHT : MID}" opacity="${i % 3 === 0 ? 1 : 0.85}"/>`;
  }).join('');

const steps = (x: number, y: number, n: number, w: number, rise: number) =>
  Array.from({ length: n }, (_, i) =>
    `<rect x="${r2(x + i * w)}" y="${r2(y - (i + 1) * rise)}" width="${r2(w - 3)}" height="${r2((i + 1) * rise)}" rx="2" fill="${i === n - 1 ? ACCENT : LIGHT}"/>`,
  ).join('');

const funnel = (cx: number, y: number, w: number, h: number) =>
  Array.from({ length: 3 }, (_, i) => {
    const top = w - i * (w * 0.22);
    const bottom = w - (i + 1) * (w * 0.22);
    const yy = y + i * (h / 3);
    const hh = h / 3 - 4;
    return `<path d="M${r2(cx - top / 2)} ${r2(yy)} h${r2(top)} l${r2(-(top - bottom) / 2)} ${r2(hh)} h${r2(-bottom)} Z" fill="${ACCENT}" opacity="${1 - i * 0.28}"/>`;
  }).join('');

const network = (cx: number, cy: number, r: number) => {
  const nodes = Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3 - Math.PI / 2;
    return [r2(cx + r * Math.cos(a)), r2(cy + r * Math.sin(a))] as [number, number];
  });
  return (
    nodes.map((n) => line(cx, cy, n[0], n[1], MID, 2)).join('') +
    nodes.map((n, i) => dot(n[0], n[1], i % 2 ? 7 : 9, i % 2 ? MID : ACCENT)).join('') +
    dot(cx, cy, 13, ACCENT) +
    dot(cx, cy, 6, WHITE)
  );
};

/** Two chain links pulled apart, with a snap mark in the gap. */
const chainBroken = (cx: number, cy: number, s: number) =>
  `<g fill="none" stroke="${ACCENT}" stroke-width="${r2(9 * s)}" stroke-linejoin="round">` +
  `<rect x="${r2(cx - 96 * s)}" y="${r2(cy - 15 * s)}" width="${r2(46 * s)}" height="${r2(30 * s)}" rx="${r2(15 * s)}" transform="rotate(-16 ${cx} ${cy})"/>` +
  `<rect x="${r2(cx - 58 * s)}" y="${r2(cy - 15 * s)}" width="${r2(46 * s)}" height="${r2(30 * s)}" rx="${r2(15 * s)}" transform="rotate(-16 ${cx} ${cy})"/>` +
  `<rect x="${r2(cx + 12 * s)}" y="${r2(cy - 15 * s)}" width="${r2(46 * s)}" height="${r2(30 * s)}" rx="${r2(15 * s)}" transform="rotate(16 ${cx} ${cy})"/>` +
  `<rect x="${r2(cx + 50 * s)}" y="${r2(cy - 15 * s)}" width="${r2(46 * s)}" height="${r2(30 * s)}" rx="${r2(15 * s)}" transform="rotate(16 ${cx} ${cy})"/>` +
  `</g>` +
  `<g stroke="${INK}" stroke-width="${r2(3.4 * s)}" stroke-linecap="round">` +
  line(r2(cx - 5 * s), r2(cy - 20 * s), r2(cx - 11 * s), r2(cy - 33 * s), INK, r2(3.4 * s)) +
  line(r2(cx + 5 * s), r2(cy - 20 * s), r2(cx + 11 * s), r2(cy - 33 * s), INK, r2(3.4 * s)) +
  line(cx, r2(cy + 20 * s), cx, r2(cy + 34 * s), INK, r2(3.4 * s)) +
  `</g>`;

/** Suspension bridge: deck, arch above it, hangers between the two. */
const bridge = (x: number, y: number, w: number) => {
  const rise = w * 0.34;
  const arch = (t: number) => [
    r2(x + t * w),
    r2(y - 2 * rise * t * (1 - t) * 2),
  ] as [number, number];
  const hangers = [0.18, 0.34, 0.5, 0.66, 0.82]
    .map((t) => {
      const [hx, hy] = arch(t);
      return line(hx, hy, hx, y - 4, MID, 2.2);
    })
    .join('');
  return (
    `<path d="M${x} ${y} Q${r2(x + w / 2)} ${r2(y - 2 * rise)} ${r2(x + w)} ${y}" fill="none" stroke="${ACCENT}" stroke-width="7" stroke-linecap="round"/>` +
    hangers +
    `<rect x="${r2(x - 10)}" y="${r2(y - 4)}" width="${r2(w + 20)}" height="10" rx="4" fill="${ACCENT}"/>` +
    line(r2(x - 10), r2(y + 8), r2(x + w + 10), r2(y + 8), INK, 2.4)
  );
};

/** Balance scales — half-disc pans on a beam. */
const scales = (cx: number, cy: number, s: number) => {
  const pan = (px: number, py: number, fill: string) =>
    `<path d="M${r2(px - 20 * s)} ${py} h${r2(40 * s)} a${r2(20 * s)} ${r2(20 * s)} 0 0 1 ${r2(-40 * s)} 0 Z" fill="${fill}"/>`;
  return (
    line(cx, r2(cy - 32 * s), cx, r2(cy + 34 * s), INK, r2(5 * s)) +
    line(r2(cx - 42 * s), r2(cy - 22 * s), r2(cx + 42 * s), r2(cy - 34 * s), INK, r2(5 * s)) +
    `<rect x="${r2(cx - 18 * s)}" y="${r2(cy + 31 * s)}" width="${r2(36 * s)}" height="${r2(8 * s)}" rx="4" fill="${INK}"/>` +
    line(r2(cx - 42 * s), r2(cy - 22 * s), r2(cx - 42 * s), r2(cy + 2 * s), MID, r2(2.4 * s)) +
    line(r2(cx + 42 * s), r2(cy - 34 * s), r2(cx + 42 * s), r2(cy - 10 * s), MID, r2(2.4 * s)) +
    pan(r2(cx - 42 * s), r2(cy + 2 * s), ACCENT) +
    pan(r2(cx + 42 * s), r2(cy - 10 * s), MID)
  );
};

const plant = (cx: number, cy: number, s: number) =>
  `<path d="M${r2(cx - 14 * s)} ${cy} h${28 * s} l${-4 * s} ${22 * s} h${-20 * s} Z" fill="${ACCENT}"/>` +
  line(cx, cy, cx, r2(cy - 26 * s), INK, r2(2.6 * s)) +
  `<path d="M${cx} ${r2(cy - 12 * s)} c${-16 * s} ${-2 * s} ${-20 * s} ${-14 * s} ${-18 * s} ${-20 * s} c${12 * s} ${-2 * s} ${18 * s} ${8 * s} ${18 * s} ${20 * s} Z" fill="${ACCENT}"/>` +
  `<path d="M${cx} ${r2(cy - 20 * s)} c${16 * s} ${-2 * s} ${20 * s} ${-14 * s} ${18 * s} ${-20 * s} c${-12 * s} ${-2 * s} ${-18 * s} ${8 * s} ${-18 * s} ${20 * s} Z" fill="${ACCENT}" opacity="0.6"/>`;

const warning = (cx: number, cy: number, s: number) =>
  `<path d="M${cx} ${r2(cy - 30 * s)} l${32 * s} ${56 * s} h${-64 * s} Z" fill="${ACCENT}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>` +
  `<rect x="${r2(cx - 3 * s)}" y="${r2(cy - 10 * s)}" width="${6 * s}" height="${20 * s}" rx="3" fill="${WHITE}"/>` +
  dot(cx, r2(cy + 18 * s), r2(3.6 * s), WHITE);

const doorway = (x: number, y: number, w: number, h: number) =>
  panel(x, y, w, h, ACCENT, 6) +
  panel(r2(x + 7), r2(y + 7), r2(w - 14), r2(h - 7), WHITE, 4) +
  dot(r2(x + w - 16), r2(y + h * 0.55), 3.5, INK);

/** Interlocking pair: `knob` bulges right, `notch` bites in on the left. */
const puzzleKnob = (x: number, y: number, s: number, fill = ACCENT) =>
  `<path d="M${x} ${y} h${r2(s)} v${r2(s * 0.34)} a${r2(s * 0.16)} ${r2(s * 0.16)} 0 0 1 0 ${r2(s * 0.32)} v${r2(s * 0.34)} h${r2(-s)} Z" fill="${fill}"/>`;
const puzzleNotch = (x: number, y: number, s: number, fill = MID) =>
  `<path d="M${x} ${y} h${r2(s)} v${r2(s)} h${r2(-s)} v${r2(-s * 0.34)} a${r2(s * 0.16)} ${r2(s * 0.16)} 0 0 0 0 ${r2(-s * 0.32)} Z" fill="${fill}"/>`;

const compass = (cx: number, cy: number, r: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${WHITE}" stroke="${INK}" stroke-width="3"/>` +
  `<path d="M${r2(cx + r * 0.5)} ${r2(cy - r * 0.5)} l${r2(-r * 0.72)} ${r2(r * 0.28)} l${r2(-r * 0.28)} ${r2(r * 0.72)} l${r2(r * 0.72)} ${r2(-r * 0.28)} Z" fill="${ACCENT}"/>` +
  dot(cx, cy, 3, INK);

const timeline = (x: number, y: number, w: number, n = 4) =>
  line(x, y, r2(x + w), y, MID, 3) +
  Array.from({ length: n }, (_, i) => {
    const cx = r2(x + (i * w) / (n - 1));
    return dot(cx, y, i === n - 1 ? 9 : 7, i <= 1 ? ACCENT : LIGHT) + line(cx, r2(y - 4), cx, r2(y - 16), MID, 2);
  }).join('');

const arrowRight = (x: number, y: number, w: number, colour = ACCENT) =>
  `<path d="M${x} ${r2(y - 5)} h${r2(w - 14)} v${-7} l${18} ${12} l${-18} ${12} v${-7} h${r2(-(w - 14))} Z" fill="${colour}"/>`;

const cloudServer = (cx: number, cy: number, s: number) =>
  `<path d="M${r2(cx - 34 * s)} ${cy} a${18 * s} ${18 * s} 0 0 1 ${18 * s} ${-18 * s} a${24 * s} ${24 * s} 0 0 1 ${44 * s} ${6 * s} a${15 * s} ${15 * s} 0 0 1 ${-4 * s} ${29 * s} h${-58 * s} a${14 * s} ${14 * s} 0 0 1 0 ${-17 * s} Z" fill="${ACCENT}"/>` +
  Array.from({ length: 2 }, (_, i) =>
    panel(r2(cx - 30 * s), r2(cy + 24 * s + i * 16 * s), r2(60 * s), r2(12 * s), i ? MID : LIGHT, 3),
  ).join('') +
  dot(r2(cx - 20 * s), r2(cy + 30 * s), r2(3 * s), ACCENT) +
  dot(r2(cx - 20 * s), r2(cy + 46 * s), r2(3 * s), ACCENT);

const document_ = (x: number, y: number, w: number, h: number) =>
  `<path d="M${x} ${y} h${r2(w - 16)} l16 16 v${r2(h - 16)} h${-w} Z" fill="${WHITE}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>` +
  textLines(r2(x + 10), r2(y + 22), r2(w - 20), 4, 10);

/** Stack of coins — reads as money far better than a single disc. */
const coinStack = (cx: number, cyBase: number, rx: number, n = 4) =>
  Array.from({ length: n }, (_, i) => {
    const y = cyBase - i * rx * 0.42;
    return (
      `<ellipse cx="${cx}" cy="${r2(y)}" rx="${rx}" ry="${r2(rx * 0.36)}" fill="${i === n - 1 ? ACCENT : ACCENT}" opacity="${r2(0.55 + i * 0.12)}"/>` +
      `<ellipse cx="${cx}" cy="${r2(y)}" rx="${rx}" ry="${r2(rx * 0.36)}" fill="none" stroke="${INK}" stroke-width="2"/>`
    );
  }).join('');

/** Signed agreement: contract, accent seal and an approved tick. */
const contract = (x: number, y: number, w: number, h: number) =>
  `<path d="M${x} ${y} h${r2(w - 18)} l18 18 v${r2(h - 18)} h${-w} Z" fill="${WHITE}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>` +
  `<rect x="${r2(x + 12)}" y="${r2(y + 16)}" width="${r2(w * 0.5)}" height="9" rx="4.5" fill="${ACCENT}"/>` +
  textLines(r2(x + 12), r2(y + 36), r2(w - 26), 3, 11) +
  `<path d="M${r2(x + 12)} ${r2(y + h - 22)} q${r2(w * 0.16)} ${-14} ${r2(w * 0.3)} 0 q${r2(w * 0.12)} ${12} ${r2(w * 0.26)} ${-6}" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>` +
  `<circle cx="${r2(x + w - 20)}" cy="${r2(y + h - 20)}" r="13" fill="${ACCENT}"/>` +
  `<path d="M${r2(x + w - 26)} ${r2(y + h - 20)} l4 5 l8 -10" fill="none" stroke="${WHITE}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;

// -------------------------------------------------------------- composition --
interface SceneDef {
  slug: string;
  title: string;
  keywords: string[];
  /** Background + prop markup drawn BEHIND the characters. */
  back?: string;
  /** Characters, painted in array order. */
  cast?: { spec: PeepSpec; rect: Rect }[];
  /** Props drawn IN FRONT of the characters (desks, foreground cards). */
  front?: string;
}

function render(def: SceneDef): UndrawEntry {
  const cast = (def.cast ?? []).map((c) => peep(c.spec, c.rect)).join('');
  return {
    slug: def.slug,
    title: def.title,
    keywords: def.keywords,
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${def.back ?? ''}${cast}${def.front ?? ''}</svg>`,
  };
}

// Reusable casting shorthands so scenes stay readable.
const P = {
  presenter: { standing: 'PointingFingerWB', hair: 'Bun', face: 'SmileBig', skin: 0 } as PeepSpec,
  presenter2: { standing: 'PointingFingerBW', hair: 'ShortCurly', face: 'Explaining', skin: 3 } as PeepSpec,
  lead: { standing: 'CrossedArmsBW', hair: 'Afro', face: 'Calm', skin: 4 } as PeepSpec,
  lead2: { standing: 'CrossedArmsWB', hair: 'MediumBangs', face: 'Serious', skin: 1 } as PeepSpec,
  easy: { standing: 'EasingBW', hair: 'ShortMessy', face: 'Smile', skin: 2 } as PeepSpec,
  easy2: { standing: 'EasingWB', hair: 'LongBangs', face: 'Smile', skin: 0 } as PeepSpec,
  suit: { standing: 'BlazerPantsWB', hair: 'Short', face: 'Calm', skin: 1, beard: 'Goatee' } as PeepSpec,
  suit2: { standing: 'BlazerPantsBW', hair: 'Hijab', face: 'Smile', skin: 2 } as PeepSpec,
  casual: { standing: 'ShirtPantsBW', hair: 'Twists', face: 'Smile', skin: 3 } as PeepSpec,
  casual2: { standing: 'ShirtPantsWB', hair: 'CornRows', face: 'SmileTeeth', skin: 4 } as PeepSpec,
  walker: { standing: 'WalkingBW', hair: 'ShortVolumed', face: 'Driven', skin: 1 } as PeepSpec,
  cheer: { standing: 'RoboDanceWB', hair: 'BunCurly', face: 'SmileBig', skin: 0 } as PeepSpec,
  resting: { standing: 'RestingBW', hair: 'Medium', face: 'Cheeky', skin: 2 } as PeepSpec,
  seated: { sitting: 'ClosedLegWB', hair: 'LongAfro', face: 'Smile', skin: 3 } as PeepSpec,
  seated2: { sitting: 'ClosedLegBW', hair: 'Bangs', face: 'Calm', skin: 0 } as PeepSpec,
  thinker: { sitting: 'CrossedLegs', hair: 'BantuKnots', face: 'Solemn', skin: 4 } as PeepSpec,
  crouch: { sitting: 'OneLegUpWB', hair: 'FlatTop', face: 'Concerned', skin: 1 } as PeepSpec,
  bustLaptop: { bust: 'Geek', hair: 'ShortCurly', face: 'Calm', skin: 2, glasses: 'GlassRound' } as PeepSpec,
  bustTablet: { bust: 'Device', hair: 'Bun', face: 'Calm', skin: 0 } as PeepSpec,
  bustCoffee: { bust: 'Coffee', hair: 'Turban', face: 'Smile', skin: 3 } as PeepSpec,
  bustExplain: { bust: 'Explaining', hair: 'Medium', face: 'Explaining', skin: 1 } as PeepSpec,
  bustPoint: { bust: 'PointingUp', hair: 'Afro', face: 'SmileBig', skin: 4 } as PeepSpec,
  bustShrug: { bust: 'Whatever', hair: 'ShortMessy', face: 'Suspicious', skin: 1 } as PeepSpec,
  bustArms: { bust: 'ArmsCrossed', hair: 'GrayMedium', face: 'Serious', skin: 0, glasses: 'GlassClubmaster' } as PeepSpec,
  bustPaper: { bust: 'Paper', hair: 'LongBangs', face: 'Concerned', skin: 2 } as PeepSpec,
  bustHoodie: { bust: 'Hoodie', hair: 'CornRows', face: 'Awe', skin: 4 } as PeepSpec,
  bustPocket: { bust: 'PocketShirt', hair: 'Short', face: 'Cheeky', skin: 1, beard: 'FullMedium' } as PeepSpec,
  bustKiller: { bust: 'Killer', hair: 'Twists', face: 'EyesClosed', skin: 3 } as PeepSpec,
} satisfies Record<string, PeepSpec>;

/** Common figure boxes. */
const FULL_L: Rect = { x: 24, y: 52, w: 118, h: 218 };
const FULL_R: Rect = { x: 258, y: 52, w: 118, h: 218 };
const FULL_C: Rect = { x: 141, y: 46, w: 122, h: 226 };
const BUST_L: Rect = { x: 18, y: 76, w: 150, h: 196 };
const BUST_R: Rect = { x: 232, y: 76, w: 150, h: 196 };
const TRIO = (i: number): Rect => ({ x: 34 + i * 112, y: 68, w: 96, h: 200 });
const QUAD = (i: number): Rect => ({ x: 16 + i * 94, y: 84, w: 84, h: 184 });

const SCENES: SceneDef[] = [
  // ---------------------------------------------------- solo + object (B2B) --
  {
    slug: 'peep-qa-tester-bug',
    title: 'QA tester finds the bug',
    keywords: ['qa', 'tester', 'bug', 'testing', 'defect', 'quality', 'debug', 'developer', 'person', 'issue'],
    back: ground() + blob(268, 132, 84) + board(196, 62, 152, 108, textLines(212, 84, 106, 3) + bug(300, 132, 15)),
    cast: [{ spec: P.presenter, rect: FULL_L }],
  },
  {
    slug: 'peep-developer-coding',
    title: 'Developer coding',
    keywords: ['developer', 'coding', 'engineer', 'programmer', 'software', 'laptop', 'build', 'person', 'tech', 'code'],
    back: ground() + blob(120, 120, 92) + floorPlate(),
    cast: [{ spec: P.bustLaptop, rect: BUST_L }],
    front: board(210, 74, 158, 120, textLines(224, 96, 112, 5, 12) + dot(348, 88, 5, ACCENT)),
  },
  {
    slug: 'peep-person-thinking',
    title: 'Person thinking it through',
    keywords: ['thinking', 'person', 'reflect', 'consider', 'idea', 'question', 'strategy', 'ponder', 'decision', 'insight'],
    back: ground(200, 274, 120) + blob(214, 108, 74, 0.1) + thought(276, 92, 46) + bulb(276, 88, 17),
    cast: [{ spec: P.thinker, rect: { x: 46, y: 118, w: 156, h: 152 } }],
  },
  {
    slug: 'peep-person-celebrating',
    title: 'Person celebrating a win',
    keywords: ['celebrating', 'win', 'success', 'happy', 'achievement', 'person', 'milestone', 'trophy', 'cheer', 'growth'],
    back: ground() + blob(200, 130, 104, 0.12) +
      [ [80, 66], [316, 74], [110, 176], [332, 168], [56, 122], [352, 116] ]
        .map(([x, y], i) => dot(x!, y!, i % 2 ? 5 : 7, i % 2 ? MID : ACCENT)).join(''),
    cast: [{ spec: P.cheer, rect: FULL_C }],
    front: trophy(330, 216, 1),
  },
  {
    slug: 'peep-person-presenting',
    title: 'Person presenting results',
    keywords: ['presenting', 'presentation', 'pitch', 'speaker', 'slides', 'meeting', 'chart', 'person', 'report', 'business'],
    back: ground() + board(150, 46, 210, 132, barChart(172, 74, 166, 76, [30, 46, 62, 88])),
    cast: [{ spec: P.presenter, rect: { x: 24, y: 62, w: 116, h: 208 } }],
  },
  {
    slug: 'peep-manager-pointing',
    title: 'Manager pointing at the number',
    keywords: ['manager', 'pointing', 'leader', 'kpi', 'metrics', 'target', 'direct', 'person', 'review', 'focus'],
    back: ground() + blob(272, 122, 82) + panel(214, 68, 142, 110, WHITE) + outline(214, 68, 142, 110) +
      `<rect x="232" y="88" width="52" height="14" rx="7" fill="${ACCENT}"/>` + textLines(232, 116, 106, 4, 12),
    cast: [{ spec: P.presenter2, rect: FULL_L }],
  },
  {
    slug: 'peep-mentor-coaching',
    title: 'Mentor coaching a colleague',
    keywords: ['mentor', 'coaching', 'coach', 'teaching', 'guidance', 'training', 'people', 'support', 'growth', 'onboarding'],
    back: ground(200, 276, 176) + floorPlate() + strip(126, 34, 148, 84, 0.12),
    cast: [
      { spec: P.bustExplain, rect: { x: 12, y: 96, w: 136, h: 176 } },
      { spec: { ...P.bustHoodie, flip: true }, rect: { x: 252, y: 108, w: 128, h: 164 } },
    ],
  },
  {
    slug: 'peep-data-analyst',
    title: 'Data analyst reading the numbers',
    keywords: ['analyst', 'data', 'analytics', 'metrics', 'insights', 'dashboard', 'report', 'person', 'stats', 'charts'],
    back: ground() + blob(112, 122, 92, 0.1),
    cast: [{ spec: P.bustTablet, rect: BUST_L }],
    front: panel(206, 62, 76, 60, WHITE) + outline(206, 62, 76, 60) + donut(244, 92, 20, 0.68) +
      panel(292, 62, 76, 60, WHITE) + outline(292, 62, 76, 60) + lineChart(304, 76, 52, 32, [10, 22, 18, 34]) +
      panel(206, 132, 162, 62, WHITE) + outline(206, 132, 162, 62) + barChart(220, 146, 134, 34, [24, 40, 32, 56, 70]),
  },
  {
    slug: 'peep-customer-support',
    title: 'Customer support conversation',
    keywords: ['support', 'customer', 'service', 'help', 'chat', 'conversation', 'person', 'reply', 'success', 'care'],
    back: ground() + blob(272, 120, 84, 0.1),
    cast: [{ spec: { ...P.bustCoffee, flip: true }, rect: BUST_R }],
    front: bubble(28, 62, 148, 50, 'left', WHITE) + textLines(44, 78, 112, 2) +
      bubble(58, 132, 132, 44, 'right', PALE) + textLines(74, 146, 96, 2),
  },
  {
    slug: 'peep-remote-worker',
    title: 'Remote worker at home',
    keywords: ['remote', 'worker', 'home', 'laptop', 'flexible', 'person', 'work', 'hybrid', 'desk', 'productivity'],
    back: ground(200, 276, 140) +
      panel(236, 34, 132, 108, ACCENT, 8) +
      panel(243, 41, 118, 94, PALE, 5) +
      line(302, 41, 302, 135, MID, 3) +
      line(243, 88, 361, 88, MID, 3) +
      outline(236, 34, 132, 108, 8, 3) +
      panel(228, 142, 148, 9, INK, 4),
    cast: [{ spec: P.seated, rect: { x: 40, y: 116, w: 154, h: 156 } }],
    front: laptop(150, 198, 58) + plant(360, 246, 0.9),
  },
  {
    slug: 'peep-person-stressed',
    title: 'Person under pressure',
    keywords: ['stressed', 'pressure', 'overwhelmed', 'deadline', 'burnout', 'person', 'problem', 'workload', 'risk', 'concerned'],
    back: ground() + blob(206, 118, 96, 0.1) + clock(322, 78, 28) +
      [ [86, 74], [122, 56], [300, 172] ].map(([x, y]) => document_(x!, y!, 44, 52)).join(''),
    cast: [{ spec: P.crouch, rect: { x: 128, y: 132, w: 150, h: 140 } }],
  },
  {
    slug: 'peep-two-people-debate',
    title: 'Two people debating',
    keywords: ['debate', 'discussion', 'disagree', 'two', 'people', 'argument', 'opinions', 'conversation', 'decision', 'meeting'],
    back: ground() + bubble(84, 42, 100, 42, 'left', WHITE) + textLines(98, 56, 72, 2) +
      bubble(216, 52, 100, 42, 'right', PALE) + textLines(230, 66, 72, 2),
    cast: [
      { spec: P.lead2, rect: { x: 40, y: 100, w: 106, h: 172 } },
      { spec: { ...P.bustShrug, flip: true }, rect: { x: 250, y: 106, w: 128, h: 166 } },
    ],
  },
  {
    slug: 'peep-person-laptop-standing',
    title: 'Person working on a laptop',
    keywords: ['laptop', 'person', 'work', 'standing', 'professional', 'productivity', 'office', 'tech', 'developer', 'remote'],
    back: ground() + blob(268, 138, 88, 0.12),
    cast: [{ spec: P.easy, rect: FULL_C }],
    front: panel(238, 156, 124, 10, INK, 4) + panel(248, 166, 8, 78, MID, 3) + panel(344, 166, 8, 78, MID, 3) + laptop(262, 100, 76),
  },
  {
    slug: 'peep-person-reading-report',
    title: 'Person reading the report',
    keywords: ['report', 'reading', 'review', 'document', 'person', 'analysis', 'research', 'audit', 'findings', 'paper'],
    back: ground() + floorPlate() + blob(120, 118, 88, 0.12),
    cast: [{ spec: P.bustPaper, rect: BUST_L }],
    front: document_(222, 64, 132, 156) + `<rect x="238" y="86" width="60" height="12" rx="6" fill="${ACCENT}"/>`,
  },
  {
    slug: 'peep-person-on-a-call',
    title: 'Person on a call',
    keywords: ['call', 'phone', 'talking', 'person', 'conversation', 'outreach', 'sales', 'contact', 'communication', 'client'],
    back: ground() + blob(268, 120, 82, 0.1) + bubble(226, 60, 132, 46, 'left', WHITE) + textLines(242, 76, 96, 2),
    cast: [{ spec: P.bustPocket, rect: BUST_L }],
    front: phone(186, 120, 26),
  },
  {
    slug: 'peep-person-at-whiteboard',
    title: 'Person at the whiteboard',
    keywords: ['whiteboard', 'workshop', 'planning', 'brainstorm', 'person', 'ideas', 'session', 'strategy', 'facilitate', 'notes'],
    back: ground() + board(148, 40, 216, 146, stickies(170, 62, 4, 3, 30)),
    cast: [{ spec: P.presenter2, rect: { x: 26, y: 60, w: 116, h: 210 } }],
  },
  {
    slug: 'peep-person-checklist',
    title: 'Person ticking off the checklist',
    keywords: ['checklist', 'tasks', 'todo', 'done', 'progress', 'person', 'plan', 'complete', 'steps', 'organised'],
    back: ground() + blob(268, 130, 88, 0.12),
    cast: [{ spec: P.presenter, rect: FULL_L }],
    front: checklistCard(206, 62, 156, 152, 3, 5),
  },
  {
    slug: 'peep-person-target-goal',
    title: 'Person aiming at the goal',
    keywords: ['target', 'goal', 'aim', 'objective', 'focus', 'person', 'strategy', 'success', 'bullseye', 'ambition'],
    back: ground() + blob(282, 128, 96, 0.12) + target(282, 128, 66),
    cast: [{ spec: P.lead, rect: FULL_L }],
  },
  {
    slug: 'peep-person-rocket-launch',
    title: 'Person launching the product',
    keywords: ['rocket', 'launch', 'startup', 'ship', 'growth', 'person', 'takeoff', 'release', 'product', 'go'],
    back: ground() + blob(286, 118, 92, 0.12) + rocket(286, 116, 1.5),
    cast: [{ spec: P.cheer, rect: { x: 30, y: 62, w: 128, h: 208 } }],
  },
  {
    slug: 'peep-person-bright-idea',
    title: 'Person with a bright idea',
    keywords: ['idea', 'lightbulb', 'creativity', 'innovation', 'insight', 'person', 'brainstorm', 'inspiration', 'think', 'solution'],
    back: ground() + blob(200, 88, 74, 0.16) + bulb(200, 78, 30),
    cast: [{ spec: P.bustPoint, rect: { x: 118, y: 138, w: 164, h: 134 } }],
  },
  {
    slug: 'peep-person-secure-shield',
    title: 'Person behind a security shield',
    keywords: ['security', 'shield', 'protection', 'safe', 'privacy', 'person', 'trust', 'compliance', 'guard', 'risk'],
    back: ground() + blob(280, 132, 88, 0.1) + shield(282, 130, 1.5),
    cast: [{ spec: P.suit, rect: FULL_L }],
  },
  {
    slug: 'peep-person-megaphone-reach',
    title: 'Person announcing to an audience',
    keywords: ['megaphone', 'announce', 'audience', 'reach', 'marketing', 'person', 'campaign', 'awareness', 'broadcast', 'promotion'],
    back: ground() + blob(140, 120, 92, 0.1),
    cast: [{ spec: P.presenter, rect: { x: 32, y: 58, w: 120, h: 212 } }],
    front: megaphone(196, 118, 1.2),
  },
  {
    slug: 'peep-person-magnifier-research',
    title: 'Person researching the detail',
    keywords: ['research', 'search', 'discovery', 'analysis', 'investigate', 'person', 'audit', 'findings', 'insight', 'review'],
    back: ground() + blob(268, 126, 86, 0.1) + magnifier(280, 118, 42),
    cast: [{ spec: P.bustArms, rect: BUST_L }],
  },
  {
    slug: 'peep-person-calendar-planning',
    title: 'Person planning the calendar',
    keywords: ['calendar', 'planning', 'schedule', 'dates', 'person', 'roadmap', 'timeline', 'organise', 'plan', 'cadence'],
    back: ground() + blob(266, 128, 88, 0.1),
    cast: [{ spec: P.presenter2, rect: FULL_L }],
    front: calendar(208, 66, 154, 142),
  },
  {
    slug: 'peep-person-deadline-clock',
    title: 'Person racing the deadline',
    keywords: ['deadline', 'clock', 'time', 'urgency', 'speed', 'person', 'schedule', 'pressure', 'delivery', 'sprint'],
    back: ground() + blob(288, 108, 74, 0.12) + clock(288, 106, 46),
    cast: [{ spec: P.walker, rect: FULL_L }],
  },
  {
    slug: 'peep-person-revenue-growth',
    title: 'Person and revenue growth',
    keywords: ['revenue', 'growth', 'money', 'profit', 'increase', 'person', 'sales', 'chart', 'finance', 'up'],
    back: ground() + blob(270, 128, 90, 0.1) + board(200, 62, 160, 116, lineChart(218, 84, 124, 68, [12, 20, 17, 32, 46])),
    cast: [{ spec: P.easy2, rect: FULL_L }],
    front: coinStack(178, 244, 19, 4),
  },
  {
    slug: 'peep-person-automation-gears',
    title: 'Person automating the work',
    keywords: ['automation', 'gears', 'process', 'workflow', 'efficiency', 'person', 'system', 'ops', 'scale', 'tooling'],
    back: ground() + blob(272, 120, 84, 0.1) + gear(272, 108, 40) + gear(322, 156, 26, MID),
    cast: [{ spec: P.casual, rect: FULL_L }],
  },
  {
    slug: 'peep-person-cloud-platform',
    title: 'Person and the cloud platform',
    keywords: ['cloud', 'platform', 'infrastructure', 'server', 'saas', 'person', 'hosting', 'tech', 'devops', 'scale'],
    back: ground() + blob(280, 116, 84, 0.1) + cloudServer(284, 104, 1.1),
    cast: [{ spec: P.bustLaptop, rect: BUST_L }],
  },
  {
    slug: 'peep-person-mobile-app',
    title: 'Person shipping the mobile app',
    keywords: ['mobile', 'app', 'phone', 'product', 'ux', 'person', 'screen', 'design', 'launch', 'device'],
    back: ground() + blob(272, 132, 84, 0.12),
    cast: [{ spec: P.presenter, rect: FULL_L }],
    front: phone(248, 66, 58) + textLines(258, 106, 38, 4, 12, LIGHT) + `<rect x="258" y="86" width="38" height="14" rx="4" fill="${ACCENT}"/>`,
  },
  {
    slug: 'peep-person-writing-content',
    title: 'Person writing content',
    keywords: ['writing', 'content', 'copy', 'blog', 'author', 'person', 'editor', 'draft', 'publish', 'story'],
    back: ground() + floorPlate() + blob(118, 122, 88, 0.12),
    cast: [{ spec: P.bustPaper, rect: BUST_L }],
    front: document_(214, 58, 150, 174) + `<rect x="232" y="80" width="72" height="12" rx="6" fill="${ACCENT}"/>`,
  },

  // ------------------------------------------------------------ team scenes --
  {
    slug: 'peep-team-huddle',
    title: 'Team huddle',
    keywords: ['team', 'huddle', 'together', 'collaboration', 'group', 'people', 'standup', 'alignment', 'meeting', 'unity'],
    back: ground(200, 276, 168) + blob(200, 136, 118, 0.1),
    cast: [
      { spec: P.lead, rect: TRIO(0) },
      { spec: P.casual2, rect: TRIO(1) },
      { spec: { ...P.easy2, flip: true }, rect: TRIO(2) },
    ],
  },
  {
    slug: 'peep-diverse-team',
    title: 'Diverse team lineup',
    keywords: ['diverse', 'team', 'people', 'inclusion', 'group', 'company', 'culture', 'staff', 'colleagues', 'together'],
    back: ground(200, 276, 178) + floorPlate(0.1),
    cast: [
      { spec: P.suit2, rect: QUAD(0) },
      { spec: P.casual, rect: QUAD(1) },
      { spec: P.lead, rect: QUAD(2) },
      { spec: { ...P.easy, flip: true }, rect: QUAD(3) },
    ],
  },
  {
    slug: 'peep-handshake-deal',
    title: 'Closing the deal',
    keywords: ['handshake', 'deal', 'agreement', 'partnership', 'contract', 'people', 'close', 'trust', 'client', 'business'],
    back: ground(200, 276, 156) + blob(200, 122, 98, 0.12),
    cast: [
      { spec: P.suit, rect: { x: 30, y: 62, w: 116, h: 208 } },
      { spec: { ...P.suit2, flip: true }, rect: { x: 254, y: 62, w: 116, h: 208 } },
    ],
    front: contract(152, 128, 96, 108),
  },
  {
    slug: 'peep-team-celebrating-win',
    title: 'Team celebrating the win',
    keywords: ['team', 'celebrating', 'win', 'success', 'people', 'milestone', 'achievement', 'happy', 'together', 'launch'],
    back: ground(200, 276, 170) + blob(200, 124, 112, 0.12) +
      [ [58, 60], [140, 44], [258, 48], [344, 64], [96, 168], [312, 160] ]
        .map(([x, y], i) => dot(x!, y!, i % 2 ? 5 : 7, i % 2 ? MID : ACCENT)).join(''),
    cast: [
      { spec: P.cheer, rect: { x: 34, y: 100, w: 96, h: 172 } },
      { spec: P.casual2, rect: { x: 146, y: 100, w: 96, h: 172 } },
      { spec: { ...P.presenter, flip: true }, rect: { x: 258, y: 100, w: 96, h: 172 } },
    ],
    front: trophy(200, 56, 1.1),
  },
  {
    slug: 'peep-team-standup-meeting',
    title: 'Team standup meeting',
    keywords: ['standup', 'meeting', 'team', 'agile', 'daily', 'people', 'sync', 'scrum', 'update', 'collaboration'],
    back: ground(200, 276, 172) + board(128, 34, 148, 84, stickies(142, 50, 4, 2, 26)),
    cast: [
      { spec: P.lead2, rect: { x: 22, y: 96, w: 96, h: 176 } },
      { spec: P.casual, rect: { x: 152, y: 100, w: 96, h: 172 } },
      { spec: { ...P.suit, flip: true }, rect: { x: 282, y: 96, w: 96, h: 176 } },
    ],
  },
  {
    slug: 'peep-team-brainstorm',
    title: 'Team brainstorm session',
    keywords: ['brainstorm', 'ideas', 'workshop', 'team', 'people', 'creativity', 'session', 'sticky', 'notes', 'innovation'],
    back: ground(200, 276, 172) + board(116, 28, 176, 112, stickies(132, 46, 5, 3, 24)) + bulb(342, 62, 19),
    cast: [
      { spec: P.presenter2, rect: { x: 8, y: 92, w: 100, h: 180 } },
      { spec: { ...P.easy2, flip: true }, rect: { x: 296, y: 96, w: 96, h: 176 } },
    ],
  },
  {
    slug: 'peep-pair-programming',
    title: 'Pair programming',
    keywords: ['pair', 'programming', 'developers', 'coding', 'team', 'people', 'collaboration', 'engineering', 'review', 'build'],
    back: ground(200, 276, 160) + blob(200, 118, 96, 0.1),
    cast: [
      { spec: P.bustLaptop, rect: { x: 6, y: 92, w: 142, h: 180 } },
      { spec: { ...P.bustPocket, flip: true }, rect: { x: 240, y: 96, w: 142, h: 176 } },
    ],
    front: board(146, 96, 110, 88, textLines(158, 114, 82, 4, 12)),
  },
  {
    slug: 'peep-interview-hiring',
    title: 'Interview and hiring',
    keywords: ['interview', 'hiring', 'recruitment', 'candidate', 'people', 'talent', 'job', 'meeting', 'hr', 'selection'],
    back: ground(200, 276, 168) + floorPlate(),
    cast: [
      { spec: P.bustArms, rect: { x: 8, y: 92, w: 140, h: 180 } },
      { spec: { ...P.bustHoodie, flip: true }, rect: { x: 244, y: 100, w: 138, h: 172 } },
    ],
    front: document_(158, 122, 84, 96) + `<rect x="170" y="140" width="42" height="10" rx="5" fill="${ACCENT}"/>`,
  },
  {
    slug: 'peep-onboarding-welcome',
    title: 'Onboarding welcome',
    keywords: ['onboarding', 'welcome', 'new', 'hire', 'people', 'introduction', 'training', 'start', 'team', 'culture'],
    back: ground(200, 276, 168) + blob(200, 112, 104, 0.1) + bubble(132, 34, 136, 44, 'left', WHITE) + textLines(148, 48, 100, 2),
    cast: [
      { spec: P.presenter, rect: { x: 40, y: 96, w: 104, h: 176 } },
      { spec: { ...P.casual2, flip: true }, rect: { x: 176, y: 96, w: 104, h: 176 } },
      { spec: P.easy, rect: { x: 288, y: 100, w: 96, h: 172 } },
    ],
  },
  {
    slug: 'peep-team-presentation-audience',
    title: 'Presenting to the team',
    keywords: ['presentation', 'audience', 'team', 'speaker', 'meeting', 'people', 'slides', 'pitch', 'talk', 'report'],
    back: ground(200, 276, 176) + board(122, 34, 196, 116, barChart(142, 60, 156, 66, [26, 40, 34, 58, 76])),
    cast: [
      { spec: P.presenter2, rect: { x: 16, y: 96, w: 96, h: 176 } },
      { spec: { ...P.seated2, flip: true }, rect: { x: 236, y: 158, w: 132, h: 114 } },
    ],
  },
  {
    slug: 'peep-customer-and-rep',
    title: 'Customer meeting the rep',
    keywords: ['customer', 'client', 'meeting', 'sales', 'people', 'account', 'relationship', 'consultation', 'service', 'two'],
    back: ground(200, 276, 160) + blob(200, 120, 92, 0.1) + bubble(148, 42, 108, 40, 'left', WHITE) + textLines(162, 55, 78, 2),
    cast: [
      { spec: P.suit, rect: { x: 40, y: 72, w: 108, h: 200 } },
      { spec: { ...P.resting, flip: true }, rect: { x: 244, y: 72, w: 116, h: 200 } },
    ],
  },
  {
    slug: 'peep-team-roadmap-planning',
    title: 'Team planning the roadmap',
    keywords: ['roadmap', 'planning', 'team', 'strategy', 'timeline', 'people', 'quarter', 'milestones', 'priorities', 'plan'],
    back: ground(200, 276, 170) + board(112, 40, 214, 112, timeline(136, 108, 166, 4) + textLines(136, 118, 166, 2, 12)),
    cast: [
      { spec: P.presenter, rect: { x: 14, y: 100, w: 94, h: 172 } },
      { spec: { ...P.lead, flip: true }, rect: { x: 296, y: 98, w: 94, h: 174 } },
    ],
  },
  {
    slug: 'peep-cross-functional-collab',
    title: 'Cross-functional collaboration',
    keywords: ['collaboration', 'cross', 'functional', 'team', 'people', 'partners', 'together', 'workflow', 'alignment', 'group'],
    back: ground(200, 276, 172) + network(200, 96, 54),
    cast: [
      { spec: P.casual, rect: { x: 20, y: 128, w: 96, h: 144 } },
      { spec: { ...P.suit2, flip: true }, rect: { x: 152, y: 122, w: 96, h: 150 } },
      { spec: P.easy2, rect: { x: 286, y: 128, w: 96, h: 144 } },
    ],
  },
  {
    slug: 'peep-leadership-alignment',
    title: 'Leadership alignment',
    keywords: ['leadership', 'alignment', 'executives', 'strategy', 'people', 'decision', 'board', 'direction', 'agreement', 'team'],
    back: ground(200, 276, 160) + blob(200, 118, 98, 0.1) + compass(200, 74, 34),
    cast: [
      { spec: P.lead, rect: { x: 44, y: 106, w: 106, h: 166 } },
      { spec: { ...P.lead2, flip: true }, rect: { x: 250, y: 106, w: 106, h: 166 } },
    ],
  },
  {
    slug: 'peep-team-retrospective',
    title: 'Team retrospective',
    keywords: ['retrospective', 'retro', 'team', 'feedback', 'review', 'people', 'agile', 'learning', 'improve', 'sprint'],
    back: ground(200, 276, 168) + board(118, 32, 178, 112, stickies(134, 50, 5, 3, 24)),
    cast: [
      { spec: P.seated2, rect: { x: 14, y: 158, w: 116, h: 114 } },
      { spec: { ...P.casual, flip: true }, rect: { x: 302, y: 82, w: 88, h: 190 } },
    ],
  },
  {
    slug: 'peep-remote-video-call',
    title: 'Remote video call',
    keywords: ['video', 'call', 'remote', 'meeting', 'team', 'people', 'distributed', 'hybrid', 'online', 'conference'],
    back: ground(200, 276, 130) + blob(112, 122, 88, 0.1),
    cast: [{ spec: P.bustCoffee, rect: { x: 8, y: 92, w: 138, h: 180 } }],
    front:
      board(184, 56, 190, 148, '') +
      [0, 1, 2, 3]
        .map((i) => {
          const x = 196 + (i % 2) * 88;
          const y = 68 + Math.floor(i / 2) * 68;
          return panel(x, y, 78, 58, i === 0 ? ACCENT : LIGHT, 5) + dot(x + 39, y + 22, 11, WHITE) +
            `<path d="M${x + 24} ${y + 52} a15 15 0 0 1 30 0 Z" fill="${WHITE}"/>`;
        })
        .join(''),
  },
  {
    slug: 'peep-mentor-and-mentee',
    title: 'Mentor and mentee',
    keywords: ['mentor', 'mentee', 'coaching', 'people', 'guidance', 'career', 'learning', 'development', 'support', 'growth'],
    back: ground(200, 276, 156) + blob(200, 122, 92, 0.1) + steps(158, 236, 4, 22, 15),
    cast: [
      { spec: P.presenter2, rect: { x: 34, y: 78, w: 104, h: 194 } },
      { spec: { ...P.easy, flip: true }, rect: { x: 262, y: 92, w: 104, h: 180 } },
    ],
  },
  {
    slug: 'peep-workshop-facilitation',
    title: 'Workshop facilitation',
    keywords: ['workshop', 'facilitation', 'training', 'team', 'people', 'session', 'learning', 'group', 'discussion', 'enablement'],
    back: ground(200, 276, 176) + board(140, 30, 186, 104, textLines(158, 50, 150, 5, 13)),
    cast: [
      { spec: P.presenter, rect: { x: 20, y: 88, w: 100, h: 184 } },
      { spec: P.seated, rect: { x: 148, y: 168, w: 116, h: 104 } },
      { spec: { ...P.thinker, flip: true }, rect: { x: 274, y: 164, w: 118, h: 108 } },
    ],
  },

  // ------------------------------------------------- character + chart/data --
  {
    slug: 'peep-growth-chart',
    title: 'Growth chart with a person',
    keywords: ['growth', 'chart', 'increase', 'trend', 'metrics', 'up', 'revenue', 'person', 'analytics', 'performance'],
    back: ground() + blob(258, 122, 96, 0.1) +
      line(178, 62, 178, 214, INK, 3) + line(178, 214, 372, 214, INK, 3) +
      lineChart(192, 78, 168, 124, [14, 26, 22, 40, 58, 76]),
    cast: [{ spec: P.presenter, rect: { x: 24, y: 64, w: 114, h: 208 } }],
  },
  {
    slug: 'peep-funnel-chart',
    title: 'Conversion funnel with a person',
    keywords: ['funnel', 'conversion', 'pipeline', 'leads', 'marketing', 'stages', 'person', 'chart', 'sales', 'drop'],
    back: ground() + blob(266, 126, 92, 0.1) + funnel(268, 68, 148, 138),
    cast: [{ spec: P.presenter2, rect: FULL_L }],
  },
  {
    slug: 'peep-before-after-bars',
    title: 'Before and after comparison',
    keywords: ['before', 'after', 'comparison', 'bars', 'improvement', 'chart', 'person', 'results', 'change', 'impact'],
    back: ground() + board(140, 52, 224, 148, barChart(164, 74, 176, 100, [26, 34, 58, 92])),
    cast: [{ spec: P.lead, rect: { x: 20, y: 66, w: 112, h: 206 } }],
  },
  {
    slug: 'peep-maturity-ladder',
    title: 'Maturity ladder with a person',
    keywords: ['maturity', 'ladder', 'levels', 'stages', 'progress', 'model', 'person', 'growth', 'assessment', 'steps'],
    back: ground() + blob(258, 148, 96, 0.1) + steps(180, 236, 5, 38, 34),
    cast: [{ spec: P.walker, rect: { x: 24, y: 66, w: 112, h: 206 } }],
  },
  {
    slug: 'peep-process-flow',
    title: 'Process flow with a person',
    keywords: ['process', 'flow', 'workflow', 'steps', 'pipeline', 'diagram', 'person', 'stages', 'system', 'operations'],
    back: ground() + strip(138, 58, 250, 86, 0.1) +
      [0, 1, 2].map((i) => panel(150 + i * 84, 74, 66, 52, WHITE) + outline(150 + i * 84, 74, 66, 52, 6, 2.4) + dot(183 + i * 84, 100, 10, ACCENT)).join('') +
      arrowRight(220, 100, 30) + arrowRight(304, 100, 30),
    cast: [{ spec: P.casual, rect: { x: 26, y: 66, w: 112, h: 206 } }],
  },
  {
    slug: 'peep-kpi-gauge',
    title: 'KPI gauge with a person',
    keywords: ['kpi', 'gauge', 'metric', 'performance', 'score', 'dial', 'person', 'target', 'measure', 'dashboard'],
    back: ground() + blob(270, 128, 88, 0.1) + gauge(272, 158, 66, 0.72),
    cast: [{ spec: P.bustArms, rect: BUST_L }],
  },
  {
    slug: 'peep-analytics-dashboard',
    title: 'Analytics dashboard with a person',
    keywords: ['dashboard', 'analytics', 'metrics', 'data', 'kpi', 'monitor', 'person', 'insights', 'report', 'stats'],
    back: ground() + board(132, 40, 244, 168,
      panel(146, 54, 108, 62, PALE, 5) + barChart(158, 66, 84, 38, [20, 34, 28, 46]) +
      panel(262, 54, 100, 62, PALE, 5) + donut(312, 85, 22, 0.62) +
      panel(146, 126, 216, 68, PALE, 5) + lineChart(160, 140, 188, 40, [12, 24, 18, 32, 28, 44])),
    cast: [{ spec: P.presenter, rect: { x: 12, y: 74, w: 106, h: 198 } }],
  },
  {
    slug: 'peep-timeline-milestones',
    title: 'Milestone timeline with a person',
    keywords: ['timeline', 'milestones', 'roadmap', 'schedule', 'phases', 'plan', 'person', 'delivery', 'progress', 'quarters'],
    back: ground() + blob(256, 124, 92, 0.08) + timeline(168, 152, 196, 5) +
      [0, 1, 2, 3, 4].map((i) => panel(154 + i * 49, 84, 40, 44, i < 2 ? ACCENT : LIGHT, 5)).join(''),
    cast: [{ spec: P.presenter2, rect: { x: 20, y: 66, w: 112, h: 206 } }],
  },
  {
    slug: 'peep-comparison-scales',
    title: 'Weighing the trade-off',
    keywords: ['comparison', 'scales', 'tradeoff', 'balance', 'decision', 'options', 'person', 'weigh', 'choice', 'versus'],
    back: ground() + blob(272, 128, 92, 0.1) + scales(276, 146, 1.15),
    cast: [{ spec: P.lead2, rect: FULL_L }],
  },
  {
    slug: 'peep-warning-alert',
    title: 'Person raising the alert',
    keywords: ['warning', 'alert', 'risk', 'incident', 'attention', 'problem', 'person', 'escalation', 'issue', 'caution'],
    back: ground() + blob(276, 126, 88, 0.12) + warning(278, 128, 1.3),
    cast: [{ spec: P.bustPoint, rect: BUST_L }],
  },
  {
    slug: 'peep-market-share-donut',
    title: 'Market share with a person',
    keywords: ['share', 'donut', 'percentage', 'market', 'split', 'chart', 'person', 'proportion', 'data', 'segment'],
    back: ground() + blob(266, 124, 90, 0.1) + donut(268, 122, 58, 0.64) +
      textLines(214, 202, 108, 2, 12),
    cast: [{ spec: P.bustTablet, rect: BUST_L }],
  },
  {
    slug: 'peep-survey-results',
    title: 'Survey results with a person',
    keywords: ['survey', 'results', 'feedback', 'research', 'responses', 'chart', 'person', 'voice', 'customer', 'data'],
    back: ground() + board(146, 48, 218, 154,
      [0, 1, 2, 3].map((i) => `<rect x="164" y="${70 + i * 30}" width="${180 - i * 34}" height="16" rx="8" fill="${i === 0 ? ACCENT : MID}" opacity="${i === 0 ? 1 : 0.65}"/>`).join('')),
    cast: [{ spec: P.presenter, rect: { x: 22, y: 66, w: 112, h: 206 } }],
  },
  {
    slug: 'peep-forecast-projection',
    title: 'Forecast projection with a person',
    keywords: ['forecast', 'projection', 'plan', 'trend', 'future', 'chart', 'person', 'model', 'estimate', 'growth'],
    back: ground() + blob(258, 118, 92, 0.08) +
      line(168, 58, 168, 210, INK, 3) + line(168, 210, 372, 210, INK, 3) +
      `<polyline points="180,190 216,168 252,174 288,142" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>` +
      `<polyline points="288,142 324,116 360,78" fill="none" stroke="${ACCENT}" stroke-width="3.5" stroke-dasharray="8 7" stroke-linecap="round"/>` +
      dot(288, 142, 5, ACCENT),
    cast: [{ spec: P.lead, rect: { x: 22, y: 66, w: 112, h: 206 } }],
  },
  {
    slug: 'peep-retention-cohort',
    title: 'Retention cohort with a person',
    keywords: ['retention', 'cohort', 'churn', 'customers', 'grid', 'analysis', 'person', 'data', 'loyalty', 'metrics'],
    back: ground() + board(150, 54, 214, 148,
      Array.from({ length: 16 }, (_, i) => {
        const c = i % 4;
        const r = Math.floor(i / 4);
        const o = 1 - (c + r) * 0.11;
        return `<rect x="${168 + c * 46}" y="${72 + r * 30}" width="38" height="22" rx="4" fill="${ACCENT}" opacity="${r2(Math.max(0.15, o))}"/>`;
      }).join('')),
    cast: [{ spec: P.bustArms, rect: { x: 6, y: 84, w: 136, h: 188 } }],
  },
  {
    slug: 'peep-data-pipeline',
    title: 'Data pipeline with a person',
    keywords: ['data', 'pipeline', 'etl', 'integration', 'flow', 'system', 'person', 'process', 'engineering', 'stream'],
    back: ground() + strip(140, 70, 250, 90, 0.1) +
      panel(152, 84, 58, 56, ACCENT, 6) + panel(240, 84, 58, 56, MID, 6) + panel(322, 84, 54, 56, ACCENT, 6) +
      arrowRight(212, 112, 26) + arrowRight(300, 112, 20) +
      textLines(152, 158, 224, 2, 13),
    cast: [{ spec: P.bustLaptop, rect: { x: 4, y: 96, w: 136, h: 176 } }],
  },
  {
    slug: 'peep-quarterly-review',
    title: 'Quarterly business review',
    keywords: ['quarterly', 'review', 'qbr', 'results', 'business', 'report', 'people', 'metrics', 'performance', 'meeting'],
    back: ground(200, 276, 168) + board(122, 34, 196, 122,
      barChart(142, 56, 158, 60, [30, 44, 38, 62, 80]) + textLines(142, 128, 158, 1, 10)),
    cast: [
      { spec: P.suit, rect: { x: 16, y: 98, w: 96, h: 174 } },
      { spec: { ...P.lead2, flip: true }, rect: { x: 296, y: 98, w: 96, h: 174 } },
    ],
  },

  // -------------------------------------------------- character + metaphors --
  {
    slug: 'peep-bridge-the-gap',
    title: 'Bridging the gap',
    keywords: ['bridge', 'gap', 'connect', 'link', 'span', 'solution', 'people', 'transition', 'cross', 'unite'],
    back: `<rect x="0" y="212" width="122" height="88" fill="${LIGHT}"/><rect x="278" y="212" width="122" height="88" fill="${LIGHT}"/>` +
      bridge(118, 212, 164),
    cast: [
      { spec: P.walker, rect: { x: 18, y: 52, w: 96, h: 164 } },
      { spec: { ...P.easy2, flip: true }, rect: { x: 288, y: 52, w: 96, h: 164 } },
    ],
  },
  {
    slug: 'peep-broken-chain',
    title: 'Breaking the blocker',
    keywords: ['broken', 'chain', 'blocker', 'break', 'friction', 'unblock', 'person', 'obstacle', 'freedom', 'change'],
    back: ground() + blob(272, 128, 88, 0.1) + chainBroken(274, 130, 0.95),
    cast: [{ spec: P.lead, rect: FULL_L }],
  },
  {
    slug: 'peep-connected-network',
    title: 'Connected network with a person',
    keywords: ['network', 'connected', 'nodes', 'integration', 'ecosystem', 'links', 'person', 'platform', 'community', 'system'],
    back: ground() + blob(272, 122, 94, 0.08) + network(274, 120, 62),
    cast: [{ spec: P.bustTablet, rect: BUST_L }],
  },
  {
    slug: 'peep-audience-reach',
    title: 'Reaching the audience',
    keywords: ['audience', 'reach', 'awareness', 'marketing', 'broadcast', 'people', 'campaign', 'followers', 'growth', 'community'],
    back: ground(200, 276, 176) + blob(108, 108, 82, 0.1) + floorPlate(),
    cast: [
      { spec: P.presenter, rect: { x: 12, y: 64, w: 108, h: 208 } },
      { spec: { ...P.casual2, flip: true }, rect: { x: 236, y: 118, w: 76, h: 154 } },
      { spec: { ...P.easy, flip: true }, rect: { x: 312, y: 124, w: 72, h: 148 } },
    ],
    front: megaphone(134, 92, 0.85),
  },
  {
    slug: 'peep-climbing-steps',
    title: 'Climbing the steps',
    keywords: ['climbing', 'steps', 'progress', 'career', 'levels', 'ambition', 'person', 'growth', 'advance', 'journey'],
    back: ground(200, 282, 170) + blob(230, 120, 92, 0.08) + steps(120, 258, 5, 42, 30),
    cast: [{ spec: P.walker, rect: { x: 252, y: 12, w: 92, h: 100 } }],
  },
  {
    slug: 'peep-puzzle-fit',
    title: 'Making the pieces fit',
    keywords: ['puzzle', 'fit', 'solution', 'pieces', 'problem', 'match', 'person', 'integration', 'strategy', 'assembly'],
    back: ground() + blob(268, 128, 88, 0.1) + puzzleKnob(216, 96, 62) + puzzleNotch(288, 96, 62, MID),
    cast: [{ spec: P.presenter2, rect: FULL_L }],
  },
  {
    slug: 'peep-compass-direction',
    title: 'Setting the direction',
    keywords: ['compass', 'direction', 'strategy', 'navigate', 'vision', 'guidance', 'person', 'north', 'plan', 'leadership'],
    back: ground() + blob(276, 122, 84, 0.1) + compass(278, 120, 54),
    cast: [{ spec: P.suit, rect: FULL_L }],
  },
  {
    slug: 'peep-seed-to-growth',
    title: 'From seed to growth',
    keywords: ['seed', 'growth', 'nurture', 'scale', 'plant', 'develop', 'person', 'start', 'invest', 'compound'],
    back: ground(200, 278, 158) + blob(264, 152, 84, 0.1) + plant(230, 226, 1) + plant(292, 226, 1.6),
    cast: [{ spec: P.seated, rect: { x: 30, y: 118, w: 138, h: 154 } }],
  },
  {
    slug: 'peep-door-opportunity',
    title: 'Opening the opportunity',
    keywords: ['door', 'opportunity', 'open', 'entry', 'access', 'chance', 'person', 'new', 'market', 'invitation'],
    back: ground(200, 280, 160) + blob(268, 140, 86, 0.1) + doorway(232, 96, 96, 152),
    cast: [{ spec: P.easy, rect: { x: 44, y: 66, w: 112, h: 206 } }],
  },
  {
    slug: 'peep-shield-compliance',
    title: 'Compliance and trust',
    keywords: ['compliance', 'trust', 'shield', 'governance', 'policy', 'security', 'people', 'audit', 'safe', 'standards'],
    back: ground(200, 276, 158) + blob(200, 118, 92, 0.1) + shield(200, 108, 1.2),
    cast: [
      { spec: P.suit2, rect: { x: 34, y: 118, w: 100, h: 154 } },
      { spec: { ...P.lead, flip: true }, rect: { x: 266, y: 118, w: 100, h: 154 } },
    ],
  },
  {
    slug: 'peep-rocket-team-launch',
    title: 'Team launching together',
    keywords: ['rocket', 'launch', 'team', 'startup', 'ship', 'people', 'growth', 'release', 'together', 'takeoff'],
    back: ground(200, 276, 172) + blob(200, 108, 96, 0.12) + rocket(200, 100, 1.35),
    cast: [
      { spec: P.cheer, rect: { x: 22, y: 116, w: 104, h: 156 } },
      { spec: { ...P.casual2, flip: true }, rect: { x: 274, y: 116, w: 104, h: 156 } },
    ],
  },
  {
    slug: 'peep-idea-to-plan',
    title: 'Turning the idea into a plan',
    keywords: ['idea', 'plan', 'strategy', 'concept', 'execution', 'roadmap', 'person', 'brainstorm', 'design', 'steps'],
    back: ground() + blob(120, 106, 76, 0.12) + bulb(120, 96, 26) + arrowRight(180, 120, 44),
    cast: [{ spec: { ...P.bustExplain, flip: true }, rect: { x: 6, y: 128, w: 122, h: 144 } }],
    front: checklistCard(236, 78, 132, 130, 2, 4),
  },
  {
    slug: 'peep-money-and-savings',
    title: 'Cost saving with a person',
    keywords: ['cost', 'saving', 'money', 'budget', 'finance', 'roi', 'person', 'efficiency', 'value', 'profit'],
    back: ground() + blob(272, 128, 88, 0.12) + coinStack(238, 196, 26, 4) + coinStack(306, 200, 21, 3),
    cast: [{ spec: P.bustPocket, rect: BUST_L }],
  },
  {
    slug: 'peep-quality-approved',
    title: 'Quality approved',
    keywords: ['quality', 'approved', 'check', 'verified', 'done', 'standard', 'person', 'review', 'pass', 'confidence'],
    back: ground() + blob(272, 124, 84, 0.12) +
      `<circle cx="274" cy="122" r="52" fill="${ACCENT}"/>` +
      `<path d="M250 122 l16 18 l32 -38" fill="none" stroke="${WHITE}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`,
    cast: [{ spec: P.presenter, rect: FULL_L }],
  },
  {
    slug: 'peep-maze-navigation',
    title: 'Navigating complexity',
    keywords: ['maze', 'complexity', 'navigate', 'challenge', 'path', 'problem', 'person', 'route', 'strategy', 'solve'],
    back: ground() + blob(266, 122, 90, 0.08) +
      `<path d="M190 62 h150 v146 h-150 Z" fill="none" stroke="${LIGHT}" stroke-width="10"/>` +
      `<path d="M212 84 h108 v40 h-72 v40 h72 v22" fill="none" stroke="${MID}" stroke-width="8" stroke-linecap="round"/>` +
      `<path d="M212 200 h44 v-38" fill="none" stroke="${ACCENT}" stroke-width="6" stroke-dasharray="9 8" stroke-linecap="round"/>`,
    cast: [{ spec: P.bustShrug, rect: BUST_L }],
  },
  {
    slug: 'peep-signal-vs-noise',
    title: 'Signal above the noise',
    keywords: ['signal', 'noise', 'focus', 'clarity', 'priority', 'filter', 'person', 'attention', 'insight', 'distraction'],
    back: ground() + blob(268, 128, 90, 0.08) +
      Array.from({ length: 11 }, (_, i) => line(196 + i * 16, 176, 196 + i * 16, 176 - (i === 5 ? 96 : 14 + ((i * 37) % 34)), i === 5 ? ACCENT : LIGHT, i === 5 ? 8 : 5)).join(''),
    cast: [{ spec: P.bustArms, rect: BUST_L }],
  },
  {
    slug: 'peep-feedback-loop',
    title: 'Closing the feedback loop',
    keywords: ['feedback', 'loop', 'iterate', 'improve', 'cycle', 'process', 'people', 'learning', 'review', 'agile'],
    back: ground(200, 276, 156) + blob(200, 116, 88, 0.1) +
      `<path d="M158 116 a48 48 0 1 1 14 34" fill="none" stroke="${ACCENT}" stroke-width="7" stroke-linecap="round"/>` +
      `<path d="M164 138 l10 20 l20 -10 Z" fill="${ACCENT}"/>`,
    cast: [
      { spec: P.bustExplain, rect: { x: 6, y: 130, w: 118, h: 142 } },
      { spec: { ...P.bustPaper, flip: true }, rect: { x: 268, y: 130, w: 118, h: 142 } },
    ],
  },
  {
    slug: 'peep-scaling-up',
    title: 'Scaling the operation',
    keywords: ['scaling', 'scale', 'growth', 'expand', 'capacity', 'operations', 'people', 'volume', 'increase', 'demand'],
    back: ground(200, 276, 176) + blob(200, 132, 100, 0.08) + barChart(136, 96, 128, 108, [22, 40, 62, 92, 126]),
    cast: [
      { spec: P.walker, rect: { x: 8, y: 92, w: 96, h: 180 } },
      { spec: { ...P.casual, flip: true }, rect: { x: 288, y: 92, w: 100, h: 180 } },
    ],
  },
];

export const OPENPEEPS_MANIFEST: UndrawEntry[] = SCENES.map(render);
