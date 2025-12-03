import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { authenticate } from '../middleware/auth';

export default async function configRoutes(fastify: FastifyInstance) {
  // Get app config
  fastify.get('/config', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const result = await query('SELECT * FROM app_configs');
      const config: Record<string, any> = {};
      
      result.rows.forEach((row: { key: string; value: string }) => {
        try {
          config[row.key] = JSON.parse(row.value);
        } catch {
          config[row.key] = row.value;
        }
      });

      return reply.send({ config });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch config' });
    }
  });

  // Get allowed SSIDs
  fastify.get('/config/ssids', async (request, reply) => {
    try {
      const result = await query('SELECT value FROM app_configs WHERE key = $1', ['ALLOWED_SSIDS']);
      
      if (result.rows.length === 0) {
        return reply.send({ ssids: [] });
      }

      const ssids = JSON.parse(result.rows[0].value);
      return reply.send({ ssids });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch SSIDs' });
    }
  });

  // Get all secteurs
  fastify.get('/secteurs', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const result = await query('SELECT * FROM secteurs ORDER BY nom');
      return reply.send({ secteurs: result.rows });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch secteurs' });
    }
  });

  // Get all produits
  fastify.get('/produits', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const result = await query('SELECT * FROM produits ORDER BY nom');
      return reply.send({ produits: result.rows });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch produits' });
    }
  });
}
