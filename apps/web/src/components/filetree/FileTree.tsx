import { useState } from 'react';
import type { ProjectFile } from '@cavaticus/shared';
import { useProjectStore } from '../../stores/projectStore';
import { api } from '../../lib/api';

interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  children: TreeNode[];
  file?: ProjectFile;
}

function buildTree(files: ProjectFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]!;
      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join('/');

      let node = current.find((n) => n.name === name);
      if (!node) {
        node = { name, path, isFile, children: [], file: isFile ? file : undefined };
        current.push(node);
      }
      current = node.children;
    }
  }

  return root;
}

function fileIcon(name: string): string {
  if (name.endsWith('.html')) return '🌐';
  if (name.endsWith('.css')) return '🎨';
  if (name.endsWith('.js') || name.endsWith('.mjs')) return '⚡';
  if (name.endsWith('.ts') || name.endsWith('.tsx')) return '📘';
  if (name.endsWith('.json')) return '{}';
  if (name.endsWith('.md')) return '📄';
  if (name.endsWith('.svg')) return '🖼';
  return '📄';
}

interface ContextMenuProps {
  depth: number;
  onRename: () => void;
  onDelete: () => void;
}

function ContextMenu({ depth, onRename, onDelete }: ContextMenuProps) {
  const menuButtonStyle = {
    display: 'block' as const,
    width: '100%',
    padding: '8px 12px',
    textAlign: 'left' as const,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '14px',
    color: 'var(--text)',
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: '100%',
        left: `${8 + depth * 16}px`,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: '4px',
        minWidth: '120px',
        zIndex: 100,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}
    >
      <button
        onClick={onRename}
        style={menuButtonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        Rename
      </button>
      <button
        onClick={onDelete}
        style={menuButtonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        Delete
      </button>
    </div>
  );
}

interface RenameDialogProps {
  fileName: string;
  isOpen: boolean;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: (newName: string) => Promise<void>;
}

function RenameDialog({ fileName, isOpen, isLoading, onClose, onConfirm }: RenameDialogProps) {
  const [newName, setNewName] = useState(fileName);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    await onConfirm(newName);
    setNewName(fileName);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-elevated)',
          padding: '20px',
          borderRadius: '8px',
          minWidth: '300px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold', color: 'var(--text)' }}>
          Rename File
        </h2>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') onClose();
          }}
          autoFocus
          style={{
            width: '100%',
            padding: '8px 12px',
            marginBottom: '16px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            background: 'var(--bg)',
            color: 'var(--text)',
            fontSize: '14px',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              padding: '8px 16px',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              background: 'var(--bg)',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              background: 'var(--accent)',
              color: '#fff',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {isLoading ? 'Renaming...' : 'Rename'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface NewFileDialogProps {
  isOpen: boolean;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: (fileName: string) => Promise<void>;
}

function NewFileDialog({ isOpen, isLoading, onClose, onConfirm }: NewFileDialogProps) {
  const [fileName, setFileName] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (fileName.trim()) {
      await onConfirm(fileName.trim());
      setFileName('');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-elevated)',
          padding: '20px',
          borderRadius: '8px',
          minWidth: '300px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold', color: 'var(--text)' }}>
          New File
        </h2>
        <input
          type="text"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          placeholder="filename.txt"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') onClose();
          }}
          autoFocus
          style={{
            width: '100%',
            padding: '8px 12px',
            marginBottom: '16px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            background: 'var(--bg)',
            color: 'var(--text)',
            fontSize: '14px',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              padding: '8px 16px',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              background: 'var(--bg)',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !fileName.trim()}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              background: 'var(--accent)',
              color: '#fff',
              cursor: isLoading || !fileName.trim() ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              opacity: isLoading || !fileName.trim() ? 0.6 : 1,
            }}
          >
            {isLoading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface DeleteDialogProps {
  fileName: string;
  isOpen: boolean;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

function DeleteDialog({ fileName, isOpen, isLoading, onClose, onConfirm }: DeleteDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-elevated)',
          padding: '20px',
          borderRadius: '8px',
          minWidth: '300px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 'bold', color: 'var(--text)' }}>
          Delete File?
        </h2>
        <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--text-muted)' }}>
          Are you sure you want to delete <strong>{fileName}</strong>? This cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              padding: '8px 16px',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              background: 'var(--bg)',
              color: 'var(--text)',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              background: '#dc2626',
              color: '#fff',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {isLoading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface FileNodeProps {
  node: TreeNode;
  depth: number;
  projectId?: string;
}

function FileNode({ node, depth, projectId }: FileNodeProps) {
  const activeFileId = useProjectStore((s) => s.activeFileId);
  const setActiveFile = useProjectStore((s) => s.setActiveFile);
  const deleteFile = useProjectStore((s) => s.deleteFile);
  const renameFile = useProjectStore((s) => s.renameFile);

  const isActive = node.file && activeFileId === node.file.id;
  const [showMenu, setShowMenu] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleDelete = async () => {
    if (!node.file || !projectId) return;

    setIsLoading(true);
    try {
      await api.del(`/api/v1/projects/${projectId}/files/${node.file.id}`);
      deleteFile(node.file.id);
      setDeleteOpen(false);
    } catch (err) {
      alert(`Failed to delete file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRename = async (newName: string) => {
    if (!node.file || !projectId || newName === node.name) {
      setRenameOpen(false);
      return;
    }

    const newPath = node.path.substring(0, node.path.lastIndexOf('/') + 1) + newName;

    setIsLoading(true);
    try {
      const result = await api.patch<{ file: ProjectFile }>(
        `/api/v1/projects/${projectId}/files/${node.file.id}`,
        { path: newPath }
      );
      renameFile(node.file.id, result.file.path);
      setRenameOpen(false);
    } catch (err) {
      alert(`Failed to rename file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div
        onContextMenu={(e) => {
          e.preventDefault();
          if (node.isFile) setShowMenu(true);
        }}
        style={{ position: 'relative' }}
      >
        <button
          onClick={() => node.file && setActiveFile(node.file.id)}
          className="flex items-center gap-1.5 w-full text-left px-2 py-1 rounded text-sm transition-colors"
          style={{
            paddingLeft: `${8 + depth * 16}px`,
            background: isActive ? 'var(--accent)' : 'transparent',
            color: isActive ? '#fff' : node.isFile ? 'var(--text)' : 'var(--text-muted)',
          }}
        >
          <span className="text-xs">{node.isFile ? fileIcon(node.name) : '📁'}</span>
          <span className="truncate">{node.name}</span>
        </button>

        {showMenu && node.isFile && (
          <ContextMenu
            depth={depth}
            onRename={() => {
              setRenameOpen(true);
              setShowMenu(false);
            }}
            onDelete={() => {
              setDeleteOpen(true);
              setShowMenu(false);
            }}
          />
        )}

        {showMenu && (
          <div
            onClick={() => setShowMenu(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 50,
            }}
          />
        )}
      </div>

      <RenameDialog
        fileName={node.name}
        isOpen={renameOpen}
        isLoading={isLoading}
        onClose={() => setRenameOpen(false)}
        onConfirm={handleRename}
      />

      <DeleteDialog
        fileName={node.name}
        isOpen={deleteOpen}
        isLoading={isLoading}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />

      {node.children.map((child) => (
        <FileNode key={child.path} node={child} depth={depth + 1} projectId={projectId} />
      ))}
    </>
  );
}

export function FileTree() {
  const files = useProjectStore((s) => s.files);
  const project = useProjectStore((s) => s.project);
  const upsertFile = useProjectStore((s) => s.upsertFile);
  const tree = buildTree(files);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleCreateFile = async (fileName: string) => {
    if (!project) return;

    setIsLoading(true);
    try {
      const result = await api.post<{ file: ProjectFile }>(
        `/api/v1/projects/${project.id}/files`,
        { path: fileName }
      );
      upsertFile(result.file);
      setNewFileOpen(false);
    } catch (err) {
      alert(`Failed to create file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="h-full overflow-y-auto py-2"
      style={{ borderRight: '1px solid var(--border)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}>
        <p className="px-3 py-1 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Files
        </p>
        <button
          onClick={() => setNewFileOpen(true)}
          style={{
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            borderRadius: '4px',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '16px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-hover)';
            e.currentTarget.style.color = 'var(--text)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
        >
          +
        </button>
      </div>
      {tree.map((node) => (
        <FileNode key={node.path} node={node} depth={0} projectId={project?.id} />
      ))}
      <NewFileDialog
        isOpen={newFileOpen}
        isLoading={isLoading}
        onClose={() => setNewFileOpen(false)}
        onConfirm={handleCreateFile}
      />
    </div>
  );
}
