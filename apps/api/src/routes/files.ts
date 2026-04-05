import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { files, projects } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

async function assertProjectOwnership(
  userId: string,
  projectId: string,
): Promise<boolean> {
  const [p] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  return !!p;
}

export async function fileRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/projects/:projectId/files',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const { projectId } = req.params as { projectId: string };
      if (!(await assertProjectOwnership(userId, projectId))) {
        return reply.status(404).send({ error: 'Not found' });
      }
      const rows = await db
        .select({
          id: files.id,
          path: files.path,
          mimeType: files.mimeType,
          updatedAt: files.updatedAt,
        })
        .from(files)
        .where(eq(files.projectId, projectId));
      return reply.send({ files: rows });
    },
  );

  app.get(
    '/api/v1/projects/:projectId/files/:fileId',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const { projectId, fileId } = req.params as { projectId: string; fileId: string };
      if (!(await assertProjectOwnership(userId, projectId))) {
        return reply.status(404).send({ error: 'Not found' });
      }
      const [file] = await db
        .select()
        .from(files)
        .where(and(eq(files.id, fileId), eq(files.projectId, projectId)))
        .limit(1);
      if (!file) return reply.status(404).send({ error: 'Not found' });
      return reply.send({ file });
    },
  );

  app.post(
    '/api/v1/projects/:projectId/files',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const { projectId } = req.params as { projectId: string };
      if (!(await assertProjectOwnership(userId, projectId))) {
        return reply.status(404).send({ error: 'Not found' });
      }
      const schema = z.object({
        path: z.string().min(1),
        content: z.string().default(''),
        mimeType: z.string().default('text/plain'),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const [file] = await db
        .insert(files)
        .values({ projectId, ...parsed.data })
        .returning();
      return reply.status(201).send({ file });
    },
  );

  app.put(
    '/api/v1/projects/:projectId/files/:fileId',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const { projectId, fileId } = req.params as { projectId: string; fileId: string };
      if (!(await assertProjectOwnership(userId, projectId))) {
        return reply.status(404).send({ error: 'Not found' });
      }
      const schema = z.object({
        content: z.string(),
        mimeType: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const [file] = await db
        .update(files)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(files.id, fileId), eq(files.projectId, projectId)))
        .returning();
      if (!file) return reply.status(404).send({ error: 'Not found' });
      return reply.send({ file });
    },
  );

  app.delete(
    '/api/v1/projects/:projectId/files/:fileId',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const { projectId, fileId } = req.params as { projectId: string; fileId: string };
      if (!(await assertProjectOwnership(userId, projectId))) {
        return reply.status(404).send({ error: 'Not found' });
      }
      const deleted = await db
        .delete(files)
        .where(and(eq(files.id, fileId), eq(files.projectId, projectId)))
        .returning({ id: files.id });
      if (deleted.length === 0) return reply.status(404).send({ error: 'Not found' });
      return reply.send({ ok: true });
    },
  );
}
