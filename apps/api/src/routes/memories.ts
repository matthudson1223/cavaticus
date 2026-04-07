import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { memories, projects } from '../db/schema.js';
import { eq, and, or } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

export async function memoryRoutes(app: FastifyInstance) {
  // GET /api/v1/memories — list user-scope memories
  app.get(
    '/api/v1/memories',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;

      const rows = await db
        .select()
        .from(memories)
        .where(and(eq(memories.userId, userId), eq(memories.scope, 'user')));

      return reply.send({ memories: rows });
    },
  );

  // GET /api/v1/projects/:projectId/memories — list project-scope memories
  app.get(
    '/api/v1/projects/:projectId/memories',
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

      // Return both user-scope and project-scope memories
      const rows = await db
        .select()
        .from(memories)
        .where(
          and(
            eq(memories.userId, userId),
            or(
              and(eq(memories.projectId, projectId), eq(memories.scope, 'project')),
              eq(memories.scope, 'user'),
            ),
          ),
        );

      return reply.send({ memories: rows });
    },
  );

  // POST /api/v1/memories or /api/v1/projects/:projectId/memories — create/upsert memory
  app.post(
    '/api/v1/memories',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;

      const schema = z.object({
        name: z.string().min(1).max(100),
        content: z.string().max(10000),
        type: z.enum(['user', 'feedback', 'project', 'reference']).optional(),
        description: z.string().max(500).optional(),
        confidence: z.number().min(0).max(1).optional(),
        scope: z.enum(['user', 'project']).optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      // Check if memory with this name already exists (upsert)
      const [existing] = await db
        .select()
        .from(memories)
        .where(
          and(
            eq(memories.userId, userId),
            eq(memories.name, parsed.data.name),
            eq(memories.scope, parsed.data.scope || 'user'),
          ),
        );

      let result;
      if (existing) {
        [result] = await db
          .update(memories)
          .set({
            ...parsed.data,
            confidence: parsed.data.confidence || existing.confidence,
            updatedAt: new Date(),
          })
          .where(eq(memories.id, existing.id))
          .returning();
      } else {
        [result] = await db
          .insert(memories)
          .values({
            userId,
            name: parsed.data.name,
            content: parsed.data.content,
            type: parsed.data.type || 'project',
            description: parsed.data.description,
            confidence: parsed.data.confidence || 1.0,
            scope: parsed.data.scope || 'user',
          })
          .returning();
      }

      return reply.status(existing ? 200 : 201).send({ memory: result });
    },
  );

  app.post(
    '/api/v1/projects/:projectId/memories',
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
        name: z.string().min(1).max(100),
        content: z.string().max(10000),
        type: z.enum(['user', 'feedback', 'project', 'reference']).optional(),
        description: z.string().max(500).optional(),
        confidence: z.number().min(0).max(1).optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      // Check if memory with this name already exists for this project
      const [existing] = await db
        .select()
        .from(memories)
        .where(
          and(
            eq(memories.userId, userId),
            eq(memories.projectId, projectId),
            eq(memories.name, parsed.data.name),
            eq(memories.scope, 'project'),
          ),
        );

      let result;
      if (existing) {
        [result] = await db
          .update(memories)
          .set({
            ...parsed.data,
            confidence: parsed.data.confidence || existing.confidence,
            updatedAt: new Date(),
          })
          .where(eq(memories.id, existing.id))
          .returning();
      } else {
        [result] = await db
          .insert(memories)
          .values({
            userId,
            projectId,
            name: parsed.data.name,
            content: parsed.data.content,
            type: parsed.data.type || 'project',
            description: parsed.data.description,
            confidence: parsed.data.confidence || 1.0,
            scope: 'project',
          })
          .returning();
      }

      return reply.status(existing ? 200 : 201).send({ memory: result });
    },
  );

  // DELETE /api/v1/memories/:memoryId
  app.delete(
    '/api/v1/memories/:memoryId',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const { memoryId } = req.params as { memoryId: string };

      const result = await db
        .delete(memories)
        .where(and(eq(memories.id, memoryId), eq(memories.userId, userId)))
        .returning();

      if (result.length === 0) {
        return reply.status(404).send({ error: 'Memory not found' });
      }

      return reply.send({ success: true });
    },
  );
}
