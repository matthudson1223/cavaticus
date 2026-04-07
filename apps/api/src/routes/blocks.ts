import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { blocks } from '../db/schema.js';
import { eq, or, isNull } from 'drizzle-orm';

const blockSchema = z.object({
  name: z.string(),
  category: z.string().optional(),
  html: z.string(),
  css: z.string(),
  thumbnail: z.string().optional(),
});

export async function blockRoutes(app: FastifyInstance) {
  // Get all blocks (system + user's personal blocks)
  app.get('/api/v1/blocks', async (req, reply) => {
    const userId = req.session.userId;

    // Fetch system blocks + user's blocks
    const allBlocks = await db
      .select()
      .from(blocks)
      .where(userId ? or(isNull(blocks.userId), eq(blocks.userId, userId as any)) : isNull(blocks.userId));

    return reply.send({ blocks: allBlocks });
  });

  // Create a new block
  app.post('/api/v1/blocks', async (req, reply) => {
    const userId = req.session.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const parsed = blockSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { name, category, html, css, thumbnail } = parsed.data;

    try {
      const [newBlock] = await db
        .insert(blocks)
        .values({
          userId: userId as any,
          name,
          category,
          html,
          css,
          thumbnail,
        })
        .returning();

      return reply.status(201).send({ block: newBlock });
    } catch (err) {
      return reply.status(400).send({ error: `Failed to create block: ${err}` });
    }
  });

  // Delete a block
  app.delete('/api/v1/blocks/:blockId', async (req, reply) => {
    const userId = req.session.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { blockId } = z.object({ blockId: z.string() }).parse(req.params);

    try {
      const [block] = await db
        .select()
        .from(blocks)
        .where(eq(blocks.id, blockId as any))
        .limit(1);

      if (!block) {
        return reply.status(404).send({ error: 'Block not found' });
      }

      // Verify ownership (system blocks cannot be deleted)
      if (block.userId !== (userId as string)) {
        return reply.status(403).send({ error: 'Cannot delete system blocks' });
      }

      await db.delete(blocks).where(eq(blocks.id, blockId as any));

      return reply.send({ ok: true });
    } catch (err) {
      return reply.status(400).send({ error: `Failed to delete block: ${err}` });
    }
  });
}
