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
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `almadina/${folder}`,
          resource_type: 'auto', // Détecte automatiquement image, video, etc.
          allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov'],
          transformation: folder === 'products' || folder === 'promotions' 
            ? [{ quality: 'auto:good', fetch_format: 'auto' }]
            : [{ width: 500, height: 500, crop: 'limit', quality: 'auto:good' }],
        },
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }
          if (!result) {
            reject(new Error('Upload failed: No result returned from Cloudinary'));
            return;
          }
          resolve(result.secure_url);
        },
      );

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
