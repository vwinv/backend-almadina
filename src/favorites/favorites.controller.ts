import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  ParseIntPipe,
  ForbiddenException,
} from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('api/favorites')
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  private checkIsCustomer(user: any) {
    if (user.role !== UserRole.CUSTOMER) {
      throw new ForbiddenException('Cette fonctionnalité est réservée aux clients');
    }
  }

  @Get()
  getFavorites(@CurrentUser() user: any) {
    this.checkIsCustomer(user);
    return this.favoritesService.getFavorites(user.id);
  }

  @Post(':productId')
  addFavorite(
    @CurrentUser() user: any,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    this.checkIsCustomer(user);
    return this.favoritesService.addFavorite(user.id, productId);
  }

  @Delete(':productId')
  removeFavorite(
    @CurrentUser() user: any,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    this.checkIsCustomer(user);
    return this.favoritesService.removeFavorite(user.id, productId);
  }

  @Get('check/:productId')
  checkFavorite(
    @CurrentUser() user: any,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    this.checkIsCustomer(user);
    return this.favoritesService.isFavorite(user.id, productId);
  }
}

