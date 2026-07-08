/**
 * DesignPatch — AI-directed *scoped* edits to an InternalDesignDocument.
 *
 * The AI never returns a whole new document; it returns a small list of
 * operations bounded by a `scope` (a single element, one page, or the whole
 * document) and a set of `targetIds`. `applyDesignPatch` is a pure function
 * that applies those operations to a deep copy of the document while
 * enforcing three invariants (docs/17-design-editing-plan.md §5.1, §6 Phase 3):
 *
 *   1. Locked elements are never modified (locked in the doc OR listed in
 *      `lockedElementIds`). Any op targeting one is rejected, so locked
 *      elements stay byte-identical after apply.
 *   2. Operations may only touch elements/pages inside the declared scope —
 *      a `page`-scoped patch leaves every other page byte-identical, an
 *      `element`-scoped patch may only touch elements in `targetIds`.
 *   3. The result is re-parsed through the schema, so a patch can never
 *      produce a structurally-invalid document (rule violations are surfaced
 *      separately by `validateDesignDocument`).
 *
 * Individual bad operations are skipped and reported in `rejected` rather
 * than throwing, so the AI repair loop can see what didn't land.
 */
import { z } from 'zod';
import {
  Colour,
  ElementSchema,
  Fill,
  Frame,
  InternalDesignDocument,
  parseDesignDocument,
  type Element,
} from './schema.js';

export const PATCH_VERSION = 1;

// ---------- Operation payload fragments ----------

const IconRef = z.object({
  provider: z.enum(['lucide', 'tabler', 'internal', 'custom']),
  name: z.string().min(1),
  svg: z.string().optional(),
});

/** Where a colour lands on the target element; defaulted by element type. */
const ColourTarget = z.enum(['auto', 'fill', 'stroke', 'border', 'text']);

// ---------- PatchOperation union ----------

export const UpdateTextOp = z.object({
  op: z.literal('updateText'),
  elementId: z.string(),
  text: z.string().min(1).max(2000).optional(),
  fontFamily: z.string().min(1).optional(),
  fontSize: z.number().min(8).max(400).optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(),
  lineHeight: z.number().min(0.8).max(3).optional(),
  letterSpacing: z.number().min(-5).max(20).optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
});

export const UpdateFrameOp = z.object({
  op: z.literal('updateFrame'),
  elementId: z.string(),
  frame: Frame.partial(),
});

export const UpdateColourOp = z.object({
  op: z.literal('updateColour'),
  elementId: z.string(),
  colour: Colour,
  /** Which colour slot to write; 'auto' picks by element type. */
  on: ColourTarget.default('auto'),
});

export const ReplaceIconOp = z.object({
  op: z.literal('replaceIcon'),
  elementId: z.string(),
  iconRef: IconRef,
});

export const ReplaceImageOp = z.object({
  op: z.literal('replaceImage'),
  elementId: z.string(),
  assetId: z.string().optional(),
  src: z.string().url().optional(),
  /** New subject; leaves the element a placeholder for the asset pipeline. */
  imageQuery: z.string().min(1).max(120).optional(),
});

export const AddElementOp = z.object({
  op: z.literal('addElement'),
  pageId: z.string(),
  /** Raw element (no id/defaults required); normalised and schema-validated. */
  element: z.record(z.unknown()),
});

export const RemoveElementOp = z.object({
  op: z.literal('removeElement'),
  elementId: z.string(),
});

export const ReorderZOp = z.object({
  op: z.literal('reorderZ'),
  elementId: z.string(),
  zIndex: z.number().int(),
});

export const UpdateBackgroundOp = z.object({
  op: z.literal('updateBackground'),
  pageId: z.string(),
  background: Fill,
});

export const UpdateOpacityOp = z.object({
  op: z.literal('updateOpacity'),
  elementId: z.string(),
  opacity: z.number().min(0).max(1),
});

export const PatchOperation = z.discriminatedUnion('op', [
  UpdateTextOp,
  UpdateFrameOp,
  UpdateColourOp,
  ReplaceIconOp,
  ReplaceImageOp,
  AddElementOp,
  RemoveElementOp,
  ReorderZOp,
  UpdateBackgroundOp,
  UpdateOpacityOp,
]);
export type PatchOperation = z.infer<typeof PatchOperation>;

// ---------- DesignPatch ----------

export const DesignPatch = z.object({
  patchVersion: z.literal(PATCH_VERSION),
  scope: z.enum(['element', 'page', 'document']),
  /** Element ids (scope 'element') or page ids (scope 'page'). Empty for 'document'. */
  targetIds: z.array(z.string()).default([]),
  operations: z.array(PatchOperation).min(1).max(40),
  /** Ids that must not change — enforced in addition to the doc's own locks. */
  lockedElementIds: z.array(z.string()).default([]),
  rationale: z.string().max(600).default(''),
});
export type DesignPatch = z.infer<typeof DesignPatch>;

/**
 * The trusted server owns `scope`, `targetIds` and `lockedElementIds`; the AI
 * only proposes `operations` + `rationale`. This is the schema the AI adapter
 * validates against, so a model can never widen its own edit scope.
 */
export const AiPatchOutput = z.object({
  operations: z.array(PatchOperation).min(1).max(40),
  rationale: z.string().max(600).default(''),
});
export type AiPatchOutput = z.infer<typeof AiPatchOutput>;

// ---------- apply ----------

export interface RejectedOp {
  index: number;
  op: string;
  reason: 'locked' | 'out-of-scope' | 'not-found' | 'type-mismatch' | 'invalid';
  detail?: string;
}

export interface ApplyPatchResult {
  document: InternalDesignDocument;
  applied: number;
  rejected: RejectedOp[];
}

export class PatchApplyError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PatchApplyError';
  }
}

type AnyEl = Record<string, unknown> & {
  id: string;
  type: string;
  locked?: boolean;
  children?: AnyEl[];
  zIndex?: number;
};
type AnyPage = { id: string; background: unknown; elements: AnyEl[] };
type AnyDoc = { pages: AnyPage[] } & Record<string, unknown>;

function defaultNewId(): string {
  const g = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (g?.randomUUID) return g.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface Located {
  el: AnyEl;
  page: AnyPage;
  parent: AnyEl[];
  index: number;
}

function indexElements(doc: AnyDoc): {
  byId: Map<string, Located>;
  pageById: Map<string, AnyPage>;
  pageOfEl: Map<string, string>;
} {
  const byId = new Map<string, Located>();
  const pageById = new Map<string, AnyPage>();
  const pageOfEl = new Map<string, string>();
  const walk = (list: AnyEl[], page: AnyPage) => {
    list.forEach((el, index) => {
      byId.set(el.id, { el, page, parent: list, index });
      pageOfEl.set(el.id, page.id);
      if (el.type === 'group' && Array.isArray(el.children)) walk(el.children, page);
    });
  };
  for (const page of doc.pages) {
    pageById.set(page.id, page);
    walk(page.elements, page);
  }
  return { byId, pageById, pageOfEl };
}

/** ElementBase defaults so an AI-emitted raw element parses. Mirrors freeform. */
function normaliseNewElement(raw: Record<string, unknown>, newId: () => string, zFallback: number): unknown {
  const withDefaults = (el: Record<string, unknown>, i: number): Record<string, unknown> => ({
    name: (el.name as string) ?? String(el.type ?? 'element'),
    opacity: 1,
    locked: false,
    visible: true,
    zIndex: typeof el.zIndex === 'number' ? el.zIndex : zFallback + i,
    roleHint: null,
    tokenRefs: [],
    recipeSlotId: null,
    meta: (el.meta as object) ?? {},
    ...el,
    id: newId(), // assigned last: never trust an AI-supplied id
    ...(el.type === 'group' && Array.isArray(el.children)
      ? { children: (el.children as Record<string, unknown>[]).map(withDefaults) }
      : {}),
  });
  return withDefaults(raw, 0);
}

/**
 * Apply a DesignPatch to a copy of `doc`. Pure: `doc` is never mutated.
 * Locked and out-of-scope operations are skipped and reported. The result is
 * re-parsed through the schema; a patch that would corrupt structure throws
 * PatchApplyError instead of returning a broken document.
 */
export function applyDesignPatch(
  doc: InternalDesignDocument,
  patch: DesignPatch,
  opts: { newId?: () => string } = {},
): ApplyPatchResult {
  const newId = opts.newId ?? defaultNewId;
  const work = JSON.parse(JSON.stringify(doc)) as AnyDoc;
  const { byId, pageById, pageOfEl } = indexElements(work);

  // Anything locked in the document OR named by the patch is protected.
  const protectedIds = new Set<string>(patch.lockedElementIds);
  for (const { el } of byId.values()) if (el.locked) protectedIds.add(el.id);

  const targets = new Set(patch.targetIds);
  const rejected: RejectedOp[] = [];
  let applied = 0;

  const elementInScope = (elId: string): boolean => {
    if (patch.scope === 'document') return true;
    if (patch.scope === 'element') return targets.has(elId);
    // page scope: element must belong to a target page
    const pid = pageOfEl.get(elId);
    return pid !== undefined && targets.has(pid);
  };
  const pageInScope = (pageId: string): boolean => {
    if (patch.scope === 'document') return true;
    if (patch.scope === 'page') return targets.has(pageId);
    return false; // element scope may not touch page-level things (background/add)
  };

  const maxZOnPage = (page: AnyPage): number =>
    page.elements.reduce((m, e) => Math.max(m, typeof e.zIndex === 'number' ? e.zIndex : 0), 0);

  patch.operations.forEach((op, index) => {
    const reject = (reason: RejectedOp['reason'], detail?: string) =>
      rejected.push({ index, op: op.op, reason, detail });

    // ----- page-targeted operations -----
    if (op.op === 'addElement' || op.op === 'updateBackground') {
      const page = pageById.get(op.pageId);
      if (!page) return reject('not-found', op.pageId);
      if (!pageInScope(op.pageId)) return reject('out-of-scope', op.pageId);

      if (op.op === 'updateBackground') {
        const bg = Fill.safeParse(op.background);
        if (!bg.success) return reject('invalid', 'background');
        page.background = bg.data as unknown;
        applied++;
        return;
      }
      // addElement
      const candidate = normaliseNewElement(op.element, newId, maxZOnPage(page) + 1);
      const parsed = ElementSchema.safeParse(candidate);
      if (!parsed.success) return reject('invalid', parsed.error.issues[0]?.message);
      page.elements.push(parsed.data as unknown as AnyEl);
      applied++;
      return;
    }

    // ----- element-targeted operations -----
    const located = byId.get(op.elementId);
    if (!located) return reject('not-found', op.elementId);
    if (protectedIds.has(op.elementId)) return reject('locked', op.elementId);
    if (!elementInScope(op.elementId)) return reject('out-of-scope', op.elementId);
    const el = located.el;

    switch (op.op) {
      case 'updateText': {
        if (el.type !== 'text') return reject('type-mismatch', el.type);
        for (const k of [
          'text', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
          'lineHeight', 'letterSpacing', 'align', 'verticalAlign',
        ] as const) {
          if (op[k] !== undefined) (el as Record<string, unknown>)[k] = op[k];
        }
        applied++;
        break;
      }
      case 'updateFrame': {
        el.frame = { ...(el.frame as object), ...op.frame };
        applied++;
        break;
      }
      case 'updateColour': {
        const slot =
          op.on !== 'auto'
            ? op.on
            : el.type === 'shape'
              ? 'fill'
              : el.type === 'image'
                ? 'border'
                : 'text'; // text + icon carry `colour`
        if (slot === 'fill') {
          if (el.type !== 'shape') return reject('type-mismatch', el.type);
          el.fill = op.colour as unknown;
        } else if (slot === 'stroke') {
          if (el.type !== 'shape') return reject('type-mismatch', el.type);
          el.stroke = op.colour as unknown;
        } else if (slot === 'border') {
          if (el.type !== 'image') return reject('type-mismatch', el.type);
          el.borderColour = op.colour as unknown;
          if (typeof el.borderWidth !== 'number' || el.borderWidth === 0) el.borderWidth = 2;
        } else {
          if (el.type !== 'text' && el.type !== 'icon') return reject('type-mismatch', el.type);
          el.colour = op.colour as unknown;
        }
        applied++;
        break;
      }
      case 'replaceIcon': {
        if (el.type !== 'icon') return reject('type-mismatch', el.type);
        el.iconRef = op.iconRef as unknown;
        applied++;
        break;
      }
      case 'replaceImage': {
        if (el.type !== 'image') return reject('type-mismatch', el.type);
        if (op.imageQuery !== undefined) {
          delete el.src;
          delete el.assetId;
          el.isPlaceholder = true;
          el.meta = { ...(el.meta as object), query: op.imageQuery };
        }
        if (op.assetId !== undefined) {
          el.assetId = op.assetId;
          el.isPlaceholder = false;
        }
        if (op.src !== undefined) {
          el.src = op.src;
          el.isPlaceholder = false;
        }
        applied++;
        break;
      }
      case 'removeElement': {
        located.parent.splice(located.index, 1);
        // indices in `located` for later ops on the same array become stale;
        // rebuild the index so subsequent removes/edits stay correct.
        rebuildInto(byId, pageOfEl, work);
        applied++;
        break;
      }
      case 'reorderZ': {
        el.zIndex = op.zIndex;
        applied++;
        break;
      }
      case 'updateOpacity': {
        el.opacity = op.opacity;
        applied++;
        break;
      }
    }
  });

  let document: InternalDesignDocument;
  try {
    document = parseDesignDocument(work);
  } catch (err) {
    throw new PatchApplyError('Patched document failed schema validation', err);
  }
  return { document, applied, rejected };
}

/** Re-index after a structural mutation (element removal) so stale indices don't misfire. */
function rebuildInto(
  byId: Map<string, Located>,
  pageOfEl: Map<string, string>,
  work: AnyDoc,
): void {
  byId.clear();
  pageOfEl.clear();
  const walk = (list: AnyEl[], page: AnyPage) => {
    list.forEach((el, index) => {
      byId.set(el.id, { el, page, parent: list, index });
      pageOfEl.set(el.id, page.id);
      if (el.type === 'group' && Array.isArray(el.children)) walk(el.children, page);
    });
  };
  for (const page of work.pages) walk(page.elements, page);
}

/**
 * Defence-in-depth for the persistence layer: re-impose every locked element
 * (and any explicitly protected id) from `base` onto `next`, so no code path
 * can drift a locked element. Returns the number of elements re-imposed.
 * Mirrors docs/08 §4 ("any drift is overwritten from the lock store").
 */
export function reimposeLocked(
  base: InternalDesignDocument,
  next: InternalDesignDocument,
  extraLockedIds: string[] = [],
): { document: InternalDesignDocument; reimposed: string[] } {
  const protectedIds = new Set(extraLockedIds);
  const baseById = new Map<string, Element>();
  const collect = (els: Element[]) => {
    for (const el of els) {
      baseById.set(el.id, el);
      if (el.locked) protectedIds.add(el.id);
      if (el.type === 'group') collect(el.children);
    }
  };
  for (const page of base.pages) collect(page.elements);

  const clone = JSON.parse(JSON.stringify(next)) as AnyDoc;
  const reimposed: string[] = [];
  const fix = (list: AnyEl[]) => {
    list.forEach((el, i) => {
      if (protectedIds.has(el.id) && baseById.has(el.id)) {
        list[i] = JSON.parse(JSON.stringify(baseById.get(el.id))) as AnyEl;
        reimposed.push(el.id);
      } else if (el.type === 'group' && Array.isArray(el.children)) {
        fix(el.children);
      }
    });
  };
  for (const page of clone.pages) fix(page.elements);
  return { document: parseDesignDocument(clone), reimposed };
}

/** Convenience: page ids whose contents this patch is allowed to change. */
export function patchTouchedPageIds(doc: InternalDesignDocument, patch: DesignPatch): string[] {
  if (patch.scope === 'page') return patch.targetIds;
  if (patch.scope === 'document') return doc.pages.map((p) => p.id);
  // element scope → the pages those elements live on
  const owner = new Map<string, string>();
  const walk = (els: Element[], pageId: string) => {
    for (const el of els) {
      owner.set(el.id, pageId);
      if (el.type === 'group') walk(el.children, pageId);
    }
  };
  for (const page of doc.pages) walk(page.elements, page.id);
  const pages = new Set<string>();
  for (const id of patch.targetIds) {
    const p = owner.get(id);
    if (p) pages.add(p);
  }
  return [...pages];
}
