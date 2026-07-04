import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { clientApi } from '../lib/api';

/**
 * Embedded design editor page.
 *
 * Production wiring (Phase 1/4 of the implementation plan):
 *   import { PolotnoContainer, SidePanelWrap, WorkspaceWrap } from 'polotno';
 *   import { createStore } from 'polotno/model/store';
 *   store.loadJSON(engineDoc)  — engineDoc comes from /design-documents/:id/engine
 *   On save: convert store.toJSON() back through the adapter contract by
 *   PUTting the internal document; the server re-validates and enforces locks.
 *
 * Brand constraints applied to the editor shell:
 *   - colour pickers restricted to brand tokens
 *   - font list restricted to the brand kit
 *   - locked elements rendered non-draggable (adapter sets draggable:false)
 */
export function EditorPage() {
  const { designDocumentId } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['design-engine', designDocumentId],
    queryFn: () => clientApi<unknown>(`/design-documents/${designDocumentId}/engine`),
    enabled: Boolean(designDocumentId),
  });

  if (isLoading) return <Centered>Loading design…</Centered>;
  if (error) return <Centered>Could not load design: {String(error)}</Centered>;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <h1 className="text-sm font-semibold">Design editor</h1>
        <div className="space-x-2">
          <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            Validate
          </button>
          <button className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white">
            Save
          </button>
        </div>
      </header>
      <div className="flex-1 bg-slate-100 p-6">
        {/* Polotno editor mounts here; scene JSON preview until the SDK licence key is configured */}
        <pre className="h-full overflow-auto rounded-lg border border-slate-200 bg-white p-4 text-xs">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center text-slate-500">{children}</div>;
}
