import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  ParseIntPipe,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { CashRegistersService } from './cash-registers.service';
import { OpenCashRegisterDto } from './dto/open-cash-register.dto';
import { CloseCashRegisterDto } from './dto/close-cash-register.dto';
import { ReconcileCashRegisterDto } from './dto/reconcile-cash-register.dto';
import { AddCashTransactionDto } from './dto/add-cash-transaction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { UserRoleExtended } from './types/cash-register.types';

@Controller('api/cash-registers')
@UseGuards(JwtAuthGuard)
export class CashRegistersController {
  constructor(private readonly cashRegistersService: CashRegistersService) {}

  /**
   * Ouvrir une caisse pour aujourd'hui
   */
  @Post('open')
  @UseGuards(RolesGuard)
  @Roles(UserRoleExtended.MANAGER as any)
  openCashRegister(
    @CurrentUser() user: any,
    @Body() openCashRegisterDto: OpenCashRegisterDto,
  ) {
    return this.cashRegistersService.openCashRegister(user.id, openCashRegisterDto);
  }

  /**
   * Obtenir la caisse ouverte du manager pour aujourd'hui
   */
  @Get('today')
  @UseGuards(RolesGuard)
  @Roles(UserRoleExtended.MANAGER as any)
  getTodayCashRegister(@CurrentUser() user: any) {
    return this.cashRegistersService.getTodayCashRegister(user.id);
  }

  /**
   * Obtenir l'historique des caisses
   */
  @Get('history')
  @UseGuards(RolesGuard)
  @Roles(UserRoleExtended.MANAGER as any)
  getHistory(
    @CurrentUser() user: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.cashRegistersService.getCashRegisterHistory(user.id, start, end);
  }

  /**
   * Obtenir une caisse par ID
   */
  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRoleExtended.MANAGER as any)
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.cashRegistersService.findOne(id, user.id);
  }

  /**
   * Fermer une caisse
   */
  @Post(':id/close')
  @UseGuards(RolesGuard)
  @Roles(UserRoleExtended.MANAGER as any)
  closeCashRegister(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() closeCashRegisterDto: CloseCashRegisterDto,
  ) {
    return this.cashRegistersService.closeCashRegister(user.id, id, closeCashRegisterDto);
  }

  /**
   * Réconcilier une caisse
   */
  @Post(':id/reconcile')
  @UseGuards(RolesGuard)
  @Roles(UserRoleExtended.MANAGER as any)
  reconcileCashRegister(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() reconcileDto: ReconcileCashRegisterDto,
  ) {
    return this.cashRegistersService.reconcileCashRegister(user.id, id, reconcileDto);
  }

  /**
   * Ajouter une transaction de caisse
   */
  @Post(':id/transactions')
  @UseGuards(RolesGuard)
  @Roles(UserRoleExtended.MANAGER as any)
  addTransaction(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() addTransactionDto: AddCashTransactionDto,
  ) {
    return this.cashRegistersService.addTransaction(user.id, id, addTransactionDto);
  }

  /**
   * Obtenir la réconciliation pour un manager sur une période
   */
  @Get('reconciliation/:userId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getReconciliation(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.cashRegistersService.getReconciliation(userId, start, end);
  }

  /**
   * Télécharger le PDF de réconciliation
   */
  @Get('reconciliation/:userId/pdf')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async downloadReconciliationPDF(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Res() res: Response,
  ) {
    try {
      const start = startDate ? new Date(startDate) : undefined;
      const end = endDate ? new Date(endDate) : undefined;
      const pdfUrlOrPath = await this.cashRegistersService.generateReconciliationPDF(userId, start, end);
      
      if (!pdfUrlOrPath) {
        return res.status(500).json({ message: 'Erreur lors de la génération du PDF' });
      }

      // Si c'est une URL Cloudinary (commence par http:// ou https://), rediriger
      if (pdfUrlOrPath.startsWith('http://') || pdfUrlOrPath.startsWith('https://')) {
        return res.redirect(pdfUrlOrPath);
      }
      
      // Sinon, c'est un chemin local (fallback en cas d'erreur d'upload)
      if (!fs.existsSync(pdfUrlOrPath)) {
        return res.status(500).json({ message: 'Erreur lors de la génération du PDF' });
      }
      
      res.setHeader('Content-Type', 'application/pdf');
      const filename = `reconciliation-${userId}-${startDate || 'all'}-${endDate || 'all'}.pdf`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      return res.sendFile(path.resolve(pdfUrlOrPath));
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      return res.status(500).json({ 
        message: 'Erreur lors de la génération du PDF', 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }
}
