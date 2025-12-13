import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async addFavorite(userId: number, productId: number) {
    // Vérifier que le produit existe
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Produit avec l'ID ${productId} introuvable`);
    }

    // Vérifier si le favori existe déjà
    const existingFavorite = await (this.prisma as any).favorite.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    if (existingFavorite) {
      throw new BadRequestException('Ce produit est déjà dans vos favoris');
    }

    return (this.prisma as any).favorite.create({
      data: {
        userId,
        productId,
      },
      include: {
        product: {
          include: {
            images: {
              orderBy: { isMain: 'desc' },
            },
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async removeFavorite(userId: number, productId: number) {
    const favorite = await (this.prisma as any).favorite.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    if (!favorite) {
      throw new NotFoundException('Ce produit n\'est pas dans vos favoris');
    }

    return (this.prisma as any).favorite.delete({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });
  }

  async getFavorites(userId: number) {
    return (this.prisma as any).favorite.findMany({
      where: { userId },
      include: {
        product: {
          include: {
            images: {
              orderBy: { isMain: 'desc' },
            },
            category: {
              select: {
                id: true,
                name: true,
              },
            },
            promotions: {
              where: {
                promotion: {
                  isActive: true,
                  startDate: { lte: new Date() },
                  endDate: { gte: new Date() },
                },
              },
              include: {
                promotion: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async isFavorite(userId: number, productId: number): Promise<boolean> {
    const favorite = await (this.prisma as any).favorite.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    return !!favorite;
  }
}

