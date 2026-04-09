interface ShortcutEntry {
  keys: string;
  description: string;
}

const SHORTCUTS: ShortcutEntry[] = [
  { keys: '1', description: 'Switch to Code editor' },
  { keys: '2', description: 'Switch to Visual editor' },
  { keys: '3', description: 'Switch to Preview' },
  { keys: 'B', description: 'Toggle file tree sidebar' },
  { keys: 'J', description: 'Toggle chat panel' },
  { keys: 'E', description: 'Export project as ZIP' },
  { keys: '?', description: 'Show keyboard shortcuts' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsHelp({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl overflow-hidden"
        style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="text-sm px-2 py-1 rounded transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-3)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Esc
          </button>
        </div>
        <div className="px-5 py-3 space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between py-1">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {s.description}
              </span>
              <kbd
                className="px-2 py-0.5 rounded text-xs font-mono"
                style={{
                  background: 'var(--bg-3)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
              >
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
