import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockMovementType } from '@prisma/client';
import { AdjustStockDto } from './dto/adjust-stock.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enregistre un mouvement de stock
   */
  async recordStockMovement(
    productId: number,
    type: StockMovementType,
    quantity: number,
    oldStock: number,
    newStock: number,
    userId?: number,
    orderId?: number,
    reason?: string,
  ) {
    return this.prisma.stockMovement.create({
      data: {
        productId,
        type,
        quantity,
        oldStock,
        newStock,
        reason,
        userId,
        orderId,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Ajuste le stock d'un produit
   */
  async adjustStock(productId: number, adjustStockDto: AdjustStockDto, userId?: number) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Produit avec l'ID ${productId} introuvable`);
    }

    const oldStock = product.stock;
    let newStock: number;
    let movementType: StockMovementType;
    let quantity: number;

    switch (adjustStockDto.type) {
      case 'ADD':
        newStock = oldStock + adjustStockDto.quantity;
        movementType = StockMovementType.ADD;
        quantity = adjustStockDto.quantity;
        break;
      case 'REMOVE':
        if (oldStock < adjustStockDto.quantity) {
          throw new BadRequestException('Le stock ne peut pas être négatif');
        }
        newStock = oldStock - adjustStockDto.quantity;
        movementType = StockMovementType.REMOVE;
        quantity = adjustStockDto.quantity;
        break;
      case 'SET':
        if (adjustStockDto.quantity < 0) {
          throw new BadRequestException('Le stock ne peut pas être négatif');
        }
        newStock = adjustStockDto.quantity;
        movementType = StockMovementType.SET;
        quantity = Math.abs(newStock - oldStock);
        break;
      default:
        throw new BadRequestException('Type de mouvement invalide');
    }

    // Mettre à jour le stock du produit
    const updatedProduct = await this.prisma.product.update({
      where: { id: productId },
      data: { stock: newStock },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        subCategory: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Enregistrer le mouvement de stock
    await this.recordStockMovement(
      productId,
      movementType,
      quantity,
      oldStock,
      newStock,
      userId,
      undefined,
      adjustStockDto.reason,
    );

    return updatedProduct;
  }

  /**
   * Récupère l'historique des mouvements de stock pour un produit
   */
  async getStockHistory(productId: number, limit?: number) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true },
    });

    if (!product) {
      throw new NotFoundException(`Produit avec l'ID ${productId} introuvable`);
    }

    const movements = await this.prisma.stockMovement.findMany({
      where: { productId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit || 100,
    });

    return {
      product,
      movements,
      total: movements.length,
    };
  }

  /**
   * Récupère les statistiques de l'inventaire
   */
  async getInventoryStats() {
    const totalProducts = await this.prisma.product.count();
    const inStock = await this.prisma.product.count({
      where: { stock: { gt: 0 } },
    });
    const outOfStock = await this.prisma.product.count({
      where: { stock: { equals: 0 } },
    });

    // Calculer la valeur totale de l'inventaire (prix d'achat * stock)
    const products = await this.prisma.product.findMany({
      select: {
        purchasePrice: true,
        stock: true,
      },
    });

    const totalValue = products.reduce((sum, product) => {
      const purchasePrice = Number(product.purchasePrice || 0);
      return sum + purchasePrice * product.stock;
    }, 0);

    return {
      totalProducts,
      inStock,
      outOfStock,
      totalValue,
    };
  }
}
