import { useNavigate, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { AppHeader } from '../components/layout/AppHeader';
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

  if (!meData) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <p style={{ color: 'var(--text-muted)' }}>
          <Link to="/auth" style={{ color: 'var(--accent)' }}>Sign in</Link> to get started
        </p>
      </div>
    );
  }

  const projects = data?.projects ?? [];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <AppHeader />

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>My Projects</h2>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: 'var(--accent)', color: '#fff' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Project
          </button>
        </div>

        {isLoading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}

        {!isLoading && projects.length === 0 && (
          <div
            className="flex flex-col items-center justify-center py-20 rounded-xl"
            style={{ border: '2px dashed var(--border)' }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
            <p className="mt-4 text-sm" style={{ color: 'var(--text-muted)' }}>
              No projects yet
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: 'var(--accent)', color: '#fff' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
            >
              Create your first project
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <Link
              key={p.id}
              to="/project/$id"
              params={{ id: p.id }}
              className="group block rounded-xl p-5 transition-all"
              style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div className="flex items-start justify-between">
                <p className="font-medium" style={{ color: 'var(--text)' }}>{p.name}</p>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', opacity: 0, transition: 'opacity 0.15s' }} className="group-hover:opacity-100">
                  <line x1="7" y1="17" x2="17" y2="7" />
                  <polyline points="7 7 17 7 17 17" />
                </svg>
              </div>
              {p.description && (
                <p className="text-sm mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                  {p.description}
                </p>
              )}
              <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                {new Date(p.updatedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
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
              autoFocus
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name) create.mutate({ name, description: desc || undefined });
                if (e.key === 'Escape') setShowModal(false);
              }}
            />
            <textarea
              placeholder="Description (optional)"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setShowModal(false);
              }}
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
                className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                style={{ background: 'var(--accent)', color: '#fff' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
              >
                {create.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
