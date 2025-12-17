import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import 'dotenv/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as express from 'express';
const compression = require('compression');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Compression gzip pour améliorer les performances
  app.use(compression());
  
  // Configuration CORS pour permettre les requêtes depuis le frontend
  const allowedOrigins = [
    'https://almadinahboutique.com',
    'https://www.almadinahboutique.com',
    process.env.FRONTEND_URL,
    'http://localhost:3000',
  ].filter(Boolean); // Enlève les valeurs undefined/null

  app.enableCors({
    origin: (origin, callback) => {
      // Autoriser les requêtes sans origine (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      
      // Vérifier si l'origine est dans la liste autorisée
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Augmenter la limite de taille du body (100MB pour supporter les vidéos)
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));
  
  // Augmenter la limite pour les multipart/form-data (uploads de fichiers)
  // Note: La limite réelle est gérée par multer dans les interceptors
  app.use(express.raw({ limit: '100mb' }));
  app.use(express.text({ limit: '100mb' }));

  // Servir les fichiers statiques (uploads)
  app.useStaticAssets(join(process.cwd(), 'public'));

  // Validation globale des DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
