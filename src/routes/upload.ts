import { FastifyInstance, FastifyRequest } from 'fastify';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';

// Simplified photo upload route - stores URLs from client-side uploads
export default async function uploadRoutes(fastify: FastifyInstance) {
  
  // POST /api/uploads/tour-photo - Register a photo URL for a tour
  fastify.post('/api/uploads/tour-photo', { preHandler: authenticate }, async (request: FastifyRequest, reply) => {
    try {
      const { tourId, type, url } = request.body as {
        tourId: string;
        type: 'depart' | 'retour' | 'hygiene';
        url: string;
      };
      const user = request.user!;

      if (!tourId || !type || !url) {
        return reply.code(400).send({ error: 'tourId, type et url sont requis' });
      }

      // Validate role based on photo type
      const allowedRoles: Record<string, string[]> = {
        depart: ['ADMIN', 'DIRECTION', 'AGENT_CONTROLE', 'admin'],
        retour: ['ADMIN', 'DIRECTION', 'AGENT_CONTROLE', 'admin'],
        hygiene: ['ADMIN', 'DIRECTION', 'AGENT_HYGIENE', 'admin'],
      };

      if (!allowedRoles[type]?.includes(user.role)) {
        return reply.code(403).send({ error: 'Permission refusée pour ce type de photo' });
      }

      // Update tour with photo URL
      const updateData: Record<string, any> = {};

      switch (type) {
        case 'depart':
          updateData.photo_preuve_depart_url = url;
          break;
        case 'retour':
          updateData.photo_preuve_retour_url = url;
          break;
        case 'hygiene':
          // For hygiene, append to array
          const tour = await prisma.tour.findUnique({
            where: { id: tourId },
            select: { photos_hygiene_urls: true },
          });
          updateData.photos_hygiene_urls = [...(tour?.photos_hygiene_urls || []), url];
          break;
      }

      await prisma.tour.update({
        where: { id: tourId },
        data: updateData,
      });

      return { success: true, url };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Erreur lors de l\'enregistrement de la photo' });
    }
  });

  // GET /api/uploads/tour-photos/:tourId - Get all photos for a tour
  fastify.get('/api/uploads/tour-photos/:tourId', { preHandler: authenticate }, async (request: FastifyRequest, reply) => {
    try {
      const { tourId } = request.params as { tourId: string };

      const tour = await prisma.tour.findUnique({
        where: { id: tourId },
        select: {
          photo_preuve_depart_url: true,
          photo_preuve_retour_url: true,
          photos_hygiene_urls: true,
        },
      });

      if (!tour) {
        return reply.code(404).send({ error: 'Tour non trouvée' });
      }

      return {
        depart: tour.photo_preuve_depart_url,
        retour: tour.photo_preuve_retour_url,
        hygiene: tour.photos_hygiene_urls,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Erreur serveur' });
    }
  });

  console.log('  📸 Upload routes registered');
}
