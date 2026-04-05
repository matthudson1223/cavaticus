import type { FastifyRequest, FastifyReply } from 'fastify';

export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!req.session.userId) {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}
