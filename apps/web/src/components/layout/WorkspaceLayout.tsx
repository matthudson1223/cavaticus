import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useState } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { FileTree } from '../filetree/FileTree';
import { CodeEditor } from '../editor/CodeEditor';
import { GrapesEditor } from '../editor/GrapesEditor';
import { PreviewFrame } from '../preview/PreviewFrame';
import { ChatPanel } from '../chat/ChatPanel';

type EditorTab = 'code' | 'visual' | 'preview';

const TAB_LABELS: Record<EditorTab, string> = {
  code: 'Code',
  visual: 'Visual',
  preview: 'Preview',
};

export function WorkspaceLayout() {
  const [tab, setTab] = useState<EditorTab>('code');
  const project = useProjectStore((s) => s.project);

  const handleExport = async () => {
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
  };

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <PanelGroup direction="horizontal" className="flex-1">
        {/* File tree */}
        <Panel defaultSize={15} minSize={10} maxSize={30}>
          <FileTree />
        </Panel>

        <PanelResizeHandle
          className="w-1 transition-colors"
          style={{ background: 'var(--border)' }}
        />

        {/* Center: code / visual / preview */}
        <Panel defaultSize={55} minSize={30}>
          <div className="h-full flex flex-col">
            <div
              className="flex items-center justify-between px-3 py-1"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-1">
                {(['code', 'visual', 'preview'] as EditorTab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className="px-3 py-1 rounded text-sm transition-colors"
                    style={{
                      background: tab === t ? 'var(--bg-3)' : 'transparent',
                      color: tab === t ? 'var(--text)' : 'var(--text-muted)',
                    }}
                  >
                    {TAB_LABELS[t]}
                  </button>
                ))}
              </div>
              <button
                onClick={handleExport}
                className="px-3 py-1 rounded text-sm transition-colors"
                style={{
                  background: 'var(--bg-3)',
                  color: 'var(--text)',
                }}
              >
                Export
              </button>
            </div>

            <div className="flex-1 overflow-hidden relative">
              {/* Code and Preview unmount when not active */}
              {tab === 'code' && <CodeEditor />}
              {tab === 'preview' && <PreviewFrame />}

              {/* GrapesEditor stays mounted once initialized to preserve editor state */}
              <GrapesEditor visible={tab === 'visual'} />
            </div>
          </div>
        </Panel>

        <PanelResizeHandle
          className="w-1 transition-colors"
          style={{ background: 'var(--border)' }}
        />

        {/* Chat */}
        <Panel defaultSize={30} minSize={20} maxSize={50}>
          <ChatPanel />
        </Panel>
      </PanelGroup>
    </div>
  );
}
