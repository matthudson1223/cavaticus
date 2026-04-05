import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import { authRoutes } from './routes/auth.js';
import { projectRoutes } from './routes/projects.js';
import { fileRoutes } from './routes/files.js';
import { settingsRoutes } from './routes/settings.js';
import { modelRoutes } from './routes/models.js';
import { createSocketServer } from './ws/handler.js';

const app = Fastify({ logger: true });

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
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
});

await app.register(authRoutes);
await app.register(projectRoutes);
await app.register(fileRoutes);
await app.register(settingsRoutes);
await app.register(modelRoutes);

app.get('/health', async () => ({ status: 'ok' }));

const port = Number(process.env['PORT'] ?? 8080);
await app.listen({ port, host: '0.0.0.0' });

createSocketServer(app.server);
console.log(`API listening on :${port}`);
