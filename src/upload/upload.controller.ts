import {
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

function createStorage(subfolder: 'products' | 'promotions' | 'profiles') {
  return diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = join(process.cwd(), 'public', 'images', subfolder);
      // Créer le dossier s'il n'existe pas
      if (!existsSync(uploadPath)) {
        mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueName = `${randomUUID()}${extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  });
}

@Controller('api/uploads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UploadController {
  private getBaseUrl(req: any): string {
    const host = req.get('host');
    const protocol = req.protocol;
    return `${protocol}://${host}`;
  }

  @Post('products')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: createStorage('products'),
      limits: { fileSize: 10 * 1024 * 1024, files: 20 }, // 10MB par fichier, 20 fichiers max
    }),
  )
  uploadProductImages(@UploadedFiles() files: any[], @Req() req: any) {
    const baseUrl = this.getBaseUrl(req);
    const urls = files.map((file) => {
      return `${baseUrl}/images/products/${file.filename}`;
    });
    return { urls };
  }

  @Post('promotions')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: createStorage('promotions'),
      limits: { fileSize: 20 * 1024 * 1024, files: 1 }, // 20MB pour les bannières
    }),
  )
  uploadPromotionBanner(@UploadedFiles() files: any[], @Req() req: any) {
    const baseUrl = this.getBaseUrl(req);
    if (files && files.length > 0) {
      const url = `${baseUrl}/images/promotions/${files[0].filename}`;
      return { url };
    }
    return { url: null };
  }

  @Post('profile-picture')
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: createStorage('profiles'),
      limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5MB pour la photo de profil
    }),
  )
  uploadProfilePicture(@UploadedFiles() files: any[], @Req() req: any, @CurrentUser() user: any) {
    const baseUrl = this.getBaseUrl(req);
    if (files && files.length > 0) {
      const url = `${baseUrl}/images/profiles/${files[0].filename}`;
      return { url };
    }
    return { url: null };
  }
}


