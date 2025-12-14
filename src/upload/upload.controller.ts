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

    // Valider les fichiers
    for (const file of files) {
      if (!file.buffer || file.buffer.length === 0) {
        throw new BadRequestException(`Le fichier ${file.originalname} est vide`);
      }
      if (!file.mimetype || !file.mimetype.startsWith('image/')) {
        throw new BadRequestException(`Le fichier ${file.originalname} n'est pas une image valide`);
      }
    }

    try {
      console.log('📤 Upload de produits - Nombre de fichiers:', files.length);
      files.forEach((file, index) => {
        console.log(`  Fichier ${index + 1}:`, {
          name: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          bufferLength: file.buffer?.length || 0,
        });
      });
      
      const urls = await this.cloudinaryService.uploadFiles(files, 'products');
      console.log('✅ URLs générées:', urls);
      return { urls };
    } catch (error) {
      console.error('❌ Erreur upload produits:', error);
      console.error('Stack:', error.stack);
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

  @Post('videos')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024, files: 10 }, // 100MB par fichier, 10 fichiers max
    }),
  )
  async uploadVideos(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Aucun fichier fourni');
    }

    // Valider les fichiers
    for (const file of files) {
      if (!file.buffer || file.buffer.length === 0) {
        throw new BadRequestException(`Le fichier ${file.originalname} est vide`);
      }
      if (!file.mimetype || !file.mimetype.startsWith('video/')) {
        throw new BadRequestException(
          `Le fichier ${file.originalname} n'est pas une vidéo valide`,
        );
      }
    }

    try {
      console.log('📤 Upload de vidéos - Nombre de fichiers:', files.length);
      files.forEach((file, index) => {
        console.log(`  Fichier ${index + 1}:`, {
          name: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          bufferLength: file.buffer?.length || 0,
        });
      });

      const urls = await this.cloudinaryService.uploadFiles(files, 'videos');
      console.log('✅ URLs générées:', urls);
      return { urls };
    } catch (error) {
      console.error('❌ Erreur upload vidéos:', error);
      console.error('Stack:', error.stack);
      throw new BadRequestException(
        `Erreur lors de l'upload des vidéos: ${error.message}`,
      );
    }
  }

  @Post('documents')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024, files: 10 }, // 50MB par fichier, 10 fichiers max
    }),
  )
  async uploadDocuments(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Aucun fichier fourni');
    }

    // Valider les fichiers
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    for (const file of files) {
      if (!file.buffer || file.buffer.length === 0) {
        throw new BadRequestException(`Le fichier ${file.originalname} est vide`);
      }
      if (!file.mimetype || !allowedMimeTypes.includes(file.mimetype)) {
        throw new BadRequestException(
          `Le fichier ${file.originalname} n'est pas un document valide (PDF, Word, Excel uniquement)`,
        );
      }
    }

    try {
      console.log('📤 Upload de documents - Nombre de fichiers:', files.length);
      files.forEach((file, index) => {
        console.log(`  Fichier ${index + 1}:`, {
          name: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          bufferLength: file.buffer?.length || 0,
        });
      });

      const urls = await this.cloudinaryService.uploadFiles(files, 'documents');
      console.log('✅ URLs générées:', urls);
      return { urls };
    } catch (error) {
      console.error('❌ Erreur upload documents:', error);
      console.error('Stack:', error.stack);
      throw new BadRequestException(
        `Erreur lors de l'upload des documents: ${error.message}`,
      );
    }
  }
}


