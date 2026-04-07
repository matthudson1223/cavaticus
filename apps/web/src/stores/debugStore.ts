import { create } from 'zustand';

export interface DebugMessage {
  id: string;
  component: string;
  message: string;
  timestamp: string;
  data?: unknown;
}

interface DebugState {
  messages: DebugMessage[];
  addMessage: (component: string, message: string, data?: unknown) => void;
  clear: () => void;
}

export const useDebugStore = create<DebugState>((set) => ({
  messages: [],
  addMessage: (component, message, data) => {
    const debugMsg: DebugMessage = {
      id: `debug-${Date.now()}-${Math.random()}`,
      component,
      message,
      timestamp: new Date().toISOString(),
      data,
    };
    set((s) => ({
      messages: [...s.messages, debugMsg].slice(-50), // Keep last 50
    }));
  },
  clear: () => set({ messages: [] }),
}));
