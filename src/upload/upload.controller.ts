import {
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CloudinaryService } from './cloudinary.service';

@Controller('api/uploads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UploadController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Post('products')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 20 }, // 10MB par fichier, 20 fichiers max
    }),
  )
  async uploadProductImages(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Aucun fichier fourni');
    }

    try {
      const urls = await this.cloudinaryService.uploadFiles(files, 'products');
      return { urls };
    } catch (error) {
      throw new BadRequestException(
        `Erreur lors de l'upload des images: ${error.message}`,
      );
    }
  }

  @Post('promotions')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024, files: 1 }, // 20MB pour les bannières
    }),
  )
  async uploadPromotionBanner(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      return { url: null };
    }

    try {
      const urls = await this.cloudinaryService.uploadFiles(
        [files[0]],
        'promotions',
      );
      return { url: urls[0] };
    } catch (error) {
      throw new BadRequestException(
        `Erreur lors de l'upload de la bannière: ${error.message}`,
      );
    }
  }

  @Post('profile-picture')
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5MB pour la photo de profil
    }),
  )
  async uploadProfilePicture(
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: any,
  ) {
    if (!files || files.length === 0) {
      return { url: null };
    }

    try {
      const urls = await this.cloudinaryService.uploadFiles(
        [files[0]],
        'profiles',
      );
      return { url: urls[0] };
    } catch (error) {
      throw new BadRequestException(
        `Erreur lors de l'upload de la photo de profil: ${error.message}`,
      );
    }
  }
}


