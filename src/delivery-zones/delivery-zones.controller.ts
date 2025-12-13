import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { DeliveryZonesService } from './delivery-zones.service';
import { CreateDeliveryZoneDto } from './dto/create-delivery-zone.dto';
import { UpdateDeliveryZoneDto } from './dto/update-delivery-zone.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('api/delivery-zones')
export class DeliveryZonesController {
  constructor(private readonly deliveryZonesService: DeliveryZonesService) {}

  // Route publique pour récupérer les zones actives (sans authentification)
  @Get('active')
  findActivePublic() {
    return this.deliveryZonesService.findActive();
  }

  // Routes protégées nécessitant une authentification
  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@CurrentUser() user: any) {
    // Les clients peuvent voir uniquement les zones actives
    if (user.role === UserRole.CUSTOMER) {
      return this.deliveryZonesService.findActive();
    }
    // Les admins voient toutes les zones
    return this.deliveryZonesService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.deliveryZonesService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createDeliveryZoneDto: CreateDeliveryZoneDto, @CurrentUser() user: any) {
    if (user.role !== UserRole.ADMIN) {
      throw new Error('Accès refusé. Cette route est réservée aux administrateurs.');
    }
    return this.deliveryZonesService.create(createDeliveryZoneDto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDeliveryZoneDto: UpdateDeliveryZoneDto,
    @CurrentUser() user: any,
  ) {
    if (user.role !== UserRole.ADMIN) {
      throw new Error('Accès refusé. Cette route est réservée aux administrateurs.');
    }
    return this.deliveryZonesService.update(id, updateDeliveryZoneDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    if (user.role !== UserRole.ADMIN) {
      throw new Error('Accès refusé. Cette route est réservée aux administrateurs.');
    }
    return this.deliveryZonesService.remove(id);
  }
}

