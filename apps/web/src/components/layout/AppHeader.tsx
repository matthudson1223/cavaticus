import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { api } from '../../lib/api';
import type { User } from '@cavaticus/shared';

interface AppHeaderProps {
  breadcrumbs?: { label: string; to?: string }[];
  actions?: React.ReactNode;
}

export function AppHeader({ breadcrumbs, actions }: AppHeaderProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ user: User }>('/api/v1/auth/me'),
    retry: false,
  });

  const logout = useMutation({
    mutationFn: () => api.post('/api/v1/auth/logout'),
    onSuccess: () => void navigate({ to: '/auth' }),
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const user = meData?.user;

  return (
    <header
      className="flex items-center justify-between px-4 py-2 shrink-0"
      style={{
        background: 'var(--bg-2)',
        borderBottom: '1px solid var(--border)',
        height: '48px',
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Link
          to="/"
          className="text-sm font-bold shrink-0 hover:opacity-80 transition-opacity"
          style={{ color: 'var(--accent)' }}
        >
          Cavaticus
        </Link>

        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1.5 min-w-0 text-sm">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5 min-w-0">
                <span style={{ color: 'var(--text-muted)' }}>/</span>
                {crumb.to ? (
                  <Link
                    to={crumb.to}
                    className="hover:underline truncate"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="truncate" style={{ color: 'var(--text)' }}>
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
        )}
      </div>

      <div className="flex items-center gap-2">
        {actions}

        {user && (
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors"
              style={{
                background: menuOpen ? 'var(--bg-3)' : 'transparent',
                color: 'var(--text-muted)',
              }}
              onMouseEnter={(e) => {
                if (!menuOpen) e.currentTarget.style.background = 'var(--bg-3)';
              }}
              onMouseLeave={(e) => {
                if (!menuOpen) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {user.email?.charAt(0).toUpperCase() ?? '?'}
              </span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ opacity: 0.6 }}>
                <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 mt-1 w-48 rounded-lg py-1 z-50"
                style={{
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                }}
              >
                <div
                  className="px-3 py-2 text-xs truncate"
                  style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}
                >
                  {user.email}
                </div>
                <Link
                  to="/"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm w-full transition-colors"
                  style={{ color: 'var(--text)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-3)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                  Dashboard
                </Link>
                <Link
                  to="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm w-full transition-colors"
                  style={{ color: 'var(--text)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-3)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                  </svg>
                  Settings
                </Link>
                <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    logout.mutate();
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm w-full transition-colors"
                  style={{ color: '#f87171' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-3)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
