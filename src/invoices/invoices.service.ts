import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../upload/cloudinary.service';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);
  private readonly invoicesDir = path.join(process.cwd(), 'public', 'invoices');

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {
    // Créer le dossier invoices s'il n'existe pas
    if (!fs.existsSync(this.invoicesDir)) {
      fs.mkdirSync(this.invoicesDir, { recursive: true });
    }
  }

  /**
   * Récupère les détails d'une facture par ID de commande
   */
  async getInvoiceByOrderId(orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        items: {
          include: {
            product: {
              include: {
                category: true,
              },
            },
          },
        },
        shippingAddress: true,
        invoice: {
          include: {
            payment: true,
          },
        },
      } as any,
    });

    if (!order || !order.invoice) {
      return null;
    }

    // Type assertion pour résoudre les problèmes de typage Prisma
    const invoice = order.invoice as any;
    const invoiceWithPayment = invoice as { payment: any | null };

    return {
      invoice: invoice,
      order: {
        id: order.id,
        total: order.total,
        status: order.status,
        createdAt: order.createdAt,
      },
      customer: order.user,
      items: order.items,
      shippingAddress: order.shippingAddress,
      payment: invoiceWithPayment.payment || null,
    };
  }

  /**
   * Génère le PDF de la facture
   */
  async generateInvoicePDF(orderId: number): Promise<string> {
    const invoiceData = await this.getInvoiceByOrderId(orderId);

    if (!invoiceData) {
      throw new NotFoundException(`Facture pour la commande ${orderId} introuvable`);
    }

    const { invoice, order, customer, items, shippingAddress, payment } = invoiceData;

    // Type assertions pour résoudre les problèmes de typage
    const invoiceTyped = invoice as any;
    const customerTyped = customer as any;
    const shippingAddressTyped = shippingAddress as any;
    const itemsTyped = items as any[];

    // Nom du fichier PDF
    const fileName = `facture-${order.id}-${invoiceTyped.invoiceNumber}.pdf`;
    const filePath = path.join(this.invoicesDir, fileName);

    // Créer le document PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // En-tête
    doc.fontSize(20).text('FACTURE', { align: 'center' });
    doc.moveDown();

    // Informations de la facture
    doc.fontSize(12);
    doc.text(`Numéro de facture: ${invoiceTyped.invoiceNumber}`, { align: 'left' });
    doc.text(`Date: ${new Date(invoiceTyped.createdAt).toLocaleDateString('fr-FR')}`, { align: 'left' });
    doc.text(`Commande #${order.id}`, { align: 'left' });
    doc.moveDown();

    // Informations du client
    doc.fontSize(14).text('CLIENT', { underline: true });
    doc.fontSize(12);
    doc.text(`${customerTyped.firstName} ${customerTyped.lastName}`);
    if (customerTyped.email) {
      doc.text(`Email: ${customerTyped.email}`);
    }
    if (customerTyped.phone) {
      doc.text(`Téléphone: ${customerTyped.phone}`);
    }
    doc.moveDown();

    // Adresse de livraison
    if (shippingAddressTyped) {
      doc.fontSize(14).text('ADRESSE DE LIVRAISON', { underline: true });
      doc.fontSize(12);
      doc.text(`${shippingAddressTyped.firstName} ${shippingAddressTyped.lastName}`);
      doc.text(shippingAddressTyped.address);
      doc.text(`${shippingAddressTyped.city}, ${shippingAddressTyped.postalCode}`);
      doc.text(shippingAddressTyped.country);
      if (shippingAddressTyped.phone) {
        doc.text(`Téléphone: ${shippingAddressTyped.phone}`);
      }
      doc.moveDown();
    }

    // Tableau des produits
    doc.fontSize(14).text('DÉTAIL DES PRODUITS', { underline: true });
    doc.moveDown(0.5);

    // En-têtes du tableau
    const tableTop = doc.y;
    doc.fontSize(10);
    doc.text('Produit', 50, tableTop);
    doc.text('Quantité', 300, tableTop);
    doc.text('Prix unitaire', 380, tableTop, { align: 'right' });
    doc.text('Total', 480, tableTop, { align: 'right' });

    // Ligne de séparation
    doc.moveTo(50, doc.y + 5).lineTo(550, doc.y + 5).stroke();
    doc.moveDown();

    // Produits
    let yPosition = doc.y;
    itemsTyped.forEach((item: any) => {
      const productName = item.product?.name || 'Produit';
      const quantity = item.quantity;
      const unitPrice = Number(item.price);
      const total = unitPrice * quantity;

      // Vérifier si on doit ajouter une nouvelle page
      if (yPosition > 700) {
        doc.addPage();
        yPosition = 50;
      }

      doc.text(productName, 50, yPosition, { width: 240 });
      doc.text(quantity.toString(), 300, yPosition);
      doc.text(`${unitPrice.toFixed(0)} FCFA`, 380, yPosition, { align: 'right', width: 90 });
      doc.text(`${total.toFixed(0)} FCFA`, 480, yPosition, { align: 'right', width: 70 });

      yPosition += 20;
    });

    doc.y = yPosition;
    doc.moveDown();

    // Ligne de séparation
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    // Totaux
    const subtotal = Number(invoiceTyped.subtotal);
    const tax = Number(invoiceTyped.tax);
    const total = Number(invoiceTyped.total);

    doc.fontSize(12);
    doc.text('Sous-total HT:', 350, doc.y, { align: 'right', width: 100 });
    doc.text(`${subtotal.toFixed(0)} FCFA`, 450, doc.y, { align: 'right', width: 100 });
    doc.moveDown();

    doc.text('TVA (18%):', 350, doc.y, { align: 'right', width: 100 });
    doc.text(`${tax.toFixed(0)} FCFA`, 450, doc.y, { align: 'right', width: 100 });
    doc.moveDown();

    doc.fontSize(14).font('Helvetica-Bold');
    doc.text('TOTAL TTC:', 350, doc.y, { align: 'right', width: 100 });
    doc.text(`${total.toFixed(0)} FCFA`, 450, doc.y, { align: 'right', width: 100 });
    doc.moveDown(2);

    // Informations de paiement
    if (payment) {
      doc.fontSize(12).font('Helvetica');
      doc.text('INFORMATIONS DE PAIEMENT', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      doc.text(`Statut: ${this.getPaymentStatusLabel(payment.status)}`);
      doc.text(`Méthode: ${this.getPaymentMethodLabel(payment.method)}`);
      if (payment.paidAt) {
        doc.text(`Date de paiement: ${new Date(payment.paidAt).toLocaleDateString('fr-FR')}`);
      }
    }

    // Pied de page
    const pageHeight = doc.page.height;
    doc.fontSize(8).text(
      'Merci pour votre achat !',
      doc.page.margins.left,
      pageHeight - 50,
      { align: 'center', width: doc.page.width - doc.page.margins.left - doc.page.margins.right },
    );

    // Finaliser le PDF
    doc.end();

    // Attendre que le fichier soit écrit et uploader sur Cloudinary
    return new Promise<string>((resolve, reject) => {
      stream.on('finish', async () => {
        this.logger.log(`PDF généré: ${filePath}`);
        
        try {
          // Lire le fichier PDF
          const pdfBuffer = fs.readFileSync(filePath);
          
          // Créer un objet File-like pour Cloudinary
          const pdfFile: Express.Multer.File = {
            fieldname: 'file',
            originalname: fileName,
            encoding: '7bit',
            mimetype: 'application/pdf',
            size: pdfBuffer.length,
            buffer: pdfBuffer,
            destination: '',
            filename: fileName,
            path: filePath,
            stream: null as any,
          } as Express.Multer.File;

          // Uploader sur Cloudinary
          this.logger.log(`Upload de la facture sur Cloudinary...`);
          const cloudinaryUrl = await this.cloudinaryService.uploadFile(
            pdfFile,
            'documents',
          );
          
          this.logger.log(`Facture uploadée sur Cloudinary: ${cloudinaryUrl}`);
          
          // Mettre à jour la facture dans la base de données avec l'URL Cloudinary
          try {
            await (this.prisma as any).invoice.update({
              where: { orderId: order.id },
              data: {
                pdfUrl: cloudinaryUrl,
              },
            });
            this.logger.log(`URL Cloudinary sauvegardée dans la base de données`);
          } catch (dbError) {
            // Si le champ pdfUrl n'existe pas encore dans le schéma, on log juste l'erreur
            this.logger.warn(
              `Impossible de sauvegarder l'URL Cloudinary dans la base de données: ${dbError.message}. ` +
              `Vérifiez que le champ 'pdfUrl' existe dans le modèle Invoice et que la migration a été appliquée.`,
            );
          }
          
          // Retourner l'URL Cloudinary
          resolve(cloudinaryUrl);
        } catch (uploadError) {
          this.logger.error(`Erreur lors de l'upload sur Cloudinary: ${uploadError}`);
          // En cas d'erreur d'upload, retourner quand même le chemin local
          resolve(filePath);
        }
      });
      stream.on('error', (error) => {
        this.logger.error(`Erreur lors de la génération du PDF: ${error}`);
        reject(error);
      });
    });
  }

  private getPaymentStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      PENDING: 'En attente',
      COMPLETED: 'Payé',
      FAILED: 'Échoué',
      REFUNDED: 'Remboursé',
    };
    return labels[status] || status;
  }

  private getPaymentMethodLabel(method: string): string {
    const labels: Record<string, string> = {
      CREDIT_CARD: 'Carte de crédit',
      DEBIT_CARD: 'Carte de débit',
      PAYPAL: 'PayPal',
      BANK_TRANSFER: 'Virement bancaire',
      CASH: 'Espèces',
      OTHER: 'Autre',
      MTN_CI: 'MTN Côte d\'Ivoire',
      MOOV_CI: 'MOOV Côte d\'Ivoire',
      ORANGE_MONEY_CI: 'Orange Money Côte d\'Ivoire',
      WAVE_CI: 'Wave Côte d\'Ivoire',
      WAVE_SN: 'Wave Sénégal',
      ORANGE_MONEY_SN: 'Orange Money Sénégal',
    };
    return labels[method] || method;
  }
}

