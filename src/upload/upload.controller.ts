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
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024, files: 20 }, // 100MB par fichier (pour supporter les vidéos), 20 fichiers max
    }),
  )
  async uploadProductMedia(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Aucun fichier fourni');
    }

    // Séparer les images et les vidéos
    const images: Express.Multer.File[] = [];
    const videos: Express.Multer.File[] = [];

    // Valider et classifier les fichiers
    for (const file of files) {
      if (!file.buffer || file.buffer.length === 0) {
        throw new BadRequestException(`Le fichier ${file.originalname} est vide`);
      }
      if (!file.mimetype) {
        throw new BadRequestException(
          `Le fichier ${file.originalname} n'a pas de type MIME défini`,
        );
      }
      
      if (file.mimetype.startsWith('image/')) {
        images.push(file);
      } else if (file.mimetype.startsWith('video/')) {
        videos.push(file);
      } else {
        throw new BadRequestException(
          `Le fichier ${file.originalname} (type: ${file.mimetype}) n'est pas supporté. Seules les images et vidéos sont acceptées`,
        );
      }
    }

    try {
      console.log('📤 Upload de média produits - Images:', images.length, 'Vidéos:', videos.length);
      
      files.forEach((file, index) => {
        console.log(`  Fichier ${index + 1}:`, {
          name: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          bufferLength: file.buffer?.length || 0,
          type: file.mimetype.startsWith('image/') ? 'image' : 'video',
        });
      });
      
      // Uploader les images et vidéos en parallèle
      const imageUploads = images.length > 0 
        ? this.cloudinaryService.uploadFiles(images, 'products')
        : Promise.resolve([]);
      const videoUploads = videos.length > 0
        ? this.cloudinaryService.uploadFiles(videos, 'videos')
        : Promise.resolve([]);

      const [imageUrls, videoUrls] = await Promise.all([imageUploads, videoUploads]);
      
      console.log('✅ URLs générées - Images:', imageUrls, 'Vidéos:', videoUrls);
      
      return { 
        urls: [...imageUrls, ...videoUrls],
        images: imageUrls,
        videos: videoUrls,
      };
    } catch (error) {
      console.error('❌ Erreur upload produits:', error);
      console.error('Stack:', error.stack);
      
      // Si c'est déjà une BadRequestException, la relancer telle quelle
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException(
        `Erreur lors de l'upload des médias: ${error.message}`,
      );
    }
  }

  @Post('promotions')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
      if (!file.mimetype) {
        throw new BadRequestException(
          `Le fichier ${file.originalname} n'a pas de type MIME défini`,
        );
      }
      if (file.mimetype.startsWith('image/')) {
        throw new BadRequestException(
          `Le fichier ${file.originalname} est une image. Utilisez l'endpoint /api/uploads/products pour uploader des images`,
        );
      }
      if (!file.mimetype.startsWith('video/')) {
        throw new BadRequestException(
          `Le fichier ${file.originalname} (type: ${file.mimetype}) n'est pas une vidéo valide. Seules les vidéos sont acceptées sur cet endpoint`,
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

      // Upload les fichiers un par un pour mieux gérer les erreurs
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        try {
          console.log(`📤 Upload vidéo ${i + 1}/${files.length}...`);
          const url = await this.cloudinaryService.uploadFile(files[i], 'videos');
          urls.push(url);
          console.log(`✅ Vidéo ${i + 1} uploadée:`, url);
        } catch (fileError) {
          console.error(`❌ Erreur upload vidéo ${i + 1} (${files[i].originalname}):`, fileError);
          throw new BadRequestException(
            `Erreur lors de l'upload de la vidéo "${files[i].originalname}": ${fileError.message}`,
          );
        }
      }
      
      console.log('✅ Toutes les vidéos uploadées:', urls);
      return { urls };
    } catch (error) {
      console.error('❌ Erreur upload vidéos:', error);
      console.error('Stack:', error.stack);
      // Si c'est déjà une BadRequestException, la relancer telle quelle
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Erreur lors de l'upload des vidéos: ${error.message}`,
      );
    }
  }

  @Post('documents')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
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


