export type ApiKeyProvider = string;

export interface UserModel {
  id: string;
  userId: string;
  modelId: string;
  label: string | null;
  addedAt: string;
}

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  path: string;
  content: string;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  projectId: string;
  role: 'user' | 'assistant';
  content: string;
  attachments: Attachment[];
  createdAt: string;
}

export interface Attachment {
  type: 'image';
  mimeType: string;
  data: string; // base64
}

export interface UserSettings {
  userId: string;
  theme: 'light' | 'dark';
  defaultProvider: ApiKeyProvider | null;
  editorFontSize: number;
}

export interface FileChange {
  path: string;
  action: 'created' | 'modified' | 'deleted';
  content?: string;
}

export interface AgentRequest {
  provider: ApiKeyProvider;
  apiKey: string;
  projectFiles: Array<{ path: string; content: string }>;
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  userMessage: string;
  attachments?: Attachment[];
  openrouterModel?: string;
  projectId?: string;
  // Unified multi-provider fields — set model to use any supported provider
  model?: string;       // e.g. "claude-opus-4-6", "gpt-4o", "ollama/llama3.3"
  customBaseUrl?: string;
  // Task/Memory/Skill systems
  existingTasks?: Task[];
  projectMemory?: Record<string, Memory>;
  activeSkill?: string;
}

export interface AgentResponse {
  responseText: string;
  fileChanges: FileChange[];
  taskUpdates?: Task[];
  memoryUpdates?: Record<string, Memory>;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface Task {
  id: string;
  projectId: string;
  subject: string;
  description?: string;
  status: TaskStatus;
  activeForm?: string;
  blocks: string[];
  blockedBy: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';
export type MemoryScope = 'user' | 'project';

export interface Memory {
  id: string;
  userId: string;
  projectId?: string;
  name: string;
  description?: string;
  type: MemoryType;
  content: string;
  confidence: number;
  scope: MemoryScope;
  createdAt: string;
  updatedAt: string;
}

export interface Skill {
  name: string;
  description: string;
  triggers: string[];
  prompt: string;
  tools?: string[];
  model?: string;
}
