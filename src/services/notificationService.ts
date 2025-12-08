import prisma from '../lib/prisma';

interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
}

interface ConflictNotificationData {
  conflictId: string;
  tourId: string;
  driverName: string;
  quantitePerdue: number;
  depasseTolerance: boolean;
  isSurplus: boolean;
}

class NotificationService {
  private expoAccessToken: string | null = null;

  constructor() {
    this.expoAccessToken = process.env.EXPO_ACCESS_TOKEN || null;
  }

  // Send push notification via Expo Push API
  async sendExpoPush(pushTokens: string[], notification: NotificationPayload): Promise<void> {
    if (pushTokens.length === 0) {
      console.log('[NotificationService] No push tokens to send to');
      return;
    }

    const messages = pushTokens.map(token => ({
      to: token,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      priority: 'high' as const,
    }));

    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
          ...(this.expoAccessToken && { 'Authorization': `Bearer ${this.expoAccessToken}` })
        },
        body: JSON.stringify(messages)
      });

      const result = await response.json();
      console.log('[NotificationService] Push sent:', result);
    } catch (error) {
      console.error('[NotificationService] Error sending push:', error);
    }
  }

  // Get all Direction users' push tokens
  async getDirectionPushTokens(): Promise<string[]> {
    const directionUsers = await prisma.user.findMany({
      where: {
        role: { in: ['DIRECTION', 'ADMIN'] },
        expoPushToken: { not: null }
      },
      select: { expoPushToken: true }
    });

    return directionUsers
      .filter(u => u.expoPushToken)
      .map(u => u.expoPushToken as string);
  }

  // Create notification record in database
  async createNotificationRecord(
    userIds: string[],
    message: string,
    data?: Record<string, any>
  ): Promise<void> {
    const notifications = userIds.map(userId => ({
      userId,
      message,
      isRead: false,
      data: data ? JSON.stringify(data) : null
    }));

    await prisma.notification.createMany({
      data: notifications.map(n => ({
        userId: n.userId,
        message: n.message,
        isRead: false
      }))
    });
  }

  // Notify Direction about new conflict
  async notifyNewConflict(conflictData: ConflictNotificationData): Promise<void> {
    const { conflictId, tourId, driverName, quantitePerdue, depasseTolerance, isSurplus } = conflictData;

    let title: string;
    let body: string;

    if (isSurplus) {
      title = '⚠️ Surplus Détecté';
      body = `${driverName}: +${Math.abs(quantitePerdue)} caisses en surplus (suspect)`;
    } else if (depasseTolerance) {
      title = '🔴 Tolérance Dépassée';
      body = `${driverName}: ${quantitePerdue} caisses manquantes (hors tolérance)`;
    } else {
      title = '📦 Nouveau Conflit';
      body = `${driverName}: ${quantitePerdue} caisses manquantes`;
    }

    // Get Direction users
    const directionUsers = await prisma.user.findMany({
      where: { role: { in: ['DIRECTION', 'ADMIN'] } },
      select: { id: true }
    });

    const userIds = directionUsers.map(u => u.id);

    // Create notification records
    await this.createNotificationRecord(userIds, body, {
      type: 'CONFLICT',
      conflictId,
      tourId,
      isSurplus,
      depasseTolerance
    });

    // Send push notifications
    const pushTokens = await this.getDirectionPushTokens();
    if (pushTokens.length > 0) {
      await this.sendExpoPush(pushTokens, { 
        title, 
        body, 
        data: { type: 'CONFLICT', conflictId, tourId } 
      });
    }
  }

  // Notify Agent Hygiène about pending hygiene check
  async notifyHygieneRequired(tourId: string, driverName: string, matricule: string): Promise<void> {
    const title = '🐔 Contrôle Hygiène Requis';
    const body = `${driverName} (${matricule}): Produits poulet à vérifier`;

    // Get Agent Hygiène users
    const hygieneAgents = await prisma.user.findMany({
      where: { role: 'AGENT_HYGIENE' },
      select: { id: true, expoPushToken: true }
    });

    const userIds = hygieneAgents.map(u => u.id);
    
    // Create notification records
    await this.createNotificationRecord(userIds, body, {
      type: 'HYGIENE_REQUIRED',
      tourId,
    });

    // Send push notifications
    const pushTokens = hygieneAgents
      .filter(u => u.expoPushToken)
      .map(u => u.expoPushToken as string);
      
    if (pushTokens.length > 0) {
      await this.sendExpoPush(pushTokens, { 
        title, 
        body, 
        data: { type: 'HYGIENE_REQUIRED', tourId } 
      });
    }
    
    console.log(`[NotificationService] Hygiene required notification sent for tour ${tourId}`);
  }

  // Notify about hygiene rejection
  async notifyHygieneRejection(tourId: string, driverName: string, notes: string): Promise<void> {
    const title = '❌ Rejet Hygiène';
    const body = `${driverName}: Contrôle hygiène rejeté`;

    const directionUsers = await prisma.user.findMany({
      where: { role: { in: ['DIRECTION', 'ADMIN'] } },
      select: { id: true }
    });

    await this.createNotificationRecord(
      directionUsers.map(u => u.id),
      body,
      { type: 'HYGIENE_REJECT', tourId, notes }
    );

    console.log(`[NotificationService] Would send push: ${title} - ${body}`);
  }

  // Get notifications for a user
  async getUserNotifications(userId: string, limit = 50): Promise<any[]> {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }

  // Mark notification as read
  async markAsRead(notificationId: string): Promise<void> {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true }
    });
  }

  // Mark all notifications as read for a user
  async markAllAsRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true }
    });
  }

  // Get unread count for a user
  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, isRead: false }
    });
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
export default notificationService;
