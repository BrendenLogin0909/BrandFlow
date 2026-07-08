/**
 * PlaygroundSource — the studio session envelope saved alongside a
 * DesignDraft/DesignDocument so the Design Studio can restore its controls
 * exactly. `mode` is the load-bearing field (docs/17-design-editing-plan.md
 * §4.3): everything else is engine-specific (recipe ids, slot fills, brand
 * overrides) and lives in packages/layout-recipes, which depends on this
 * package — so it stays loosely typed here to avoid a reverse dependency.
 */
import { z } from 'zod';

/**
 * 'recipe'    — slot edits regenerate layout deterministically.
 * 'freeform'  — AI composed the full layout; edits are direct/AI-patched.
 * 'hybrid'    — a recipe doc where the user has manually moved/resized an
 *               element; slot text still updates bound elements but geometry
 *               is manual/AI only from this point on.
 */
export const PlaygroundMode = z.enum(['recipe', 'freeform', 'hybrid']);
export type PlaygroundMode = z.infer<typeof PlaygroundMode>;

export const LinkedIdeaRef = z.object({
  id: z.string().optional(),
  title: z.string(),
  angle: z.string().nullable().optional(),
  objective: z.string().optional(),
});
export type LinkedIdeaRef = z.infer<typeof LinkedIdeaRef>;

/**
 * `.passthrough()` so recipe/variant/fill/brand/font fields (owned by
 * layout-recipes and the web app) round-trip untouched; only `mode` and the
 * linked-idea shape are validated here.
 */
export const PlaygroundSource = z
  .object({
    mode: PlaygroundMode.default('recipe'),
    idea: LinkedIdeaRef.nullable().optional(),
  })
  .passthrough();
export type PlaygroundSource = z.infer<typeof PlaygroundSource>;

/** Parse unknown data as a playground source; missing/invalid `mode` defaults to 'recipe'. */
export function parsePlaygroundSource(data: unknown): PlaygroundSource {
  return PlaygroundSource.parse(data ?? {});
}
