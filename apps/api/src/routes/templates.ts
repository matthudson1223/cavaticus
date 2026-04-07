import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { templates, projects, files, userSettings } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const templateFileSchema = z.object({
  path: z.string(),
  content: z.string(),
  mimeType: z.string(),
});

export async function templateRoutes(app: FastifyInstance) {
  // Get all templates
  app.get('/api/v1/templates', async (req, reply) => {
    const allTemplates = await db.select().from(templates);
    return reply.send({ templates: allTemplates });
  });

  // Create project from template
  app.post('/api/v1/projects/from-template/:templateId', async (req, reply) => {
    const userId = req.session.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { templateId } = z.object({ templateId: z.string() }).parse(req.params);
    const { name } = z.object({ name: z.string().optional() }).parse(req.body);

    try {
      const [template] = await db
        .select()
        .from(templates)
        .where(eq(templates.id, templateId as any))
        .limit(1);

      if (!template) {
        return reply.status(404).send({ error: 'Template not found' });
      }

      // Create new project
      const [newProject] = await db
        .insert(projects)
        .values({
          userId: userId as any,
          name: name || template.name,
          description: template.description,
        })
        .returning({ id: projects.id });

      // Insert template files into project
      const templateFiles = (template.files as any[] || []);
      for (const file of templateFiles) {
        await db.insert(files).values({
          projectId: newProject!.id,
          path: file.path,
          content: file.content,
          mimeType: file.mimeType || 'text/plain',
        });
      }

      return reply.status(201).send({ project: newProject });
    } catch (err) {
      return reply.status(400).send({ error: `Failed to create project: ${err}` });
    }
  });
}
