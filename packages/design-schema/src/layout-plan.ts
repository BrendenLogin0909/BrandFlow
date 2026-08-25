/**
 * LayoutPlan — the hand-off between stage 2 (art direction, AI) and stage 3
 * (compositor, deterministic code) of the composition pipeline, and the thing
 * stage 4 (the critic) adjusts. See docs/18-design-system-and-pipeline.md §4.
 *
 * A plan describes STRUCTURE ON THE GRID and nothing else: no pixels, no font
 * sizes, no raw colours. That is the whole point — a model that cannot emit a
 * pixel value cannot break the grid, and a critic that can only move regions
 * between cells cannot un-align a page it was asked to improve.
 *
 * NOTE FOR THE PIPELINE BRANCHES: stages 2 and 3 are being built in parallel
 * branches against the same spec section. This file is the single intended
 * home for the type; if another branch also introduced it, converge here.
 */
import { z } from 'zod';

/** Grid dimensions from the design system: 12 columns x 16 rows. */
export const GRID_COLUMNS = 12;
export const GRID_ROWS = 16;

/** Type-scale steps, 1 (display) .. 6 (caption). `emphasis` indexes these. */
export const EMPHASIS_MIN = 1;
export const EMPHASIS_MAX = 6;

/**
 * A page may use at most this many distinct type steps, and must keep at
 * least one step-1-or-2 element — docs/18 §3. This is what forces hierarchy.
 */
export const MAX_DISTINCT_EMPHASIS_PER_PAGE = 4;

export const RegionRole = z.enum([
  'kicker',
  'headline',
  'subhead',
  'body',
  'stat',
  'cta',
  'image',
  'chart',
  'icon',
  'block',
]);
export type RegionRole = z.infer<typeof RegionRole>;

/** Roles that carry copy; at least one must survive every adjustment. */
export const TEXT_ROLES: readonly RegionRole[] = ['kicker', 'headline', 'subhead', 'body', 'stat', 'cta'];

export function isTextRole(role: RegionRole): boolean {
  return TEXT_ROLES.includes(role);
}

export const RegionColour = z.enum(['text', 'primary', 'secondary', 'accent', 'neutral', 'background']);
export type RegionColour = z.infer<typeof RegionColour>;

export const PlanBackground = z.enum(['background', 'primary', 'accent', 'text']);
export type PlanBackground = z.infer<typeof PlanBackground>;

export const SignatureMove = z.enum([
  'bleed-edge',
  'oversized-numeral',
  'overlap',
  'full-bleed-block',
  'crop-circle',
  'rule-accent',
]);
export type SignatureMove = z.infer<typeof SignatureMove>;

export const GridSpan = z.object({
  start: z.number().int(),
  span: z.number().int(),
});
export type GridSpan = z.infer<typeof GridSpan>;

export const PlanRegion = z.object({
  id: z.string().min(1),
  role: RegionRole,
  col: GridSpan,
  row: GridSpan,
  emphasis: z.number().int().min(EMPHASIS_MIN).max(EMPHASIS_MAX),
  colour: RegionColour.optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  contentRef: z.string().optional(),
  imageQuery: z.string().optional(),
});
export type PlanRegion = z.infer<typeof PlanRegion>;

export const PlanPage = z.object({
  background: PlanBackground,
  regions: z.array(PlanRegion).min(1),
  signatureRegionId: z.string().min(1),
  /** Which of the enumerated moves the signature region carries (docs/18 §5). */
  signatureMove: SignatureMove.optional(),
});
export type PlanPage = z.infer<typeof PlanPage>;

export const LayoutPlan = z.object({
  pages: z.array(PlanPage).min(1),
});
export type LayoutPlan = z.infer<typeof LayoutPlan>;

/** Clamp a grid span to the legal range for its axis (1-based, inclusive). */
export function clampSpan(span: GridSpan, axisLength: number): GridSpan {
  const start = Math.min(Math.max(Math.round(span.start), 1), axisLength);
  const maxSpan = axisLength - start + 1;
  const size = Math.min(Math.max(Math.round(span.span), 1), maxSpan);
  return { start, span: size };
}

export function clampCol(span: GridSpan): GridSpan {
  return clampSpan(span, GRID_COLUMNS);
}

export function clampRow(span: GridSpan): GridSpan {
  return clampSpan(span, GRID_ROWS);
}

export function clampEmphasis(value: number): number {
  return Math.min(Math.max(Math.round(value), EMPHASIS_MIN), EMPHASIS_MAX);
}
