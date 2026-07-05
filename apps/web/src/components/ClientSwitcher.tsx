import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getAccessToken, getActiveClientId, setActiveClientId } from '../lib/api';

interface Me {
  clients: { id: string; name: string; slug: string }[];
}

/**
 * Agency users switch between accessible clients here (direct memberships
 * plus, for org-wide roles, every client in the organisation). Everything
 * the app fetches is scoped to this selection, and the API re-verifies
 * membership server-side on every request.
 */
export function ClientSwitcher() {
  const queryClient = useQueryClient();
  const [active, setActive] = useState(getActiveClientId() ?? '');
  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/auth/me'),
    enabled: Boolean(getAccessToken()),
  });

  const clients = data?.clients ?? [];

  // Auto-select the first accessible client when none (or a stale one) is stored.
  useEffect(() => {
    if (clients.length === 0) return;
    if (!clients.some((c) => c.id === active)) {
      const first = clients[0]!;
      setActiveClientId(first.id);
      setActive(first.id);
      queryClient.invalidateQueries();
    }
  }, [clients, active, queryClient]);

  return (
    <div className="border-b border-slate-200 px-3 pb-3">
      <label className="mb-1 block text-xs font-semibold uppercase text-slate-400">
        Active client
      </label>
      <select
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        value={active}
        onChange={(e) => {
          setActiveClientId(e.target.value);
          setActive(e.target.value);
          queryClient.invalidateQueries(); // hard scope change: drop all cached data
        }}
      >
        {clients.length === 0 && <option value="">No clients yet</option>}
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
