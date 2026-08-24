/**
 * Asset library — licence-aware. Search the whitelisted free providers
 * (icons, figures, photos), see each result's licence and usage tier, and
 * save the keepers into this client's library (or the shared pool). Saved
 * assets feed the AI compose tool.
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clientApi, getActiveClientId, uploadClientAsset } from '../lib/api';
import { libraryItemContentUrl, useAuthedImageSrc } from '../components/design-studio';

type Kind = 'icon' | 'illustration' | 'photo' | 'ai';

interface SearchResult {
  provider: string;
  providerId: string;
  kind: Kind;
  contentUrl: string;
  thumbUrl: string;
  sourceUrl?: string;
  creator?: string;
  licence: string;
  attributionRequired: boolean;
  usageTier: 1 | 2 | 3;
  label: string;
}

interface LibraryItem {
  id: string;
  type: string;
  provider: string | null;
  providerId: string | null;
  licence: string | null;
  usageTier: number;
  approved: boolean;
  shared: boolean;
  attributionRequired: boolean;
  contentUrl: string | null;
  thumbUrl: string | null;
  creator: string | null;
  filename: string;
  tags: string[];
  /** Present for customer uploads (bytes live in object storage). */
  storageKey?: string | null;
}

const UPLOAD_ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp';

const TIER_LABEL: Record<number, { text: string; cls: string }> = {
  1: { text: 'auto-safe', cls: 'bg-green-100 text-green-700' },
  2: { text: 'usable · keep metadata', cls: 'bg-amber-100 text-amber-700' },
  3: { text: 'review before use', cls: 'bg-red-100 text-red-700' },
};

export function AssetLibraryPage() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<Kind>('illustration');
  const [q, setQ] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [shareNext, setShareNext] = useState(false);
  const [uploadType, setUploadType] = useState<'LOGO' | 'PHOTO'>('LOGO');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: providers } = useQuery({
    queryKey: ['asset-providers'],
    queryFn: () => clientApi<{ id: string; label: string; kinds: string[]; needsKey: boolean; tier: number }[]>('/assets/providers'),
  });
  const { data: catalog } = useQuery({
    queryKey: ['assets-catalog'],
    queryFn: () =>
      clientApi<{ pools: { id: string; label: string; approx: number | null; kind: string }[] }>('/assets/catalog'),
  });
  const { data: library } = useQuery({
    queryKey: ['assets'],
    queryFn: () => clientApi<LibraryItem[]>('/assets'),
  });

  async function search() {
    setSearching(true);
    setAiError(null);
    try {
      const res = await clientApi<{ results: SearchResult[] }>(
        `/assets/search?kind=${kind}&q=${encodeURIComponent(q)}&limit=48`,
      );
      setResults(res.results);
    } finally {
      setSearching(false);
    }
  }

  async function generate() {
    const prompt = aiPrompt.trim();
    if (prompt.length < 20) {
      setAiError('Add more detail (at least 20 characters): subject, style, mood, setting.');
      return;
    }
    setGenerating(true);
    setAiError(null);
    try {
      const res = await clientApi<{ results: SearchResult[] }>('/assets/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt, count: 1, shared: shareNext }),
      });
      setResults(res.results);
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  const save = useMutation({
    mutationFn: (r: SearchResult) =>
      clientApi('/assets/save-external', {
        method: 'POST',
        body: JSON.stringify({
          provider: r.provider, providerId: r.providerId, kind: r.kind,
          contentUrl: r.contentUrl, thumbUrl: r.thumbUrl, sourceUrl: r.sourceUrl,
          creator: r.creator, label: r.label, shared: shareNext,
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets'] }),
  });

  const toggleApprove = useMutation({
    mutationFn: (item: LibraryItem) =>
      clientApi(`/assets/${item.id}`, { method: 'PATCH', body: JSON.stringify({ approved: !item.approved, allowInPrompts: !item.approved }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => clientApi(`/assets/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assets'] }),
  });

  const upload = useMutation({
    mutationFn: (file: File) => uploadClientAsset(file, { type: uploadType, shared: shareNext }),
    onSuccess: () => {
      setUploadError(null);
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
    onError: (e) => setUploadError(e instanceof Error ? e.message : 'Upload failed'),
  });

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (file) upload.mutate(file);
  }

  const keyedPhotoProviders = (providers ?? []).filter((p) => p.kinds.includes('photo') && p.needsKey);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Asset library</h1>
      <p className="mt-1 text-sm text-slate-500">
        Search free, licence-safe providers and save the keepers. Saved assets feed the AI compose
        tool. Tier-1 assets are auto-usable; tier 2–3 need your approval first.
        {catalog?.pools?.length ? (
          <>
            {' '}
            Live pools:{' '}
            {catalog.pools
              .filter((p) => p.approx)
              .slice(0, 5)
              .map((p) => `${p.label} (~${Number(p.approx).toLocaleString()})`)
              .join(' · ')}
            .
          </>
        ) : null}
      </p>

      {/* search */}
      <div className="mt-5 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex gap-1">
          {(['icon', 'illustration', 'photo', 'ai'] as Kind[]).map((k) => (
            <button key={k}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${kind === k ? 'bg-indigo-600 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
              onClick={() => setKind(k)}>
              {k === 'illustration' ? 'illustrations' : k === 'ai' ? 'AI (saved)' : `${k}s`}
            </button>
          ))}
        </div>
        {kind !== 'ai' && (
          <>
            <input className="min-w-64 flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
              placeholder={kind === 'photo' ? 'e.g. team celebrating' : kind === 'illustration' ? 'e.g. developer working' : 'e.g. trophy, rocket, target'}
              value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()} />
            <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              disabled={searching} onClick={search}>
              {searching ? 'Searching…' : 'Search'}
            </button>
          </>
        )}
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <input type="checkbox" checked={shareNext} onChange={(e) => setShareNext(e.target.checked)} />
          save to shared pool (all clients)
        </label>
      </div>

      {/* upload — the customer's own logo/photo, stored in object storage (not the search whitelist) */}
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/40 p-3">
        <span className="text-xs font-semibold text-indigo-900">Upload your own:</span>
        <select
          className="rounded border border-slate-300 px-2 py-1 text-xs"
          value={uploadType}
          onChange={(e) => setUploadType(e.target.value as 'LOGO' | 'PHOTO')}
        >
          <option value="LOGO">Logo</option>
          <option value="PHOTO">Photo</option>
        </select>
        <button
          type="button"
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          disabled={upload.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          {upload.isPending ? 'Uploading…' : 'Upload file'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          className="hidden"
          onChange={handleFileChosen}
        />
        <span className="text-[10px] text-slate-500">PNG, JPEG, SVG or WEBP · up to 5MB</span>
        {uploadError && <span className="text-[10px] font-medium text-red-600">{uploadError}</span>}
      </div>

      {kind === 'photo' && keyedPhotoProviders.length === 0 && (
        <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-500">
          Photos come from Openverse + Wikimedia (free, no key, CC0/public-domain). Add a free
          UNSPLASH_ACCESS_KEY, PEXELS_API_KEY or PIXABAY_API_KEY to also pull premium stock.
        </div>
      )}
      {kind === 'ai' && (
        <div className="mt-3 space-y-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-semibold">Generate with AI (uses API credits)</p>
          <p>
            This tab lists <strong>already saved</strong> AI images — opening it does not spend credits.
            To create new ones, write a detailed prompt (≥20 chars) and click Generate (1 image, auto-saved).
          </p>
          <textarea
            className="w-full rounded border border-amber-300 bg-white px-2 py-1.5 text-sm text-slate-800"
            rows={3}
            placeholder="e.g. Flat vector illustration of a QA engineer at a laptop finding a bug, soft purple accent, LinkedIn carousel style, no text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              disabled={generating || aiPrompt.trim().length < 20}
              onClick={() => void generate()}
            >
              {generating ? 'Generating…' : 'Generate 1 image'}
            </button>
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-white"
              disabled={searching}
              onClick={() => void search()}
            >
              Refresh saved
            </button>
            <span className="text-[10px] text-amber-800">{aiPrompt.trim().length}/20+ characters</span>
          </div>
          {aiError && <p className="text-red-600">{aiError}</p>}
        </div>
      )}

      {/* search results */}
      {results.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-sm font-semibold text-slate-600">Results</div>
          <div className="grid grid-cols-4 gap-3 lg:grid-cols-6">
            {results.map((r) => (
              <div key={`${r.provider}:${r.providerId}`} className="rounded-lg border border-slate-200 bg-white p-2">
                <div className="flex h-24 items-center justify-center overflow-hidden rounded bg-slate-50">
                  <img src={r.thumbUrl} alt={r.label} className="max-h-24 max-w-full object-contain" loading="lazy" />
                </div>
                <div className="mt-1 truncate text-[11px] text-slate-500" title={r.label}>{r.label}</div>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className={`rounded px-1 py-0.5 text-[9px] font-semibold ${TIER_LABEL[r.usageTier]?.cls}`}>
                    {r.licence}
                  </span>
                  <button className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-indigo-700"
                    onClick={() => save.mutate(r)}>
                    Save
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* library */}
      <div className="mt-8">
        <div className="mb-2 text-sm font-semibold text-slate-600">
          Your library <span className="text-slate-400">({library?.length ?? 0})</span>
        </div>
        {library?.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
            No saved assets yet — search above and save the ones you like.
          </div>
        )}
        <div className="grid grid-cols-4 gap-3 lg:grid-cols-6">
          {(library ?? []).map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-2">
              <div className="flex h-24 items-center justify-center overflow-hidden rounded bg-slate-50">
                <LibraryThumb item={item} />
              </div>
              <div className="mt-1 flex items-center gap-1">
                <span className={`rounded px-1 py-0.5 text-[9px] font-semibold ${TIER_LABEL[item.usageTier]?.cls}`}>
                  {TIER_LABEL[item.usageTier]?.text}
                </span>
                {item.provider === 'upload' && (
                  <span className="rounded bg-indigo-100 px-1 py-0.5 text-[9px] font-semibold text-indigo-700">
                    {item.type === 'LOGO' ? 'your logo' : 'uploaded'}
                  </span>
                )}
                {item.shared && <span className="rounded bg-purple-100 px-1 py-0.5 text-[9px] font-semibold text-purple-700">shared</span>}
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px]">
                <button className={`rounded px-1.5 py-0.5 font-semibold ${item.approved ? 'bg-green-100 text-green-700' : 'border border-slate-300 text-slate-500'}`}
                  onClick={() => toggleApprove.mutate(item)}
                  title="Approved assets can be used in generation">
                  {item.approved ? 'approved ✓' : 'approve'}
                </button>
                <button className="text-red-500 hover:text-red-700" onClick={() => remove.mutate(item.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Renders a library item's thumb, resolving uploads (no public URL) through the authed /content route. */
function LibraryThumb({ item }: { item: LibraryItem }) {
  const src = useAuthedImageSrc(libraryItemContentUrl(item, getActiveClientId()));
  if (!src) return null;
  return <img src={src} alt={item.filename} className="max-h-24 max-w-full object-contain" loading="lazy" />;
}
