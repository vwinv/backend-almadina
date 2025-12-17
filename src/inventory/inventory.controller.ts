import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  Query,
  Request,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('api/inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * Ajuster le stock d'un produit
   */
  @Post('adjust/:productId')
  adjustStock(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() adjustStockDto: AdjustStockDto,
    @CurrentUser() user: any,
  ) {
    return this.inventoryService.adjustStock(productId, adjustStockDto, user.id);
  }

  /**
   * Récupérer l'historique des mouvements de stock pour un produit
   */
  @Get('history/:productId')
  getStockHistory(
    @Param('productId', ParseIntPipe) productId: number,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : undefined;
    return this.inventoryService.getStockHistory(productId, limitNum);
  }

  /**
   * Récupérer les statistiques de l'inventaire
   */
  @Get('stats')
  getInventoryStats() {
    return this.inventoryService.getInventoryStats();
  }
}
