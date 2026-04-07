import type { FastifyInstance } from 'fastify';
import archiver from 'archiver';
import { requireAuth } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { projects, files } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export async function exportRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>(
    '/api/v1/projects/:id/export',
    async (req, reply) => {
      await requireAuth(req, reply);
      if (!req.session.userId) return; // Already handled by requireAuth

      const { id } = req.params;

      // Verify project ownership
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, id))
        .limit(1);

      if (!project || project.userId !== req.session.userId) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      // Query all project files
      const projectFiles = await db
        .select()
        .from(files)
        .where(eq(files.projectId, id));

      // Create ZIP archive
      const archive = archiver('zip', { zlib: { level: 9 } });

      // Set response headers
      reply.type('application/zip');
      reply.header('Content-Disposition', `attachment; filename="${project.name}.zip"`);

      // Pipe archive to response
      archive.pipe(reply.raw);

      // Add files to archive
      for (const file of projectFiles) {
        archive.append(file.content, { name: file.path });
      }

      // Finalize archive
      await archive.finalize();
    }
  );
}
