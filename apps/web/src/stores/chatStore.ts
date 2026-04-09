import { create } from 'zustand';
import { debug } from '../lib/debug';
import type { ChatMessage, FileChange } from '@cavaticus/shared';

export interface ToolStep {
  toolName: string;
  timestamp: number;
}

export interface MessageActivity {
  toolSteps: ToolStep[];
  thinkingText: string;
  fileChanges: FileChange[];
  startedAt: number;
  completedAt: number | null;
}

interface ChatState {
  messages: ChatMessage[];
  agentStatus: 'thinking' | 'coding' | 'idle';
  selectedModelId: string | null;
  currentMessageId: string | null;
  /** Per-message activity tracking (tool steps, thinking, file changes) */
  activity: Record<string, MessageActivity>;
  setMessages: (msgs: ChatMessage[]) => void;
  addMessage: (msg: ChatMessage) => void;
  appendChunk: (messageId: string, chunk: string) => void;
  replaceMessage: (msg: ChatMessage) => void;
  setAgentStatus: (status: 'thinking' | 'coding' | 'idle') => void;
  setSelectedModelId: (id: string | null) => void;
  setCurrentMessageId: (id: string | null) => void;
  addToolStep: (messageId: string, toolName: string) => void;
  setThinking: (messageId: string, text: string) => void;
  completeActivity: (messageId: string, fileChanges: FileChange[]) => void;
}

function ensureActivity(activity: Record<string, MessageActivity>, messageId: string): MessageActivity {
  if (!activity[messageId]) {
    activity[messageId] = {
      toolSteps: [],
      thinkingText: '',
      fileChanges: [],
      startedAt: Date.now(),
      completedAt: null,
    };
  }
  return activity[messageId]!;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  agentStatus: 'idle',
  selectedModelId: null,
  currentMessageId: null,
  activity: {},
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
  addToolStep: (messageId, toolName) => {
    debug('store', `addToolStep: ${messageId} → ${toolName}`);
    set((s) => {
      const activity = { ...s.activity };
      const a = ensureActivity(activity, messageId);
      activity[messageId] = {
        ...a,
        toolSteps: [...a.toolSteps, { toolName, timestamp: Date.now() }],
      };
      return { activity };
    });
  },
  setThinking: (messageId, text) => {
    debug('store', `setThinking: ${messageId} (${text.length} chars)`);
    set((s) => {
      const activity = { ...s.activity };
      const a = ensureActivity(activity, messageId);
      activity[messageId] = { ...a, thinkingText: text };
      return { activity };
    });
  },
  completeActivity: (messageId, fileChanges) => {
    debug('store', `completeActivity: ${messageId}, ${fileChanges.length} file changes`);
    set((s) => {
      const activity = { ...s.activity };
      const a = ensureActivity(activity, messageId);
      activity[messageId] = { ...a, fileChanges, completedAt: Date.now() };
      return { activity };
    });
  },
}));
