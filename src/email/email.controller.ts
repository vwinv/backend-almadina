import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { EmailService } from './email.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('api/email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('send')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)
  async sendCustomEmail(@Body() data: { to: string; subject: string; message: string; customerName?: string }) {
    try {
      const success = await this.emailService.sendCustomEmail(data);
      if (success) {
        return { success: true, message: 'Email envoyé avec succès' };
      } else {
        // Vérifier si c'est un problème de configuration
        const hasUser = !!process.env.SMTP_USER;
        const hasPassword = !!process.env.SMTP_PASSWORD;
        if (!hasUser || !hasPassword) {
          const missing: string[] = [];
          if (!hasUser) missing.push('SMTP_USER');
          if (!hasPassword) missing.push('SMTP_PASSWORD');
          return { 
            success: false, 
            message: `Configuration email incomplète. Variables d'environnement manquantes: ${missing.join(', ')}. Veuillez configurer ces variables dans votre fichier .env` 
          };
        }
        return { success: false, message: 'Erreur lors de l\'envoi de l\'email. Vérifiez les logs du serveur pour plus de détails.' };
      }
    } catch (error) {
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Erreur lors de l\'envoi de l\'email' 
      };
    }
  }
}

