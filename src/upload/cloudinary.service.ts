import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Stream } from 'stream';

@Injectable()
export class CloudinaryService {
  constructor() {
    // Vérifier et logger la configuration (sans exposer le secret)
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    
    if (!cloudName || !apiKey || !apiSecret) {
      console.error('❌ Configuration Cloudinary manquante!');
      console.error('CLOUDINARY_CLOUD_NAME:', cloudName ? '✅ Défini' : '❌ Manquant');
      console.error('CLOUDINARY_API_KEY:', apiKey ? '✅ Défini' : '❌ Manquant');
      console.error('CLOUDINARY_API_SECRET:', apiSecret ? '✅ Défini' : '❌ Manquant');
    } else {
      console.log('✅ Configuration Cloudinary chargée:', {
        cloud_name: cloudName,
        api_key: apiKey.substring(0, 4) + '...',
      });
    }
    
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });
  }

  /**
   * Upload un fichier vers Cloudinary
   */
  async uploadFile(
    file: Express.Multer.File,
    folder: 'products' | 'promotions' | 'profiles' | 'videos' | 'documents',
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
        resource_type: 'auto', // 'auto' détecte automatiquement image, video, ou raw
      };
      
      // Pour les vidéos, spécifier explicitement le resource_type
      if (file.mimetype && file.mimetype.startsWith('video/')) {
        options.resource_type = 'video';
      }
      
      // Pour les PDF et autres fichiers raw, utiliser resource_type 'raw'
      if (file.mimetype === 'application/pdf' || 
          file.mimetype === 'application/msword' ||
          file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        options.resource_type = 'raw';
      }

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
          
          // TEMPORAIRE: Retourner simplement l'URL sécurisée sans transformations
          // pour éviter les problèmes de signature
          console.log('✅ Upload réussi:', {
            public_id: result.public_id,
            format: result.format,
            resource_type: result.resource_type,
            width: result.width || 'N/A',
            height: result.height || 'N/A',
            duration: result.duration || 'N/A', // Pour les vidéos
            bytes: result.bytes || 'N/A', // Taille du fichier
          });
          
          // Retourner l'URL sécurisée directement (transformations peuvent être ajoutées côté frontend)
          resolve(result.secure_url);
          
          // NOTE: Les transformations peuvent être ajoutées dans l'URL côté frontend
          // Pour images: https://res.cloudinary.com/[cloud_name]/image/upload/f_auto,q_auto:good/[public_id]
          // Pour vidéos: https://res.cloudinary.com/[cloud_name]/video/upload/[public_id]
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
    folder: 'products' | 'promotions' | 'profiles' | 'videos' | 'documents',
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
