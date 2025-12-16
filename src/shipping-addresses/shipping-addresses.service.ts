import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShippingAddressDto } from './dto/create-shipping-address.dto';
import { UpdateShippingAddressDto } from './dto/update-shipping-address.dto';

@Injectable()
export class ShippingAddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: number) {
    return this.prisma.shippingAddress.findMany({
      where: { userId },
      include: {
        deliveryZone: true,
      },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async findOne(id: number, userId: number) {
    const address = await this.prisma.shippingAddress.findUnique({
      where: { id },
      include: {
        deliveryZone: true,
      },
    });

    if (!address) {
      throw new NotFoundException(`Adresse avec l'ID ${id} introuvable`);
    }

    if (address.userId !== userId) {
      throw new ForbiddenException('Vous n\'avez pas accès à cette adresse');
    }

    return address;
  }

  async create(userId: number, createShippingAddressDto: CreateShippingAddressDto) {
    // Vérifier que la zone de livraison existe et est active (obligatoire)
    const deliveryZone = await this.prisma.deliveryZone.findUnique({
      where: { id: createShippingAddressDto.deliveryZoneId },
    });

    if (!deliveryZone) {
      throw new NotFoundException(`Zone de livraison avec l'ID ${createShippingAddressDto.deliveryZoneId} introuvable`);
    }

    if (!deliveryZone.isActive) {
      throw new BadRequestException('Cette zone de livraison n\'est pas active');
    }

    // Si c'est la première adresse ou si isDefault est true, mettre les autres à false
    if (createShippingAddressDto.isDefault) {
      await this.prisma.shippingAddress.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    // Construire l'objet data en omettant les valeurs undefined
    const data: any = {
      userId,
      address: createShippingAddressDto.address,
      city: createShippingAddressDto.city,
      deliveryZoneId: createShippingAddressDto.deliveryZoneId,
    };

    // Ajouter les champs optionnels seulement s'ils sont définis
    if (createShippingAddressDto.label !== undefined) {
      data.label = createShippingAddressDto.label;
    }
    if (createShippingAddressDto.firstName !== undefined) {
      data.firstName = createShippingAddressDto.firstName;
    }
    if (createShippingAddressDto.lastName !== undefined) {
      data.lastName = createShippingAddressDto.lastName;
    }
    if (createShippingAddressDto.postalCode !== undefined) {
      data.postalCode = createShippingAddressDto.postalCode;
    }
    if (createShippingAddressDto.country !== undefined) {
      data.country = createShippingAddressDto.country;
    }
    if (createShippingAddressDto.phone !== undefined) {
      data.phone = createShippingAddressDto.phone;
    }
    if (createShippingAddressDto.isDefault !== undefined) {
      data.isDefault = createShippingAddressDto.isDefault;
    }

    return this.prisma.shippingAddress.create({
      data,
      include: {
        deliveryZone: true,
      },
    });
  }

  async update(id: number, userId: number, updateShippingAddressDto: UpdateShippingAddressDto) {
    // Vérifier que l'adresse existe et appartient à l'utilisateur
    await this.findOne(id, userId);

    // Vérifier que la zone de livraison existe si fournie
    if (updateShippingAddressDto.deliveryZoneId) {
      const deliveryZone = await this.prisma.deliveryZone.findUnique({
        where: { id: updateShippingAddressDto.deliveryZoneId },
      });

      if (!deliveryZone) {
        throw new NotFoundException(`Zone de livraison avec l'ID ${updateShippingAddressDto.deliveryZoneId} introuvable`);
      }

      if (!deliveryZone.isActive) {
        throw new BadRequestException('Cette zone de livraison n\'est pas active');
      }
    }

    // Si on définit cette adresse comme défaut, mettre les autres à false
    if (updateShippingAddressDto.isDefault) {
      await this.prisma.shippingAddress.updateMany({
        where: {
          userId,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    return this.prisma.shippingAddress.update({
      where: { id },
      data: updateShippingAddressDto,
      include: {
        deliveryZone: true,
      },
    });
  }

  async remove(id: number, userId: number) {
    // Vérifier que l'adresse existe et appartient à l'utilisateur
    await this.findOne(id, userId);

    return this.prisma.shippingAddress.delete({
      where: { id },
    });
  }
}

