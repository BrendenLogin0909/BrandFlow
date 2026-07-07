import type {
  Colour,
  Element,
  GroupElement,
  InternalDesignDocument,
  Page,
} from '@brandflow/design-schema';
import { findElement, mapElement } from './frame';
import { zIndexesFromFrontToBack } from './element-tree';

function mapPage(
  doc: InternalDesignDocument,
  pageId: string,
  fn: (page: Page) => Page,
): InternalDesignDocument {
  let touched = false;
  const pages = doc.pages.map((page) => {
    if (page.id !== pageId) return page;
    const next = fn(page);
    if (next !== page) touched = true;
    return next;
  });
  return touched ? { ...doc, pages } : doc;
}

function mapTopLevelElements(
  elements: Element[],
  id: string,
  fn: (el: Element) => Element | null,
): { elements: Element[]; changed: boolean } {
  let changed = false;
  const out: Element[] = [];
  for (const el of elements) {
    if (el.id === id) {
      const next = fn(el);
      changed = true;
      if (next) out.push(next);
      continue;
    }
    out.push(el);
  }
  return { elements: changed ? out : elements, changed };
}

export function updateElementById(
  doc: InternalDesignDocument,
  id: string,
  fn: (el: Element) => Element,
): InternalDesignDocument {
  return mapElement(doc, id, (el) => (el.locked ? el : fn(el)));
}

export function deleteTopLevelElements(
  doc: InternalDesignDocument,
  pageId: string,
  ids: Set<string>,
): InternalDesignDocument {
  if (ids.size === 0) return doc;
  return mapPage(doc, pageId, (page) => {
    const next = page.elements.filter((el) => !ids.has(el.id) || el.locked);
    return next.length === page.elements.length ? page : { ...page, elements: next };
  });
}

export function duplicateTopLevelElements(
  doc: InternalDesignDocument,
  pageId: string,
  ids: string[],
): InternalDesignDocument {
  if (ids.length === 0) return doc;
  return mapPage(doc, pageId, (page) => {
    const toCopy = page.elements.filter((el) => ids.includes(el.id));
    if (!toCopy.length) return page;
    const maxZ = Math.max(0, ...page.elements.map((e) => e.zIndex));
    const clones = toCopy.map((el, i) => cloneElement(el, maxZ + i + 1));
    return { ...page, elements: [...page.elements, ...clones] };
  });
}

function cloneElement(el: Element, zIndex: number): Element {
  const id = crypto.randomUUID();
  const base = {
    ...structuredClone(el),
    id,
    name: `${el.name} copy`,
    zIndex,
    locked: false,
    frame: { ...el.frame, x: el.frame.x + 12, y: el.frame.y + 12 },
  };
  if (base.type === 'group') {
    return remapGroupIds(base as GroupElement);
  }
  return base;
}

function remapGroupIds(group: GroupElement): GroupElement {
  const remap = (el: Element): Element => {
    const next = { ...structuredClone(el), id: crypto.randomUUID() };
    if (next.type === 'group') {
      return { ...next, children: next.children.map(remap) };
    }
    return next;
  };
  return { ...group, children: group.children.map(remap) };
}

export function groupTopLevelElements(
  doc: InternalDesignDocument,
  pageId: string,
  ids: string[],
): InternalDesignDocument {
  if (ids.length < 2) return doc;
  const idSet = new Set(ids);
  return mapPage(doc, pageId, (page) => {
    const picked = page.elements.filter((el) => idSet.has(el.id) && !el.locked);
    if (picked.length < 2) return page;
    const rest = page.elements.filter((el) => !idSet.has(el.id));
    const minX = Math.min(...picked.map((e) => e.frame.x));
    const minY = Math.min(...picked.map((e) => e.frame.y));
    const maxX = Math.max(...picked.map((e) => e.frame.x + e.frame.width));
    const maxY = Math.max(...picked.map((e) => e.frame.y + e.frame.height));
    const maxZ = Math.max(...picked.map((e) => e.zIndex));
    const group: GroupElement = {
      id: crypto.randomUUID(),
      name: 'Group',
      type: 'group',
      frame: { x: minX, y: minY, width: maxX - minX, height: maxY - minY, rotation: 0 },
      opacity: 1,
      locked: false,
      visible: true,
      zIndex: maxZ,
      roleHint: null,
      tokenRefs: [],
      recipeSlotId: null,
      meta: {},
      children: picked.map((el) => ({ ...el, frame: { ...el.frame, x: el.frame.x, y: el.frame.y } })),
    };
    return { ...page, elements: [...rest, group] };
  });
}

export function ungroupTopLevelElement(
  doc: InternalDesignDocument,
  pageId: string,
  groupId: string,
): InternalDesignDocument {
  return mapPage(doc, pageId, (page) => {
    const idx = page.elements.findIndex((el) => el.id === groupId);
    if (idx < 0) return page;
    const el = page.elements[idx]!;
    if (el.type !== 'group' || el.locked) return page;
    const before = page.elements.slice(0, idx);
    const after = page.elements.slice(idx + 1);
    return { ...page, elements: [...before, ...el.children, ...after] };
  });
}

export function applyLayerOrder(
  doc: InternalDesignDocument,
  pageId: string,
  orderedIds: string[],
): InternalDesignDocument {
  const zMap = zIndexesFromFrontToBack(orderedIds);
  return mapPage(doc, pageId, (page) => {
    let changed = false;
    const elements = page.elements.map((el) => {
      const z = zMap[el.id];
      if (z === undefined || el.zIndex === z) return el;
      changed = true;
      return { ...el, zIndex: z };
    });
    return changed ? { ...page, elements } : page;
  });
}

export function toggleElementLock(
  doc: InternalDesignDocument,
  id: string,
  locked: boolean,
): InternalDesignDocument {
  return mapElement(doc, id, (el) => ({ ...el, locked }));
}

export function toggleElementVisible(
  doc: InternalDesignDocument,
  id: string,
  visible: boolean,
): InternalDesignDocument {
  return mapElement(doc, id, (el) => ({ ...el, visible }));
}

export function setElementColour(
  doc: InternalDesignDocument,
  id: string,
  colour: Colour,
  field: 'text' | 'icon' | 'fill' | 'stroke' = 'text',
): InternalDesignDocument {
  return updateElementById(doc, id, (el) => {
    if (el.type === 'text' && field === 'text') return { ...el, colour };
    if (el.type === 'icon') return { ...el, colour };
    if (el.type === 'shape' && field === 'fill') return { ...el, fill: colour };
    if (el.type === 'shape' && field === 'stroke' && el.stroke) return { ...el, stroke: colour };
    return el;
  });
}

export function primarySelectedElement(
  doc: InternalDesignDocument,
  selectedIds: string[],
): Element | null {
  const id = selectedIds[0];
  if (!id) return null;
  return findElement(doc, id);
}
