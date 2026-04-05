import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { userModels } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

export async function modelRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/settings/models',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const models = await db
        .select()
        .from(userModels)
        .where(eq(userModels.userId, userId));
      return reply.send({ models });
    },
  );

  app.post(
    '/api/v1/settings/models',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const schema = z.object({
        modelId: z.string().min(1).max(200),
        label: z.string().max(100).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const { modelId, label } = parsed.data;

      // Validate model exists on OpenRouter
      try {
        const response = await fetch('https://openrouter.ai/api/v1/models');
        if (!response.ok) {
          return reply.status(503).send({
            error: 'Failed to validate model with OpenRouter',
          });
        }
        const data = (await response.json()) as { data?: Array<{ id: string }> };
        const models = data.data || [];
        const modelExists = models.some((m) => m.id === modelId);

        if (!modelExists) {
          return reply.status(400).send({
            error: `Model "${modelId}" not found on OpenRouter`,
          });
        }
      } catch (err) {
        return reply.status(503).send({
          error: 'Failed to validate model with OpenRouter',
        });
      }

      // Check if already saved
      const existing = await db
        .select()
        .from(userModels)
        .where(and(eq(userModels.userId, userId), eq(userModels.modelId, modelId)))
        .limit(1);

      if (existing.length > 0) {
        // Update label if provided
        if (label) {
          const [updated] = await db
            .update(userModels)
            .set({ label })
            .where(
              and(
                eq(userModels.userId, userId),
                eq(userModels.modelId, modelId),
              ),
            )
            .returning();
          return reply.send({ model: updated });
        }
        return reply.send({ model: existing[0] });
      }

      // Insert new model
      const [model] = await db
        .insert(userModels)
        .values({ userId, modelId, label: label || null })
        .returning();

      return reply.status(201).send({ model });
    },
  );

  app.delete(
    '/api/v1/settings/models/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const { id } = req.params as { id: string };

      const result = await db
        .delete(userModels)
        .where(and(eq(userModels.id, id), eq(userModels.userId, userId)))
        .returning();

      if (result.length === 0) {
        return reply.status(404).send({ error: 'Model not found' });
      }

      return reply.send({ ok: true });
    },
  );
}
