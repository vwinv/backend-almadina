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
import { ShippingAddressesService } from './shipping-addresses.service';
import { CreateShippingAddressDto } from './dto/create-shipping-address.dto';
import { UpdateShippingAddressDto } from './dto/update-shipping-address.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('api/shipping-addresses')
@UseGuards(JwtAuthGuard)
export class ShippingAddressesController {
  constructor(private readonly shippingAddressesService: ShippingAddressesService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    if (user.role !== UserRole.CUSTOMER) {
      throw new Error('Accès refusé. Cette route est réservée aux clients.');
    }
    return this.shippingAddressesService.findAll(user.id);
  }

  // Route admin pour récupérer les adresses d'un client - DOIT être avant @Get(':id')
  @Get('customer/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findCustomerAddresses(@Param('userId', ParseIntPipe) userId: number) {
    return this.shippingAddressesService.findAll(userId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    if (user.role !== UserRole.CUSTOMER) {
      throw new Error('Accès refusé. Cette route est réservée aux clients.');
    }
    return this.shippingAddressesService.findOne(id, user.id);
  }

  @Post()
  create(@Body() createShippingAddressDto: CreateShippingAddressDto, @CurrentUser() user: any) {
    if (user.role !== UserRole.CUSTOMER) {
      throw new Error('Accès refusé. Cette route est réservée aux clients.');
    }
    return this.shippingAddressesService.create(user.id, createShippingAddressDto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateShippingAddressDto: UpdateShippingAddressDto,
    @CurrentUser() user: any,
  ) {
    if (user.role !== UserRole.CUSTOMER) {
      throw new Error('Accès refusé. Cette route est réservée aux clients.');
    }
    return this.shippingAddressesService.update(id, user.id, updateShippingAddressDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    if (user.role !== UserRole.CUSTOMER) {
      throw new Error('Accès refusé. Cette route est réservée aux clients.');
    }
    return this.shippingAddressesService.remove(id, user.id);
  }
}

