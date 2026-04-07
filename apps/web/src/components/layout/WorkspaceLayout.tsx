import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useState } from 'react';
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
              className="flex items-center gap-1 px-3 py-1"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
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
