import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Stream } from 'stream';

@Injectable()
export class CloudinaryService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  /**
   * Upload un fichier vers Cloudinary
   */
  async uploadFile(
    file: Express.Multer.File,
    folder: 'products' | 'promotions' | 'profiles',
  ): Promise<string> {
    // Vérifier la configuration Cloudinary
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      throw new Error('Configuration Cloudinary manquante. Vérifiez les variables d\'environnement.');
    }

    // Vérifier que le fichier a un buffer
    if (!file.buffer || file.buffer.length === 0) {
      throw new Error('Le fichier est vide ou invalide');
    }

    return new Promise((resolve, reject) => {
      // Options minimales pour éviter les problèmes de signature
      // On évite toutes les transformations lors de l'upload
      const options: any = {
        folder: `almadina/${folder}`,
        resource_type: 'auto',
      };

      const uploadStream = cloudinary.uploader.upload_stream(
        options,
        (error, result) => {
          if (error) {
            const errorMessage = error.message || 'Erreur inconnue lors de l\'upload';
            const errorHttpCode = error.http_code || 'N/A';
            reject(new Error(`Cloudinary error (${errorHttpCode}): ${errorMessage}`));
            return;
          }
          if (!result) {
            reject(new Error('Upload failed: No result returned from Cloudinary'));
            return;
          }
          
          // Générer l'URL avec transformations appliquées à la volée (pas de problème de signature)
          if (file.mimetype && file.mimetype.startsWith('image/')) {
            const transformOptions: any = {
              secure: true,
              fetch_format: 'auto',
              quality: 'auto:good',
              type: 'upload',
              resource_type: 'image',
            };
            
            // Pour les photos de profil, ajouter le redimensionnement
            if (folder === 'profiles') {
              transformOptions.width = 500;
              transformOptions.height = 500;
              transformOptions.crop = 'limit';
            }
            
            // Générer l'URL avec transformations
            const optimizedUrl = cloudinary.url(result.public_id, transformOptions);
            resolve(optimizedUrl);
          } else {
            // Pour les fichiers non-images, retourner l'URL originale
            resolve(result.secure_url);
          }
        },
      );

      // Gérer les erreurs du stream
      uploadStream.on('error', (streamError) => {
        reject(new Error(`Stream error: ${streamError.message}`));
      });

      // Convertir le buffer en stream
      const bufferStream = new Stream.PassThrough();
      bufferStream.end(file.buffer);
      bufferStream.pipe(uploadStream);
    });
  }

  /**
   * Upload plusieurs fichiers vers Cloudinary
   */
  async uploadFiles(
    files: Express.Multer.File[],
    folder: 'products' | 'promotions' | 'profiles',
  ): Promise<string[]> {
    const uploadPromises = files.map((file) => this.uploadFile(file, folder));
    return Promise.all(uploadPromises);
  }

  /**
   * Supprime un fichier de Cloudinary à partir de son URL
   */
  async deleteFile(url: string): Promise<void> {
    try {
      // Extraire le public_id de l'URL
      const publicId = this.extractPublicId(url);
      if (publicId) {
        await cloudinary.uploader.destroy(publicId);
      }
    } catch (error) {
      console.error('Erreur lors de la suppression du fichier Cloudinary:', error);
    }
  }

  /**
   * Extrait le public_id d'une URL Cloudinary
   */
  private extractPublicId(url: string): string | null {
    try {
      const urlParts = url.split('/');
      const fileNameWithExt = urlParts[urlParts.length - 1];
      const publicId = fileNameWithExt.split('.')[0];
      const folderPath = urlParts.slice(urlParts.indexOf('upload') + 1, -1).join('/');
      
      if (folderPath) {
        return `${folderPath}/${publicId}`;
      }
      return publicId;
    } catch (error) {
      return null;
    }
  }
}
