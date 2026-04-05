import { Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import type { ApiKeyProvider, UserSettings } from '@cavaticus/shared';

const PROVIDERS: { id: ApiKeyProvider; label: string; placeholder: string }[] = [
  { id: 'claude', label: 'Claude (Anthropic)', placeholder: 'sk-ant-…' },
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-…' },
  { id: 'gemini', label: 'Gemini (Google)', placeholder: 'AIza…' },
];

export function settingsComponent() {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () =>
      api.get<{ settings: UserSettings | null; storedProviders: string[] }>(
        '/api/v1/settings',
      ),
  });

  const saveSettings = useMutation({
    mutationFn: (body: Partial<UserSettings>) => api.put('/api/v1/settings', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  const saveKey = useMutation({
    mutationFn: ({ provider, key }: { provider: ApiKeyProvider; key: string }) =>
      api.put('/api/v1/settings/api-keys', { provider, key }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  const deleteKey = useMutation({
    mutationFn: (provider: ApiKeyProvider) =>
      api.del(`/api/v1/settings/api-keys/${provider}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const storedProviders = new Set(data?.storedProviders ?? []);
  const settings = data?.settings;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <Link to="/" className="text-sm" style={{ color: 'var(--text-muted)' }}>
          ← Back
        </Link>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Settings</h1>
        <div />
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        <section>
          <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text)' }}>API Keys</h2>
          <div className="space-y-4">
            {PROVIDERS.map(({ id, label, placeholder }) => (
              <div
                key={id}
                className="rounded-xl p-4 space-y-3"
                style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</p>
                  {storedProviders.has(id) && (
                    <span className="text-xs text-green-400">● Stored</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder={storedProviders.has(id) ? '••••••••' : placeholder}
                    value={keyInputs[id] ?? ''}
                    onChange={(e) => setKeyInputs((prev) => ({ ...prev, [id]: e.target.value }))}
                    className="flex-1 px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  <button
                    onClick={() => { const key = keyInputs[id]; if (key) saveKey.mutate({ provider: id, key }); }}
                    disabled={!keyInputs[id] || saveKey.isPending}
                    className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    Save
                  </button>
                  {storedProviders.has(id) && (
                    <button
                      onClick={() => deleteKey.mutate(id)}
                      className="px-3 py-2 rounded-lg text-sm"
                      style={{ color: '#f87171' }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text)' }}>Preferences</h2>
          <div
            className="rounded-xl p-4 space-y-4"
            style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm" style={{ color: 'var(--text)' }}>Default Provider</p>
              <select
                value={settings?.defaultProvider ?? ''}
                onChange={(e) => saveSettings.mutate({ defaultProvider: (e.target.value as ApiKeyProvider) || null })}
                className="px-3 py-1.5 rounded-lg text-sm"
                style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                <option value="">None</option>
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm" style={{ color: 'var(--text)' }}>
                Editor Font Size ({settings?.editorFontSize ?? 14}px)
              </p>
              <input
                type="range"
                min={8}
                max={24}
                value={settings?.editorFontSize ?? 14}
                onChange={(e) => saveSettings.mutate({ editorFontSize: Number(e.target.value) })}
                className="w-32"
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
