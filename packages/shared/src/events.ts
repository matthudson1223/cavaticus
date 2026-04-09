export const WS_EVENTS = {
  // Client -> Server
  CHAT_SEND: 'chat:send',
  CHAT_CANCEL: 'chat:cancel',
  // Server -> Client
  CHAT_CHUNK: 'chat:chunk',
  CHAT_DONE: 'chat:done',
  FILE_CHANGED: 'file:changed',
  AGENT_STATUS: 'agent:status',
  AGENT_ERROR: 'agent:error',
  TASK_UPDATED: 'task:updated',
  AGENT_TOOL_USE: 'agent:tool_use',
  AGENT_THINKING: 'agent:thinking',
} as const;

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

export interface ChatSendPayload {
  projectId: string;
  content: string;
  attachments?: import('./types.js').Attachment[];
  modelId?: string;
}

export interface ChatCancelPayload {
  messageId: string;
}

export interface ChatChunkPayload {
  messageId: string;
  chunk: string;
}

export interface ChatDonePayload {
  messageId: string;
  message: import('./types.js').ChatMessage;
  fileChanges: import('./types.js').FileChange[];
}

export interface FileChangedPayload {
  projectId: string;
  file: import('./types.js').ProjectFile;
}

export interface AgentStatusPayload {
  status: 'thinking' | 'coding' | 'idle';
}

export interface AgentToolUsePayload {
  messageId: string;
  toolName: string;
}

export interface AgentThinkingPayload {
  messageId: string;
  text: string;
}

export interface TaskUpdatedPayload {
  projectId: string;
  task: import('./types.js').Task;
}
