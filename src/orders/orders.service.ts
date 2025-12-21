import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { CreateManualOrderDto } from './dto/create-manual-order.dto';
import { CashRegistersService } from '../cash-registers/cash-registers.service';
import { CashRegisterTransactionType } from '../cash-registers/types/cash-register.types';
import { StockMovementType, OrderStatus, PaymentMethod } from '@prisma/client';
import { EmailService } from '../email/email.service';
import { sendOrderStatusEmail } from './helpers/order-email.helper';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => CashRegistersService))
    private readonly cashRegistersService?: CashRegistersService,
    private readonly emailService?: EmailService,
  ) {}

  async create(createOrderDto: CreateOrderDto) {
    // Vérifier que l'utilisateur existe
    if (!createOrderDto.userId) {
      throw new BadRequestException('L\'ID utilisateur est requis');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: createOrderDto.userId },
    });

    if (!user) {
      throw new NotFoundException(`Utilisateur avec l'ID ${createOrderDto.userId} introuvable`);
    }

    // Créer l'adresse de livraison si fournie
    let shippingAddressId = createOrderDto.shippingAddressId;
    let deliveryZoneId: number | null = null;
    
    if (createOrderDto.shippingAddress && !shippingAddressId) {
      deliveryZoneId = createOrderDto.shippingAddress.deliveryZoneId || null;
      const shippingAddress = await (this.prisma as any).shippingAddress.create({
        data: {
          userId: createOrderDto.userId,
          firstName: createOrderDto.shippingAddress.firstName,
          lastName: createOrderDto.shippingAddress.lastName,
          address: createOrderDto.shippingAddress.address,
          city: createOrderDto.shippingAddress.city,
          postalCode: createOrderDto.shippingAddress.postalCode,
          country: createOrderDto.shippingAddress.country,
          phone: createOrderDto.shippingAddress.phone || null,
          deliveryZoneId: deliveryZoneId,
          isDefault: false,
        },
      });
      shippingAddressId = shippingAddress.id;
    }

    // Vérifier que les produits existent et calculer le total
    let total = 0;
    const orderItems: any[] = [];

    for (const item of createOrderDto.items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
        include: { category: true },
      });

      if (!product) {
        throw new NotFoundException(`Produit avec l'ID ${item.productId} introuvable`);
      }

      const price = item.price || Number(product.price);
      const itemTotal = price * item.quantity;
      total += itemTotal;

      orderItems.push({
        productId: item.productId,
        quantity: item.quantity,
        price,
        originalPrice: Number(product.price),
        customization: item.customization || null,
      });
    }

    // Récupérer le prix de livraison depuis la zone de livraison
    let shippingCost = 0;
    
    // Essayer d'abord avec l'adresse existante
    if (shippingAddressId) {
      const shippingAddress = await (this.prisma as any).shippingAddress.findUnique({
        where: { id: shippingAddressId },
        include: {
          deliveryZone: true,
        },
      });
      if (shippingAddress?.deliveryZone?.price) {
        shippingCost = Number(shippingAddress.deliveryZone.price);
      } else if (shippingAddress?.deliveryZoneId) {
        // Si la relation n'est pas chargée, récupérer directement la zone
        const deliveryZone = await this.prisma.deliveryZone.findUnique({
          where: { id: shippingAddress.deliveryZoneId },
        });
        if (deliveryZone?.price) {
          shippingCost = Number(deliveryZone.price);
        }
      }
    }
    
    // Si on n'a pas trouvé de prix et qu'on crée une nouvelle adresse avec deliveryZoneId
    if (shippingCost === 0 && deliveryZoneId) {
      const deliveryZone = await this.prisma.deliveryZone.findUnique({
        where: { id: deliveryZoneId },
      });
      if (deliveryZone?.price) {
        shippingCost = Number(deliveryZone.price);
      }
    }

    // Ajouter le prix de livraison au total
    total += shippingCost;

    // Créer la commande
    const order = await this.prisma.order.create({
      data: {
        userId: createOrderDto.userId,
        total,
        status: 'PENDING' as any,
        shippingAddressId: shippingAddressId || null,
        items: {
          create: orderItems,
        },
      } as any,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        items: {
          include: {
            product: {
              include: {
                category: true,
              },
            },
          },
        },
        shippingAddress: {
          include: {
            deliveryZone: true,
          },
        },
        deliveryPerson: true,
        invoice: {
          include: {
            payment: true,
          },
        },
      } as any,
    });

    // Créer automatiquement la facture
    // Le subtotal est le total sans la livraison
    const subtotalWithoutShipping = Number(total) - shippingCost;
    // Total facture = sous-total produits + livraison (sans TVA)
    const invoiceTotal = subtotalWithoutShipping + shippingCost;
    const invoiceNumber = `INV-${Date.now()}-${order.id}`;

    const invoice = await (this.prisma as any).invoice.create({
      data: {
        invoiceNumber,
        orderId: order.id,
        subtotal: subtotalWithoutShipping, // Sous-total des produits
        tax: 0, // Pas de TVA
        shipping: shippingCost, // Prix de livraison
        discount: 0,
        total: invoiceTotal, // Total = subtotal + shipping
      },
    });

    // Mettre à jour le stock des produits commandés
    await this.updateProductStockForOrder(order.id, orderItems);

    // Récupérer la commande complète avec toutes les relations pour l'email
    const orderForEmail = await this.prisma.order.findUnique({
      where: { id: order.id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        items: {
          include: {
            product: true,
          },
        },
        shippingAddress: {
          include: {
            deliveryZone: true,
          },
        },
        deliveryPerson: true,
        invoice: {
          include: {
            payment: true,
          },
        },
      } as any,
    });

    // Envoyer l'email de confirmation de commande (PENDING)
    if (orderForEmail) {
      sendOrderStatusEmail(this.emailService, orderForEmail, OrderStatus.PENDING).catch((err) => {
        console.error('Erreur lors de l\'envoi de l\'email de confirmation:', err);
      });
    }

    // Récupérer la commande avec la facture
    const orderWithInvoice = await this.prisma.order.findUnique({
      where: { id: order.id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        items: {
          include: {
            product: {
              include: {
                category: true,
              },
            },
          },
        },
        shippingAddress: {
          include: {
            deliveryZone: true,
          },
        },
        deliveryPerson: true,
        invoice: {
          include: {
            payment: true,
          },
        },
      } as any,
    });

    return orderWithInvoice;
  }

  async findAll(status?: string) {
    const where: any = {};
    
    if (status) {
      where.status = status;
    }

    return this.prisma.order.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        items: {
          include: {
            product: {
              include: {
                category: true,
              },
            },
          },
        },
        shippingAddress: {
          include: {
            deliveryZone: true,
          },
        },
        deliveryPerson: true,
        invoice: {
          include: {
            payment: true,
          },
        },
      } as any,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        items: {
          include: {
            product: {
              include: {
                category: true,
              },
            },
            promotion: true,
          },
        },
        shippingAddress: {
          include: {
            deliveryZone: true,
          },
        },
        deliveryPerson: true,
        invoice: {
          include: {
            payment: true,
          },
        },
      } as any,
    });

    if (!order) {
      throw new NotFoundException(`Commande avec l'ID ${id} introuvable`);
    }

    return order;
  }

  async findByUserId(userId: number) {
    return this.prisma.order.findMany({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: true,
              },
            },
            promotion: true,
          },
        },
        shippingAddress: {
          include: {
            deliveryZone: true,
          },
        },
        deliveryPerson: true,
        invoice: {
          include: {
            payment: true,
          },
        },
      } as any,
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: number, updateOrderDto: UpdateOrderDto) {
    const existing = await this.prisma.order.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Commande avec l'ID ${id} introuvable`);
    }

    // Vérifier que le livreur existe et est actif si fourni
    if (updateOrderDto.deliveryPersonId) {
      const deliveryPerson = await this.prisma.deliveryPerson.findUnique({
        where: { id: updateOrderDto.deliveryPersonId },
      });

      if (!deliveryPerson) {
        throw new NotFoundException(`Livreur avec l'ID ${updateOrderDto.deliveryPersonId} introuvable`);
      }

      if (deliveryPerson.status !== 'ACTIVE') {
        throw new BadRequestException('Ce livreur n\'est pas actif');
      }
    }

    const oldStatus = existing.status;
    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: updateOrderDto as any,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        items: {
          include: {
            product: true,
          },
        },
        shippingAddress: {
          include: {
            deliveryZone: true,
          },
        },
        deliveryPerson: true,
        invoice: {
          include: {
            payment: true,
          },
        },
      } as any,
    });

    // Envoyer un email si le statut a changé
    if (updateOrderDto.status && updateOrderDto.status !== oldStatus) {
      sendOrderStatusEmail(this.emailService, updatedOrder, updateOrderDto.status as OrderStatus).catch((err) => {
        console.error('Erreur lors de l\'envoi de l\'email de notification:', err);
      });
    }

    return updatedOrder;
  }

  async cancel(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        invoice: {
          include: {
            payment: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Commande avec l'ID ${id} introuvable`);
    }

    // Vérifier si le paiement a été effectué
    if (order.invoice?.payment?.status === 'COMPLETED') {
      throw new BadRequestException('Impossible d\'annuler une commande déjà payée');
    }

    const cancelledOrder = await this.prisma.order.update({
      where: { id },
      data: { status: 'CANCELLED' as any },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        items: {
          include: {
            product: true,
          },
        },
        shippingAddress: {
          include: {
            deliveryZone: true,
          },
        },
        deliveryPerson: true,
        invoice: {
          include: {
            payment: true,
          },
        },
      } as any,
    });

    // Envoyer l'email de notification d'annulation
    sendOrderStatusEmail(this.emailService, cancelledOrder, OrderStatus.CANCELLED).catch((err) => {
      console.error('Erreur lors de l\'envoi de l\'email de notification:', err);
    });

    return cancelledOrder;
  }

  async validatePayment(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        invoice: {
          include: {
            payment: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Commande avec l'ID ${id} introuvable`);
    }

    if (!order.invoice) {
      throw new BadRequestException('Aucune facture associée à cette commande');
    }

    if (order.invoice.payment?.status === 'COMPLETED') {
      throw new BadRequestException('Le paiement a déjà été validé');
    }

    // Mettre à jour le statut du paiement
    if (order.invoice.payment) {
      await (this.prisma as any).payment.update({
        where: { id: order.invoice.payment.id },
        data: {
          status: 'COMPLETED',
          paidAt: new Date(),
        },
      });
    } else {
      // Créer le paiement si il n'existe pas
      await (this.prisma as any).payment.create({
        data: {
          invoiceId: order.invoice.id,
          amount: order.invoice.total,
          method: 'OTHER',
          status: 'COMPLETED',
          paidAt: new Date(),
        },
      });
    }

    // Mettre à jour le statut de la commande
    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: { status: 'PROCESSING' as any },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        items: {
          include: {
            product: true,
          },
        },
        shippingAddress: {
          include: {
            deliveryZone: true,
          },
        },
        deliveryPerson: true,
        invoice: {
          include: {
            payment: true,
          },
        },
      } as any,
    });

    // Envoyer l'email de notification
    sendOrderStatusEmail(this.emailService, updatedOrder, OrderStatus.PROCESSING).catch((err) => {
      console.error('Erreur lors de l\'envoi de l\'email de notification:', err);
    });

    return updatedOrder;
  }

  async markAsDelivered(id: number, userId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      throw new NotFoundException(`Commande avec l'ID ${id} introuvable`);
    }

    // Vérifier que l'utilisateur est le propriétaire de la commande
    if (order.userId !== userId) {
      throw new ForbiddenException('Vous n\'êtes pas autorisé à modifier cette commande');
    }

    // Vérifier que la commande est en cours de livraison
    if (order.status !== 'SHIPPED') {
      throw new BadRequestException('La commande doit être expédiée avant d\'être marquée comme livrée');
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: { status: 'DELIVERED' as any },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        items: {
          include: {
            product: true,
          },
        },
        shippingAddress: {
          include: {
            deliveryZone: true,
          },
        },
        deliveryPerson: true,
        invoice: {
          include: {
            payment: true,
          },
        },
      } as any,
    });

    // Envoyer l'email de notification
    sendOrderStatusEmail(this.emailService, updatedOrder, OrderStatus.DELIVERED).catch((err) => {
      console.error('Erreur lors de l\'envoi de l\'email de notification:', err);
    });

    return updatedOrder;
  }

  async createManualOrder(createManualOrderDto: CreateManualOrderDto, managerId?: number) {
    // Vérifier que l'utilisateur existe
    const user = await this.prisma.user.findUnique({
      where: { id: createManualOrderDto.userId },
    });

    if (!user) {
      throw new NotFoundException(`Utilisateur avec l'ID ${createManualOrderDto.userId} introuvable`);
    }

    // Créer l'adresse de livraison si nécessaire
    let shippingAddressId: number | null = null;
    if (createManualOrderDto.requiresDelivery && createManualOrderDto.shippingAddress) {
      const shippingAddress = await (this.prisma as any).shippingAddress.create({
        data: {
          userId: createManualOrderDto.userId,
          firstName: createManualOrderDto.shippingAddress.firstName,
          lastName: createManualOrderDto.shippingAddress.lastName,
          address: createManualOrderDto.shippingAddress.address,
          city: createManualOrderDto.shippingAddress.city,
          postalCode: createManualOrderDto.shippingAddress.postalCode,
          country: createManualOrderDto.shippingAddress.country,
          phone: createManualOrderDto.shippingAddress.phone || null,
          deliveryZoneId: createManualOrderDto.shippingAddress.deliveryZoneId || null,
          isDefault: false,
        },
      });
      shippingAddressId = shippingAddress.id;
    }

    // Calculer le total avec les frais de livraison si nécessaire
    let total = 0;
    const orderItems: any[] = [];
    let deliveryFee = 0;

    for (const item of createManualOrderDto.items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
      });

      if (!product) {
        throw new NotFoundException(`Produit avec l'ID ${item.productId} introuvable`);
      }

      const price = item.price || Number(product.price);
      const itemTotal = price * item.quantity;
      total += itemTotal;

      orderItems.push({
        productId: item.productId,
        quantity: item.quantity,
        price,
        originalPrice: Number(product.price),
        customization: item.customization || null,
      });
    }

    // Ajouter les frais de livraison si nécessaire
    if (createManualOrderDto.requiresDelivery && shippingAddressId) {
      const shippingAddress = await (this.prisma as any).shippingAddress.findUnique({
        where: { id: shippingAddressId },
        include: { deliveryZone: true },
      });
      if (shippingAddress?.deliveryZone) {
        deliveryFee = Number(shippingAddress.deliveryZone.price);
        total += deliveryFee;
      }
    }

    // Créer la commande
    const order = await this.prisma.order.create({
      data: {
        userId: createManualOrderDto.userId,
        createdByManagerId: managerId || null,
        total,
        status: 'PROCESSING' as any,
        shippingAddressId: shippingAddressId || null,
        deliveryPersonId: createManualOrderDto.deliveryPersonId || null,
        items: {
          create: orderItems,
        },
      } as any,
    });

    // Créer la facture
    const subtotal = total - deliveryFee;
    // Total facture = sous-total produits + livraison (sans TVA)
    const invoiceTotal = subtotal + deliveryFee;
    const invoiceNumber = `INV-${Date.now()}-${order.id}`;

    const invoice = await (this.prisma as any).invoice.create({
      data: {
        invoiceNumber,
        orderId: order.id,
        subtotal,
        tax: 0, // Pas de TVA
        shipping: deliveryFee,
        discount: 0,
        total: invoiceTotal, // Total = subtotal + shipping
      },
    });

    // Créer le paiement
    // Mapper la méthode de paiement du DTO vers l'enum Prisma
    const mapPaymentMethod = (method: string): PaymentMethod => {
      switch (method) {
        case 'CASH':
          return PaymentMethod.CASH;
        case 'CARD':
          return PaymentMethod.CREDIT_CARD; // Par défaut, utiliser CREDIT_CARD pour CARD
        case 'MOBILE_MONEY':
          return PaymentMethod.OTHER; // Mobile money générique
        case 'OM':
          return PaymentMethod.ORANGE_MONEY_CI;
        case 'WAVE':
          return PaymentMethod.WAVE_CI;
        case 'MTN':
          return PaymentMethod.MTN_CI;
        case 'MOOV':
          return PaymentMethod.MOOV_CI;
        case 'OTHER':
          return PaymentMethod.OTHER;
        default:
          return PaymentMethod.OTHER;
      }
    };

    // Pour les commandes manuelles, le paiement est toujours considéré comme complété
    const paymentStatus = 'COMPLETED';
    await (this.prisma as any).payment.create({
      data: {
        invoiceId: invoice.id,
        amount: invoiceTotal,
        method: mapPaymentMethod(createManualOrderDto.paymentMethod),
        status: paymentStatus,
        paidAt: new Date(), // Toujours marquer comme payé pour les commandes manuelles
      },
    });

    // Mapper la méthode de paiement du DTO vers l'enum Prisma
    const mapPaymentName = (method: string): String => {
      switch (method) {
        case 'CASH':
          return "en especes";
        case 'CARD':
          return "par carte"; // Par défaut, utiliser CREDIT_CARD pour CARD
        case 'OM':
          return "par orange money"; // Ou une valeur mobile money spécifique selon le besoin
        case 'WAVE':
          return "par wave";
        case 'MTN':
          return "par mtn";
        case 'MOOV':
          return "par moov money";
        default:
          return "autres moyens de paiement";
      }
    };
    // Si le paiement est en espèces et qu'un manager a créé la commande, créer une transaction de caisse
    if (/* createManualOrderDto.paymentMethod === 'CASH' && */ managerId && this.cashRegistersService) {
      try {
        const cashRegister = await this.cashRegistersService.getTodayCashRegister(managerId);
        // Vérifier que la caisse est ouverte (peut être 'OPEN' ou l'enum)
        const isOpen = (cashRegister as any).status === 'OPEN' || (cashRegister as any).status === 'OPEN';
        if (cashRegister && isOpen) {
          await this.cashRegistersService.addTransaction(
            managerId,
            (cashRegister as any).id,
            {
              type: CashRegisterTransactionType.CASH_SALE,
              amount: invoiceTotal,
              description: `Vente - paiement ${mapPaymentName(createManualOrderDto.paymentMethod)} - Commande #${order.id}`,
              orderId: order.id,
            }
          );
        }
      } catch (error) {
        // Log l'erreur mais ne bloque pas la création de la commande
        console.error('Erreur lors de la création de la transaction de caisse:', error);
      }
    }

    // Mettre à jour le stock des produits commandés
    await this.updateProductStockForOrder(order.id, orderItems);

    // Récupérer la commande complète
    return this.prisma.order.findUnique({
      where: { id: order.id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        items: {
          include: {
            product: true,
          },
        },
        shippingAddress: {
          include: {
            deliveryZone: true,
          },
        },
        deliveryPerson: true,
        invoice: {
          include: {
            payment: true,
          },
        },
      } as any,
    });
  }

  /**
   * Met à jour le stock des produits après création d'une commande
   */
  private async updateProductStockForOrder(orderId: number, orderItems: any[]) {
    for (const item of orderItems) {
      try {
        // Récupérer le produit actuel pour connaître le stock
        const product = await this.prisma.product.findUnique({
          where: { id: item.productId },
        });

        if (!product) {
          console.error(`Produit ${item.productId} introuvable pour mise à jour du stock`);
          continue;
        }

        const oldStock = Number(product.stock) || 0;
        const quantityToDeduct = item.quantity;
        const newStock = Math.max(0, oldStock - quantityToDeduct); // Éviter les stocks négatifs

        // Mettre à jour le stock du produit
        await this.prisma.product.update({
          where: { id: item.productId },
          data: {
            stock: newStock,
          },
        });

        // Enregistrer le mouvement de stock
        await this.prisma.stockMovement.create({
          data: {
            productId: item.productId,
            type: StockMovementType.SALE,
            quantity: quantityToDeduct,
            oldStock: oldStock,
            newStock: newStock,
            orderId: orderId,
            reason: `Vente - Commande #${orderId}`,
          },
        });
      } catch (error) {
        // Log l'erreur mais ne bloque pas la création de la commande
        console.error(`Erreur lors de la mise à jour du stock pour le produit ${item.productId}:`, error);
      }
    }
  }

  /**
   * Supprime une commande (uniquement si elle est annulée) - Réservé aux SUPER_ADMIN
   */
  async remove(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        invoice: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Commande introuvable');
    }

    // Vérifier que la commande est annulée
    if (order.status !== 'CANCELLED') {
      throw new BadRequestException('Seules les commandes annulées peuvent être supprimées');
    }

    // Supprimer la commande et ses relations (les items seront supprimés en cascade si configuré)
    await this.prisma.order.delete({
      where: { id },
    });

    return { message: 'Commande supprimée avec succès' };
  }
}
