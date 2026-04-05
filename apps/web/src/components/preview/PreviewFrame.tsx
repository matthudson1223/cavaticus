import { useEffect, useRef } from 'react';
import { useProjectStore } from '../../stores/projectStore';

function buildSrcDoc(
  files: Array<{ path: string; content: string; mimeType: string }>,
): string {
  const html = files.find((f) => f.path === 'index.html')?.content ?? '';
  const css = files
    .filter((f) => f.mimeType === 'text/css')
    .map((f) => `<style>${f.content}</style>`)
    .join('\n');
  const js = files
    .filter(
      (f) =>
        f.mimeType === 'application/javascript' ||
        f.mimeType === 'text/javascript',
    )
    .filter((f) => f.path !== 'script.js' || true) // include all JS
    .map((f) => `<script>${f.content}</script>`)
    .join('\n');

  // Inject CSS and JS into HTML
  if (html.includes('</head>')) {
    return html.replace('</head>', `${css}\n</head>`).replace('</body>', `${js}\n</body>`);
  }
  return `${html}\n${css}\n${js}`;
}

export function PreviewFrame() {
  const files = useProjectStore((s) => s.files);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (iframeRef.current) {
        iframeRef.current.srcdoc = buildSrcDoc(files);
      }
    }, 300);
  }, [files]);

  return (
    <iframe
      ref={iframeRef}
      title="Preview"
      sandbox="allow-scripts allow-same-origin"
      className="w-full h-full border-0"
      style={{ background: '#fff' }}
    />
  );
}
