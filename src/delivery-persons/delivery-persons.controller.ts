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
  Put,
} from '@nestjs/common';
import { DeliveryPersonsService } from './delivery-persons.service';
import { CreateDeliveryPersonDto } from './dto/create-delivery-person.dto';
import { UpdateDeliveryPersonDto } from './dto/update-delivery-person.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('api/delivery-persons')
@UseGuards(JwtAuthGuard)
export class DeliveryPersonsController {
  constructor(private readonly deliveryPersonsService: DeliveryPersonsService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    if (user.role !== UserRole.ADMIN) {
      throw new Error('Accès refusé. Cette route est réservée aux administrateurs.');
    }
    return this.deliveryPersonsService.findAll();
  }

  @Get('active')
  findActive(@CurrentUser() user: any) {
    if (user.role !== UserRole.ADMIN) {
      throw new Error('Accès refusé. Cette route est réservée aux administrateurs.');
    }
    return this.deliveryPersonsService.findActive();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    if (user.role !== UserRole.ADMIN) {
      throw new Error('Accès refusé. Cette route est réservée aux administrateurs.');
    }
    return this.deliveryPersonsService.findOne(id);
  }

  @Post()
  create(@Body() createDeliveryPersonDto: CreateDeliveryPersonDto, @CurrentUser() user: any) {
    if (user.role !== UserRole.ADMIN) {
      throw new Error('Accès refusé. Cette route est réservée aux administrateurs.');
    }
    return this.deliveryPersonsService.create(createDeliveryPersonDto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDeliveryPersonDto: UpdateDeliveryPersonDto,
    @CurrentUser() user: any,
  ) {
    if (user.role !== UserRole.ADMIN) {
      throw new Error('Accès refusé. Cette route est réservée aux administrateurs.');
    }
    return this.deliveryPersonsService.update(id, updateDeliveryPersonDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    if (user.role !== UserRole.ADMIN) {
      throw new Error('Accès refusé. Cette route est réservée aux administrateurs.');
    }
    return this.deliveryPersonsService.remove(id);
  }

  @Put(':id/assign-order/:orderId')
  assignToOrder(
    @Param('id', ParseIntPipe) deliveryPersonId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
    @CurrentUser() user: any,
  ) {
    if (user.role !== UserRole.ADMIN) {
      throw new Error('Accès refusé. Cette route est réservée aux administrateurs.');
    }
    return this.deliveryPersonsService.assignToOrder(deliveryPersonId, orderId);
  }
}

