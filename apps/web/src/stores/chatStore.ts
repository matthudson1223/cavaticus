import { create } from 'zustand';
import { debug } from '../lib/debug';
import type { ChatMessage } from '@cavaticus/shared';

interface ChatState {
  messages: ChatMessage[];
  agentStatus: 'thinking' | 'coding' | 'idle';
  selectedModelId: string | null;
  currentMessageId: string | null;
  setMessages: (msgs: ChatMessage[]) => void;
  addMessage: (msg: ChatMessage) => void;
  appendChunk: (messageId: string, chunk: string) => void;
  replaceMessage: (msg: ChatMessage) => void;
  setAgentStatus: (status: 'thinking' | 'coding' | 'idle') => void;
  setSelectedModelId: (id: string | null) => void;
  setCurrentMessageId: (id: string | null) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  agentStatus: 'idle',
  selectedModelId: null,
  currentMessageId: null,
  setMessages: (messages) => {
    debug('store', `setMessages: ${messages.length} messages`);
    set({ messages });
  },
  addMessage: (msg) => {
    debug('store', `addMessage: ${msg.role} (${msg.content.length} chars)`);
    set((s) => ({ messages: [...s.messages, msg] }));
  },
  appendChunk: (messageId, chunk) => {
    debug('store', `appendChunk: messageId=${messageId} (${chunk.length} chars)`);
    set((s) => {
      const exactMatch = s.messages.some((m) => m.id === messageId);
      if (exactMatch) {
        return {
          messages: s.messages.map((m) =>
            m.id === messageId ? { ...m, content: m.content + chunk } : m,
          ),
        };
      }
      // Fallback: find the last assistant placeholder (streaming-*) and claim it
      const messages = [...s.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]!.role === 'assistant' && messages[i]!.id.startsWith('streaming-')) {
          messages[i] = { ...messages[i]!, id: messageId, content: messages[i]!.content + chunk };
          break;
        }
      }
      return { messages };
    });
  },
  replaceMessage: (msg) => {
    debug('store', `replaceMessage: messageId=${msg.id} (${msg.content.length} chars)`);
    set((s) => {
      const exactMatch = s.messages.some((m) => m.id === msg.id);
      if (exactMatch) {
        return { messages: s.messages.map((m) => (m.id === msg.id ? msg : m)) };
      }
      // Fallback: replace the last assistant message
      const messages = [...s.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]!.role === 'assistant') {
          messages[i] = msg;
          break;
        }
      }
      return { messages };
    });
  },
  setAgentStatus: (agentStatus) => {
    debug('store', `setAgentStatus: ${agentStatus}`);
    set({ agentStatus });
  },
  setSelectedModelId: (selectedModelId) => {
    debug('store', `setSelectedModelId: ${selectedModelId}`);
    set({ selectedModelId });
  },
  setCurrentMessageId: (currentMessageId) => {
    debug('store', `setCurrentMessageId: ${currentMessageId}`);
    set({ currentMessageId });
  },
}));
