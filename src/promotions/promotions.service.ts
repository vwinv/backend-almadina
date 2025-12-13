import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { AssignProductsDto } from './dto/assign-products.dto';

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createPromotionDto: CreatePromotionDto) {
    // Normaliser le code : si vide ou null, mettre à undefined pour ne pas l'inclure
    const code = createPromotionDto.code?.trim() || undefined;

    // Vérifier que le code promo est unique si fourni
    if (code) {
      const existing = await this.prisma.promotion.findUnique({
        where: { code },
      });
      if (existing) {
        throw new BadRequestException('Un code promotion avec ce nom existe déjà');
      }
    }

    // Vérifier que startDate < endDate
    if (new Date(createPromotionDto.startDate) >= new Date(createPromotionDto.endDate)) {
      throw new BadRequestException('La date de début doit être antérieure à la date de fin');
    }

    // Vérifier que value est dans la bonne plage selon le type
    if (createPromotionDto.type === 'PERCENTAGE' && createPromotionDto.value > 100) {
      throw new BadRequestException('Le pourcentage ne peut pas dépasser 100%');
    }

    return this.prisma.promotion.create({
      data: {
        ...createPromotionDto,
        code: code || null, // Utiliser null au lieu de undefined pour Prisma
        startDate: new Date(createPromotionDto.startDate),
        endDate: new Date(createPromotionDto.endDate),
      },
      include: {
        products: {
          include: {
            product: {
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

  async findAll() {
    return this.prisma.promotion.findMany({
      include: {
        products: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id },
      include: {
        products: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                price: true,
                image: true,
              },
            },
          },
        },
      },
    });

    if (!promotion) {
      throw new NotFoundException(`Promotion avec l'ID ${id} introuvable`);
    }

    return promotion;
  }

  async update(id: number, updatePromotionDto: UpdatePromotionDto) {
    const existing = await this.prisma.promotion.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Promotion avec l'ID ${id} introuvable`);
    }

    // Normaliser le code : si vide ou null, mettre à undefined pour ne pas l'inclure
    const code = updatePromotionDto.code?.trim() || undefined;

    // Vérifier que le code promo est unique si fourni et différent de l'actuel
    if (code && code !== existing.code) {
      const existingCode = await this.prisma.promotion.findUnique({
        where: { code },
      });
      if (existingCode) {
        throw new BadRequestException('Un code promotion avec ce nom existe déjà');
      }
    }

    // Vérifier les dates si fournies
    const startDate = updatePromotionDto.startDate
      ? new Date(updatePromotionDto.startDate)
      : existing.startDate;
    const endDate = updatePromotionDto.endDate
      ? new Date(updatePromotionDto.endDate)
      : existing.endDate;

    if (startDate >= endDate) {
      throw new BadRequestException('La date de début doit être antérieure à la date de fin');
    }

    // Vérifier la valeur si fournie
    const value = updatePromotionDto.value ?? Number(existing.value);
    const type = updatePromotionDto.type ?? existing.type;
    if (type === 'PERCENTAGE' && value > 100) {
      throw new BadRequestException('Le pourcentage ne peut pas dépasser 100%');
    }

    const updateData: any = { ...updatePromotionDto };
    // Gérer le code : si fourni et non vide, l'utiliser, sinon null
    if (updatePromotionDto.code !== undefined) {
      updateData.code = code || null;
    }
    if (updatePromotionDto.startDate) {
      updateData.startDate = new Date(updatePromotionDto.startDate);
    }
    if (updatePromotionDto.endDate) {
      updateData.endDate = new Date(updatePromotionDto.endDate);
    }

    return this.prisma.promotion.update({
      where: { id },
      data: updateData,
      include: {
        products: {
          include: {
            product: {
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

  async remove(id: number) {
    const existing = await this.prisma.promotion.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Promotion avec l'ID ${id} introuvable`);
    }

    return this.prisma.promotion.delete({
      where: { id },
    });
  }

  async assignProducts(promotionId: number, assignProductsDto: AssignProductsDto) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
    });

    if (!promotion) {
      throw new NotFoundException(`Promotion avec l'ID ${promotionId} introuvable`);
    }

    const productIds: number[] = [];

    // Si categoryId est fourni, récupérer tous les produits de cette catégorie
    if (assignProductsDto.categoryId) {
      const categoryProducts = await this.prisma.product.findMany({
        where: { categoryId: assignProductsDto.categoryId },
        select: { id: true },
      });
      productIds.push(...categoryProducts.map((p) => p.id));
    }

    // Ajouter les productIds fournis
    if (assignProductsDto.productIds && assignProductsDto.productIds.length > 0) {
      productIds.push(...assignProductsDto.productIds);
    }

    // Supprimer les doublons
    const uniqueProductIds = [...new Set(productIds)];

    if (uniqueProductIds.length === 0) {
      throw new BadRequestException('Aucun produit à associer');
    }

    // Vérifier que les produits existent
    const products = await this.prisma.product.findMany({
      where: { id: { in: uniqueProductIds } },
      select: { id: true },
    });

    if (products.length !== uniqueProductIds.length) {
      throw new BadRequestException('Certains produits n\'existent pas');
    }

    // Créer les associations (ignorer les doublons grâce à @@unique)
    await this.prisma.productPromotion.createMany({
      data: uniqueProductIds.map((productId) => ({
        productId,
        promotionId,
      })),
      skipDuplicates: true,
    });

    return this.findOne(promotionId);
  }

  async removeProduct(promotionId: number, productId: number) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
    });

    if (!promotion) {
      throw new NotFoundException(`Promotion avec l'ID ${promotionId} introuvable`);
    }

    await this.prisma.productPromotion.deleteMany({
      where: {
        promotionId,
        productId,
      },
    });

    return this.findOne(promotionId);
  }

  async toggleActive(id: number) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id },
    });

    if (!promotion) {
      throw new NotFoundException(`Promotion avec l'ID ${id} introuvable`);
    }

    return this.prisma.promotion.update({
      where: { id },
      data: { isActive: !promotion.isActive },
      include: {
        products: {
          include: {
            product: {
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

  async findActiveWithProducts() {
    const now = new Date();
    const promotions = await this.prisma.promotion.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        banniere: true,
        type: true,
        value: true,
        startDate: true,
        endDate: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return promotions;
  }
}

