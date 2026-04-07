import { useNavigate, useParams } from '@tanstack/react-router';
import { useEffect } from 'react';
import { api } from '../lib/api';
import { useProjectStore } from '../stores/projectStore';
import { useChatStore } from '../stores/chatStore';
import { WorkspaceLayout } from '../components/layout/WorkspaceLayout';
import { useSocket } from '../hooks/useSocket';
import type { Project, ProjectFile } from '@cavaticus/shared';

export function workspaceComponent() {
  const { id } = useParams({ strict: false }) as { id: string };
  const navigate = useNavigate();

  const setProject = useProjectStore((s) => s.setProject);
  const setFiles = useProjectStore((s) => s.setFiles);
  const setActiveFile = useProjectStore((s) => s.setActiveFile);
  const setMessages = useChatStore((s) => s.setMessages);
  useSocket(id);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [{ project }, { files }, chatMessages] = await Promise.all([
          api.get<{ project: Project }>(`/api/v1/projects/${id}`),
          api.get<{ files: Array<Pick<ProjectFile, 'id' | 'path' | 'mimeType'>> }>(
            `/api/v1/projects/${id}/files`,
          ),
          api.get<any[]>(`/api/v1/projects/${id}/chat`),
        ]);

        const fullFiles = await Promise.all(
          files.map((f) =>
            api
              .get<{ file: ProjectFile }>(`/api/v1/projects/${id}/files/${f.id}`)
              .then((r) => r.file),
          ),
        );

        if (cancelled) return;
        setProject(project);
        setFiles(fullFiles);
        setMessages(chatMessages || []);
        if (fullFiles.length > 0) {
          const indexHtml = fullFiles.find((f) => f.path === 'index.html');
          setActiveFile(indexHtml?.id ?? fullFiles[0]!.id);
        }
      } catch {
        void navigate({ to: '/auth' });
      }
    }

    void load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return <WorkspaceLayout />;
}
