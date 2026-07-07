import type { Element } from '@brandflow/design-schema';
import type { DesignStudioBindings } from './studio-props';
import { primarySelectedElement } from './document-mutations';

export interface DesignStudioAssetToolbarProps extends DesignStudioBindings {
  insertMode: boolean;
  onInsertModeChange: (on: boolean) => void;
  onReplaceImage: () => void;
  onInsertImage: () => void;
}

export function DesignStudioAssetToolbar({
  document: doc,
  selectedIds,
  insertMode,
  onInsertModeChange,
  onReplaceImage,
  onInsertImage,
}: DesignStudioAssetToolbarProps) {
  const el: Element | null = primarySelectedElement(doc, selectedIds);

  return (
    <div className="space-y-2 border-b border-slate-200 pb-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Assets</div>
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
          onClick={onInsertImage}
        >
          + Insert image
        </button>
        <button
          type="button"
          className={`rounded border px-2 py-1 text-xs ${
            insertMode ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-slate-300'
          }`}
          onClick={() => onInsertModeChange(!insertMode)}
        >
          {insertMode ? 'Click canvas…' : 'Place mode off'}
        </button>
        {el?.type === 'image' && (
          <button
            type="button"
            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
            onClick={onReplaceImage}
          >
            Replace image
          </button>
        )}
      </div>
      {insertMode && (
        <p className="text-[10px] text-indigo-700">Pick an asset, then click the canvas to place it.</p>
      )}
    </div>
  );
}
