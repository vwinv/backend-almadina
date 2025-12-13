import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Récupère toutes les statistiques du tableau de bord
   */
  async getDashboardStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Total des commandes
    const totalOrders = await this.prisma.order.count();
    const ordersThisMonth = await this.prisma.order.count({
      where: {
        createdAt: {
          gte: startOfMonth,
        },
      },
    });
    const ordersLastMonth = await this.prisma.order.count({
      where: {
        createdAt: {
          gte: startOfLastMonth,
          lte: endOfLastMonth,
        },
      },
    });
    const ordersGrowth = ordersLastMonth > 0
      ? ((ordersThisMonth - ordersLastMonth) / ordersLastMonth) * 100
      : ordersThisMonth > 0 ? 100 : 0;

    // Total des produits
    const totalProducts = await this.prisma.product.count({
      where: {
        isActive: true,
      },
    });

    // Total des clients
    const totalCustomers = await this.prisma.user.count({
      where: {
        role: 'CUSTOMER',
      },
    });
    const customersThisMonth = await this.prisma.user.count({
      where: {
        role: 'CUSTOMER',
        createdAt: {
          gte: startOfMonth,
        },
      },
    });
    const customersLastMonth = await this.prisma.user.count({
      where: {
        role: 'CUSTOMER',
        createdAt: {
          gte: startOfLastMonth,
          lte: endOfLastMonth,
        },
      },
    });
    const customersGrowth = customersLastMonth > 0
      ? ((customersThisMonth - customersLastMonth) / customersLastMonth) * 100
      : customersThisMonth > 0 ? 100 : 0;

    // Promotions actives
    const activePromotions = await this.prisma.promotion.count({
      where: {
        isActive: true,
        startDate: {
          lte: now,
        },
        endDate: {
          gte: now,
        },
      },
    });

    // Revenus du mois
    const revenueThisMonth = await this.prisma.order.aggregate({
      where: {
        createdAt: {
          gte: startOfMonth,
        },
        invoice: {
          payment: {
            status: 'COMPLETED',
          },
        },
      },
      _sum: {
        total: true,
      },
    });

    const revenueLastMonth = await this.prisma.order.aggregate({
      where: {
        createdAt: {
          gte: startOfLastMonth,
          lte: endOfLastMonth,
        },
        invoice: {
          payment: {
            status: 'COMPLETED',
          },
        },
      },
      _sum: {
        total: true,
      },
    });

    const revenueGrowth = revenueLastMonth._sum.total && Number(revenueLastMonth._sum.total) > 0
      ? ((Number(revenueThisMonth._sum.total || 0) - Number(revenueLastMonth._sum.total)) / Number(revenueLastMonth._sum.total)) * 100
      : Number(revenueThisMonth._sum.total || 0) > 0 ? 100 : 0;

    return {
      orders: {
        total: totalOrders,
        thisMonth: ordersThisMonth,
        growth: Math.round(ordersGrowth * 10) / 10,
      },
      products: {
        total: totalProducts,
      },
      customers: {
        total: totalCustomers,
        thisMonth: customersThisMonth,
        growth: Math.round(customersGrowth * 10) / 10,
      },
      promotions: {
        active: activePromotions,
      },
      revenue: {
        thisMonth: Number(revenueThisMonth._sum.total || 0),
        lastMonth: Number(revenueLastMonth._sum.total || 0),
        growth: Math.round(revenueGrowth * 10) / 10,
      },
    };
  }

  /**
   * Récupère les ventes mensuelles sur une année
   */
  async getYearlySales() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const months = [
      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];

    const salesData: Array<{ month: string; monthIndex: number; sales: number }> = [];

    for (let month = 0; month < 12; month++) {
      const startOfMonth = new Date(currentYear, month, 1);
      const endOfMonth = new Date(currentYear, month + 1, 0, 23, 59, 59, 999);

      // Calculer le total des ventes pour ce mois (commandes payées)
      const monthlySales = await this.prisma.order.aggregate({
        where: {
          createdAt: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
          invoice: {
            payment: {
              status: 'COMPLETED',
            },
          },
        },
        _sum: {
          total: true,
        },
      });

      salesData.push({
        month: months[month],
        monthIndex: month,
        sales: Number(monthlySales._sum.total || 0),
      });
    }

    return salesData;
  }
}

