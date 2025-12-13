import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { CreateManualOrderDto } from './dto/create-manual-order.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

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
    if (createOrderDto.shippingAddress && !shippingAddressId) {
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
    const subtotal = Number(total);
    const tax = subtotal * 0.18; // TVA 18%
    const invoiceTotal = subtotal + tax;
    const invoiceNumber = `INV-${Date.now()}-${order.id}`;

    const invoice = await (this.prisma as any).invoice.create({
      data: {
        invoiceNumber,
        orderId: order.id,
        subtotal,
        tax,
        shipping: 0,
        discount: 0,
        total: invoiceTotal,
      },
    });

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

    return this.prisma.order.update({
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

    return this.prisma.order.update({
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
    return this.prisma.order.update({
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

    return this.prisma.order.update({
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
  }

  async createManualOrder(createManualOrderDto: CreateManualOrderDto) {
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
    const tax = subtotal * 0.18; // TVA 18%
    const invoiceTotal = subtotal + tax + deliveryFee;
    const invoiceNumber = `INV-${Date.now()}-${order.id}`;

    const invoice = await (this.prisma as any).invoice.create({
      data: {
        invoiceNumber,
        orderId: order.id,
        subtotal,
        tax,
        shipping: deliveryFee,
        discount: 0,
        total: invoiceTotal,
      },
    });

    // Créer le paiement
    const paymentStatus = createManualOrderDto.paymentMethod === 'CASH' ? 'COMPLETED' : 'PENDING';
    await (this.prisma as any).payment.create({
      data: {
        invoiceId: invoice.id,
        amount: invoiceTotal,
        method: createManualOrderDto.paymentMethod,
        status: paymentStatus,
        paidAt: paymentStatus === 'COMPLETED' ? new Date() : null,
      },
    });

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
}
