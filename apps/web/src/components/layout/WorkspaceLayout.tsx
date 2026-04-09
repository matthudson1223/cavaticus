import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useState, useCallback, useMemo } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { FileTree } from '../filetree/FileTree';
import { CodeEditor } from '../editor/CodeEditor';
import { GrapesEditor } from '../editor/GrapesEditor';
import { PreviewFrame } from '../preview/PreviewFrame';
import { ChatPanel } from '../chat/ChatPanel';
import { AppHeader } from './AppHeader';
import { KeyboardShortcutsHelp } from '../KeyboardShortcutsHelp';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useSocket } from '../../hooks/useSocket';

type EditorTab = 'code' | 'visual' | 'preview';

const TAB_CONFIG: { id: EditorTab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'code',
    label: 'Code',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    id: 'visual',
    label: 'Visual',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="9" y1="21" x2="9" y2="9" />
      </svg>
    ),
  },
  {
    id: 'preview',
    label: 'Preview',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
];

export function WorkspaceLayout() {
  const [tab, setTab] = useState<EditorTab>('code');
  const [showFiles, setShowFiles] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const project = useProjectStore((s) => s.project);

  // Initialize WebSocket connection for this project
  useSocket(project?.id);

  const handleExport = useCallback(async () => {
    if (!project) return;
    try {
      const response = await fetch(`/api/v1/projects/${project.id}/export`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    }
  }, [project]);

  const toggleFiles = useCallback(() => setShowFiles((v) => !v), []);
  const toggleChat = useCallback(() => setShowChat((v) => !v), []);
  const toggleShortcuts = useCallback(() => setShowShortcuts((v) => !v), []);

  const shortcuts = useMemo(
    () => [
      { key: '1', action: () => setTab('code'), description: 'Code tab' },
      { key: '2', action: () => setTab('visual'), description: 'Visual tab' },
      { key: '3', action: () => setTab('preview'), description: 'Preview tab' },
      { key: 'b', action: toggleFiles, description: 'Toggle files' },
      { key: 'j', action: toggleChat, description: 'Toggle chat' },
      { key: 'e', action: () => void handleExport(), description: 'Export' },
      { key: '?', shift: true, action: toggleShortcuts, description: 'Shortcuts' },
    ],
    [toggleFiles, toggleChat, toggleShortcuts, handleExport],
  );

  useKeyboardShortcuts(shortcuts);

  const breadcrumbs = project
    ? [{ label: 'Projects', to: '/' }, { label: project.name }]
    : undefined;

  const headerActions = (
    <div className="flex items-center gap-1">
      <ToggleButton
        active={showFiles}
        onClick={toggleFiles}
        title="Toggle file tree (B)"
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>
        }
      />
      <ToggleButton
        active={showChat}
        onClick={toggleChat}
        title="Toggle chat panel (J)"
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        }
      />
      <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px' }} />
      <button
        onClick={() => void handleExport()}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-3)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        title="Export project (E)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Export
      </button>
      <button
        onClick={toggleShortcuts}
        className="flex items-center justify-center w-7 h-7 rounded-lg text-xs transition-colors"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-3)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        title="Keyboard shortcuts (?)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
          <line x1="6" y1="8" x2="6" y2="8" />
          <line x1="10" y1="8" x2="10" y2="8" />
          <line x1="14" y1="8" x2="14" y2="8" />
          <line x1="18" y1="8" x2="18" y2="8" />
          <line x1="6" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="18" y2="12" />
          <line x1="8" y1="16" x2="16" y2="16" />
        </svg>
      </button>
    </div>
  );

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <AppHeader breadcrumbs={breadcrumbs} actions={headerActions} />

      {/* Editor tab bar */}
      <div
        className="flex items-center px-3 py-1 shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}
      >
        <div className="flex items-center gap-0.5">
          {TAB_CONFIG.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors"
              style={{
                background: tab === t.id ? 'var(--bg-3)' : 'transparent',
                color: tab === t.id ? 'var(--text)' : 'var(--text-muted)',
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <PanelGroup direction="horizontal" className="flex-1">
        {/* File tree */}
        {showFiles && (
          <>
            <Panel defaultSize={15} minSize={10} maxSize={30}>
              <FileTree />
            </Panel>
            <PanelResizeHandle
              className="w-1 transition-colors hover:bg-[var(--accent)]"
              style={{ background: 'var(--border)' }}
            />
          </>
        )}

        {/* Center: code / visual / preview */}
        <Panel defaultSize={
          showFiles && showChat ? 55
          : showFiles ? 85
          : showChat ? 70
          : 100
        } minSize={30}>
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-hidden relative">
              {tab === 'code' && <CodeEditor />}
              {tab === 'preview' && <PreviewFrame />}
              <GrapesEditor visible={tab === 'visual'} />
            </div>
          </div>
        </Panel>

        {/* Chat */}
        {showChat && (
          <>
            <PanelResizeHandle
              className="w-1 transition-colors hover:bg-[var(--accent)]"
              style={{ background: 'var(--border)' }}
            />
            <Panel defaultSize={30} minSize={20} maxSize={50}>
              <ChatPanel />
            </Panel>
          </>
        )}
      </PanelGroup>

      <KeyboardShortcutsHelp open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  title,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
      style={{
        background: active ? 'var(--bg-3)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--bg-3)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      {icon}
    </button>
  );
}
