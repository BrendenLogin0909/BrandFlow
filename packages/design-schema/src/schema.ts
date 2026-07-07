/**
 * InternalDesignDocument — the vendor-neutral, authoritative design format.
 * Zod schemas are the single source of truth; parse failures mean the
 * document can never be stored or rendered. See docs/09-design-generation-schema.md.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 1;

// ---------- Supporting types ----------

export const BrandColourToken = z.enum([
  'primary',
  'secondary',
  'accent',
  'neutral',
  'background',
  'text',
]);

export const Colour = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('token'),
    token: z.union([BrandColourToken, z.string().regex(/^custom:[\w-]+$/)]),
  }),
  z.object({
    kind: z.literal('raw'),
    hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    allowedOverride: z.boolean().default(false),
  }),
]);
export type Colour = z.infer<typeof Colour>;

export const Gradient = z.object({
  kind: z.literal('gradient'),
  stops: z.array(z.object({ at: z.number().min(0).max(1), colour: Colour })).min(2).max(5),
  angle: z.number().min(0).max(360),
});

export const ImageFill = z.object({
  kind: z.literal('imageFill'),
  assetId: z.string(),
  tint: Colour.optional(),
});

export const Fill = z.union([Colour, Gradient, ImageFill]);
export type Fill = z.infer<typeof Fill>;

export const Insets = z.object({
  top: z.number().min(0),
  right: z.number().min(0),
  bottom: z.number().min(0),
  left: z.number().min(0),
});
export type Insets = z.infer<typeof Insets>;

export const Frame = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().finite(),
  height: z.number().positive().finite(),
  rotation: z.number().min(-360).max(360).default(0),
});
export type Frame = z.infer<typeof Frame>;

export const BrandTokenReference = z.object({
  category: z.enum(['colour', 'font', 'logo', 'spacing']),
  token: z.string().min(1),
});

export const RoleHint = z.enum([
  'headline',
  'subheadline',
  'body',
  'caption',
  'logo',
  'icon',
  'badge',
  'decoration',
  'background',
  'cta',
  'attribution',
  'data',
  'divider',
  'image',
]);
export type RoleHint = z.infer<typeof RoleHint>;

// ---------- Elements ----------

const ElementBase = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  frame: Frame,
  opacity: z.number().min(0).max(1).default(1),
  locked: z.boolean().default(false),
  visible: z.boolean().default(true),
  zIndex: z.number().int(),
  roleHint: RoleHint.nullable().default(null),
  tokenRefs: z.array(BrandTokenReference).default([]),
  recipeSlotId: z.string().nullable().default(null),
  meta: z.record(z.unknown()).default({}),
});

export const TextElement = ElementBase.extend({
  type: z.literal('text'),
  text: z.string().min(1).max(2000),
  fontFamily: z.string().min(1),
  fontSize: z.number().min(8).max(400),
  fontWeight: z.number().int().min(100).max(900).default(400),
  fontStyle: z.enum(['normal', 'italic']).default('normal'),
  lineHeight: z.number().min(0.8).max(3).default(1.2),
  letterSpacing: z.number().min(-5).max(20).default(0),
  align: z.enum(['left', 'center', 'right']).default('left'),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).default('top'),
  colour: Colour,
  maxLines: z.number().int().positive().optional(),
  autoFit: z.boolean().default(false),
});
export type TextElement = z.infer<typeof TextElement>;

export const ImageElement = ElementBase.extend({
  type: z.literal('image'),
  assetId: z.string().optional(),
  src: z.string().url().optional(),
  fit: z.enum(['cover', 'contain', 'fill']).default('cover'),
  cropRect: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .optional(),
  cornerRadius: z.number().min(0).default(0),
  borderColour: Colour.optional(),
  borderWidth: z.number().min(0).default(0),
  isPlaceholder: z.boolean().default(false),
});
export type ImageElement = z.infer<typeof ImageElement>;

export const IconElement = ElementBase.extend({
  type: z.literal('icon'),
  iconRef: z.object({
    provider: z.enum(['lucide', 'tabler', 'internal', 'custom']),
    name: z.string().min(1),
    svg: z.string().optional(),
  }),
  colour: Colour,
  strokeWidth: z.number().min(0.5).max(6).default(2),
});
export type IconElement = z.infer<typeof IconElement>;

export const ShapeElement = ElementBase.extend({
  type: z.literal('shape'),
  shape: z.enum(['rect', 'ellipse', 'line', 'triangle', 'arrow', 'polygon']),
  fill: Fill,
  stroke: Colour.optional(),
  strokeWidth: z.number().min(0).default(0),
  cornerRadius: z.number().min(0).default(0),
  points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
});
export type ShapeElement = z.infer<typeof ShapeElement>;

export const ChartElement = ElementBase.extend({
  type: z.literal('chart'),
  chartType: z.enum(['bar', 'donut', 'progress', 'stat']),
  data: z
    .array(z.object({ label: z.string().max(60), value: z.number().finite() }))
    .min(1)
    .max(12),
  palette: z.array(BrandTokenReference).min(1),
});
export type ChartElement = z.infer<typeof ChartElement>;

// Groups nest; bound depth via lazy schema + explicit depth check in validation.
export type GroupElement = z.infer<typeof ElementBase> & {
  type: 'group';
  children: Element[];
};
export type Element =
  | TextElement
  | ImageElement
  | IconElement
  | ShapeElement
  | ChartElement
  | GroupElement;

export const ElementSchema: z.ZodType<Element> = z.lazy(() =>
  z.discriminatedUnion('type', [
    TextElement,
    ImageElement,
    IconElement,
    ShapeElement,
    ChartElement,
    ElementBase.extend({
      type: z.literal('group'),
      children: z.array(ElementSchema).min(1).max(30),
    }),
  ]),
) as z.ZodType<Element>;

// ---------- Pages & document ----------

export const Page = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  background: Fill,
  safeArea: Insets,
  elements: z.array(ElementSchema).min(1).max(60),
});
export type Page = z.infer<typeof Page>;

export const LayoutRecipeRef = z.object({
  recipeId: z.string().min(1),
  recipeVersion: z.number().int().positive(),
  variant: z.string().min(1),
});

export const BrandTokensSnapshot = z.object({
  colours: z.record(z.string().regex(/^#[0-9a-fA-F]{6}$/)),
  fonts: z.object({
    heading: z.string().min(1),
    body: z.string().min(1),
    accent: z.string().optional(),
  }),
  logoAssetIds: z.array(z.string()).default([]),
});
export type BrandTokensSnapshot = z.infer<typeof BrandTokensSnapshot>;

export const InternalDesignDocument = z.object({
  id: z.string().uuid(),
  schemaVersion: z.literal(SCHEMA_VERSION),
  version: z.number().int().positive(),
  brandProfileId: z.string().min(1),
  clientCompanyId: z.string().min(1),
  layoutRecipeRef: LayoutRecipeRef,
  format: z.string().min(1),
  canvas: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    unit: z.literal('px'),
    dpi: z.number().int().positive().default(96),
  }),
  brandTokens: BrandTokensSnapshot,
  pages: z.array(Page).min(1).max(20),
  /**
   * Licence credits required by auto-filled assets (e.g. CC-BY photos). Set by
   * the asset pipeline; rendered as a small credits line on export. Optional
   * so recipe designs and pre-existing documents parse unchanged.
   */
  attributions: z.array(z.string()).optional(),
});
export type InternalDesignDocument = z.infer<typeof InternalDesignDocument>;

/** Parse unknown data into a document; throws ZodError with violation details. */
export function parseDesignDocument(data: unknown): InternalDesignDocument {
  return InternalDesignDocument.parse(data);
}
