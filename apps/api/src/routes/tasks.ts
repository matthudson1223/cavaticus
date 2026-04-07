import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { tasks, projects } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

export async function taskRoutes(app: FastifyInstance) {
  // GET /api/v1/projects/:projectId/tasks
  app.get(
    '/api/v1/projects/:projectId/tasks',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const { projectId } = req.params as { projectId: string };

      // Verify project ownership
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const rows = await db
        .select()
        .from(tasks)
        .where(eq(tasks.projectId, projectId));

      return reply.send({ tasks: rows });
    },
  );

  // POST /api/v1/projects/:projectId/tasks
  app.post(
    '/api/v1/projects/:projectId/tasks',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const { projectId } = req.params as { projectId: string };

      // Verify project ownership
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const schema = z.object({
        subject: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        activeForm: z.string().optional(),
        status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const [task] = await db
        .insert(tasks)
        .values({
          projectId,
          ...parsed.data,
          status: parsed.data.status || 'pending',
        })
        .returning();

      return reply.status(201).send({ task });
    },
  );

  // PUT /api/v1/projects/:projectId/tasks/:taskId
  app.put(
    '/api/v1/projects/:projectId/tasks/:taskId',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const { projectId, taskId } = req.params as {
        projectId: string;
        taskId: string;
      };

      // Verify project ownership
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const schema = z.object({
        subject: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional(),
        activeForm: z.string().optional(),
        status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const [task] = await db
        .update(tasks)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)))
        .returning();

      if (!task) {
        return reply.status(404).send({ error: 'Task not found' });
      }

      return reply.send({ task });
    },
  );

  // DELETE /api/v1/projects/:projectId/tasks/:taskId
  app.delete(
    '/api/v1/projects/:projectId/tasks/:taskId',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const { projectId, taskId } = req.params as {
        projectId: string;
        taskId: string;
      };

      // Verify project ownership
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const result = await db
        .delete(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)))
        .returning();

      if (result.length === 0) {
        return reply.status(404).send({ error: 'Task not found' });
      }

      return reply.send({ success: true });
    },
  );
}
