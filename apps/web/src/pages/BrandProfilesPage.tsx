import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clientApi, getActiveClientId, uploadClientAsset } from '../lib/api';
import { useAuthedImageSrc } from '../components/design-studio';

interface BrandLogoEntry {
  assetId: string;
  kind: string;
}

interface BrandProfile {
  id: string;
  name: string;
  status: string;
  brandKit?: { logos?: BrandLogoEntry[] | null } | null;
}

const STATUS_STYLES: Record<string, string> = {
  APPROVED: 'bg-green-100 text-green-800',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-800',
  DRAFT: 'bg-slate-100 text-slate-600',
  CHANGES_REQUESTED: 'bg-red-100 text-red-800',
};

const UPLOAD_ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp';

export function BrandProfilesPage() {
  const { data } = useQuery({
    queryKey: ['brand-profiles'],
    queryFn: () => clientApi<BrandProfile[]>('/brand-profiles'),
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Brand profiles</h1>
        <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
          New brand profile
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Brands must be approved (Gate 1) before they can be used for generation.
      </p>
      <div className="mt-6 space-y-3">
        {(data ?? []).map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex items-center gap-4">
              <BrandProfileLogoCard profile={p} />
              <div className="font-medium">{p.name}</div>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[p.status] ?? ''}`}
            >
              {p.status.replaceAll('_', ' ')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Minimal logo card: current primary logo preview + upload-and-set-primary
 * button. The full brand-kit editor (colours, fonts, style guide, etc.) is
 * a separate later workstream — this only handles the logo.
 */
function BrandProfileLogoCard({ profile }: { profile: BrandProfile }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const clientId = getActiveClientId();

  const primaryAssetId = profile.brandKit?.logos?.find((l) => l.kind === 'primary')?.assetId ?? null;
  const logoSrc = useAuthedImageSrc(
    primaryAssetId && clientId ? `/api/clients/${clientId}/assets/${primaryAssetId}/content` : null,
  );

  const uploadAndSet = useMutation({
    mutationFn: async (file: File) => {
      const asset = await uploadClientAsset(file, { type: 'LOGO', shared: false });
      return clientApi(`/brand-profiles/${profile.id}/logo`, {
        method: 'POST',
        body: JSON.stringify({ assetId: asset.id, kind: 'primary' }),
      });
    },
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['brand-profiles'] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Upload failed'),
  });

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) uploadAndSet.mutate(file);
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex h-14 w-24 items-center justify-center overflow-hidden rounded border border-dashed border-slate-300 bg-slate-50">
        {logoSrc ? (
          <img src={logoSrc} alt={`${profile.name} logo`} className="max-h-14 max-w-24 object-contain" />
        ) : (
          <span className="text-[9px] text-slate-400">no logo</span>
        )}
      </div>
      <button
        type="button"
        className="rounded border border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        disabled={uploadAndSet.isPending}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploadAndSet.isPending ? 'Uploading…' : primaryAssetId ? 'Replace logo' : 'Upload logo'}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="hidden"
        onChange={handleFileChosen}
      />
      {error && <span className="max-w-24 text-center text-[9px] text-red-600">{error}</span>}
    </div>
  );
}
