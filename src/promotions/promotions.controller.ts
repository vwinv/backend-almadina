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
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { AssignProductsDto } from './dto/assign-products.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('api/promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  // Route publique pour les promotions actives
  @Get('public/active')
  findActivePublic() {
    return this.promotionsService.findActiveWithProducts();
  }

  // Routes protégées pour l'admin
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() createPromotionDto: CreatePromotionDto) {
    return this.promotionsService.create(createPromotionDto);
  }

  @Get()
  findAll() {
    return this.promotionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.promotionsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePromotionDto: UpdatePromotionDto,
  ) {
    return this.promotionsService.update(id, updatePromotionDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.promotionsService.remove(id);
  }

  @Post(':id/products')
  assignProducts(
    @Param('id', ParseIntPipe) promotionId: number,
    @Body() assignProductsDto: AssignProductsDto,
  ) {
    return this.promotionsService.assignProducts(promotionId, assignProductsDto);
  }

  @Delete(':id/products/:productId')
  removeProduct(
    @Param('id', ParseIntPipe) promotionId: number,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.promotionsService.removeProduct(promotionId, productId);
  }

  @Patch(':id/toggle-active')
  toggleActive(@Param('id', ParseIntPipe) id: number) {
    return this.promotionsService.toggleActive(id);
  }
}

