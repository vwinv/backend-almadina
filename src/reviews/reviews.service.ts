import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrUpdateRating(userId: number, productId: number, rating: number) {
    // Vérifier si le produit existe
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException(`Produit avec l'ID ${productId} introuvable`);
    }

    // Vérifier si l'utilisateur a déjà laissé un avis pour ce produit
    const existingReview = await (this.prisma.review as any).findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    let review;
    if (existingReview) {
      // Mettre à jour la note existante
      review = await (this.prisma.review as any).update({
        where: {
          userId_productId: {
            userId,
            productId,
          },
        },
        data: {
          rating,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
    } else {
      // Créer un nouvel avis avec juste la note
      review = await (this.prisma.review as any).create({
        data: {
          userId,
          productId,
          rating,
          comment: null,
          isApproved: true, // Approuvé automatiquement
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
    }

    return review;
  }

  async updateComment(userId: number, productId: number, comment: string | null) {
    // Vérifier si le produit existe
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException(`Produit avec l'ID ${productId} introuvable`);
    }

    // Vérifier si l'utilisateur a déjà un avis pour ce produit
    const existingReview = await (this.prisma.review as any).findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    let review;
    if (existingReview) {
      // Mettre à jour le commentaire si l'avis existe déjà
      review = await (this.prisma.review as any).update({
        where: {
          userId_productId: {
            userId,
            productId,
          },
        },
        data: {
          comment,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
    } else {
      // Créer un nouvel avis avec juste le commentaire (sans note)
      review = await (this.prisma.review as any).create({
        data: {
          userId,
          productId,
          rating: 0, // Pas de note, juste un commentaire
          comment,
          isApproved: true, // Approuvé automatiquement
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
    }

    return review;
  }

  async create(userId: number, productId: number, createReviewDto: CreateReviewDto) {
    const { rating, comment } = createReviewDto;

    // Vérifier si le produit existe
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException(`Produit avec l'ID ${productId} introuvable`);
    }

    // Vérifier si l'utilisateur a déjà laissé un avis pour ce produit
    const existingReview = await (this.prisma.review as any).findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    if (existingReview) {
      throw new BadRequestException('Vous avez déjà laissé un avis pour ce produit.');
    }

    const review = await (this.prisma.review as any).create({
      data: {
        userId,
        productId,
        rating,
        comment,
        isApproved: true, // Approuvé automatiquement
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return review;
  }

  async findAllApprovedByProduct(productId: number) {
    // Retourner tous les commentaires (maintenant tous approuvés automatiquement)
    return (this.prisma.review as any).findMany({
      where: {
        productId,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findUserReview(userId: number, productId: number) {
    return (this.prisma.review as any).findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  // Méthodes pour l'admin (non implémentées ici mais prévues)
  async findAll() {
    return (this.prisma.review as any).findMany({
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveReview(id: number) {
    return (this.prisma.review as any).update({
      where: { id },
      data: { isApproved: true },
    });
  }

  async deleteReview(id: number) {
    return (this.prisma.review as any).delete({
      where: { id },
    });
  }
}

