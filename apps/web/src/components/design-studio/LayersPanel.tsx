import { useState } from 'react';
import type { DesignStudioBindings } from './studio-props';
import { activePageFromBindings } from './studio-props';
import { applyLayerOrder, toggleElementLock, toggleElementVisible } from './document-mutations';
import { layerRowsForPage, reorderLayerIds } from './element-tree';

export type LayersPanelProps = DesignStudioBindings;

export function LayersPanel({
  document: doc,
  activePageId,
  selectedIds,
  onDocumentChange,
  onSelectionChange,
}: LayersPanelProps) {
  const page = activePageFromBindings({ document: doc, activePageId });
  const [dragId, setDragId] = useState<string | null>(null);

  if (!page) {
    return <div className="text-xs text-slate-400">No active page.</div>;
  }

  const rows = layerRowsForPage(page.elements);
  const order = rows.map((r) => r.id);

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const nextOrder = reorderLayerIds(order, dragId, targetId);
    onDocumentChange(applyLayerOrder(doc, page.id, nextOrder));
    setDragId(null);
  };

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Layers</div>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">No elements on this page.</p>
      ) : (
        <ul className="max-h-64 space-y-0.5 overflow-auto">
          {rows.map((row) => {
            const selected = selectedIds.includes(row.id);
            return (
              <li
                key={row.id}
                draggable={!row.locked}
                onDragStart={() => setDragId(row.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(row.id)}
                className={`flex items-center gap-1 rounded border px-1.5 py-1 text-xs ${
                  selected ? 'border-indigo-400 bg-indigo-50' : 'border-transparent hover:bg-slate-50'
                }`}
              >
                <button
                  type="button"
                  className="shrink-0 text-slate-400 hover:text-slate-700"
                  title={row.visible ? 'Hide' : 'Show'}
                  onClick={() =>
                    onDocumentChange(toggleElementVisible(doc, row.id, !row.visible))
                  }
                >
                  {row.visible ? '👁' : '○'}
                </button>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left"
                  onClick={() => onSelectionChange([row.id])}
                >
                  <span className="text-slate-400">{row.type.slice(0, 1).toUpperCase()}</span>{' '}
                  {row.name}
                </button>
                <button
                  type="button"
                  className={`shrink-0 ${row.locked ? 'text-red-500' : 'text-slate-300'}`}
                  title={row.locked ? 'Unlock' : 'Lock'}
                  onClick={() =>
                    onDocumentChange(toggleElementLock(doc, row.id, !row.locked))
                  }
                >
                  {row.locked ? '🔒' : '🔓'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
