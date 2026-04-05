import { Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import type { ApiKeyProvider, UserSettings, UserModel } from '@cavaticus/shared';

const PROVIDERS: { id: ApiKeyProvider; label: string; placeholder: string }[] = [
  { id: 'claude', label: 'Claude (Anthropic)', placeholder: 'sk-ant-…' },
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-…' },
  { id: 'gemini', label: 'Gemini (Google)', placeholder: 'AIza…' },
  { id: 'openrouter', label: 'OpenRouter', placeholder: 'sk-or-…' },
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

  const { data: modelsData } = useQuery({
    queryKey: ['models'],
    queryFn: () =>
      api.get<{ models: UserModel[] }>('/api/v1/settings/models'),
  });

  const addModel = useMutation({
    mutationFn: ({ modelId, label }: { modelId: string; label?: string }) =>
      api.post('/api/v1/settings/models', { modelId, label }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['models'] });
      setModelInput('');
      setModelLabel('');
      setModelError('');
    },
  });

  const removeModel = useMutation({
    mutationFn: (id: string) =>
      api.del(`/api/v1/settings/models/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['models'] }),
  });

  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [modelInput, setModelInput] = useState('');
  const [modelLabel, setModelLabel] = useState('');
  const [modelError, setModelError] = useState('');
  const storedProviders = new Set(data?.storedProviders ?? []);
  const models = modelsData?.models ?? [];
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

        {storedProviders.has('openrouter') && (
          <section>
            <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text)' }}>OpenRouter Models</h2>
            <div className="space-y-4">
              <div
                className="rounded-xl p-4 space-y-3"
                style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}
              >
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                    Model ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. google/gemma-4-26b-a4b-it or mistralai/mistral-7b-instruct"
                    value={modelInput}
                    onChange={(e) => {
                      setModelInput(e.target.value);
                      setModelError('');
                    }}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    disabled={addModel.isPending}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                    Label (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Gemma 4"
                    value={modelLabel}
                    onChange={(e) => setModelLabel(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    disabled={addModel.isPending}
                  />
                </div>
                {modelError && (
                  <p className="text-sm" style={{ color: '#f87171' }}>
                    {modelError}
                  </p>
                )}
                <button
                  onClick={() => {
                    if (!modelInput.trim()) {
                      setModelError('Model ID is required');
                      return;
                    }
                    addModel.mutate({ modelId: modelInput.trim(), label: modelLabel || undefined });
                  }}
                  disabled={!modelInput.trim() || addModel.isPending}
                  className="w-full py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  {addModel.isPending ? 'Adding…' : 'Add Model'}
                </button>
              </div>

              {models.length > 0 && (
                <div
                  className="rounded-xl p-4"
                  style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}
                >
                  <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text)' }}>
                    Saved Models
                  </h3>
                  <div className="space-y-2">
                    {models.map((model) => (
                      <div
                        key={model.id}
                        className="flex items-center justify-between p-2 rounded-lg"
                        style={{ background: 'var(--bg-3)' }}
                      >
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                            {model.label || model.modelId}
                          </p>
                          {model.label && (
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {model.modelId}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => removeModel.mutate(model.id)}
                          disabled={removeModel.isPending}
                          className="text-sm disabled:opacity-50"
                          style={{ color: '#f87171' }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

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
