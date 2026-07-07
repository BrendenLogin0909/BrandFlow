/**
 * Standalone harness for the DesignCanvas (route: /studio-canvas-demo).
 *
 * This exists so the canvas can be exercised in isolation before the full
 * Design Studio shell (Agent 1) wires it into the pipeline. It builds a real
 * `InternalDesignDocument` from a layout recipe, owns the document/selection
 * state, and hands both to <DesignCanvas>, logging edits. Not linked in the
 * nav — reach it directly by URL. Safe to delete once the shell replaces it.
 */
import { useMemo, useState } from 'react';
import type { BrandTokensSnapshot, InternalDesignDocument } from '@brandflow/design-schema';
import { RECIPES } from '@brandflow/layout-recipes';
import { DesignCanvas } from './DesignCanvas';
import { findElement } from './frame';

const TOKENS: BrandTokensSnapshot = {
  colours: {
    primary: '#1a3c8f',
    secondary: '#4a6fd4',
    accent: '#e8b23a',
    neutral: '#8a8f98',
    background: '#ffffff',
    text: '#101418',
  },
  fonts: { heading: 'Poppins', body: 'Inter' },
  logoAssetIds: [],
};

function buildSampleDoc(): InternalDesignDocument {
  const recipe = RECIPES[0]!;
  const fill = { slots: {} as Record<string, { kind: 'text'; text: string }> };
  for (const slot of recipe.slots) {
    if (slot.kind === 'text') fill.slots[slot.id] = { kind: 'text', text: 'Editable sample text' };
  }
  return recipe.layout(fill as never, {
    documentId: crypto.randomUUID(),
    brandProfileId: 'demo',
    clientCompanyId: 'demo',
    brandTokens: TOKENS,
    variant: recipe.variants[0]!.id,
    seed: 7,
    newId: () => crypto.randomUUID(),
  });
}

export function DesignCanvasDemo() {
  const [doc, setDoc] = useState<InternalDesignDocument>(() => buildSampleDoc());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'recipe' | 'hybrid'>('recipe');
  const activePageId = doc.pages[0]?.id ?? null;

  const selectedSummary = useMemo(
    () =>
      selectedIds
        .map((id) => {
          const el = findElement(doc, id);
          return el ? `${el.type} "${el.name}" @ (${Math.round(el.frame.x)}, ${Math.round(el.frame.y)})` : id;
        })
        .join(' · '),
    [selectedIds, doc],
  );

  function toggleLockSelected() {
    if (!selectedIds.length) return;
    setDoc((d) => ({
      ...d,
      pages: d.pages.map((p) => ({
        ...p,
        elements: p.elements.map((el) =>
          selectedIds.includes(el.id) ? { ...el, locked: !el.locked } : el,
        ),
      })),
    }));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 text-sm">
        <span className="font-semibold">DesignCanvas demo</span>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
          mode: <strong>{mode}</strong>
        </span>
        <button
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
          onClick={toggleLockSelected}
          disabled={!selectedIds.length}
        >
          Toggle lock on selection
        </button>
        <button
          className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
          onClick={() => setDoc(buildSampleDoc())}
        >
          Reset
        </button>
        <span className="ml-auto max-w-[50%] truncate text-xs text-slate-500">
          {selectedIds.length ? selectedSummary : 'nothing selected — click an element'}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <DesignCanvas
          document={doc}
          activePageId={activePageId}
          selectedIds={selectedIds}
          onDocumentChange={setDoc}
          onSelectionChange={setSelectedIds}
          onFirstManualEdit={() => setMode('hybrid')}
          onRequestTextEdit={(id) => console.log('request text edit', id)}
        />
      </div>
    </div>
  );
}
