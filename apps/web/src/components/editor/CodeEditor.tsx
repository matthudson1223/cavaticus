import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { useCallback, useRef } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { api } from '../../lib/api';
import type { ProjectFile } from '@cavaticus/shared';

function getExtensions(mimeType: string) {
  if (mimeType === 'text/html') return [html()];
  if (mimeType === 'text/css') return [css()];
  if (
    mimeType === 'application/javascript' ||
    mimeType === 'text/javascript' ||
    mimeType === 'text/typescript'
  ) {
    return [javascript({ typescript: mimeType === 'text/typescript' })];
  }
  return [];
}

export function CodeEditor() {
  const files = useProjectStore((s) => s.files);
  const activeFileId = useProjectStore((s) => s.activeFileId);
  const updateFileContent = useProjectStore((s) => s.updateFileContent);
  const project = useProjectStore((s) => s.project);

  const activeFile = files.find((f) => f.id === activeFileId);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (value: string) => {
      if (!activeFile || !project) return;
      updateFileContent(activeFile.id, value);

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        api.put<{ file: ProjectFile }>(
          `/api/v1/projects/${project.id}/files/${activeFile.id}`,
          { content: value },
        ).catch(console.error);
      }, 500);
    },
    [activeFile, project, updateFileContent],
  );

  if (!activeFile) {
    return (
      <div
        className="h-full flex items-center justify-center"
        style={{ background: '#1e2030', color: 'var(--text-muted)' }}
      >
        Select a file to edit
      </div>
    );
  }

  return (
    <CodeMirror
      value={activeFile.content}
      onChange={handleChange}
      extensions={getExtensions(activeFile.mimeType)}
      theme={oneDark}
      height="100%"
      style={{ height: '100%', fontSize: 14 }}
    />
  );
}
