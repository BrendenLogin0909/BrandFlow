/**
 * Composition pipeline stages 1 and 2 — the AI that has the ideas.
 * See docs/18-design-system-and-pipeline.md §2 (rubric), §3 (tokens),
 * §4 (stage interfaces) and §5 (signature moves).
 *
 *   stage 1  runConcept        — the visual idea + the on-page copy. No geometry.
 *   stage 2  runArtDirection   — that idea placed on a 12x16 grid. No pixels.
 *   stage 3  (not here)        — deterministic compositor, packages/layout-recipes.
 *
 * Both stages run the violation-guided repair loop the freeform composer and
 * the patch service use (max 2 rounds, violations fed back into the prompt).
 * The schemas below are the guardrails: the model cannot emit a pixel value, a
 * font size or an off-grid cell, because those fields do not exist and the
 * objects are strict. That is what makes stage 3's guarantees mechanical.
 *
 * SCHEMA OWNERSHIP: these Zod schemas duplicate the design-system contract that
 * `@brandflow/design-schema`'s `design-system.ts` will own (docs/18 §3). That
 * module was not yet in main when this was written, so the definitions live
 * here and MUST be de-duplicated against it on merge — delete these and import
 * instead, keeping the review functions below.
 */
import { z } from 'zod';
// The canonical LayoutPlan/ConceptOutput schemas live in @brandflow/design-schema
// (docs/18 section 4) and are what the compositor consumes. The local schemas
// below stay because they add input leniency the canonical ones deliberately do
// not have — type-role aliasing and string clamping, so a near-miss from the
// model costs a normalisation rather than a repair round. The exported TYPES,
// however, are the canonical ones: two structurally identical types with the
// same name are still unrelated to TypeScript, which is exactly the drift the
// spec exists to prevent.
import type { CanvasSize, TypeEmphasis } from '@brandflow/design-schema';
import {
  ConceptOutput as CanonicalConceptOutput,
  LayoutPlan as CanonicalLayoutPlan,
  emphasisCellDeficit,
  emphasisFitsCell,
  typeSize,
} from '@brandflow/design-schema';
import { LINKEDIN_CANVAS_PRESETS, formatVisualDirectionBrief } from '@brandflow/shared';
import type { AiCompletionMeta, AiProviderPort } from '../ports/index.js';

// ---------- design-system vocabulary (docs/18 §3 + §5) ----------

/** 12 columns x 16 rows inside the safe area. Cells are the only geometry. */
export const GRID_COLUMNS = 12;
export const GRID_ROWS = 16;
/** A page may use at most 4 of the 6 type steps (docs/18 §3). */
export const MAX_TYPE_STEPS_PER_PAGE = 4;
/** ...and must include at least one step-1-or-2 element. */
export const MAX_EMPHASIS_FOR_HIERARCHY = 2;
/** >= 75% canvas coverage, no accidental dead bands (docs/18 §6). */
export const MIN_ROWS_COVERED = Math.ceil(GRID_ROWS * 0.75);

export const SIGNATURE_MOVES = [
  'bleed-edge',
  'oversized-numeral',
  'overlap',
  'full-bleed-block',
  'crop-circle',
  'rule-accent',
] as const;
export type SignatureMove = (typeof SIGNATURE_MOVES)[number];

/** The 6-step type scale, referenced by name only — never a size. */
export const TYPE_ROLES = ['display', 'headline', 'subhead', 'bodyLarge', 'body', 'caption'] as const;
export type TypeRole = (typeof TYPE_ROLES)[number];

export const REGISTERS = ['bold', 'calm', 'urgent', 'playful', 'authoritative'] as const;

export const REGION_ROLES = [
  'kicker', 'headline', 'subhead', 'body', 'stat', 'cta', 'image', 'chart', 'icon', 'block',
] as const;
export type RegionRole = (typeof REGION_ROLES)[number];

/** Roles that carry copy — the ones that need a contentRef and must not collide. */
export const TEXT_REGION_ROLES: readonly RegionRole[] = ['kicker', 'headline', 'subhead', 'body', 'stat', 'cta'];

export const COLOUR_TOKENS = ['text', 'primary', 'secondary', 'accent', 'neutral', 'background'] as const;
export const BACKGROUND_TOKENS = ['background', 'primary', 'accent', 'text'] as const;

/** Which region role each move needs to be executable by the compositor. */
const MOVE_REQUIRES_ROLE: Partial<Record<SignatureMove, RegionRole>> = {
  'oversized-numeral': 'stat',
  'crop-circle': 'image',
  'full-bleed-block': 'block',
  'rule-accent': 'headline',
};

// ---------- schema helpers ----------

/**
 * Providers ignore maxLength in tool schemas, so length is clamped rather than
 * rejected — a 300-character headline is a formatting problem, not a reason to
 * burn a repair round. Mirrors packages/shared/src/visual-direction.ts.
 */
const clamped = (n: number) =>
  z
    .string()
    .min(1)
    .transform((s) => {
      const t = s.trim();
      return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
    });

/** Ids are truncated, never ellipsised — signatureRegionId must still match. */
const clampedId = (n: number) =>
  z
    .string()
    .min(1)
    .transform((s) => s.trim().slice(0, n));

/**
 * `TypeRole` is named but not defined in docs/18 §4; it is read here as the
 * §3 type-scale step names. Common semantic aliases are normalised instead of
 * rejected so a near-miss does not cost a repair round.
 */
const TYPE_ROLE_ALIASES: Record<string, TypeRole> = {
  title: 'headline', hook: 'headline', heading: 'headline', h1: 'headline',
  subheadline: 'subhead', subtitle: 'subhead', slidetitle: 'subhead',
  kicker: 'caption', eyebrow: 'caption', label: 'caption', source: 'caption', footnote: 'caption',
  stat: 'display', number: 'display', numeral: 'display', big: 'display',
  quote: 'bodyLarge', pullquote: 'bodyLarge', lead: 'bodyLarge', intro: 'bodyLarge',
  cta: 'body', bullet: 'body', list: 'body', bodysmall: 'body', paragraph: 'body',
};

// transform().pipe() rather than preprocess(): preprocess widens the inferred
// output to unknown, which would leak `role: unknown` all the way into
// ConceptOutputT and break every consumer's typing.
export const TypeRoleSchema = z
  .string()
  .transform((v) =>
    (TYPE_ROLES as readonly string[]).includes(v)
      ? v
      : (TYPE_ROLE_ALIASES[v.toLowerCase().replace(/[^a-z]/g, '')] ?? v),
  )
  .pipe(z.enum(TYPE_ROLES));

/** A 1-indexed run of grid cells that must stay inside the track. */
const gridSpan = (max: number, axis: 'column' | 'row') =>
  z
    .object({
      start: z.number().int().min(1).max(max),
      span: z.number().int().min(1).max(max),
    })
    .strict()
    .refine((v) => v.start + v.span - 1 <= max, {
      message: `${axis} start + span must stay inside ${axis}s 1-${max}`,
    });

// ---------- stage 1: ConceptOutput (docs/18 §4) ----------

export const ConceptOutput = z
  .object({
    /** The single message, one sentence. */
    bigIdea: clamped(220),
    /** The visual idea carrying it. */
    metaphor: clamped(220),
    /** What must dominate the page — nameable in three words. */
    focalPoint: clamped(60),
    register: z.enum(REGISTERS),
    /** Exactly one. A single value, never a list — two moves is noise. */
    signatureMove: z.enum(SIGNATURE_MOVES),
    pages: z
      .array(
        z
          .object({
            purpose: clamped(200),
            copy: z
              .array(z.object({ role: TypeRoleSchema, text: clamped(280) }).strict())
              .min(1)
              .max(8),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict()
  .pipe(CanonicalConceptOutput);

export type ConceptOutputT = z.infer<typeof CanonicalConceptOutput>;

// ---------- stage 2: LayoutPlan (docs/18 §4) ----------

export const LayoutRegion = z
  .object({
    id: clampedId(40),
    role: z.enum(REGION_ROLES),
    col: gridSpan(GRID_COLUMNS, 'column'),
    row: gridSpan(GRID_ROWS, 'row'),
    /** Maps to the type scale. Not a font size — there is no font size. */
    emphasis: z.number().int().min(1).max(6),
    colour: z.enum(COLOUR_TOKENS).optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
    /** 0-based index of the copy item on the same concept page, as a string. */
    contentRef: clampedId(8).optional(),
    imageQuery: clamped(60).optional(),
  })
  // strict is the guardrail that rejects x/y/width/height/fontSize/hex — the
  // model cannot break the grid because off-grid fields do not exist.
  .strict();
export type LayoutRegionT = z.infer<typeof LayoutRegion>;

export const LayoutPage = z
  .object({
    background: z.enum(BACKGROUND_TOKENS),
    regions: z.array(LayoutRegion).min(1).max(14),
    signatureRegionId: clampedId(40),
  })
  .strict()
  .superRefine((page, ctx) => {
    const ids = page.regions.map((r) => r.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['regions'], message: `duplicate region ids: ${[...new Set(dupes)].join(', ')}` });

    if (!ids.includes(page.signatureRegionId))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['signatureRegionId'],
        message: `signatureRegionId "${page.signatureRegionId}" does not name a region on this page`,
      });

    // docs/18 §3: at most 4 of the 6 type steps on a page...
    const steps = new Set(
      page.regions.filter((r) => TEXT_REGION_ROLES.includes(r.role)).map((r) => r.emphasis),
    );
    if (steps.size > MAX_TYPE_STEPS_PER_PAGE)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['regions'],
        message: `a page may use at most ${MAX_TYPE_STEPS_PER_PAGE} of the 6 type steps; this page uses ${steps.size} (${[...steps].sort().join(', ')})`,
      });

    // ...and at least one step-1-or-2 element. This is what forces hierarchy.
    if (!page.regions.some((r) => r.emphasis <= MAX_EMPHASIS_FOR_HIERARCHY))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['regions'],
        message: 'every page needs at least one region at emphasis 1 or 2 — without it there is no focal point',
      });
  });

export const LayoutPlan = z
  .object({ pages: z.array(LayoutPage).min(1).max(20) })
  .strict()
  // Normalise leniently, then validate against the canonical schema so the
  // parsed value IS the canonical type rather than a look-alike.
  .pipe(CanonicalLayoutPlan);
export type LayoutPlanT = z.infer<typeof CanonicalLayoutPlan>;

// ---------- the rubric, mechanised (docs/18 §2) ----------

const STOCK_PHRASES = [
  "in today's fast-paced world", 'in a world where', "let's dive in", 'lets dive in', 'dive deep',
  'unlock', 'supercharge', 'elevate your', 'game-changer', 'game changer', 'seamless',
  'revolutionise', 'revolutionize', 'harness the power', 'the secret to', 'at the end of the day',
  'next level', 'synergy', 'move the needle', 'low-hanging fruit', 'best practices',
  'thought leader', 'in this article', 'without further ado',
];

const CLICHE_METAPHORS = [
  'light bulb', 'lightbulb', 'puzzle piece', 'jigsaw', 'handshake', 'iceberg', 'chess',
  'ladder', 'staircase', 'mountain summit', 'climbing a mountain', 'finish line', 'domino',
  'gears turning', 'cogs', 'magnifying glass', 'maze', 'tug of war', 'needle in a haystack',
  'growing tree', 'seedling', 'rocket', 'blast off', 'crystal ball', 'tip of the iceberg',
  'journey', 'roadmap', 'north star',
];

const hits = (text: string, needles: string[]): string[] => {
  const lower = text.toLowerCase();
  return needles.filter((n) => lower.includes(n));
};

const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

const sentenceCount = (s: string): number =>
  s.trim().split(/[.!?]+(?:\s+|$)/).filter((p) => p.trim().length > 0).length;

export interface ConceptReviewContext {
  /** Pages the set is expected to have. */
  pageCount?: number;
  /** Brand style-guide banned phrases. */
  bannedPhrases?: string[];
}

/**
 * The anti-generic gate for stage 1. Everything here is fed back verbatim as a
 * repair instruction, so each message names the fix, not just the fault.
 */
export function reviewConcept(concept: ConceptOutputT, ctx: ConceptReviewContext = {}): string[] {
  const v: string[] = [];

  if (wordCount(concept.focalPoint) > 3)
    v.push(`focalPoint "${concept.focalPoint}" is ${wordCount(concept.focalPoint)} words — it must be nameable in three words or fewer. Decide what actually dominates.`);

  if (sentenceCount(concept.bigIdea) > 1)
    v.push('bigIdea must be ONE sentence stating a single claim — split or cut until one sentence carries it.');

  const idea = hits(concept.bigIdea, STOCK_PHRASES);
  if (idea.length) v.push(`bigIdea uses stock phrasing (${idea.join(', ')}) — rewrite it in the brand's own concrete words.`);

  const cliche = [...new Set([...hits(concept.metaphor, CLICHE_METAPHORS), ...hits(concept.focalPoint, CLICHE_METAPHORS)])];
  if (cliche.length)
    v.push(`the metaphor is an exhausted one (${cliche.join(', ')}) — replace it with an image specific to this brand and this post.`);

  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  if (normalise(concept.metaphor) === normalise(concept.bigIdea))
    v.push('metaphor just restates bigIdea — it must be a picture, not a paraphrase.');

  if (ctx.pageCount && concept.pages.length !== ctx.pageCount)
    v.push(`the set needs exactly ${ctx.pageCount} page(s); you returned ${concept.pages.length}.`);

  concept.pages.forEach((page, i) => {
    const n = i + 1;
    const roles = new Set(page.copy.map((c) => c.role));
    if (roles.size > MAX_TYPE_STEPS_PER_PAGE)
      v.push(`page ${n} uses ${roles.size} type roles — at most ${MAX_TYPE_STEPS_PER_PAGE} per page.`);
    if (!page.copy.some((c) => c.role === 'display' || c.role === 'headline'))
      v.push(`page ${n} has no display or headline copy — every page needs one dominant line.`);

    page.copy.forEach((c, j) => {
      const stock = hits(c.text, STOCK_PHRASES);
      if (stock.length) v.push(`page ${n} copy[${j}] uses stock phrasing (${stock.join(', ')}) — say the specific thing instead.`);
      const banned = ctx.bannedPhrases?.length ? hits(c.text, ctx.bannedPhrases.map((p) => p.toLowerCase())) : [];
      if (banned.length) v.push(`page ${n} copy[${j}] contains a banned brand phrase (${banned.join(', ')}).`);
      if ((c.role === 'headline' || c.role === 'display') && wordCount(c.text) > 10)
        v.push(`page ${n} copy[${j}] is a ${c.role} of ${wordCount(c.text)} words — 8 or fewer, it has to land at a glance.`);
      if ((c.role === 'body' || c.role === 'bodyLarge') && wordCount(c.text) > 24)
        v.push(`page ${n} copy[${j}] is ${wordCount(c.text)} words — cut it to 20 or fewer.`);
    });
  });

  return v;
}

const overlaps = (a: LayoutRegionT, b: LayoutRegionT): boolean =>
  a.col.start <= b.col.start + b.col.span - 1 &&
  b.col.start <= a.col.start + a.col.span - 1 &&
  a.row.start <= b.row.start + b.row.span - 1 &&
  b.row.start <= a.row.start + a.row.span - 1;

/** Geometry only: two pages with the same skeleton ARE the same structure. */
const structureFingerprint = (regions: LayoutRegionT[]): string =>
  regions
    .map((r) => `${r.col.start}/${r.col.span}:${r.row.start}/${r.row.span}`)
    .sort()
    .join('|');

/** What `reviewLayoutPlan` checks emphasis-fit against when the caller has no
 *  exact pixel canvas to hand — the reference canvas docs/18 §3 quotes every
 *  token against, and the pipeline's own default (docs/18 §4, `canvasFor`). */
const DEFAULT_REVIEW_CANVAS: CanvasSize = LINKEDIN_CANVAS_PRESETS.portrait;

/**
 * The art-director gate for stage 2 — the section 2 rubric expressed as checks
 * the compositor can rely on: coverage, no colliding copy, deliberate
 * asymmetry, page-to-page variety, and a signature move that is executable.
 *
 * `canvas` defaults to the portrait preset (the pipeline's own default) so
 * existing two-argument callers keep working; pass the plan's real canvas
 * when it is known so the emphasis-fit check (P2.A, docs/20 §B) measures
 * against the geometry the compositor will actually build.
 */
export function reviewLayoutPlan(
  plan: LayoutPlanT,
  concept: ConceptOutputT,
  canvas: CanvasSize = DEFAULT_REVIEW_CANVAS,
): string[] {
  const v: string[] = [];

  if (plan.pages.length !== concept.pages.length)
    v.push(`the concept has ${concept.pages.length} page(s); the plan has ${plan.pages.length}. Lay out every concept page, in order.`);

  const needRole = MOVE_REQUIRES_ROLE[concept.signatureMove];

  plan.pages.forEach((page, i) => {
    const n = i + 1;
    const copy = concept.pages[i]?.copy ?? [];

    // --- active whitespace vs. dead bands: >= 75% of the rows in use ---
    const rows = new Set<number>();
    for (const r of page.regions)
      for (let y = r.row.start; y <= r.row.start + r.row.span - 1; y++) rows.add(y);
    if (rows.size < MIN_ROWS_COVERED)
      v.push(`page ${n} occupies only ${rows.size} of ${GRID_ROWS} rows — leftover empty rows read as unfinished. Use at least ${MIN_ROWS_COVERED}, and put the emptiness where you want it.`);

    // --- copy regions must not collide (the signature region may overlap) ---
    const text = page.regions.filter((r) => TEXT_REGION_ROLES.includes(r.role));
    for (let a = 0; a < text.length; a++)
      for (let b = a + 1; b < text.length; b++) {
        const [x, y] = [text[a]!, text[b]!];
        if (x.id === page.signatureRegionId || y.id === page.signatureRegionId) continue;
        if (overlaps(x, y))
          v.push(`page ${n} regions "${x.id}" and "${y.id}" occupy the same cells — only the signature region may overlap.`);
      }

    // --- deliberate asymmetry: not a stack of full-width bands ---
    if (page.regions.length >= 4 && page.regions.every((r) => r.col.start === 1 && r.col.span === GRID_COLUMNS))
      v.push(`page ${n} is ${page.regions.length} full-width bands stacked down the page — that is the default that makes every post look the same. Split the columns and put the weight off-centre.`);

    // --- copy placement contract: every item placed exactly once ---
    const used = new Map<number, string[]>();
    for (const r of page.regions) {
      if (!TEXT_REGION_ROLES.includes(r.role)) {
        if (r.role === 'image' && !r.imageQuery)
          v.push(`page ${n} image region "${r.id}" has no imageQuery — 2-5 words naming the subject.`);
        continue;
      }
      if (r.contentRef === undefined) {
        v.push(`page ${n} region "${r.id}" (${r.role}) has no contentRef — set it to the 0-based index of the copy item it shows.`);
        continue;
      }
      const idx = Number(r.contentRef);
      if (!Number.isInteger(idx) || idx < 0 || idx >= copy.length) {
        v.push(`page ${n} region "${r.id}" has contentRef "${r.contentRef}"; this page's copy has indices 0-${copy.length - 1}.`);
        continue;
      }
      used.set(idx, [...(used.get(idx) ?? []), r.id]);
    }
    for (const [idx, regions] of used)
      if (regions.length > 1) v.push(`page ${n} places copy[${idx}] in ${regions.length} regions (${regions.join(', ')}) — each copy item goes in exactly one place.`);
    const missing = copy.map((_, j) => j).filter((j) => !used.has(j));
    if (missing.length)
      v.push(`page ${n} never places copy ${missing.map((j) => `copy[${j}]`).join(', ')} — every written line must appear somewhere or be cut.`);

    // --- the signature move must be executable by the compositor ---
    const sig = page.regions.find((r) => r.id === page.signatureRegionId);
    if (sig && needRole && sig.role !== needRole)
      v.push(`page ${n} signature move "${concept.signatureMove}" needs a "${needRole}" region, but signatureRegionId points at "${sig.id}" (${sig.role}).`);

    // --- P2.A: emphasis must fit its cell (docs/20 §B) ---
    // The law-firm defect: a plan asked for a headline at emphasis 2 (68px) in
    // a 6x2 cell, which does not hold it, and the compositor silently stepped
    // the type down to 30px with nothing anywhere saying so. This is the
    // upstream half of the fix — catch the mismatch in the plan, before it
    // ever reaches the compositor — and it judges "does it fit" with the
    // EXACT SAME predicate (`emphasisFitsCell`) the compositor's own
    // grow-before-shrink step uses, so the two can never disagree about
    // which plans are fine as written.
    for (const r of page.regions) {
      if (!TEXT_REGION_ROLES.includes(r.role)) continue;
      const idx = r.contentRef !== undefined ? Number(r.contentRef) : NaN;
      if (!Number.isInteger(idx) || idx < 0 || idx >= copy.length) continue; // flagged above already
      const text = copy[idx]!.text;
      const emphasis = r.emphasis as TypeEmphasis;
      const letterSpacing = r.role === 'kicker' ? 2 : 0;
      if (emphasisFitsCell(text, emphasis, r.col.span, r.row.span, canvas, letterSpacing)) continue;

      const deficit = emphasisCellDeficit(text, emphasis, r.col.span, r.row.span, canvas, letterSpacing);
      const ask = deficit
        ? [
            deficit.extraRows > 0 ? `${deficit.extraRows} more row${deficit.extraRows === 1 ? '' : 's'}` : null,
            deficit.extraCols > 0 ? `${deficit.extraCols} more column${deficit.extraCols === 1 ? '' : 's'}` : null,
          ]
            .filter((s): s is string => s !== null)
            .join(' and ')
        : 'more room than the whole grid has, even at 12x16';
      v.push(
        `page ${n} region "${r.id}" is emphasis ${emphasis} (${typeSize(emphasis, canvas)}px) but its ` +
          `${r.col.span}x${r.row.span} cell cannot hold its copy at that size — give it ${ask}, or lower the emphasis.`,
      );
    }
  });

  // --- variety across the set (docs/18 §2.7) ---
  const seen = new Map<string, number>();
  plan.pages.forEach((page, i) => {
    const fp = structureFingerprint(page.regions);
    const first = seen.get(fp);
    if (first !== undefined)
      v.push(`page ${i + 1} has the same structure as page ${first + 1} — no two pages in a set may be laid out alike. Change the axis, not just the words.`);
    else seen.set(fp, i);
  });

  // --- the headline-top default ---
  if (plan.pages.length >= 3) {
    const topHeavy = plan.pages.every((page) => {
      const focal = page.regions
        .filter((r) => TEXT_REGION_ROLES.includes(r.role))
        .sort((a, b) => a.emphasis - b.emphasis)[0];
      return !!focal && focal.row.start <= 3;
    });
    if (topHeavy)
      v.push('every page opens with its biggest element in rows 1-3 — that is the headline-top default. Move the focal point low, right or centre on at least one page.');
  }

  return v;
}

// ---------- stage 1 service ----------

/**
 * AiProviderPort takes `z.ZodType<T>`, which requires input and output types to
 * match. These schemas clamp and normalise, so their input type is the raw
 * model output and only the OUTPUT is the domain type — without this the step
 * would resolve to the unclamped input shape. Parsing is unchanged.
 */
const asPortSchema = <S extends z.ZodTypeAny>(schema: S) =>
  schema as unknown as z.ZodType<z.output<S>>;

export interface ConceptRequest {
  /** The post this design is for: idea, copy, on-image text, slides. */
  brief: unknown;
  /** Brand context from buildBrandContext — the only brand data source. */
  brand: unknown;
  /** Visual format hint (VisualFormat). */
  format?: string;
  /** Pages the set should have. */
  pageCount?: number;
  /** Draft-stage visual direction (PostPackage.visualDirection). */
  visualDirection?: Record<string, unknown> | null;
}

export interface StageOptions {
  bannedPhrases?: string[];
  /** Repair rounds, including the first attempt. Default 2 (docs/18 §4). */
  maxAttempts?: number;
}

export interface ConceptResult {
  concept: ConceptOutputT;
  meta: AiCompletionMeta;
  /** Rubric violations still outstanding — empty when the concept is clean. */
  violations: string[];
  needsAttention: boolean;
  attempts: number;
}

/**
 * Stage 1. Returns the clean concept, or the closest attempt flagged
 * `needsAttention`; null only when no attempt produced parseable output.
 */
export async function runConcept(
  ai: AiProviderPort,
  request: ConceptRequest,
  opts: StageOptions = {},
): Promise<ConceptResult | null> {
  const maxAttempts = opts.maxAttempts ?? 2;
  const brief = formatVisualDirectionBrief(request.visualDirection ?? undefined);
  let violations: string[] = [];
  let best: ConceptResult | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { data, meta } = await ai.complete(
        'design_concept',
        {
          brief: request.brief,
          brand: request.brand,
          format: request.format,
          pageCount: request.pageCount,
          ...(brief ? { visualDirection: brief } : {}),
          ...(attempt > 0 ? { violations } : {}),
        },
        asPortSchema(ConceptOutput),
      );

      const found = reviewConcept(data, { pageCount: request.pageCount, bannedPhrases: opts.bannedPhrases });
      const result: ConceptResult = {
        concept: data,
        meta,
        violations: found,
        needsAttention: found.length > 0,
        attempts: attempt + 1,
      };
      if (found.length === 0) return result;
      violations = found;
      if (!best || found.length < best.violations.length) best = result;
    } catch (err) {
      violations = [String(err)];
    }
  }
  return best;
}

// ---------- stage 2 service ----------

export interface ArtDirectionRequest {
  concept: ConceptOutputT;
  /** Brand context from buildBrandContext. */
  brand: unknown;
  format?: string;
  canvasPreset?: 'square' | 'portrait' | 'landscape';
  /**
   * The exact pixel canvas the compositor will build against — pass it when
   * known so the emphasis-fit check (P2.A) measures the same geometry stage 3
   * will. Falls back to `canvasPreset` (then the portrait default) when
   * omitted, which is coarser: `canvasPreset` only distinguishes square from
   * portrait/landscape, not the two non-square presets from each other.
   */
  canvas?: CanvasSize;
}

export interface ArtDirectionResult {
  plan: LayoutPlanT;
  meta: AiCompletionMeta;
  violations: string[];
  needsAttention: boolean;
  attempts: number;
}

/**
 * Stage 2. Same contract as stage 1: clean plan, or the closest attempt
 * flagged `needsAttention`; null only when nothing parseable came back.
 */
export async function runArtDirection(
  ai: AiProviderPort,
  request: ArtDirectionRequest,
  opts: StageOptions = {},
): Promise<ArtDirectionResult | null> {
  const maxAttempts = opts.maxAttempts ?? 2;
  let violations: string[] = [];
  let best: ArtDirectionResult | null = null;
  const canvas = request.canvas ?? LINKEDIN_CANVAS_PRESETS[request.canvasPreset ?? 'portrait'];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { data, meta } = await ai.complete(
        'design_art_direction',
        {
          concept: request.concept,
          brand: request.brand,
          format: request.format,
          canvasPreset: request.canvasPreset,
          ...(attempt > 0 ? { violations } : {}),
        },
        asPortSchema(LayoutPlan),
      );

      const found = reviewLayoutPlan(data, request.concept, canvas);
      const result: ArtDirectionResult = {
        plan: data,
        meta,
        violations: found,
        needsAttention: found.length > 0,
        attempts: attempt + 1,
      };
      if (found.length === 0) return result;
      violations = found;
      if (!best || found.length < best.violations.length) best = result;
    } catch (err) {
      violations = [String(err)];
    }
  }
  return best;
}
