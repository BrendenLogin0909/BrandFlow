/** Scope detection for AI patch requests (docs/17 Agent 8). */
export type PatchScope = 'element' | 'page' | 'document';

export function derivePatchScope(
  selectedIds: string[],
  activePageId: string | null,
): { scope: PatchScope; targetIds: string[]; label: string } {
  if (selectedIds.length > 0) {
    const n = selectedIds.length;
    return {
      scope: 'element',
      targetIds: selectedIds,
      label: n === 1 ? '1 selected element' : `${n} selected elements`,
    };
  }
  if (activePageId) {
    return { scope: 'page', targetIds: [activePageId], label: 'active page' };
  }
  return { scope: 'document', targetIds: [], label: 'whole document' };
}
