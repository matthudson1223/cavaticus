import { create } from 'zustand';
import type { ChatMessage } from '@cavaticus/shared';

interface ChatState {
  messages: ChatMessage[];
  agentStatus: 'thinking' | 'coding' | 'idle';
  setMessages: (msgs: ChatMessage[]) => void;
  addMessage: (msg: ChatMessage) => void;
  appendChunk: (messageId: string, chunk: string) => void;
  replaceMessage: (msg: ChatMessage) => void;
  setAgentStatus: (status: 'thinking' | 'coding' | 'idle') => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  agentStatus: 'idle',
  setMessages: (messages) => set({ messages }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  appendChunk: (messageId, chunk) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, content: m.content + chunk } : m,
      ),
    })),
  replaceMessage: (msg) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === msg.id ? msg : m)),
    })),
  setAgentStatus: (agentStatus) => set({ agentStatus }),
}));
