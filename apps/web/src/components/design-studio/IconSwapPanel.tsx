import { useState } from 'react';
import { clientApi } from '../../lib/api';
import type { AssetSearchResult } from './assetTypes';

export interface IconSwapPanelProps {
  currentName: string;
  onSwap: (iconName: string, label: string) => void;
}

/** Compact Lucide search for the selected icon element. */
export function IconSwapPanel({ currentName, onSwap }: IconSwapPanelProps) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AssetSearchResult[]>([]);
  const [busy, setBusy] = useState(false);

  async function search() {
    setBusy(true);
    try {
      const res = await clientApi<{ results: AssetSearchResult[] }>(
        `/assets/search?kind=icon&q=${encodeURIComponent(q || currentName)}&limit=12`,
      );
      setResults(res.results);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-slate-200 pt-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Swap icon</div>
      <p className="text-xs text-slate-500">Current: <code className="text-indigo-700">{currentName}</code></p>
      <div className="flex gap-1">
        <input
          className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
          placeholder="Search Lucide…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <button
          type="button"
          className="rounded border border-slate-300 px-2 text-xs disabled:opacity-50"
          disabled={busy}
          onClick={search}
        >
          Go
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {results.map((r) => (
          <button
            key={r.providerId}
            type="button"
            title={r.label}
            className="flex flex-col items-center rounded border border-slate-200 p-1 hover:border-indigo-400"
            onClick={() => onSwap(r.providerId, r.label)}
          >
            <img src={r.thumbUrl || r.contentUrl} alt="" className="h-8 w-8 object-contain" />
            <span className="mt-0.5 w-full truncate text-[9px] text-slate-500">{r.providerId}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
