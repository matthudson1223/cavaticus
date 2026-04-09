import { describe, it, expect, vi } from 'vitest';
import { requireAuth } from '../middleware/auth.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

function makeReply() {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply;
  return reply;
}

describe('requireAuth', () => {
  it('calls reply.status(401) when no userId in session', async () => {
    const req = { session: {} } as FastifyRequest;
    const reply = makeReply();

    await requireAuth(req, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('does not send 401 when userId is present', async () => {
    const req = { session: { userId: 'user-123' } } as FastifyRequest;
    const reply = makeReply();

    await requireAuth(req, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });
});
