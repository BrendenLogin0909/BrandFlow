import type { InternalDesignDocument } from '@brandflow/design-schema';

/** Shared controlled props for Design Studio panels and canvas. */
export interface DesignStudioBindings {
  document: InternalDesignDocument;
  activePageId: string | null;
  selectedIds: string[];
  onDocumentChange: (doc: InternalDesignDocument) => void;
  onSelectionChange: (ids: string[]) => void;
}

export function activePageFromBindings(
  bindings: Pick<DesignStudioBindings, 'document' | 'activePageId'>,
) {
  const { document: doc, activePageId } = bindings;
  if (!doc.pages.length) return null;
  if (activePageId) {
    const hit = doc.pages.find((p) => p.id === activePageId);
    if (hit) return hit;
  }
  return doc.pages[0]!;
}
