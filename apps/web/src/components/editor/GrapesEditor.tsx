import { useEffect, useRef } from 'react';
import grapesjs from 'grapesjs';
import type { Editor } from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import { useProjectStore } from '../../stores/projectStore';
import { api } from '../../lib/api';

// ── HTML helpers ─────────────────────────────────────────────────────────────

function extractBody(html: string): string {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1]! : html;
}

function rebuildHtml(original: string, newBody: string): string {
  // Replace only the body content, preserving <head> and outer tags
  if (/<body[^>]*>/i.test(original)) {
    return original.replace(
      /(<body[^>]*>)[\s\S]*?(<\/body>)/i,
      `$1\n${newBody}\n$2`,
    );
  }
  return newBody;
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
}

export function GrapesEditor({ visible }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const initializedRef = useRef(false);
  // IDs of files we just saved from GrapesJS — skip syncing those back in
  const recentGrapesSaves = useRef<Set<string>>(new Set());

  const files = useProjectStore((s) => s.files);
  const project = useProjectStore((s) => s.project);
  const updateFileContent = useProjectStore((s) => s.updateFileContent);

  // ── Init GrapesJS the first time the tab becomes visible ──────────────────
  useEffect(() => {
    if (!visible || initializedRef.current || !containerRef.current) return;
    initializedRef.current = true;

    const htmlFile = files.find((f) => f.path === 'index.html');
    const cssFiles = files.filter((f) => f.mimeType === 'text/css');

    const bodyHtml = htmlFile
      ? extractBody(htmlFile.content)
      : '<p>No index.html found in this project.</p>';
    const cssContent = cssFiles.map((f) => f.content).join('\n');

    const editor = grapesjs.init({
      container: containerRef.current,
      fromElement: false,
      storageManager: false,
      width: 'auto',
      height: '100%',
      components: bodyHtml,
      style: cssContent,
      deviceManager: {
        devices: [
          { name: 'Desktop', width: '' },
          { name: 'Tablet', width: '768px', widthMedia: '992px' },
          { name: 'Mobile', width: '375px', widthMedia: '480px' },
        ],
      },
    });

    editorRef.current = editor;

    // ── Save back to store + API on user edits ──────────────────────────────
    let saveTimer: ReturnType<typeof setTimeout>;

    editor.on('update', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        if (!project) return;

        const latestFiles = useProjectStore.getState().files;
        const latestHtml = latestFiles.find((f) => f.path === 'index.html');
        const latestCss = latestFiles.filter((f) => f.mimeType === 'text/css');

        const newBody = editor.getHtml();
        const newCss = editor.getCss() ?? '';

        if (latestHtml) {
          const newHtml = rebuildHtml(latestHtml.content, newBody);
          recentGrapesSaves.current.add(latestHtml.id);
          updateFileContent(latestHtml.id, newHtml);
          api
            .put(`/api/v1/projects/${project.id}/files/${latestHtml.id}`, {
              content: newHtml,
            })
            .catch(console.error)
            .finally(() => {
              setTimeout(() => recentGrapesSaves.current.delete(latestHtml.id), 500);
            });
        }

        // Write all CSS back into the first CSS file (or style.css if present)
        const targetCss =
          latestCss.find((f) => f.path === 'style.css' || f.path === 'styles.css') ??
          latestCss[0];
        if (targetCss && newCss) {
          recentGrapesSaves.current.add(targetCss.id);
          updateFileContent(targetCss.id, newCss);
          api
            .put(`/api/v1/projects/${project.id}/files/${targetCss.id}`, {
              content: newCss,
            })
            .catch(console.error)
            .finally(() => {
              setTimeout(() => recentGrapesSaves.current.delete(targetCss.id), 500);
            });
        }
      }, 800);
    });

    return () => {
      clearTimeout(saveTimer);
      editor.destroy();
      editorRef.current = null;
      initializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ── Sync external file changes (AI agent) into GrapesJS ───────────────────
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const htmlFile = files.find((f) => f.path === 'index.html');
    const cssFiles = files.filter((f) => f.mimeType === 'text/css');

    if (!htmlFile || recentGrapesSaves.current.has(htmlFile.id)) return;

    const newBody = extractBody(htmlFile.content);
    const newCss = cssFiles.map((f) => f.content).join('\n');

    // Avoid no-op syncs
    if (newBody === editor.getHtml()) return;

    editor.setComponents(newBody);
    editor.setStyle(newCss);
  }, [files]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: visible ? 'block' : 'none',
      }}
    />
  );
}
