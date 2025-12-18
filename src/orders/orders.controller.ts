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
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { CreateManualOrderDto } from './dto/create-manual-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
@Controller('api/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // Route publique pour les clients
  @Post('customer')
  @UseGuards(JwtAuthGuard)
  createCustomerOrder(@Body() createOrderDto: CreateOrderDto, @CurrentUser() user: any) {
    // S'assurer que l'utilisateur est un client
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Cette route est réservée aux clients');
    }
    // Utiliser l'ID de l'utilisateur connecté
    createOrderDto.userId = user.id;
    return this.ordersService.create(createOrderDto);
  }

  @Get('customer/my-orders')
  @UseGuards(JwtAuthGuard)
  getCustomerOrders(@CurrentUser() user: any) {
    // S'assurer que l'utilisateur est un client
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Cette route est réservée aux clients');
    }
    return this.ordersService.findByUserId(user.id);
  }

  // Routes admin (protégées)
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(@Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.create(createOrderDto);
  }

  // Route pour créer une commande manuellement (admin ou manager) - DOIT être avant les routes avec :id
  @Post('manual')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)
  createManual(@Body() createManualOrderDto: CreateManualOrderDto, @CurrentUser() user: any) {
    // Si c'est un manager, utiliser son ID
    const managerId = user.role === UserRole.MANAGER ? user.id : undefined;
    return this.ordersService.createManualOrder(createManualOrderDto, managerId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findAll(@Query('status') status?: string) {
    return this.ordersService.findAll(status);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findOne(id);
  }

  /**
   * Supprime une commande (uniquement si annulée) - Réservé aux SUPER_ADMIN
   * DOIT être avant les autres routes avec :id pour éviter les conflits
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.remove(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOrderDto: UpdateOrderDto,
  ) {
    return this.ordersService.update(id, updateOrderDto);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.cancel(id);
  }

  @Post(':id/validate-payment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  validatePayment(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.validatePayment(id);
  }

  // Route pour que le client marque sa commande comme livrée
  @Post(':id/mark-delivered')
  @UseGuards(JwtAuthGuard)
  markAsDelivered(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    // Vérifier que l'utilisateur est le propriétaire de la commande
    return this.ordersService.markAsDelivered(id, user.id);
  }
}
