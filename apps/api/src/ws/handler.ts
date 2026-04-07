import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { db } from '../db/index.js';
import {
  chatMessages,
  files,
  projects,
  userSettings,
} from '../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { getDecryptedApiKey } from '../routes/settings.js';
import { runAgent } from '../services/agent.js';
import { WS_EVENTS } from '@cavaticus/shared';
import type {
  ChatSendPayload,
  ChatCancelPayload,
  AgentRequest,
  ApiKeyProvider,
} from '@cavaticus/shared';

/** Detect which provider a model string belongs to (mirrors Python detect_provider). */
function detectProviderFromModel(modelId: string): string | null {
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

export function createSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env['WEB_ORIGIN'] ?? 'http://localhost:5173',
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    // For now, accept all connections (session auth happens on first chat message)
    // TODO: Properly extract userId from Fastify session cookie

    socket.on(WS_EVENTS.CHAT_SEND, async (payload: ChatSendPayload) => {
      const { projectId, content, attachments, modelId } = payload;
      log(`CHAT_SEND: projectId=${projectId}, content_len=${content.length}, modelId=${modelId}`);

      // TODO: Extract userId from session cookie
      // For now, skip ownership check
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!project) return;
      const userId = project.userId;

      // Load history and files BEFORE inserting the current user message,
      // so the current turn isn't duplicated in chatHistory + userMessage.
      const [projectFiles, rawHistory] = await Promise.all([
        db.select({ path: files.path, content: files.content })
          .from(files)
          .where(eq(files.projectId, projectId)),
        db.select({ role: chatMessages.role, content: chatMessages.content })
          .from(chatMessages)
          .where(eq(chatMessages.projectId, projectId))
          .orderBy(asc(chatMessages.createdAt))
          .limit(50),
      ]);

      // Drop empty assistant messages left by failed/cancelled turns
      const history = rawHistory.filter((h) => h.content.trim() !== '');

      // Persist user message
      await db
        .insert(chatMessages)
        .values({
          projectId,
          role: 'user',
          content,
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
        userMessage: content,
        attachments,
        openrouterModel: provider === 'openrouter' ? modelId : undefined,
        // Unified provider: pass model string directly for any provider
        model: modelId || undefined,
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
          } else if (event.type === 'error') {
            log(`AGENT_ERROR: ${event.text}`);
            socket.emit(WS_EVENTS.AGENT_ERROR, { error: event.text });
            socket.emit(WS_EVENTS.AGENT_STATUS, { status: 'idle' });
            break;
          } else if (event.type === 'done') {
            fullText = event.responseText;
            log(`CHAT_DONE: response_len=${event.responseText.length}, changes=${event.fileChanges.length}`);

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

            // Fetch final message from DB
            const [finalMsg] = await db
              .select()
              .from(chatMessages)
              .where(eq(chatMessages.id, messageId))
              .limit(1);

            socket.emit(WS_EVENTS.CHAT_DONE, {
              messageId,
              message: finalMsg,
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

function guessMimeType(path: string): string {
  if (path.endsWith('.html')) return 'text/html';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.js') || path.endsWith('.mjs')) return 'application/javascript';
  if (path.endsWith('.ts')) return 'text/typescript';
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.md')) return 'text/markdown';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  return 'text/plain';
}
