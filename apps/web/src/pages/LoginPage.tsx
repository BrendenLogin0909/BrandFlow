import { useState } from 'react';
import { api, setAccessToken, setActiveClientId } from '../lib/api';

interface LoginResult {
  accessToken: string;
  refreshToken: string;
}
interface Me {
  clients: { id: string; name: string }[];
}

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<LoginResult>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setAccessToken(res.accessToken);
      const me = await api<Me>('/auth/me');
      if (me.clients[0]) setActiveClientId(me.clients[0].id);
      onLoggedIn();
    } catch {
      setError('Invalid email or password');
      setAccessToken(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <form onSubmit={submit} className="w-96 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">
          Brand<span className="text-indigo-600">Flow</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to your workspace</p>

        <label className="mt-6 block text-sm font-medium">
          Email
          <input type="email" required autoComplete="email"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Password
          <input type="password" required autoComplete="current-password"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}

        <button type="submit" disabled={busy}
          className="mt-6 w-full rounded-md bg-indigo-600 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="mt-4 text-center text-xs text-slate-400">
          The Recipe Playground works without signing in —{' '}
          <a href="/playground" className="text-indigo-600 underline">open it</a>.
        </p>
      </form>
    </div>
  );
}
