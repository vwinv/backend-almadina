import {
  Controller,
  Post,
  Body,
  UseGuards,
  ParseIntPipe,
  Param,
  Get,
  BadRequestException,
} from '@nestjs/common';
import { PayDunyaService } from './paydunya.service';
import { CreatePaymentDto, PayDunyaPaymentMethod } from './dto/create-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('api/payments')
export class PaymentsController {
  constructor(
    private readonly payDunyaService: PayDunyaService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Crée un checkout invoice PayDunya
   */
  @Post('checkout/:orderId')
  @UseGuards(JwtAuthGuard)
  async createCheckout(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.payDunyaService.createCheckoutInvoice(orderId);
  }

  /**
   * Paiement via MTN Côte d'Ivoire
   */
  @Post('mtn-ci')
  @UseGuards(JwtAuthGuard)
  async payWithMTNCI(@Body() createPaymentDto: CreatePaymentDto, @CurrentUser() user: any) {
    // Vérifier que la commande appartient à l'utilisateur
    await this.verifyOrderOwnership(createPaymentDto.orderId, user.id);
    return this.payDunyaService.payWithMTNCI(createPaymentDto);
  }

  /**
   * Paiement via MOOV Côte d'Ivoire
   */
  @Post('moov-ci')
  @UseGuards(JwtAuthGuard)
  async payWithMOOVCI(@Body() createPaymentDto: CreatePaymentDto, @CurrentUser() user: any) {
    await this.verifyOrderOwnership(createPaymentDto.orderId, user.id);
    return this.payDunyaService.payWithMOOVCI(createPaymentDto);
  }

  /**
   * Paiement via Orange Money Côte d'Ivoire
   */
  @Post('orange-money-ci')
  @UseGuards(JwtAuthGuard)
  async payWithOrangeMoneyCI(@Body() createPaymentDto: CreatePaymentDto, @CurrentUser() user: any) {
    await this.verifyOrderOwnership(createPaymentDto.orderId, user.id);
    return this.payDunyaService.payWithOrangeMoneyCI(createPaymentDto);
  }

  /**
   * Paiement via Wave Côte d'Ivoire
   */
  @Post('wave-ci')
  @UseGuards(JwtAuthGuard)
  async payWithWaveCI(@Body() createPaymentDto: CreatePaymentDto, @CurrentUser() user: any) {
    await this.verifyOrderOwnership(createPaymentDto.orderId, user.id);
    return this.payDunyaService.payWithWaveCI(createPaymentDto);
  }

  /**
   * Paiement via Wave Sénégal
   */
  @Post('wave-sn')
  @UseGuards(JwtAuthGuard)
  async payWithWaveSN(@Body() createPaymentDto: CreatePaymentDto, @CurrentUser() user: any) {
    await this.verifyOrderOwnership(createPaymentDto.orderId, user.id);
    return this.payDunyaService.payWithWaveSN(createPaymentDto);
  }

  /**
   * Paiement via Orange Money Sénégal
   */
  @Post('orange-money-sn')
  @UseGuards(JwtAuthGuard)
  async payWithOrangeMoneySN(@Body() createPaymentDto: CreatePaymentDto, @CurrentUser() user: any) {
    await this.verifyOrderOwnership(createPaymentDto.orderId, user.id);
    return this.payDunyaService.payWithOrangeMoneySN(createPaymentDto);
  }

  /**
   * Callback PayDunya (webhook)
   */
  @Post('callback')
  async handleCallback(@Body() data: any) {
    return this.payDunyaService.handleCallback(data);
  }

  /**
   * Vérifie que la commande appartient à l'utilisateur
   */
  private async verifyOrderOwnership(orderId: number, userId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new BadRequestException(`Commande avec l'ID ${orderId} introuvable`);
    }

    if (order.userId !== userId) {
      throw new BadRequestException('Cette commande ne vous appartient pas');
    }
  }
}

