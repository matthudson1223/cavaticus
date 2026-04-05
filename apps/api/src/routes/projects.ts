import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { projects, files } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const STARTER_FILES = [
  {
    path: 'index.html',
    mimeType: 'text/html',
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Website</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <h1>Hello, World!</h1>
  <script src="script.js"></script>
</body>
</html>`,
  },
  {
    path: 'style.css',
    mimeType: 'text/css',
    content: `body {
  font-family: sans-serif;
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}`,
  },
  {
    path: 'script.js',
    mimeType: 'application/javascript',
    content: `// Your JavaScript goes here
console.log('Hello from script.js');`,
  },
];

export async function projectRoutes(app: FastifyInstance) {
  app.get(
    '/api/v1/projects',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const rows = await db
        .select({
          id: projects.id,
          name: projects.name,
          description: projects.description,
          createdAt: projects.createdAt,
          updatedAt: projects.updatedAt,
        })
        .from(projects)
        .where(eq(projects.userId, userId));
      return reply.send({ projects: rows });
    },
  );

  app.post(
    '/api/v1/projects',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const schema = z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const [project] = await db
        .insert(projects)
        .values({ userId, ...parsed.data })
        .returning();

      await db.insert(files).values(
        STARTER_FILES.map((f) => ({ projectId: project!.id, ...f })),
      );

      return reply.status(201).send({ project });
    },
  );

  app.get(
    '/api/v1/projects/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const { id } = req.params as { id: string };
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, id), eq(projects.userId, userId)))
        .limit(1);
      if (!project) return reply.status(404).send({ error: 'Not found' });
      return reply.send({ project });
    },
  );

  app.put(
    '/api/v1/projects/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const { id } = req.params as { id: string };
      const schema = z.object({
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).nullable().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const [project] = await db
        .update(projects)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(projects.id, id), eq(projects.userId, userId)))
        .returning();
      if (!project) return reply.status(404).send({ error: 'Not found' });
      return reply.send({ project });
    },
  );

  app.delete(
    '/api/v1/projects/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const userId = req.session.userId!;
      const { id } = req.params as { id: string };
      const deleted = await db
        .delete(projects)
        .where(and(eq(projects.id, id), eq(projects.userId, userId)))
        .returning({ id: projects.id });
      if (deleted.length === 0) return reply.status(404).send({ error: 'Not found' });
      return reply.send({ ok: true });
    },
  );
}
