import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeliveryPersonDto } from './dto/create-delivery-person.dto';
import { UpdateDeliveryPersonDto } from './dto/update-delivery-person.dto';
import { DeliveryPersonStatus } from '@prisma/client';

@Injectable()
export class DeliveryPersonsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.deliveryPerson.findMany({
      orderBy: [
        { status: 'asc' },
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
      include: {
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });
  }

  async findActive() {
    return this.prisma.deliveryPerson.findMany({
      where: { status: DeliveryPersonStatus.ACTIVE },
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
    });
  }

  async findOne(id: number) {
    const deliveryPerson = await this.prisma.deliveryPerson.findUnique({
      where: { id },
      include: {
        orders: {
          where: {
            status: {
              in: ['PENDING', 'PROCESSING', 'SHIPPED'],
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });

    if (!deliveryPerson) {
      throw new NotFoundException(`Livreur avec l'ID ${id} introuvable`);
    }

    return deliveryPerson;
  }

  async create(createDeliveryPersonDto: CreateDeliveryPersonDto) {
    // Vérifier si le téléphone existe déjà
    const existing = await this.prisma.deliveryPerson.findUnique({
      where: { phone: createDeliveryPersonDto.phone },
    });

    if (existing) {
      throw new ConflictException('Un livreur avec ce numéro de téléphone existe déjà');
    }

    // Vérifier si l'email existe déjà (si fourni)
    if (createDeliveryPersonDto.email) {
      const existingEmail = await this.prisma.deliveryPerson.findUnique({
        where: { email: createDeliveryPersonDto.email },
      });

      if (existingEmail) {
        throw new ConflictException('Un livreur avec cet email existe déjà');
      }
    }

    return this.prisma.deliveryPerson.create({
      data: {
        ...createDeliveryPersonDto,
        status: createDeliveryPersonDto.status || DeliveryPersonStatus.ACTIVE,
      },
    });
  }

  async update(id: number, updateDeliveryPersonDto: UpdateDeliveryPersonDto) {
    await this.findOne(id);

    // Vérifier si le téléphone existe déjà (si modifié)
    if (updateDeliveryPersonDto.phone) {
      const existing = await this.prisma.deliveryPerson.findUnique({
        where: { phone: updateDeliveryPersonDto.phone },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException('Un livreur avec ce numéro de téléphone existe déjà');
      }
    }

    // Vérifier si l'email existe déjà (si modifié)
    if (updateDeliveryPersonDto.email) {
      const existingEmail = await this.prisma.deliveryPerson.findUnique({
        where: { email: updateDeliveryPersonDto.email },
      });

      if (existingEmail && existingEmail.id !== id) {
        throw new ConflictException('Un livreur avec cet email existe déjà');
      }
    }

    return this.prisma.deliveryPerson.update({
      where: { id },
      data: updateDeliveryPersonDto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    // Vérifier si le livreur a des commandes en cours
    const activeOrders = await this.prisma.order.count({
      where: {
        deliveryPersonId: id,
        status: {
          in: ['PENDING', 'PROCESSING', 'SHIPPED'],
        },
      },
    });

    if (activeOrders > 0) {
      throw new Error('Impossible de supprimer ce livreur car il a des commandes en cours');
    }

    return this.prisma.deliveryPerson.delete({
      where: { id },
    });
  }

  async assignToOrder(deliveryPersonId: number, orderId: number) {
    // Vérifier que le livreur existe et est actif
    const deliveryPerson = await this.findOne(deliveryPersonId);
    
    if (deliveryPerson.status !== DeliveryPersonStatus.ACTIVE) {
      throw new Error('Ce livreur n\'est pas actif');
    }

    // Vérifier que la commande existe
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Commande avec l'ID ${orderId} introuvable`);
    }

    // Assigner le livreur à la commande
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryPersonId,
      },
    });
  }
}

