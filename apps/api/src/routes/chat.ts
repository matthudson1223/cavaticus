import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { chatMessages, projects } from '../db/schema.js';
import { eq, asc } from 'drizzle-orm';

export async function chatRoutes(app: FastifyInstance) {
  app.get<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId/chat',
    async (req, reply) => {
      await requireAuth(req, reply);
      if (!req.session.userId) return; // Already handled by requireAuth, but TypeScript needs this

      const { projectId } = req.params;

      // Verify project ownership
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project || project.userId !== req.session.userId) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      // Return last 50 messages ordered by createdAt ASC
      const messages = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.projectId, projectId))
        .orderBy(asc(chatMessages.createdAt))
        .limit(50);

      return reply.send(messages);
    }
  );
}
