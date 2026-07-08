import { z } from 'zod';

const clamp = (n: number) =>
  z.string().transform((s) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s));

/** Rich visual-direction brief produced at draft stage (Agent 9, backlog #1). */
export const VisualDirectionSchema = z.object({
  scene: clamp(200).optional(),
  metaphor: clamp(200).optional(),
  mood: clamp(120).optional(),
  compositionHints: clamp(400).optional(),
  colourMood: clamp(120).optional(),
  illustrationStyle: clamp(120).optional(),
});
export type VisualDirection = z.infer<typeof VisualDirectionSchema>;

/** Non-empty fields only — safe to append to compose/patch prompts. */
export function formatVisualDirectionBrief(vd: VisualDirection | null | undefined): string | null {
  if (!vd) return null;
  const parts = [
    vd.scene && `Scene: ${vd.scene}`,
    vd.metaphor && `Metaphor: ${vd.metaphor}`,
    vd.mood && `Mood: ${vd.mood}`,
    vd.compositionHints && `Composition: ${vd.compositionHints}`,
    vd.colourMood && `Colour mood: ${vd.colourMood}`,
    vd.illustrationStyle && `Illustration style: ${vd.illustrationStyle}`,
  ].filter(Boolean);
  return parts.length ? parts.join('\n') : null;
}
