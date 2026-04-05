import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { apiKeys, userSettings } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { encrypt, decrypt } from '../services/crypto.js';

export async function settingsRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/settings',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const [settings] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1);

      const storedKeys = await db
        .select({ provider: apiKeys.provider })
        .from(apiKeys)
        .where(eq(apiKeys.userId, userId));

      return reply.send({
        settings: settings ?? null,
        storedProviders: storedKeys.map((k) => k.provider),
      });
    },
  );

  app.put(
    '/api/v1/settings',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const schema = z.object({
        theme: z.enum(['light', 'dark']).optional(),
        defaultProvider: z.enum(['claude', 'openai', 'gemini', 'openrouter']).nullable().optional(),
        editorFontSize: z.number().int().min(8).max(32).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const [updated] = await db
        .insert(userSettings)
        .values({ userId, ...parsed.data })
        .onConflictDoUpdate({
          target: userSettings.userId,
          set: parsed.data,
        })
        .returning();
      return reply.send({ settings: updated });
    },
  );

  app.get(
    '/api/v1/settings/api-keys',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const rows = await db
        .select({ provider: apiKeys.provider })
        .from(apiKeys)
        .where(eq(apiKeys.userId, userId));
      return reply.send({ providers: rows.map((r) => r.provider) });
    },
  );

  app.put(
    '/api/v1/settings/api-keys',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const schema = z.object({
        provider: z.enum(['claude', 'openai', 'gemini', 'openrouter']),
        key: z.string().min(1),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const { ciphertext, iv, authTag } = encrypt(parsed.data.key);
      await db
        .insert(apiKeys)
        .values({
          userId,
          provider: parsed.data.provider,
          encryptedKey: ciphertext,
          iv,
          authTag,
        })
        .onConflictDoUpdate({
          target: [apiKeys.userId, apiKeys.provider],
          set: { encryptedKey: ciphertext, iv, authTag },
        });

      return reply.send({ ok: true });
    },
  );

  app.delete(
    '/api/v1/settings/api-keys/:provider',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const { provider } = req.params as { provider: string };
      await db
        .delete(apiKeys)
        .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, provider)));
      return reply.send({ ok: true });
    },
  );
}

export async function getDecryptedApiKey(
  userId: string,
  provider: string,
): Promise<string | null> {
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, provider)))
    .limit(1);
  if (!row) return null;
  return decrypt(row.encryptedKey, row.iv, row.authTag);
}
