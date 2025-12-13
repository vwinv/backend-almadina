import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeliveryZoneDto } from './dto/create-delivery-zone.dto';
import { UpdateDeliveryZoneDto } from './dto/update-delivery-zone.dto';

@Injectable()
export class DeliveryZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.deliveryZone.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findActive() {
    return this.prisma.deliveryZone.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const zone = await this.prisma.deliveryZone.findUnique({
      where: { id },
    });

    if (!zone) {
      throw new NotFoundException(`Zone de livraison avec l'ID ${id} introuvable`);
    }

    return zone;
  }

  async create(createDeliveryZoneDto: CreateDeliveryZoneDto) {
    return this.prisma.deliveryZone.create({
      data: createDeliveryZoneDto,
    });
  }

  async update(id: number, updateDeliveryZoneDto: UpdateDeliveryZoneDto) {
    await this.findOne(id);

    return this.prisma.deliveryZone.update({
      where: { id },
      data: updateDeliveryZoneDto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    // Vérifier si la zone est utilisée dans des adresses de livraison
    const addressesCount = await this.prisma.shippingAddress.count({
      where: { deliveryZoneId: id },
    });

    if (addressesCount > 0) {
      throw new Error('Impossible de supprimer cette zone car elle est utilisée dans des adresses de livraison');
    }

    return this.prisma.deliveryZone.delete({
      where: { id },
    });
  }
}

