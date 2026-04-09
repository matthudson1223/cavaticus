import type { Server as HttpServer } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { db } from '../db/index.js';
import {
  chatMessages,
  files,
  projects,
  userSettings,
  tasks,
  memories,
} from '../db/schema.js';
import { eq, asc, or, and } from 'drizzle-orm';
import { getDecryptedApiKey } from '../routes/settings.js';
import { runAgent, type TaskUpdate, type MemoryUpdate } from '../services/agent.js';
import { WS_EVENTS } from '@cavaticus/shared';
import type {
  ChatSendPayload,
  ChatCancelPayload,
  AgentRequest,
  ApiKeyProvider,
} from '@cavaticus/shared';

/** Detect which provider a model string belongs to (mirrors Python detect_provider). */
export function detectProviderFromModel(modelId: string): string | null {
  if (modelId.startsWith('claude-')) return 'claude';
  if (modelId.startsWith('gpt-') || /^o[13]/.test(modelId)) return 'openai';
  if (modelId.startsWith('gemini-')) return 'gemini';
  if (modelId.startsWith('deepseek-')) return 'deepseek';
  if (modelId.startsWith('moonshot-') || modelId.startsWith('kimi-')) return 'kimi';
  if (modelId.startsWith('qwen') || modelId.startsWith('qwq-')) return 'qwen';
  if (modelId.startsWith('glm-')) return 'zhipu';
  // local/custom explicit prefix — everything else with a slash is an OpenRouter org/model
  if (modelId.includes('/')) {
    const prefix = modelId.split('/')[0]!;
    if (['ollama', 'lmstudio', 'custom'].includes(prefix)) return prefix;
    return 'openrouter';
  }
  return null;
}

const debug = process.env['DEBUG'] === 'cavaticus';
const log = (msg: string) => {
  if (debug) console.log(`[cavaticus:ws] ${new Date().toISOString()} ${msg}`);
};

// Track active agent streams by messageId so we can abort them
const activeStreams = new Map<string, { aborted: boolean }>();

export function createSocketServer(httpServer: HttpServer, app: FastifyInstance): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env['WEB_ORIGIN'] ?? 'http://localhost:5173',
      credentials: true,
    },
  });

  // Middleware to extract userId from session cookie
  io.use(async (socket, next) => {
    try {
      const cookies = socket.handshake.headers.cookie || '';
      // @fastify/session uses 'sessionId' as default cookie name
      const sessionIdMatch = cookies.match(/sessionId=([^;]+)/);
      const sessionId = sessionIdMatch?.[1];

      if (!sessionId) {
        log(`No sessionId found in cookies: ${cookies.substring(0, 50)}`);
        return next(new Error('No session found'));
      }

      // Access the session store from Fastify's plugin store
      let sessionStore = (app as any).sessionStore;

      // Fallback: try to access via other possible property names used by @fastify/session
      if (!sessionStore) {
        sessionStore = (app as any).session?.store;
      }
      if (!sessionStore) {
        sessionStore = (app as any).store;
      }

      if (!sessionStore) {
        log(`Session store not available. App keys: ${Object.keys(app).join(',').substring(0, 100)}`);
        log(`App decorators: ${Object.keys((app as any).decorators || {}).join(',')}`);
        return next(new Error('Session store not available'));
      }

      // Look up the session by ID in the store
      const session = await new Promise<any>((resolve, reject) => {
        sessionStore.get(sessionId, (err: any, session: any) => {
          if (err) {
            log(`Session store error: ${err instanceof Error ? err.message : String(err)}`);
            reject(err);
          } else {
            log(`Session lookup for ${sessionId}: ${session ? 'found' : 'not found'}`);
            resolve(session);
          }
        });
      });

      if (!session?.userId) {
        log(`Invalid session: no userId. Session keys: ${session ? Object.keys(session).join(',') : 'null'}`);
        return next(new Error('Invalid or expired session'));
      }

      log(`Socket authenticated: userId=${session.userId}`);
      socket.data.userId = session.userId;
      next();
    } catch (err) {
      log(`Session auth error: ${err instanceof Error ? err.message : String(err)}`);
      next(new Error('Session validation failed'));
    }
  });

  io.on('connection', (socket) => {

    socket.on(WS_EVENTS.CHAT_SEND, async (payload: ChatSendPayload) => {
      const { projectId, content, attachments, modelId } = payload;
      log(`CHAT_SEND: projectId=${projectId}, content_len=${content.length}, modelId=${modelId}`);

      // Verify authentication
      const userId = socket.data.userId;
      if (!userId) {
        log('ERROR: No authenticated userId');
        socket.emit(WS_EVENTS.AGENT_ERROR, { error: 'Unauthorized' });
        return;
      }

      // Verify project ownership
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!project || project.userId !== userId) {
        log(`ERROR: User ${userId} does not own project ${projectId}`);
        socket.emit(WS_EVENTS.AGENT_ERROR, { error: 'Unauthorized' });
        return;
      }

      // Load history, files, tasks, and memories BEFORE inserting the current user message,
      // so the current turn isn't duplicated in chatHistory + userMessage.
      const [projectFiles, rawHistory, rawTasks, projectMemories] = await Promise.all([
        db.select({ path: files.path, content: files.content })
          .from(files)
          .where(eq(files.projectId, projectId)),
        db.select({ role: chatMessages.role, content: chatMessages.content })
          .from(chatMessages)
          .where(eq(chatMessages.projectId, projectId))
          .orderBy(asc(chatMessages.createdAt))
          .limit(50),
        db.select()
          .from(tasks)
          .where(eq(tasks.projectId, projectId)),
        // Load both user-scope and project-scope memories
        db.select()
          .from(memories)
          .where(
            and(
              eq(memories.userId, userId),
              or(
                and(eq(memories.projectId, projectId), eq(memories.scope, 'project')),
                eq(memories.scope, 'user'),
              ),
            ),
          ),
      ]);

      // Convert null descriptions to undefined and dates to ISO strings for AgentRequest
      const projectTasks = rawTasks.map(t => ({
        id: t.id,
        projectId: t.projectId,
        subject: t.subject,
        description: t.description ?? undefined,
        status: t.status as any, // Database stores as string, type system expects TaskStatus literal
        activeForm: t.activeForm ?? undefined,
        blocks: t.blocks,
        blockedBy: t.blockedBy,
        metadata: (t.metadata ?? {}) as Record<string, unknown> | undefined,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      }));

      // Drop empty assistant messages left by failed/cancelled turns
      const history = rawHistory.filter((h) => h.content.trim() !== '');

      // Detect skill trigger from message (e.g., "/commit fix auth")
      let activeSkill: string | undefined;
      let userContent = content;
      const skillMatch = content.trim().match(/^(\S+)\s*(.*)/);
      if (skillMatch && skillMatch[1]?.startsWith('/')) {
        const trigger = skillMatch[1];
        // Common skills: /commit, /review, /refactor
        if (['/commit', '/review', '/review-pr', '/refactor'].includes(trigger)) {
          activeSkill = trigger;
          userContent = skillMatch[2] || ''; // Strip skill trigger from content
        }
      }

      // Build memory dict keyed by name
      const memoryDict: Record<string, any> = {};
      for (const mem of projectMemories) {
        memoryDict[mem.name] = {
          name: mem.name,
          content: mem.content,
          type: mem.type,
          description: mem.description,
          confidence: mem.confidence,
          created_at: mem.createdAt?.getTime() / 1000,
        };
      }

      // Persist user message (use original content including skill trigger for history)
      await db
        .insert(chatMessages)
        .values({
          projectId,
          role: 'user',
          content,  // Keep original content with skill trigger for history
          attachments: attachments ?? [],
        });

      // Get default provider + API key
      const [settings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1);

      // Detect provider: prefer auto-detecting from modelId, fall back to saved default
      const detectedProvider = modelId ? detectProviderFromModel(modelId) : null;
      const provider = detectedProvider
        ?? (settings?.defaultProvider as ApiKeyProvider | null)
        ?? 'claude';

      // Local providers (ollama, lmstudio) don't need an API key
      const localProviders = new Set(['ollama', 'lmstudio']);
      const apiKey = localProviders.has(provider)
        ? ''
        : await getDecryptedApiKey(userId, provider);

      if (!localProviders.has(provider) && !apiKey) {
        log(`ERROR: No API key for provider=${provider}`);
        socket.emit(WS_EVENTS.AGENT_ERROR, {
          error: `No API key stored for provider "${provider}". Add it in Settings.`,
        });
        return;
      }

      log(`Calling agent: provider=${provider}, model=${modelId || '(default)'}, files=${projectFiles.length}, history=${history.length}`);
      socket.emit(WS_EVENTS.AGENT_STATUS, { status: 'thinking' });

      // Create placeholder assistant message
      const [assistantMsg] = await db
        .insert(chatMessages)
        .values({ projectId, role: 'assistant', content: '', attachments: [] })
        .returning();

      const messageId = assistantMsg!.id;
      let fullText = '';

      const agentRequest: AgentRequest = {
        provider: provider as ApiKeyProvider,
        apiKey: apiKey ?? '',
        projectFiles,
        projectId,
        chatHistory: history.map((h) => ({
          role: h.role as 'user' | 'assistant',
          content: h.content,
        })),
        userMessage: userContent || content,  // Use stripped content (skill trigger removed)
        attachments,
        openrouterModel: provider === 'openrouter' ? modelId : undefined,
        // Unified provider: pass model string directly for any provider
        model: modelId || undefined,
        // Task/Memory/Skill systems
        existingTasks: projectTasks,
        projectMemory: memoryDict,
        activeSkill,
      };

      try {
        const streamContext = { aborted: false };
        activeStreams.set(messageId, streamContext);

        for await (const event of runAgent(agentRequest)) {
          // Check if stream was cancelled
          if (streamContext.aborted) {
            log(`Stream cancelled for messageId=${messageId}`);
            break;
          }

          if (event.type === 'chunk') {
            fullText += event.text;
            log(`CHAT_CHUNK: ${event.text.length} chars`);
            socket.emit(WS_EVENTS.CHAT_CHUNK, { messageId, chunk: event.text });
          } else if (event.type === 'tool_use') {
            log(`TOOL_USE: ${event.name}`);
            socket.emit(WS_EVENTS.AGENT_TOOL_USE, { messageId, toolName: event.name });
            socket.emit(WS_EVENTS.AGENT_STATUS, { status: 'coding' });
          } else if (event.type === 'thinking') {
            log(`THINKING: ${event.text.length} chars`);
            socket.emit(WS_EVENTS.AGENT_THINKING, { messageId, text: event.text });
          } else if (event.type === 'error') {
            log(`AGENT_ERROR: ${event.text}`);
            socket.emit(WS_EVENTS.AGENT_ERROR, { error: event.text });
            socket.emit(WS_EVENTS.AGENT_STATUS, { status: 'idle' });
            break;
          } else if (event.type === 'done') {
            fullText = event.responseText;
            log(`CHAT_DONE: response_len=${event.responseText.length}, changes=${event.fileChanges.length}, tasks=${event.taskUpdates?.length || 0}, memories=${Object.keys(event.memoryUpdates || {}).length}`);

            // Persist final assistant message
            await db
              .update(chatMessages)
              .set({ content: fullText })
              .where(eq(chatMessages.id, messageId));

            // Apply file changes to DB
            for (const change of event.fileChanges) {
              if (change.action === 'deleted') {
                // Could implement delete; skipping for now
                continue;
              }

              // Upsert by path
              const [updatedFile] = await db
                .insert(files)
                .values({
                  projectId,
                  path: change.path,
                  content: change.content ?? '',
                  mimeType: guessMimeType(change.path),
                })
                .onConflictDoUpdate({
                  target: [files.projectId, files.path],
                  set: {
                    content: change.content ?? '',
                    updatedAt: new Date(),
                  },
                })
                .returning();

              socket.emit(WS_EVENTS.FILE_CHANGED, {
                projectId,
                file: updatedFile,
              });
            }

            // Apply task updates (insert new tasks, update existing ones)
            const taskUpdates = event.taskUpdates || [];
            for (const taskUpdate of taskUpdates) {
              // If task has a temporary ID from the agent, generate a new UUID
              const finalId = taskUpdate.id?.startsWith('task_') ? undefined : taskUpdate.id;

              const [updatedTask] = await db
                .insert(tasks)
                .values({
                  id: finalId,  // undefined = let DB generate UUID; real UUID = use it
                  projectId,
                  subject: taskUpdate.subject,
                  description: taskUpdate.description ?? null,
                  status: taskUpdate.status,
                  activeForm: taskUpdate.activeForm ?? null,
                  blocks: taskUpdate.blocks,
                  blockedBy: taskUpdate.blockedBy,
                  metadata: taskUpdate.metadata,
                })
                .onConflictDoUpdate({
                  target: [tasks.id],
                  set: {
                    subject: taskUpdate.subject,
                    description: taskUpdate.description ?? null,
                    status: taskUpdate.status,
                    activeForm: taskUpdate.activeForm ?? null,
                    blocks: taskUpdate.blocks,
                    blockedBy: taskUpdate.blockedBy,
                    metadata: taskUpdate.metadata,
                    updatedAt: new Date(),
                  },
                })
                .returning();

              socket.emit(WS_EVENTS.TASK_UPDATED, {
                projectId,
                task: updatedTask,
              });
            }

            // Apply memory updates
            const memoryUpdates = event.memoryUpdates || {};
            for (const [name, memUpdate] of Object.entries(memoryUpdates)) {
              if (memUpdate === null) {
                // Deletion
                await db
                  .delete(memories)
                  .where(
                    and(
                      eq(memories.userId, userId),
                      eq(memories.name, name),
                    ),
                  );
              } else if (memUpdate) {
                // Upsert - memUpdate is MemoryUpdate, not undefined
                const memoryPayload: any = {
                  userId,
                  name,
                  content: memUpdate.content ?? '',
                  type: memUpdate.type ?? 'project',
                  description: memUpdate.description ?? '',
                  confidence: memUpdate.confidence ?? 1.0,
                  scope: memUpdate.scope ?? 'project',
                };

                if (memoryPayload.scope === 'project') {
                  memoryPayload.projectId = projectId;
                }

                await db
                  .insert(memories)
                  .values(memoryPayload)
                  .onConflictDoUpdate({
                    target: [memories.userId, memories.name, memories.scope],
                    set: {
                      content: memUpdate.content ?? '',
                      description: memUpdate.description ?? '',
                      confidence: memUpdate.confidence ?? 1.0,
                      updatedAt: new Date(),
                    },
                  });
              }
            }

            // Fetch final message from DB
            const [finalMsg] = await db
              .select()
              .from(chatMessages)
              .where(eq(chatMessages.id, messageId))
              .limit(1);

            socket.emit(WS_EVENTS.CHAT_DONE, {
              messageId,
              message: finalMsg,
              fileChanges: event.fileChanges,
            });
            log('Agent completed successfully');
            socket.emit(WS_EVENTS.AGENT_STATUS, { status: 'idle' });
          }
        }

        // Handle early termination (cancellation)
        if (streamContext.aborted) {
          log(`Agent cancelled, updating message with partial content`);
          await db
            .update(chatMessages)
            .set({ content: fullText || 'Cancelled' })
            .where(eq(chatMessages.id, messageId));
          socket.emit(WS_EVENTS.AGENT_STATUS, { status: 'idle' });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        log(`ERROR: ${errorMsg}`);
        socket.emit(WS_EVENTS.AGENT_ERROR, {
          error: errorMsg,
        });
        socket.emit(WS_EVENTS.AGENT_STATUS, { status: 'idle' });
      } finally {
        // Clean up stream context
        activeStreams.delete(messageId);
      }
    });

    socket.on(WS_EVENTS.CHAT_CANCEL, (payload: ChatCancelPayload) => {
      const { messageId } = payload;
      log(`CHAT_CANCEL: messageId=${messageId}`);

      const stream = activeStreams.get(messageId);
      if (stream) {
        stream.aborted = true;
        activeStreams.delete(messageId);
        socket.emit(WS_EVENTS.AGENT_STATUS, { status: 'idle' });
      }
    });
  });

  return io;
}

export function guessMimeType(path: string): string {
  if (path.endsWith('.html')) return 'text/html';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.js') || path.endsWith('.mjs')) return 'application/javascript';
  if (path.endsWith('.ts')) return 'text/typescript';
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.md')) return 'text/markdown';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  return 'text/plain';
}
