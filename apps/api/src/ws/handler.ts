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
  AgentRequest,
  ApiKeyProvider,
} from '@cavaticus/shared';

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

      // TODO: Extract userId from session cookie
      // For now, skip ownership check
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!project) return;
      const userId = project.userId;

      // Persist user message
      const [userMsg] = await db
        .insert(chatMessages)
        .values({
          projectId,
          role: 'user',
          content,
          attachments: attachments ?? [],
        })
        .returning();

      // Load project files
      const projectFiles = await db
        .select({ path: files.path, content: files.content })
        .from(files)
        .where(eq(files.projectId, projectId));

      // Load chat history (last 50)
      const history = await db
        .select({ role: chatMessages.role, content: chatMessages.content })
        .from(chatMessages)
        .where(eq(chatMessages.projectId, projectId))
        .orderBy(asc(chatMessages.createdAt))
        .limit(50);

      // Get default provider + API key
      const [settings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1);

      const provider =
        (settings?.defaultProvider as ApiKeyProvider | null) ?? 'claude';
      const apiKey = await getDecryptedApiKey(userId, provider);

      if (!apiKey) {
        socket.emit(WS_EVENTS.AGENT_ERROR, {
          error: `No API key stored for provider "${provider}"`,
        });
        return;
      }

      socket.emit(WS_EVENTS.AGENT_STATUS, { status: 'thinking' });

      // Create placeholder assistant message
      const [assistantMsg] = await db
        .insert(chatMessages)
        .values({ projectId, role: 'assistant', content: '', attachments: [] })
        .returning();

      const messageId = assistantMsg!.id;
      let fullText = '';

      const agentRequest: AgentRequest = {
        provider,
        apiKey,
        projectFiles,
        chatHistory: history.map((h) => ({
          role: h.role as 'user' | 'assistant',
          content: h.content,
        })),
        userMessage: content,
        attachments,
        openrouterModel: provider === 'openrouter' ? modelId : undefined,
      };

      try {
        for await (const event of runAgent(agentRequest)) {
          if (event.type === 'chunk') {
            fullText += event.text;
            socket.emit(WS_EVENTS.CHAT_CHUNK, { messageId, chunk: event.text });
          } else if (event.type === 'done') {
            fullText = event.responseText;

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
            socket.emit(WS_EVENTS.AGENT_STATUS, { status: 'idle' });
          }
        }
      } catch (err) {
        socket.emit(WS_EVENTS.AGENT_ERROR, {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
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
