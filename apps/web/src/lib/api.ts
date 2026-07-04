/** Thin fetch wrapper; attaches JWT and the active client scope. */

let accessToken: string | null = localStorage.getItem('bf.accessToken');

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) localStorage.setItem('bf.accessToken', token);
  else localStorage.removeItem('bf.accessToken');
}

export function getActiveClientId(): string | null {
  return localStorage.getItem('bf.activeClientId');
}

export function setActiveClientId(id: string) {
  localStorage.setItem('bf.activeClientId', id);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.error?.code ?? 'UNKNOWN', body?.error?.message);
  }
  return res.json() as Promise<T>;
}

/** Client-scoped call: /clients/:clientId is prepended from the active switcher selection. */
export function clientApi<T>(path: string, init?: RequestInit): Promise<T> {
  const clientId = getActiveClientId();
  if (!clientId) return Promise.reject(new ApiError(400, 'NO_ACTIVE_CLIENT'));
  return api<T>(`/clients/${clientId}${path}`, init);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}
