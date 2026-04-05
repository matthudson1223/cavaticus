import { useNavigate, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import type { Project, User } from '@cavaticus/shared';

export function dashboardComponent() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ user: User }>('/api/v1/auth/me'),
    retry: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<{ projects: Project[] }>('/api/v1/projects'),
    enabled: !!meData,
  });

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const create = useMutation({
    mutationFn: (vals: { name: string; description?: string }) =>
      api.post<{ project: Project }>('/api/v1/projects', vals),
    onSuccess: ({ project }) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setShowModal(false);
      setName('');
      setDesc('');
      void navigate({ to: '/project/$id', params: { id: project.id } });
    },
  });

  const logout = useMutation({
    mutationFn: () => api.post('/api/v1/auth/logout'),
    onSuccess: () => void navigate({ to: '/auth' }),
  });

  if (!meData) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <p style={{ color: 'var(--text-muted)' }}>
          <Link to="/auth" style={{ color: 'var(--accent)' }}>Sign in</Link> to get started
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Cavaticus</h1>
        <div className="flex items-center gap-4">
          <Link to="/settings" className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Settings
          </Link>
          <button
            onClick={() => logout.mutate()}
            className="text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>My Projects</h2>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            + New Project
          </button>
        </div>

        {isLoading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.projects.map((p) => (
            <Link
              key={p.id}
              to="/project/$id"
              params={{ id: p.id }}
              className="block rounded-xl p-5 transition-colors"
              style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}
            >
              <p className="font-medium" style={{ color: 'var(--text)' }}>{p.name}</p>
              {p.description && (
                <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                  {p.description}
                </p>
              )}
              <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                {new Date(p.updatedAt).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      </main>

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div
            className="w-full max-w-md rounded-xl p-6 space-y-4"
            style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}
          >
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>New Project</h3>
            <input
              type="text"
              placeholder="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <textarea
              placeholder="Description (optional)"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            {create.error && (
              <p className="text-sm text-red-400">{(create.error as Error).message}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => create.mutate({ name, description: desc || undefined })}
                disabled={!name || create.isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {create.isPending ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
