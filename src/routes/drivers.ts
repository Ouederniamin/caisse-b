import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { authenticate } from '../middleware/auth';

export default async function driverRoutes(fastify: FastifyInstance) {
  // Get all drivers
  fastify.get('/drivers', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const result = await query(
        'SELECT id, nom_complet, matricule_par_defaut, tolerance_caisses_mensuelle, statut FROM drivers ORDER BY nom_complet'
      );
      return reply.send({ drivers: result.rows });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch drivers' });
    }
  });

  // Get driver by ID
  fastify.get('/drivers/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    
    try {
      const result = await query(
        'SELECT * FROM drivers WHERE id = $1',
        [id]
      );
      
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Driver not found' });
      }
      
      return reply.send({ driver: result.rows[0] });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch driver' });
    }
  });

  // Create driver
  fastify.post('/drivers', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { nom_complet, matricule_par_defaut, tolerance_caisses_mensuelle } = request.body as {
      nom_complet: string;
      matricule_par_defaut?: string;
      tolerance_caisses_mensuelle?: number;
    };

    if (!nom_complet) {
      return reply.code(400).send({ error: 'nom_complet is required' });
    }

    try {
      const result = await query(
        'INSERT INTO drivers (nom_complet, matricule_par_defaut, tolerance_caisses_mensuelle) VALUES ($1, $2, $3) RETURNING *',
        [nom_complet, matricule_par_defaut || null, tolerance_caisses_mensuelle || 0]
      );

      return reply.code(201).send({ driver: result.rows[0] });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create driver' });
    }
  });

  // Update driver
  fastify.put('/drivers/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { nom_complet, matricule_par_defaut, tolerance_caisses_mensuelle, statut } = request.body as any;

    try {
      const result = await query(
        `UPDATE drivers 
         SET nom_complet = COALESCE($1, nom_complet),
             matricule_par_defaut = COALESCE($2, matricule_par_defaut),
             tolerance_caisses_mensuelle = COALESCE($3, tolerance_caisses_mensuelle),
             statut = COALESCE($4, statut),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5
         RETURNING *`,
        [nom_complet, matricule_par_defaut, tolerance_caisses_mensuelle, statut, id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Driver not found' });
      }

      return reply.send({ driver: result.rows[0] });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update driver' });
    }
  });

  // Delete driver
  fastify.delete('/drivers/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const result = await query('DELETE FROM drivers WHERE id = $1 RETURNING id', [id]);

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Driver not found' });
      }

      return reply.send({ message: 'Driver deleted successfully' });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to delete driver' });
    }
  });
}
