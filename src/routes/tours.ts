import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { authenticate } from '../middleware/auth';

export default async function tourRoutes(fastify: FastifyInstance) {
  // Get all tours
  fastify.get('/tours', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const result = await query(`
        SELECT t.*, d.nom_complet as driver_name, s.nom as secteur_name
        FROM tours t
        JOIN drivers d ON t.driver_id = d.id
        JOIN secteurs s ON t.secteur_id = s.id
        ORDER BY t.created_at DESC
      `);
      return reply.send({ tours: result.rows });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch tours' });
    }
  });

  // Create tour (Fiche de Sortie)
  fastify.post('/tours', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const {
      driver_id,
      secteur_id,
      nbre_caisses_depart,
      poids_net_produits_depart,
      matricule_vehicule
    } = request.body as any;

    const user = (request as any).user;

    if (!driver_id || !secteur_id || !nbre_caisses_depart) {
      return reply.code(400).send({ error: 'Missing required fields' });
    }

    try {
      const result = await query(
        `INSERT INTO tours (
          driver_id, secteur_id, agent_controle_id,
          nbre_caisses_depart, poids_net_produits_depart,
          matricule_vehicule, statut
        ) VALUES ($1, $2, $3, $4, $5, $6, 'EN_CHARGEMENT')
        RETURNING *`,
        [driver_id, secteur_id, user.id, nbre_caisses_depart, poids_net_produits_depart, matricule_vehicule]
      );

      return reply.code(201).send({ tour: result.rows[0] });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create tour' });
    }
  });

  // Update tour status and add weighing data
  fastify.put('/tours/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as any;
    const user = (request as any).user;

    try {
      // Build dynamic update query
      const fields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined) {
          fields.push(`${key} = $${paramIndex}`);
          values.push(updates[key]);
          paramIndex++;
        }
      });

      if (fields.length === 0) {
        return reply.code(400).send({ error: 'No fields to update' });
      }

      values.push(id);
      
      const result = await query(
        `UPDATE tours SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Tour not found' });
      }

      // Update driver status if needed
      if (updates.statut) {
        const tour = result.rows[0];
        let driverStatus = 'A_L_USINE';
        
        switch (updates.statut) {
          case 'PRET_A_PARTIR':
            driverStatus = 'PRET_A_PARTIR';
            break;
          case 'EN_TOURNEE':
            driverStatus = 'EN_TOURNEE';
            break;
          case 'EN_ATTENTE_DECHARGEMENT':
            driverStatus = 'EN_ATTENTE_DECHARGEMENT';
            break;
          case 'EN_ATTENTE_HYGIENE':
            driverStatus = 'EN_ATTENTE_HYGIENE';
            break;
          case 'TERMINEE':
            driverStatus = 'A_L_USINE';
            break;
        }

        await query('UPDATE drivers SET statut = $1 WHERE id = $2', [driverStatus, tour.driver_id]);
      }

      return reply.send({ tour: result.rows[0] });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to update tour' });
    }
  });

  // Complete return (Create conflict if needed)
  fastify.post('/tours/:id/complete-return', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { nbre_caisses_retour, produits_retournes } = request.body as {
      nbre_caisses_retour: number;
      produits_retournes: boolean;
    };

    try {
      // Get tour
      const tourResult = await query('SELECT * FROM tours WHERE id = $1', [id]);
      if (tourResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Tour not found' });
      }

      const tour = tourResult.rows[0];
      const perte = tour.nbre_caisses_depart - nbre_caisses_retour;

      // Update tour
      const newStatus = produits_retournes ? 'EN_ATTENTE_HYGIENE' : 'TERMINEE';
      await query(
        `UPDATE tours 
         SET nbre_caisses_retour = $1, produits_retournes = $2, statut = $3, date_retour_controle = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [nbre_caisses_retour, produits_retournes, newStatus, id]
      );

      // Create conflict if there is a loss
      if (perte > 0) {
        const caisseConfig = await query('SELECT valeur_tnd FROM caisse_configs LIMIT 1');
        const valeurCaisse = caisseConfig.rows[0]?.valeur_tnd || 5.0;
        const montantDette = perte * valeurCaisse;

        // Check tolerance
        const driver = await query('SELECT tolerance_caisses_mensuelle FROM drivers WHERE id = $1', [tour.driver_id]);
        const tolerance = driver.rows[0]?.tolerance_caisses_mensuelle || 0;

        // Get monthly losses
        const monthlyLosses = await query(
          `SELECT COALESCE(SUM(quantite_perdue), 0) as total
           FROM conflicts c
           JOIN tours t ON c.tour_id = t.id
           WHERE t.driver_id = $1 
           AND EXTRACT(MONTH FROM c.created_at) = EXTRACT(MONTH FROM CURRENT_DATE)
           AND EXTRACT(YEAR FROM c.created_at) = EXTRACT(YEAR FROM CURRENT_DATE)`,
          [tour.driver_id]
        );

        const totalPertes = parseInt(monthlyLosses.rows[0].total) + perte;
        const depasseTolerance = totalPertes > tolerance;

        await query(
          `INSERT INTO conflicts (tour_id, quantite_perdue, montant_dette_tnd, depasse_tolerance)
           VALUES ($1, $2, $3, $4)`,
          [id, perte, montantDette, depasseTolerance]
        );

        // TODO: Send notification to Direction if depasseTolerance
      }

      // Update driver status
      const driverStatus = produits_retournes ? 'EN_ATTENTE_HYGIENE' : 'A_L_USINE';
      await query('UPDATE drivers SET statut = $1 WHERE id = $2', [driverStatus, tour.driver_id]);

      return reply.send({ 
        message: 'Return completed',
        conflict_created: perte > 0,
        perte
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to complete return' });
    }
  });

  // Note: /sortie and /entree endpoints are defined in server.ts
  // They use Prisma ORM and support both web and mobile clients
}
