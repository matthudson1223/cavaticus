export const WS_EVENTS = {
  // Client -> Server
  CHAT_SEND: 'chat:send',
  // Server -> Client
  CHAT_CHUNK: 'chat:chunk',
  CHAT_DONE: 'chat:done',
  FILE_CHANGED: 'file:changed',
  AGENT_STATUS: 'agent:status',
  AGENT_ERROR: 'agent:error',
} as const;

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

export interface ChatSendPayload {
  projectId: string;
  content: string;
  attachments?: import('./types.js').Attachment[];
  modelId?: string;
}

export interface ChatChunkPayload {
  messageId: string;
  chunk: string;
}

export interface ChatDonePayload {
  messageId: string;
  message: import('./types.js').ChatMessage;
}

export interface FileChangedPayload {
  projectId: string;
  file: import('./types.js').ProjectFile;
}

export interface AgentStatusPayload {
  status: 'thinking' | 'coding' | 'idle';
}
