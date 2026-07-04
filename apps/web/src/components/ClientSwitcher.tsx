import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getActiveClientId, setActiveClientId } from '../lib/api';

interface Me {
  memberships: {
    clientCompany: { id: string; name: string } | null;
    organisation: { id: string; name: string };
    role: string;
  }[];
}

/**
 * Agency users switch between assigned clients here. Everything the app
 * fetches is scoped to this selection (clientApi), and the API re-verifies
 * membership server-side on every request.
 */
export function ClientSwitcher() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me') });

  const clients =
    data?.memberships
      .map((m) => m.clientCompany)
      .filter((c): c is { id: string; name: string } => c !== null) ?? [];

  return (
    <div className="border-b border-slate-200 px-3 pb-3">
      <label className="mb-1 block text-xs font-semibold uppercase text-slate-400">
        Active client
      </label>
      <select
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        value={getActiveClientId() ?? ''}
        onChange={(e) => {
          setActiveClientId(e.target.value);
          queryClient.invalidateQueries(); // hard scope change: drop all cached data
        }}
      >
        <option value="" disabled>
          Select client…
        </option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
