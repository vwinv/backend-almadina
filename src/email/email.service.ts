import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { OrderStatus } from '@prisma/client';

export interface OrderEmailData {
  orderId: number;
  customerName: string;
  customerEmail: string;
  orderNumber: string;
  orderDate: Date;
  status: OrderStatus;
  items: Array<{
    productName: string;
    quantity: number;
    price: number;
  }>;
  total: number;
  shippingAddress?: {
    address: string;
    city: string;
    postalCode?: string;
    country?: string;
  };
  trackingNumber?: string;
  deliveryPersonName?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    // Le transporter sera initialisé avec les identifiants du compte expéditeur
    // Configuration via variables d'environnement
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const emailConfig = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true pour 465, false pour autres ports
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASSWORD || '',
      },
    };

    // Ne créer le transporter que si les identifiants sont configurés
    if (emailConfig.auth.user && emailConfig.auth.pass) {
      try {
        this.transporter = nodemailer.createTransport(emailConfig);

        // Vérifier la configuration
        this.transporter.verify((error, success) => {
          if (error) {
            this.logger.error('Erreur de configuration email:', error);
            this.transporter = null;
          } else {
            this.logger.log('Service email configuré avec succès');
          }
        });
      } catch (error) {
        this.logger.error('Erreur lors de la création du transporter email:', error);
        this.transporter = null;
      }
    } else {
      const missing: string[] = [];
      if (!emailConfig.auth.user) missing.push('SMTP_USER');
      if (!emailConfig.auth.pass) missing.push('SMTP_PASSWORD');
      this.logger.warn(`Configuration email non complète. Variables manquantes: ${missing.join(', ')}. Les emails ne seront pas envoyés.`);
      this.transporter = null;
    }
  }

  async sendOrderStatusEmail(data: OrderEmailData): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn('Transporter email non configuré. Email non envoyé.');
      return false;
    }

    try {
      const emailContent = this.generateOrderStatusEmail(data);

      const mailOptions = {
        from: `"${process.env.SMTP_FROM_NAME || 'Al Madina Boutique'}" <${process.env.SMTP_USER}>`,
        to: data.customerEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      };

      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email de suivi de commande envoyé: ${info.messageId}`);
      return true;
    } catch (error) {
      this.logger.error(`Erreur lors de l'envoi de l'email de suivi:`, error);
      return false;
    }
  }

  private generateOrderStatusEmail(data: OrderEmailData): { subject: string; html: string; text: string } {
    const statusMessages = {
      PENDING: {
        subject: `Votre commande #${data.orderNumber} a été reçue`,
        title: 'Commande reçue',
        message: 'Nous avons bien reçu votre commande et nous la traitons actuellement.',
      },
      PROCESSING: {
        subject: `Votre commande #${data.orderNumber} est en cours de préparation`,
        title: 'Commande en préparation',
        message: 'Votre commande est actuellement en cours de préparation et sera bientôt expédiée.',
      },
      SHIPPED: {
        subject: `Votre commande #${data.orderNumber} a été expédiée`,
        title: 'Commande expédiée',
        message: data.trackingNumber
          ? `Votre commande a été expédiée. Numéro de suivi: ${data.trackingNumber}`
          : 'Votre commande a été expédiée et est en route vers vous.',
      },
      DELIVERED: {
        subject: `Votre commande #${data.orderNumber} a été livrée`,
        title: 'Commande livrée',
        message: data.deliveryPersonName
          ? `Votre commande a été livrée${data.deliveryPersonName ? ` par ${data.deliveryPersonName}` : ''}. Merci de votre achat !`
          : 'Votre commande a été livrée. Merci de votre achat !',
      },
      CANCELLED: {
        subject: `Votre commande #${data.orderNumber} a été annulée`,
        title: 'Commande annulée',
        message: 'Votre commande a été annulée. Si vous avez des questions, n\'hésitez pas à nous contacter.',
      },
    };

    const statusInfo = statusMessages[data.status] || statusMessages.PENDING;

    const logoUrl = process.env.FRONTEND_URL || 'https://almadinahboutique.com';
    
    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${statusInfo.subject}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #ffffff;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px; text-align: center;">
                <!-- Logo centré -->
                <div style="margin-bottom: 30px;">
                    <img src="${logoUrl}/images/logo.jpeg" alt="Al Madina Boutique Logo" style="max-width: 150px; height: auto; margin: 0 auto;" />
                </div>
                
                <!-- Objet dans un rectangle noir -->
                <div style="background-color: #000000; padding: 20px; margin: 0 auto 30px; max-width: 560px; border-radius: 5px;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold; text-align: center;">${statusInfo.subject}</h1>
                </div>
                
                <!-- Body de l'email -->
                <div style="background: #ffffff; padding: 30px; margin: 0 auto 30px; max-width: 560px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <p style="margin-top: 0;">Bonjour ${data.customerName},</p>
                    
                    <p>${statusInfo.message}</p>
                    
                    <div style="background: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #DA9E19;">
                        <p style="margin: 0;"><strong>Numéro de commande:</strong> #${data.orderNumber}</p>
                        <p style="margin: 5px 0 0 0;"><strong>Date de commande:</strong> ${new Date(data.orderDate).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        })}</p>
                        <p style="margin: 5px 0 0 0;"><strong>Statut:</strong> ${this.getStatusLabel(data.status)}</p>
                        ${data.trackingNumber ? `<p style="margin: 5px 0 0 0;"><strong>Numéro de suivi:</strong> ${data.trackingNumber}</p>` : ''}
                    </div>
                    
                    <h3 style="color: #333; border-bottom: 2px solid #DA9E19; padding-bottom: 10px; margin-top: 30px;">Détails de la commande</h3>
                    
                    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                        <thead>
                            <tr style="background: #f5f5f5;">
                                <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Produit</th>
                                <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Quantité</th>
                                <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Prix</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.items
                              .map(
                                (item) => `
                            <tr>
                                <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.productName}</td>
                                <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;">${item.quantity}</td>
                                <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">${item.price.toFixed(2)} FCFA</td>
                            </tr>
                            `,
                              )
                              .join('')}
                            <tr style="font-weight: bold; font-size: 18px;">
                                <td colspan="2" style="padding: 15px 10px; text-align: right; border-top: 2px solid #DA9E19;">Total:</td>
                                <td style="padding: 15px 10px; text-align: right; border-top: 2px solid #DA9E19; color: #DA9E19;">${data.total.toFixed(2)} FCFA</td>
                            </tr>
                        </tbody>
                    </table>
                    
                    ${data.shippingAddress ? `
                    <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <h3 style="color: #333; margin-top: 0;">Adresse de livraison</h3>
                        <p style="margin: 5px 0;">
                            ${data.shippingAddress.address}<br>
                            ${data.shippingAddress.postalCode ? data.shippingAddress.postalCode + ' ' : ''}${data.shippingAddress.city}<br>
                            ${data.shippingAddress.country || 'Côte d\'Ivoire'}
                        </p>
                    </div>
                    ` : ''}
                    
                    <p style="margin-top: 30px;">Pour toute question concernant votre commande, n'hésitez pas à nous contacter.</p>
                </div>
                
                <!-- Rectangle dégradé doré avec le texte -->
                <div style="background: linear-gradient(135deg, #DA9E19 0%, #DBB536 33%, #FDF179 66%, #FFD245 100%); padding: 25px; margin: 0 auto; max-width: 560px; border-radius: 5px; text-align: center;">
                    <p style="color: #000000; margin: 0; font-size: 18px; font-weight: bold;">Al Madinah E - commerce</p>
                </div>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    const text = `
${statusInfo.subject}

Bonjour ${data.customerName},

${statusInfo.message}

Numéro de commande: #${data.orderNumber}
Date de commande: ${new Date(data.orderDate).toLocaleDateString('fr-FR')}
Statut: ${this.getStatusLabel(data.status)}
${data.trackingNumber ? `Numéro de suivi: ${data.trackingNumber}` : ''}

Détails de la commande:
${data.items.map((item) => `- ${item.productName} x${item.quantity}: ${item.price.toFixed(2)} FCFA`).join('\n')}

Total: ${data.total.toFixed(2)} FCFA

${data.shippingAddress ? `Adresse de livraison:\n${data.shippingAddress.address}\n${data.shippingAddress.postalCode || ''} ${data.shippingAddress.city}\n${data.shippingAddress.country || 'Côte d\'Ivoire'}` : ''}

Pour toute question, contactez-nous à contact@almadinahboutique.com ou au +225 0767626698.
    `;

    return { subject: statusInfo.subject, html, text };
  }

  private getStatusLabel(status: OrderStatus): string {
    const labels = {
      PENDING: 'En attente',
      PROCESSING: 'En préparation',
      SHIPPED: 'Expédiée',
      DELIVERED: 'Livrée',
      CANCELLED: 'Annulée',
    };
    return labels[status] || status;
  }

  async sendCustomerAccessEmail(data: {
    customerName: string;
    customerEmail: string;
    password: string;
    phone?: string;
  }): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn('Transporter email non configuré. Email non envoyé.');
      return false;
    }

    try {
      const emailContent = this.generateCustomerAccessEmail(data);

      const mailOptions = {
        from: `"${process.env.SMTP_FROM_NAME || 'Al Madina Boutique'}" <${process.env.SMTP_USER}>`,
        to: data.customerEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      };

      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email d'accès client envoyé: ${info.messageId}`);
      return true;
    } catch (error) {
      this.logger.error(`Erreur lors de l'envoi de l'email d'accès:`, error);
      return false;
    }
  }

  async sendCustomEmail(data: {
    to: string;
    subject: string;
    message: string;
    customerName?: string;
  }): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn('Transporter email non configuré. Email non envoyé.');
      return false;
    }

    try {
      const logoUrl = process.env.FRONTEND_URL || 'https://almadinahboutique.com';
      
      // Formatage HTML du message (remplacer les sauts de ligne par <br>)
      const htmlMessage = data.message.replace(/\n/g, '<br>');
      
      const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.subject}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #ffffff;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px; text-align: center;">
                <!-- Logo centré -->
                <div style="margin-bottom: 30px;">
                    <img src="${logoUrl}/images/logo.jpeg" alt="Al Madina Boutique Logo" style="max-width: 150px; height: auto; margin: 0 auto;" />
                </div>
                
                <!-- Objet dans un rectangle noir -->
                <div style="background-color: #000000; padding: 20px; margin: 0 auto 30px; max-width: 560px; border-radius: 5px;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold; text-align: center;">${data.subject}</h1>
                </div>
                
                <!-- Body de l'email -->
                <div style="background: #ffffff; padding: 30px; margin: 0 auto 30px; max-width: 560px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    ${data.customerName ? `<p style="margin-top: 0;">Bonjour ${data.customerName},</p>` : '<p style="margin-top: 0;">Bonjour,</p>'}
                    
                    <div style="font-size: 14px; line-height: 1.8; color: #555;">
                        ${htmlMessage}
                    </div>
                </div>
                
                <!-- Footer avec dégradé doré -->
                <div style="background: linear-gradient(135deg, #DA9E19 0%, #DBB536 33%, #FDF179 66%, #FFD245 100%); padding: 20px; margin: 0 auto; max-width: 560px; border-radius: 5px; text-align: center;">
                    <p style="color: #000000; margin: 0; font-weight: bold; font-size: 16px;">Al Madinah E - commerce</p>
                </div>
            </td>
        </tr>
    </table>
</body>
</html>
      `;

      const text = data.message;

      const mailOptions = {
        from: `"${process.env.SMTP_FROM_NAME || 'Al Madina Boutique'}" <${process.env.SMTP_USER}>`,
        to: data.to,
        subject: data.subject,
        html: html,
        text: text,
      };

      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email personnalisé envoyé à ${data.to}: ${info.messageId}`);
      return true;
    } catch (error) {
      this.logger.error(`Erreur lors de l'envoi de l'email personnalisé:`, error);
      return false;
    }
  }

  private generateCustomerAccessEmail(data: {
    customerName: string;
    customerEmail: string;
    password: string;
    phone?: string;
  }): { subject: string; html: string; text: string } {
    const subject = 'Bienvenue - Vos accès Al Madina Boutique';
    const logoUrl = process.env.FRONTEND_URL || 'https://almadinahboutique.com';
    const loginUrl = `${process.env.FRONTEND_URL || 'https://almadinahboutique.com'}/login`;

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #ffffff;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 40px 20px; text-align: center;">
                <!-- Logo centré -->
                <div style="margin-bottom: 30px;">
                    <img src="${logoUrl}/images/logo.jpeg" alt="Al Madina Boutique Logo" style="max-width: 150px; height: auto; margin: 0 auto;" />
                </div>
                
                <!-- Objet dans un rectangle noir -->
                <div style="background-color: #000000; padding: 20px; margin: 0 auto 30px; max-width: 560px; border-radius: 5px;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold; text-align: center;">Bienvenue sur Al Madina Boutique</h1>
                </div>
                
                <!-- Body de l'email -->
                <div style="background: #ffffff; padding: 30px; margin: 0 auto 30px; max-width: 560px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <p style="margin-top: 0;">Bonjour ${data.customerName},</p>
                    
                    <p>Votre compte client a été créé avec succès sur Al Madina Boutique. Vous pouvez maintenant accéder à votre espace client pour suivre vos commandes et gérer vos informations.</p>
                    
                    <div style="background: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #DA9E19;">
                        <h3 style="margin-top: 0; color: #333;">Vos identifiants de connexion</h3>
                        <p style="margin: 10px 0;"><strong>Email:</strong> ${data.customerEmail}</p>
                        ${data.phone ? `<p style="margin: 10px 0;"><strong>Téléphone:</strong> ${data.phone}</p>` : ''}
                        <p style="margin: 10px 0;"><strong>Mot de passe:</strong> <code style="background: #fff; padding: 5px 10px; border-radius: 3px; font-size: 16px; font-weight: bold; color: #DA9E19;">${data.password}</code></p>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${loginUrl}" style="display: inline-block; background-color: #000000; color: #ffffff; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">Se connecter</a>
                    </div>
                    
                    <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
                        <p style="margin: 0; color: #856404;"><strong>⚠️ Important:</strong> Pour des raisons de sécurité, nous vous recommandons de changer votre mot de passe après votre première connexion.</p>
                    </div>
                    
                    <p style="margin-top: 30px;">Pour toute question, n'hésitez pas à nous contacter.</p>
                </div>
                
                <!-- Rectangle dégradé doré avec le texte -->
                <div style="background: linear-gradient(135deg, #DA9E19 0%, #DBB536 33%, #FDF179 66%, #FFD245 100%); padding: 25px; margin: 0 auto; max-width: 560px; border-radius: 5px; text-align: center;">
                    <p style="color: #000000; margin: 0; font-size: 18px; font-weight: bold;">Al Madinah E - commerce</p>
                </div>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    const text = `
${subject}

Bonjour ${data.customerName},

Votre compte client a été créé avec succès sur Al Madina Boutique.

Vos identifiants de connexion:
Email: ${data.customerEmail}
${data.phone ? `Téléphone: ${data.phone}` : ''}
Mot de passe: ${data.password}

Connectez-vous ici: ${loginUrl}

⚠️ Important: Pour des raisons de sécurité, nous vous recommandons de changer votre mot de passe après votre première connexion.

Pour toute question, contactez-nous à contact@almadinahboutique.com ou au +225 0767626698.
    `;

    return { subject, html, text };
  }
}
