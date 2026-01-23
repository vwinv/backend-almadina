import {
  Controller,
  Get,
  Param,
  Res,
  UseGuards,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('api/invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  /**
   * Récupère les détails d'une facture
   */
  @Get(':orderId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)
  async getInvoice(@Param('orderId', ParseIntPipe) orderId: number) {
    const invoice = await this.invoicesService.getInvoiceByOrderId(orderId);
    if (!invoice) {
      throw new NotFoundException(`Facture pour la commande ${orderId} introuvable`);
    }
    return invoice;
  }

  /**
   * Génère et télécharge le PDF de la facture
   * Force toujours la régénération : supprime l'ancienne facture et génère une nouvelle
   */
  @Get(':orderId/pdf')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)
  async downloadInvoicePDF(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Res() res: Response,
  ) {
    // Toujours forcer la régénération : supprimer l'ancienne facture et générer une nouvelle
    const pdfPathOrUrl = await this.invoicesService.generateInvoicePDF(orderId, true);
    
    // Si c'est une URL Cloudinary (commence par http:// ou https://)
    if (pdfPathOrUrl.startsWith('http://') || pdfPathOrUrl.startsWith('https://')) {
      return res.redirect(pdfPathOrUrl);
    }
    
    // Sinon, c'est un chemin local, envoyer le fichier
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="facture-${orderId}.pdf"`);
    return res.sendFile(pdfPathOrUrl);
  }
}

