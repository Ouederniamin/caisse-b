import { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);
    
    // Verify JWT token
    try {
      const decoded = await request.server.jwt.verify(token);
      (request as any).user = decoded;
    } catch (err) {
      return reply.code(401).send({ error: 'Invalid token' });
    }
  } catch (error) {
    return reply.code(500).send({ error: 'Authentication failed' });
  }
}

export async function authorize(roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    
    if (!user) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }

    if (!roles.includes(user.role)) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
  };
}
