/** Thin fetch wrapper; attaches JWT and the active client scope. */

let accessToken: string | null = localStorage.getItem('bf.accessToken');

export function getAccessToken(): string | null {
  return accessToken;
}

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
      // Content-Type only when there IS a body, and never for FormData —
      // the browser must set that itself (multipart boundary). Fastify
      // 400s on "application/json" requests with an empty payload too
      // (e.g. DELETE), hence the init.body guard.
      ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
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

/** Uploaded AssetLibraryItem shape returned by POST /assets/upload. */
export interface UploadedAsset {
  id: string;
  type: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string | null;
  shared: boolean;
}

/** Multipart upload → active client's asset library (logos/photos → MinIO via StoragePort). */
export function uploadClientAsset(
  file: File,
  opts: { type: 'LOGO' | 'PHOTO'; shared?: boolean } = { type: 'PHOTO' },
): Promise<UploadedAsset> {
  const form = new FormData();
  form.append('file', file);
  const qs = new URLSearchParams({ type: opts.type, shared: String(opts.shared ?? false) });
  return clientApi<UploadedAsset>(`/assets/upload?${qs.toString()}`, { method: 'POST', body: form });
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
