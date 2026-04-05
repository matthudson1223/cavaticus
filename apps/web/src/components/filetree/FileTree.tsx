import type { ProjectFile } from '@cavaticus/shared';
import { useProjectStore } from '../../stores/projectStore';

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

function FileNode({ node, depth }: { node: TreeNode; depth: number }) {
  const activeFileId = useProjectStore((s) => s.activeFileId);
  const setActiveFile = useProjectStore((s) => s.setActiveFile);
  const isActive = node.file && activeFileId === node.file.id;

  return (
    <div>
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
      {node.children.map((child) => (
        <FileNode key={child.path} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function FileTree() {
  const files = useProjectStore((s) => s.files);
  const tree = buildTree(files);

  return (
    <div
      className="h-full overflow-y-auto py-2"
      style={{ borderRight: '1px solid var(--border)' }}
    >
      <p className="px-3 py-1 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        Files
      </p>
      {tree.map((node) => (
        <FileNode key={node.path} node={node} depth={0} />
      ))}
    </div>
  );
}
