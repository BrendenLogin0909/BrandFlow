import { useQuery } from '@tanstack/react-query';
import { clientApi } from '../lib/api';

interface BrandProfile {
  id: string;
  name: string;
  status: string;
}

const STATUS_STYLES: Record<string, string> = {
  APPROVED: 'bg-green-100 text-green-800',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-800',
  DRAFT: 'bg-slate-100 text-slate-600',
  CHANGES_REQUESTED: 'bg-red-100 text-red-800',
};

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
            <div className="font-medium">{p.name}</div>
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
