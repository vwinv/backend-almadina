import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PayDunyaService {
  private readonly logger = new Logger(PayDunyaService.name);
  private readonly apiBaseUrl: string;
  private readonly masterKey: string;
  private readonly privateKey: string;
  private readonly token: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // Utiliser les variables d'environnement pour les clés PayDunya
    this.apiBaseUrl = this.configService.get<string>('PAYDUNYA_API_URL') || 'https://app.paydunya.com/api/v1';
    this.masterKey = this.configService.get<string>('PAYDUNYA_MASTER_KEY') || '';
    this.privateKey = this.configService.get<string>('PAYDUNYA_PRIVATE_KEY') || '';
    this.token = this.configService.get<string>('PAYDUNYA_TOKEN') || '';
  }

  /**
   * Crée un checkout invoice PayDunya
   */
  async createCheckoutInvoice(orderId: number) {
    try {
      // Récupérer la commande avec tous les détails
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          items: {
            include: {
              product: true,
            },
          },
          shippingAddress: true,
          invoice: true,
        },
      });

      if (!order) {
        throw new BadRequestException(`Commande avec l'ID ${orderId} introuvable`);
      }

      // Créer ou récupérer la facture
      let invoice = order.invoice;
      if (!invoice) {
        // Générer un numéro de facture unique
        const invoiceNumber = `INV-${Date.now()}-${orderId}`;
        
        // Calculer les totaux
        const subtotal = Number(order.total);
        const tax = subtotal * 0.18; // TVA 18%
        const total = subtotal + tax;

        invoice = await this.prisma.invoice.create({
          data: {
            invoiceNumber,
            orderId: order.id,
            subtotal,
            tax,
            shipping: 0,
            discount: 0,
            total,
          },
        });
      }

      // Construire les items pour PayDunya
      const items: any = {};
      order.items.forEach((item, index) => {
        items[`item_${index}`] = {
          name: item.product.name,
          quantity: item.quantity,
          unit_price: String(Number(item.price)),
          total_price: String(Number(item.price) * item.quantity),
          description: item.product.description || '',
        };
      });

      // Construire les taxes
      const taxes: any = {
        tax_0: {
          name: 'TVA (18%)',
          amount: Math.round(Number(invoice.tax)),
        },
      };

      // Construire le payload pour PayDunya
      const payload = {
        invoice: {
          items,
          taxes,
          total_amount: Math.round(Number(invoice.total)),
          description: `Commande #${order.id}`,
        },
        store: {
          name: this.configService.get<string>('STORE_NAME') || 'Almadina',
          tagline: '',
          postal_address: '',
          phone: '',
          logo_url: '',
          website_url: '',
        },
        custom_data: {
          order_id: order.id,
          invoice_id: invoice.id,
        },
        actions: {
          callback_url: `${this.configService.get<string>('API_BASE_URL') || 'http://localhost:3000'}/api/payments/callback`,
        },
      };

      // Appel API PayDunya pour créer le checkout invoice
      const response = await fetch(`${this.apiBaseUrl}/checkout-invoice/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PAYDUNYA-MASTER-KEY': this.masterKey,
          'PAYDUNYA-PRIVATE-KEY': this.privateKey,
          'PAYDUNYA-TOKEN': this.token,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.response_code !== '00') {
        throw new BadRequestException(`Erreur PayDunya: ${data.response_text || 'Erreur inconnue'}`);
      }

      // Extraire le token de paiement
      const paymentToken = data.token;

      // Créer ou mettre à jour le paiement
      const payment = await this.prisma.payment.upsert({
        where: { invoiceId: invoice.id },
        create: {
          invoiceId: invoice.id,
          amount: invoice.total,
          method: 'OTHER',
          status: 'PENDING',
          transactionId: paymentToken,
        },
        update: {
          transactionId: paymentToken,
        },
      });

      return {
        paymentToken,
        checkoutUrl: data.response_text,
        invoice,
        payment,
      };
    } catch (error) {
      this.logger.error('Erreur lors de la création du checkout invoice:', error);
      throw error;
    }
  }

  /**
   * Effectue un paiement via MTN Côte d'Ivoire
   */
  async payWithMTNCI(createPaymentDto: CreatePaymentDto) {
    const { orderId, phoneNumber, fullName, email } = createPaymentDto;

    // Créer le checkout invoice
    const { paymentToken } = await this.createCheckoutInvoice(orderId);

    // Récupérer les infos du client si non fournies
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });

    if (!order) {
      throw new BadRequestException(`Commande avec l'ID ${orderId} introuvable`);
    }

    const customerName = fullName || `${order.user.firstName} ${order.user.lastName}`;
    const customerEmail = email || order.user.email || '';

    // Appel API PayDunya pour MTN CI
    const response = await fetch(`${this.apiBaseUrl}/softpay/mtn-ci`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYDUNYA-MASTER-KEY': this.masterKey,
        'PAYDUNYA-PRIVATE-KEY': this.privateKey,
        'PAYDUNYA-TOKEN': this.token,
      },
      body: JSON.stringify({
        mtn_ci_customer_fullname: customerName,
        mtn_ci_email: customerEmail,
        mtn_ci_phone_number: phoneNumber,
        mtn_ci_wallet_provider: 'MTNCI',
        payment_token: paymentToken,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new BadRequestException(data.message || 'Erreur lors du paiement MTN CI');
    }

    // Mettre à jour le paiement
    await this.updatePaymentMethod(orderId, 'MTN_CI');

    return data;
  }

  /**
   * Effectue un paiement via MOOV Côte d'Ivoire
   */
  async payWithMOOVCI(createPaymentDto: CreatePaymentDto) {
    const { orderId, phoneNumber, fullName, email } = createPaymentDto;

    // Créer le checkout invoice
    const { paymentToken } = await this.createCheckoutInvoice(orderId);

    // Récupérer les infos du client si non fournies
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });

    if (!order) {
      throw new BadRequestException(`Commande avec l'ID ${orderId} introuvable`);
    }

    const customerName = fullName || `${order.user.firstName} ${order.user.lastName}`;
    const customerEmail = email || order.user.email || '';

    // Appel API PayDunya pour MOOV CI
    const response = await fetch(`${this.apiBaseUrl}/softpay/moov-ci`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYDUNYA-MASTER-KEY': this.masterKey,
        'PAYDUNYA-PRIVATE-KEY': this.privateKey,
        'PAYDUNYA-TOKEN': this.token,
      },
      body: JSON.stringify({
        moov_ci_customer_fullname: customerName,
        moov_ci_email: customerEmail,
        moov_ci_phone_number: phoneNumber,
        payment_token: paymentToken,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new BadRequestException(data.message || 'Erreur lors du paiement MOOV CI');
    }

    // Mettre à jour le paiement
    await this.updatePaymentMethod(orderId, 'MOOV_CI');

    return data;
  }

  /**
   * Effectue un paiement via Orange Money Côte d'Ivoire
   */
  async payWithOrangeMoneyCI(createPaymentDto: CreatePaymentDto) {
    const { orderId, phoneNumber, fullName, email, otpCode } = createPaymentDto;

    // Créer le checkout invoice
    const { paymentToken } = await this.createCheckoutInvoice(orderId);

    // Récupérer les infos du client si non fournies
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });

    if (!order) {
      throw new BadRequestException(`Commande avec l'ID ${orderId} introuvable`);
    }

    const customerName = fullName || `${order.user.firstName} ${order.user.lastName}`;
    const customerEmail = email || order.user.email || '';

    // Appel API PayDunya pour Orange Money CI
    const response = await fetch(`${this.apiBaseUrl}/softpay/orange-money-ci`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYDUNYA-MASTER-KEY': this.masterKey,
        'PAYDUNYA-PRIVATE-KEY': this.privateKey,
        'PAYDUNYA-TOKEN': this.token,
      },
      body: JSON.stringify({
        orange_money_ci_customer_fullname: customerName,
        orange_money_ci_email: customerEmail,
        orange_money_ci_phone_number: phoneNumber,
        orange_money_ci_otp: otpCode || '',
        payment_token: paymentToken,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new BadRequestException(data.message || 'Erreur lors du paiement Orange Money CI');
    }

    // Mettre à jour le paiement
    await this.updatePaymentMethod(orderId, 'ORANGE_MONEY_CI');

    // Retourner la réponse avec l'URL du QR code si disponible
    return {
      success: data.success,
      message: data.message || 'Paiement initié avec succès',
      url: data.url || data.qr_code_url || data.response_text || data.checkout_url || null,
      ...data
    };
  }

  /**
   * Effectue un paiement via Wave Côte d'Ivoire (avec QR code)
   */
  async payWithWaveCI(createPaymentDto: CreatePaymentDto) {
    const { orderId, phoneNumber, fullName, email } = createPaymentDto;

    // Créer le checkout invoice
    const { paymentToken } = await this.createCheckoutInvoice(orderId);

    // Récupérer les infos du client si non fournies
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });

    if (!order) {
      throw new BadRequestException(`Commande avec l'ID ${orderId} introuvable`);
    }

    const customerName = fullName || `${order.user.firstName} ${order.user.lastName}`;
    const customerEmail = email || order.user.email || '';

    // S'assurer que le numéro de téléphone est bien formaté (sans espaces, sans indicatif)
    const cleanPhoneNumber = phoneNumber.replace(/\s+/g, '').replace(/^(\+?225)/, '');

    // Préparer le payload pour Wave CI
    const payload = {
      wave_ci_fullName: customerName,
      wave_ci_email: customerEmail || '',
      wave_ci_phone: cleanPhoneNumber,
      wave_ci_payment_token: paymentToken,
    };

    // Logger la requête pour debug
    this.logger.log('Requête Wave CI:', JSON.stringify(payload, null, 2));

    // Appel API PayDunya pour Wave CI
    const response = await fetch(`${this.apiBaseUrl}/softpay/wave-ci`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYDUNYA-MASTER-KEY': this.masterKey,
        'PAYDUNYA-PRIVATE-KEY': this.privateKey,
        'PAYDUNYA-TOKEN': this.token,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    // Logger la réponse pour debug
    this.logger.log('Réponse Wave CI:', JSON.stringify(data, null, 2));

    if (!data.success) {
      const errorMessage = data.message || data.response_text || 'Erreur lors du paiement Wave CI';
      this.logger.error('Erreur Wave CI:', errorMessage);
      throw new BadRequestException(errorMessage);
    }

    // Mettre à jour le paiement
    await this.updatePaymentMethod(orderId, 'WAVE_CI');

    // Retourner la réponse avec l'URL du QR code si disponible
    return {
      success: data.success,
      message: data.message || 'Paiement initié avec succès',
      url: data.url || data.qr_code_url || data.response_text || data.checkout_url || null,
      ...data
    };
  }

  /**
   * Effectue un paiement via Wave Sénégal (avec QR code)
   */
  async payWithWaveSN(createPaymentDto: CreatePaymentDto) {
    const { orderId, phoneNumber, fullName, email } = createPaymentDto;

    // Créer le checkout invoice
    const { paymentToken } = await this.createCheckoutInvoice(orderId);

    // Récupérer les infos du client si non fournies
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });

    if (!order) {
      throw new BadRequestException(`Commande avec l'ID ${orderId} introuvable`);
    }

    const customerName = fullName || `${order.user.firstName} ${order.user.lastName}`;
    const customerEmail = email || order.user.email || '';

    // S'assurer que le numéro de téléphone est bien formaté (sans espaces)
    // Pour Wave Sénégal, le numéro doit être au format: +221XXXXXXXXX (avec indicatif et +)
    let cleanPhoneNumber = phoneNumber.replace(/\s+/g, '');
    
    // Si le numéro ne commence pas par +221 ou 221, l'ajouter
    if (!cleanPhoneNumber.startsWith('+221') && !cleanPhoneNumber.startsWith('221')) {
      // Retirer d'abord l'indicatif s'il existe
      cleanPhoneNumber = cleanPhoneNumber.replace(/^(\+?221)/, '');
      // Ajouter l'indicatif +221
      cleanPhoneNumber = `+221${cleanPhoneNumber}`;
    } else if (cleanPhoneNumber.startsWith('221') && !cleanPhoneNumber.startsWith('+221')) {
      // Ajouter le + si absent mais que 221 est présent
      cleanPhoneNumber = `+${cleanPhoneNumber}`;
    }

    // Préparer le payload pour Wave Sénégal
    const payload = {
      wave_senegal_fullName: customerName,
      wave_senegal_email: customerEmail || '',
      wave_senegal_phone: cleanPhoneNumber,
      wave_senegal_payment_token: paymentToken
    };

    // Logger la requête pour debug
    this.logger.log('Requête Wave SN:', JSON.stringify(payload, null, 2));

    // Appel API PayDunya pour Wave Sénégal
    const response = await fetch(`${this.apiBaseUrl}/softpay/wave-senegal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYDUNYA-MASTER-KEY': this.masterKey,
        'PAYDUNYA-PRIVATE-KEY': this.privateKey,
        'PAYDUNYA-TOKEN': this.token,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    // Logger la réponse pour debug
    this.logger.log('Réponse Wave SN complète:', JSON.stringify(data, null, 2));

    if (!data.success) {
      const errorMessage = data.message || data.response_text || 'Erreur lors du paiement Wave Sénégal';
      this.logger.error('Erreur Wave SN:', errorMessage);
      throw new BadRequestException(errorMessage);
    }

    // Mettre à jour le paiement
    await this.updatePaymentMethod(orderId, 'WAVE_SN');

    // Extraire l'URL du QR code depuis différents champs possibles
    const qrCodeUrl = data.url || 
                      data.qr_code_url || 
                      data.qr_code || 
                      data.response_text || 
                      data.checkout_url || 
                      data.checkout_invoice_url ||
                      (data.response && data.response.url) ||
                      null;

    this.logger.log('URL QR Code extraite:', qrCodeUrl);

    // Retourner la réponse avec l'URL du QR code si disponible
    return {
      success: data.success,
      message: data.message || 'Paiement initié avec succès',
      url: qrCodeUrl,
      ...data
    };
  }

  /**
   * Effectue un paiement via Orange Money Sénégal (avec QR code)
   */
  async payWithOrangeMoneySN(createPaymentDto: CreatePaymentDto) {
    const { orderId, phoneNumber, fullName, email } = createPaymentDto;

    // Créer le checkout invoice
    const { paymentToken } = await this.createCheckoutInvoice(orderId);

    // Récupérer les infos du client si non fournies
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });

    if (!order) {
      throw new BadRequestException(`Commande avec l'ID ${orderId} introuvable`);
    }

    const customerName = fullName || `${order.user.firstName} ${order.user.lastName}`;
    const customerEmail = email || order.user.email || '';

    // Appel API PayDunya pour Orange Money Sénégal
    const response = await fetch(`${this.apiBaseUrl}/softpay/orange-money-senegal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYDUNYA-MASTER-KEY': this.masterKey,
        'PAYDUNYA-PRIVATE-KEY': this.privateKey,
        'PAYDUNYA-TOKEN': this.token,
      },
      body: JSON.stringify({
        customer_name: customerName,
        customer_email: customerEmail,
        phone_number: phoneNumber,
        invoice_token: paymentToken,
      }),
    });

    const data = await response.json();

    // Logger la réponse pour debug
    this.logger.log('Réponse Orange Money SN complète:', JSON.stringify(data, null, 2));

    if (!data.success) {
      throw new BadRequestException(data.message || 'Erreur lors du paiement Orange Money Sénégal');
    }

    // Mettre à jour le paiement
    await this.updatePaymentMethod(orderId, 'ORANGE_MONEY_SN');

    // Extraire maxit_url de other_url pour le QR code
    let qrCodeUrl = null;
    if (data.other_url && data.other_url.maxit_url) {
      qrCodeUrl = data.other_url.maxit_url;
      this.logger.log('URL maxit_url extraite pour QR code:', qrCodeUrl);
    } else {
      // Fallback sur les autres champs possibles
      qrCodeUrl = data.url || 
                  data.qr_code_url || 
                  data.qr_code || 
                  data.response_text || 
                  data.checkout_url || 
                  data.checkout_invoice_url ||
                  (data.response && data.response.url) ||
                  null;
    }

    // Retourner la réponse avec l'URL du QR code
    return {
      success: data.success,
      message: data.message || 'Paiement initié avec succès',
      url: qrCodeUrl,
      ...data
    };
  }

  /**
   * Met à jour la méthode de paiement dans la base de données
   */
  private async updatePaymentMethod(orderId: number, method: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { invoice: { include: { payment: true } } },
    });

    if (order?.invoice?.payment) {
      await this.prisma.payment.update({
        where: { id: order.invoice.payment.id },
        data: {
          method: method as any,
        },
      });
    }
  }

  /**
   * Callback pour les notifications PayDunya
   */
  async handleCallback(data: any) {
    this.logger.log('Callback PayDunya reçu:', data);

    // Vérifier le statut du paiement
    if (data.status === 'completed') {
      // Mettre à jour le paiement dans la base de données
      const payment = await this.prisma.payment.findUnique({
        where: { transactionId: data.token },
        include: { invoice: { include: { order: true } } },
      });

      if (payment) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'COMPLETED',
            paidAt: new Date(),
          },
        });

        // Mettre à jour le statut de la commande
        await this.prisma.order.update({
          where: { id: payment.invoice.orderId },
          data: { status: 'PROCESSING' },
        });
      }
    }

    return { success: true };
  }
}

