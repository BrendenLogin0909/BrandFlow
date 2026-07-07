import type { Element } from '@brandflow/design-schema';

export interface LayerRow {
  id: string;
  name: string;
  type: Element['type'];
  zIndex: number;
  visible: boolean;
  locked: boolean;
}

/** Top-level elements on a page, front-to-back (highest zIndex first). */
export function layerRowsForPage(elements: Element[]): LayerRow[] {
  return [...elements]
    .sort((a, b) => b.zIndex - a.zIndex)
    .map((el) => ({
      id: el.id,
      name: el.name,
      type: el.type,
      zIndex: el.zIndex,
      visible: el.visible,
      locked: el.locked,
    }));
}

export function reorderLayerIds(
  currentOrder: string[],
  draggedId: string,
  targetId: string,
): string[] {
  if (draggedId === targetId) return currentOrder;
  const without = currentOrder.filter((id) => id !== draggedId);
  const targetIdx = without.indexOf(targetId);
  if (targetIdx < 0) return currentOrder;
  without.splice(targetIdx, 0, draggedId);
  return without;
}

/** Assign zIndex 1..n with front (list top) getting highest index. */
export function zIndexesFromFrontToBack(orderedIds: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  const n = orderedIds.length;
  orderedIds.forEach((id, i) => {
    out[id] = n - i;
  });
  return out;
}
