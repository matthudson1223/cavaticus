import { create } from 'zustand';
import { debug } from '../lib/debug';
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
  deleteFile: (id: string) => void;
  renameFile: (id: string, newPath: string) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  project: null,
  files: [],
  activeFileId: null,
  setProject: (project) => {
    debug('store', `setProject: ${project?.name}`);
    set({ project });
  },
  setFiles: (files) => {
    debug('store', `setFiles: ${files.length} files`);
    set({ files });
  },
  setActiveFile: (activeFileId) => {
    debug('store', `setActiveFile: ${activeFileId}`);
    set({ activeFileId });
  },
  updateFileContent: (id, content) => {
    debug('store', `updateFileContent: id=${id} (${content.length} chars)`);
    set((s) => ({
      files: s.files.map((f) => (f.id === id ? { ...f, content } : f)),
    }));
  },
  upsertFile: (file) => {
    debug('store', `upsertFile: ${file.path}`);
    set((s) => {
      const exists = s.files.find((f) => f.id === file.id);
      return {
        files: exists
          ? s.files.map((f) => (f.id === file.id ? file : f))
          : [...s.files, file],
      };
    });
  },
  deleteFile: (id) => {
    debug('store', `deleteFile: ${id}`);
    set((s) => ({
      files: s.files.filter((f) => f.id !== id),
      activeFileId: s.activeFileId === id ? null : s.activeFileId,
    }));
  },
  renameFile: (id, newPath) => {
    debug('store', `renameFile: ${id} -> ${newPath}`);
    set((s) => ({
      files: s.files.map((f) =>
        f.id === id ? { ...f, path: newPath } : f
      ),
    }));
  },
}));
