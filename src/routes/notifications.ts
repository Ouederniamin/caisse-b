import { FastifyInstance, FastifyRequest } from 'fastify';
import prisma from '../lib/prisma';
import notificationService from '../services/notificationService';
import { authenticate } from '../middleware/auth';

export default async function notificationRoutes(fastify: FastifyInstance) {

  // POST /api/notifications/register-token - Register Expo push token
  fastify.post('/api/notifications/register-token', { preHandler: authenticate }, async (request: FastifyRequest, reply) => {
    try {
      const { expoPushToken } = request.body as { expoPushToken: string };
      const userId = request.user!.id;

      if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken[')) {
        return reply.code(400).send({ error: 'Token Expo invalide' });
      }

      // Store token in User model
      await prisma.user.update({
        where: { id: userId },
        data: { expoPushToken }
      });

      return { success: true, message: 'Token enregistré' };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Erreur serveur' });
    }
  });

  // GET /api/notifications - Get user notifications
  fastify.get('/api/notifications', { preHandler: authenticate }, async (request: FastifyRequest, reply) => {
    try {
      const userId = request.user!.id;
      const { limit } = request.query as { limit?: string };

      const notifications = await notificationService.getUserNotifications(
        userId, 
        limit ? parseInt(limit) : 50
      );

      const unreadCount = await notificationService.getUnreadCount(userId);

      return {
        notifications,
        unreadCount
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Erreur serveur' });
    }
  });

  // PATCH /api/notifications/:id/read - Mark notification as read
  fastify.patch('/api/notifications/:id/read', { preHandler: authenticate }, async (request: FastifyRequest, reply) => {
    try {
      const { id } = request.params as { id: string };
      
      await notificationService.markAsRead(id);

      return { success: true };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Erreur serveur' });
    }
  });

  // POST /api/notifications/mark-all-read - Mark all notifications as read
  fastify.post('/api/notifications/mark-all-read', { preHandler: authenticate }, async (request: FastifyRequest, reply) => {
    try {
      const userId = request.user!.id;
      
      await notificationService.markAllAsRead(userId);

      return { success: true };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Erreur serveur' });
    }
  });

  // GET /api/notifications/unread-count - Get unread count
  fastify.get('/api/notifications/unread-count', { preHandler: authenticate }, async (request: FastifyRequest, reply) => {
    try {
      const userId = request.user!.id;
      const count = await notificationService.getUnreadCount(userId);

      return { count };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Erreur serveur' });
    }
  });

  console.log('  🔔 Notification routes registered');
}
