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
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getInvoice(@Param('orderId', ParseIntPipe) orderId: number) {
    const invoice = await this.invoicesService.getInvoiceByOrderId(orderId);
    if (!invoice) {
      throw new NotFoundException(`Facture pour la commande ${orderId} introuvable`);
    }
    return invoice;
  }

  /**
   * Génère et télécharge le PDF de la facture
   * Si la facture existe déjà sur Cloudinary, retourne l'URL Cloudinary
   * Sinon, génère le PDF, l'upload sur Cloudinary et redirige vers l'URL
   */
  @Get(':orderId/pdf')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async downloadInvoicePDF(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Res() res: Response,
  ) {
    // Vérifier si la facture a déjà une URL Cloudinary
    const invoice = await this.invoicesService.getInvoiceByOrderId(orderId);
    if (invoice && (invoice.invoice as any).pdfUrl) {
      // Rediriger vers l'URL Cloudinary
      return res.redirect((invoice.invoice as any).pdfUrl);
    }

    // Générer le PDF et l'uploader sur Cloudinary
    const pdfPathOrUrl = await this.invoicesService.generateInvoicePDF(orderId);
    
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

