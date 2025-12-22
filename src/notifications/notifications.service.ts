import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createNotificationDto: CreateNotificationDto) {
    // Si userId est fourni, vérifier que l'utilisateur existe
    if (createNotificationDto.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: createNotificationDto.userId },
      });
      if (!user) {
        throw new NotFoundException(`Utilisateur avec l'ID ${createNotificationDto.userId} introuvable`);
      }
    }

    // Créer la notification
    return (this.prisma as any).notification.create({
      data: {
        userId: createNotificationDto.userId || null,
        title: createNotificationDto.title,
        message: createNotificationDto.message,
        type: createNotificationDto.type || 'INFO',
        link: createNotificationDto.link || null,
      },
    });
  }

  /**
   * Crée une notification pour tous les administrateurs et gestionnaires
   */
  async createForAdminsAndManagers(createNotificationDto: Omit<CreateNotificationDto, 'userId'>) {
    // Récupérer tous les utilisateurs avec le rôle ADMIN, SUPER_ADMIN ou MANAGER
    const adminsAndManagers = await this.prisma.user.findMany({
      where: {
        role: {
          in: [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER],
        },
      },
      select: {
        id: true,
      },
    });

    // Créer une notification pour chaque admin/manager
    const notifications = await Promise.all(
      adminsAndManagers.map((user) =>
        (this.prisma as any).notification.create({
          data: {
            userId: user.id,
            title: createNotificationDto.title,
            message: createNotificationDto.message,
            type: createNotificationDto.type || 'INFO',
            link: createNotificationDto.link || null,
          },
        })
      )
    );

    return notifications;
  }

  async findAll(userId?: number) {
    const where: any = {};
    
    if (userId) {
      // Notifications pour un utilisateur spécifique : globales OU pour cet utilisateur
      where.OR = [
        { userId: null }, // Notifications globales
        { userId }, // Notifications pour cet utilisateur
      ];
    } else {
      // Si pas d'userId, retourner toutes les notifications (pour l'admin)
      where.userId = null; // Seulement les notifications globales par défaut
    }

    return (this.prisma as any).notification.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markAsRead(notificationId: number, userId: number) {
    const notification = await (this.prisma as any).notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException(`Notification avec l'ID ${notificationId} introuvable`);
    }

    // Vérifier que la notification appartient à l'utilisateur ou est globale
    if (notification.userId !== null && notification.userId !== userId) {
      throw new NotFoundException('Notification introuvable');
    }

    return (this.prisma as any).notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  /**
   * Compte les notifications non lues pour un utilisateur
   */
  async countUnread(userId: number): Promise<number> {
    return (this.prisma as any).notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }
}

