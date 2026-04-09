import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import helmet from '@fastify/helmet';
import csrf from '@fastify/csrf-protection';
import { authRoutes } from './routes/auth.js';
import { projectRoutes } from './routes/projects.js';
import { fileRoutes } from './routes/files.js';
import { settingsRoutes } from './routes/settings.js';
import { modelRoutes } from './routes/models.js';
import { taskRoutes } from './routes/tasks.js';
import { memoryRoutes } from './routes/memories.js';
import { chatRoutes } from './routes/chat.js';
import { exportRoutes } from './routes/export.js';
import { githubRoutes } from './routes/github.js';
import { templateRoutes } from './routes/templates.js';
import { blockRoutes } from './routes/blocks.js';
import { createSocketServer } from './ws/handler.js';

// Simple in-memory session store for development
class MemoryStore {
  private sessions = new Map<string, any>();

  get(sessionId: string, callback: (err: Error | null, session?: any) => void) {
    try {
      const session = this.sessions.get(sessionId);
      callback(null, session);
    } catch (err) {
      callback(err instanceof Error ? err : new Error(String(err)));
    }
  }

  set(sessionId: string, session: any, callback: (err?: Error | null) => void) {
    try {
      this.sessions.set(sessionId, session);
      callback(null);
    } catch (err) {
      callback(err instanceof Error ? err : new Error(String(err)));
    }
  }

  destroy(sessionId: string, callback: (err?: Error | null) => void) {
    try {
      this.sessions.delete(sessionId);
      callback(null);
    } catch (err) {
      callback(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

const debug = process.env['DEBUG'] === 'cavaticus';
const app = Fastify({
  logger: debug ? { level: 'debug' } : true
});

// Create and attach session store
const sessionStore = new MemoryStore();
(app as any).sessionStore = sessionStore;

await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
    },
  },
});

await app.register(cors, {
  origin: process.env['WEB_ORIGIN'] ?? 'http://localhost:5173',
  credentials: true,
});

await app.register(cookie);

await app.register(session, {
  secret: process.env['SESSION_SECRET'] ?? 'change-me-in-production-please',
  cookie: {
    secure: process.env['NODE_ENV'] === 'production',
    httpOnly: true,
    sameSite: process.env['NODE_ENV'] === 'production' ? 'strict' : false,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
  store: sessionStore,
});

await app.register(csrf);

await app.register(authRoutes);
await app.register(projectRoutes);
await app.register(fileRoutes);
await app.register(settingsRoutes);
await app.register(modelRoutes);
await app.register(taskRoutes);
await app.register(memoryRoutes);
await app.register(chatRoutes);
await app.register(exportRoutes);
await app.register(githubRoutes);
await app.register(templateRoutes);
await app.register(blockRoutes);

app.get('/health', async () => ({ status: 'ok' }));

const port = Number(process.env['PORT'] ?? 8080);
await app.listen({ port, host: '0.0.0.0' });

createSocketServer(app.server, app);
console.log(`API listening on :${port}`);
