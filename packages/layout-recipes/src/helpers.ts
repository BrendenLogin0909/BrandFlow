/** Element factory helpers shared by recipe layout functions. */
import type {
  Colour,
  Element,
  Fill,
  IconElement,
  InternalDesignDocument,
  Page,
  RoleHint,
  ShapeElement,
  TextElement,
} from '@brandflow/design-schema';
import { SCHEMA_VERSION, fitFontSize } from '@brandflow/design-schema';
import type { LayoutContext, LayoutRecipe } from './types.js';

export const token = (t: string): Colour => ({ kind: 'token', token: t as never });

export interface TextOpts {
  role: RoleHint;
  slotId?: string;
  font: string;
  size: number;
  minSize?: number;
  weight?: number;
  colour?: Colour;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  z: number;
}

/** Creates a text element, auto-stepping the font down (never below role minimum) to fit. */
export function text(
  ctx: LayoutContext,
  content: string,
  frame: { x: number; y: number; width: number; height: number },
  o: TextOpts,
): TextElement {
  const lineHeight = o.lineHeight ?? 1.25;
  const fitted =
    fitFontSize(content, o.size, o.minSize ?? Math.min(o.size, 14), lineHeight, frame.width, frame.height) ??
    o.minSize ??
    14;
  return {
    type: 'text',
    id: ctx.newId(),
    name: o.role ?? 'text',
    frame: { ...frame, rotation: 0 },
    opacity: 1,
    locked: false,
    visible: true,
    zIndex: o.z,
    roleHint: o.role,
    tokenRefs: [{ category: 'font', token: o.font === ctx.brandTokens.fonts.heading ? 'heading' : 'body' }],
    recipeSlotId: o.slotId ?? null,
    meta: {},
    text: content,
    fontFamily: o.font,
    fontSize: fitted,
    fontWeight: o.weight ?? 400,
    fontStyle: 'normal',
    lineHeight,
    letterSpacing: 0,
    align: o.align ?? 'left',
    verticalAlign: 'top',
    colour: o.colour ?? token('text'),
    autoFit: true,
  };
}

export function icon(
  ctx: LayoutContext,
  name: string,
  frame: { x: number; y: number; width: number; height: number },
  o: { colour?: Colour; z: number; slotId?: string; provider?: 'lucide' | 'tabler' | 'internal' },
): IconElement {
  return {
    type: 'icon',
    id: ctx.newId(),
    name: `icon:${name}`,
    frame: { ...frame, rotation: 0 },
    opacity: 1,
    locked: false,
    visible: true,
    zIndex: o.z,
    roleHint: 'icon',
    tokenRefs: [{ category: 'colour', token: 'accent' }],
    recipeSlotId: o.slotId ?? null,
    meta: {},
    iconRef: { provider: o.provider ?? 'lucide', name },
    colour: o.colour ?? token('accent'),
    strokeWidth: 2,
  };
}

export function shape(
  ctx: LayoutContext,
  kind: ShapeElement['shape'],
  frame: { x: number; y: number; width: number; height: number },
  o: { fill: Fill; z: number; role?: RoleHint; cornerRadius?: number; slotId?: string },
): ShapeElement {
  return {
    type: 'shape',
    id: ctx.newId(),
    name: `${kind}`,
    frame: { ...frame, rotation: 0 },
    opacity: 1,
    locked: false,
    visible: true,
    zIndex: o.z,
    roleHint: o.role ?? 'decoration',
    tokenRefs: [],
    recipeSlotId: o.slotId ?? null,
    meta: {},
    shape: kind,
    fill: o.fill,
    strokeWidth: 0,
    cornerRadius: o.cornerRadius ?? 0,
  };
}

export function page(
  ctx: LayoutContext,
  recipe: LayoutRecipe,
  name: string,
  background: Fill,
  elements: Element[],
): Page {
  return { id: ctx.newId(), name, background, safeArea: recipe.safeArea, elements };
}

export function assemble(
  ctx: LayoutContext,
  recipe: LayoutRecipe,
  format: string,
  pages: Page[],
): InternalDesignDocument {
  return {
    id: ctx.documentId,
    schemaVersion: SCHEMA_VERSION,
    version: 1,
    brandProfileId: ctx.brandProfileId,
    clientCompanyId: ctx.clientCompanyId,
    layoutRecipeRef: { recipeId: recipe.id, recipeVersion: recipe.version, variant: ctx.variant },
    format,
    canvas: { ...recipe.canvas, unit: 'px', dpi: 96 },
    brandTokens: ctx.brandTokens,
    pages,
  };
}

/** Background + text colours for a colour treatment. */
export function treatmentColours(treatment: 'light' | 'dark' | 'accent') {
  switch (treatment) {
    case 'dark':
      return { bg: token('text'), fg: token('background'), accent: token('accent') };
    case 'accent':
      return { bg: token('primary'), fg: token('background'), accent: token('accent') };
    default:
      return { bg: token('background'), fg: token('text'), accent: token('primary') };
  }
}
