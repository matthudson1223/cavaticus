import { create } from 'zustand';
import type { Project, ProjectFile } from '@cavaticus/shared';

interface ProjectState {
  project: Project | null;
  files: ProjectFile[];
  activeFileId: string | null;
  setProject: (p: Project) => void;
  setFiles: (files: ProjectFile[]) => void;
  setActiveFile: (id: string | null) => void;
  updateFileContent: (id: string, content: string) => void;
  upsertFile: (file: ProjectFile) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  project: null,
  files: [],
  activeFileId: null,
  setProject: (project) => set({ project }),
  setFiles: (files) => set({ files }),
  setActiveFile: (activeFileId) => set({ activeFileId }),
  updateFileContent: (id, content) =>
    set((s) => ({
      files: s.files.map((f) => (f.id === id ? { ...f, content } : f)),
    })),
  upsertFile: (file) =>
    set((s) => {
      const exists = s.files.find((f) => f.id === file.id);
      return {
        files: exists
          ? s.files.map((f) => (f.id === file.id ? file : f))
          : [...s.files, file],
      };
    }),
}));
