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
   * Supprime l'ancienne facture (Cloudinary et base de données) pour forcer la régénération
   */
  async clearInvoiceCache(orderId: number): Promise<void> {
    try {
      const invoice = await (this.prisma as any).invoice.findUnique({
        where: { orderId: orderId },
        select: { pdfUrl: true },
      });

      if (invoice && invoice.pdfUrl) {
        // Supprimer le fichier de Cloudinary
        try {
          await this.cloudinaryService.deleteFile(invoice.pdfUrl);
          this.logger.log(`Ancienne facture supprimée de Cloudinary pour la commande ${orderId}`);
        } catch (cloudinaryError) {
          this.logger.warn(`Impossible de supprimer la facture de Cloudinary: ${cloudinaryError.message}`);
        }

        // Supprimer le pdfUrl de la base de données
        await (this.prisma as any).invoice.update({
          where: { orderId: orderId },
          data: { pdfUrl: null },
        });
        this.logger.log(`Cache de facture effacé pour la commande ${orderId}`);
      }
    } catch (error) {
      // Ignorer l'erreur si le champ n'existe pas ou si la facture n'existe pas
      this.logger.warn(`Impossible de supprimer le cache de la facture ${orderId}: ${error.message}`);
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
            customerType: true,
            companyName: true,
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
        shippingAddress: {
          include: {
            deliveryZone: true,
          },
        },
        deliveryPerson: true,
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
        deliveryPerson: order.deliveryPerson || null,
      },
      customer: order.user,
      items: order.items,
      shippingAddress: order.shippingAddress,
      payment: invoiceWithPayment.payment || null,
    };
  }

  /**
   * Génère le PDF de la facture
   * @param orderId - ID de la commande
   * @param forceRegenerate - Si true, supprime l'ancienne facture avant de générer la nouvelle
   */
  async generateInvoicePDF(orderId: number, forceRegenerate: boolean = false): Promise<string> {
    // Si forceRegenerate est true, supprimer l'ancienne facture
    if (forceRegenerate) {
      await this.clearInvoiceCache(orderId);
    }

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
    const deliveryPersonTyped = (order.deliveryPerson || null) as any;
    
    // Définir shipping tôt pour éviter les erreurs de scope
    const shipping = Number(invoiceTyped.shipping || 0);

    // Nom du fichier PDF
    const fileName = `facture-${order.id}-${invoiceTyped.invoiceNumber}.pdf`;
    const filePath = path.join(this.invoicesDir, fileName);

    // Créer le document PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // En-tête avec logo et informations fiscales
    const logoPath = path.join(process.cwd(), 'public', 'images', 'logoSbg.png');
    const logoExists = fs.existsSync(logoPath);
    const startY = 60;
    
    // Logo à gauche (si disponible)
    if (logoExists) {
      try {
        doc.image(logoPath, 50, startY, { width: 100, height: 100, fit: [100, 100] });
      } catch (error) {
        this.logger.warn(`Impossible de charger le logo: ${error.message}`);
      }
    }
    
    // Rectangle avec informations fiscales à gauche (après le logo, espace réduit)
    const rectX = 50;
    const rectY = startY + 60; // En dessous du logo (espace minimal)
    const rectWidth = 200;
    const rectHeight = 85;
    const borderRadius = 5;
    
    // Dessiner le rectangle avec bordure noire et coins arrondis
    // Utiliser roundedRect si disponible, sinon rect
    try {
      if (typeof (doc as any).roundedRect === 'function') {
        (doc as any).roundedRect(rectX, rectY, rectWidth, rectHeight, borderRadius)
          .strokeColor('#000000')
          .lineWidth(1.5)
          .stroke();
      } else {
        // Fallback: rectangle simple
        doc.rect(rectX, rectY, rectWidth, rectHeight)
          .strokeColor('#000000')
          .lineWidth(1.5)
          .stroke();
      }
    } catch (error) {
      // Si roundedRect n'est pas disponible, utiliser rect
      doc.rect(rectX, rectY, rectWidth, rectHeight)
        .strokeColor('#000000')
        .lineWidth(1.5)
        .stroke();
    }
    
    // Informations fiscales dans le rectangle (à gauche)
    doc.fontSize(9)
       .fillColor('#000000')
       .text('N°CC: 2305673 T', rectX + 10, rectY + 10, { width: rectWidth - 20 })
       .text('Régime d\'Imposition : TEE', rectX + 10, rectY + 30, { width: rectWidth - 20 })
       .text('Centre des impôts : RIVIERA 2', rectX + 10, rectY + 50, { width: rectWidth - 20 });
    
    // Informations facture proforma en dessous du rectangle
    const currentY = rectY + rectHeight + 15; // En dessous du rectangle
    doc.y = currentY;
    const invoiceDate = new Date(invoiceTyped.createdAt);
    const invoiceYear = invoiceDate.getFullYear();
    const invoiceDateStr = invoiceDate.toLocaleDateString('fr-FR', { 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric' 
    });
    
    // À gauche : "FACTURE PROFORMA /$annee/$numero facture" en gras
    doc.fontSize(11)
       .fillColor('#000000')
       .font('Helvetica-Bold')
       .text(`FACTURE PROFORMA /${invoiceYear}/${invoiceTyped.invoiceNumber}`, 50, currentY);

    // À droite : "Abidjan, le $date"
    doc.fontSize(11)
       .fillColor('#000000')
       .font('Helvetica')
       .text(`Abidjan, le ${invoiceDateStr}`, 50, currentY, {
         align: 'right',
         width: doc.page.width - 100
       });
 
    doc.moveDown();

    // Informations du client
    doc.fontSize(12)
       .font('Helvetica');
    
    // Afficher le nom selon le type de client
    let clientName = '';
    
    // Log détaillé pour debug
    this.logger.log(`=== DEBUG CLIENT INFO ===`);
    this.logger.log(`Raw customerTyped: ${JSON.stringify(customerTyped, null, 2)}`);
    this.logger.log(`customerType (raw): ${customerTyped.customerType}`);
    this.logger.log(`customerType (type): ${typeof customerTyped.customerType}`);
    this.logger.log(`companyName: ${customerTyped.companyName}`);
    this.logger.log(`firstName: ${customerTyped.firstName}`);
    this.logger.log(`lastName: ${customerTyped.lastName}`);
    
    // Normaliser le customerType
    let customerType = '';
    if (customerTyped.customerType) {
      if (typeof customerTyped.customerType === 'string') {
        customerType = customerTyped.customerType.toUpperCase().trim();
      } else if (customerTyped.customerType.toString) {
        customerType = customerTyped.customerType.toString().toUpperCase().trim();
      }
    }
    
    this.logger.log(`customerType (normalized): ${customerType}`);
    
    // Vérifier si c'est une compagnie
    const isCompany = customerType === 'COMPANY';
    const hasCompanyName = customerTyped.companyName && customerTyped.companyName.trim().length > 0;
    
    this.logger.log(`isCompany: ${isCompany}, hasCompanyName: ${hasCompanyName}`);
    
    if (isCompany && hasCompanyName) {
      // Pour les entreprises, utiliser le nom de l'entreprise
      clientName = customerTyped.companyName.trim();
      this.logger.log(`Using company name: ${clientName}`);
    } else {
      // Pour les particuliers, utiliser prénom et nom
      clientName = `${customerTyped.firstName || ''} ${customerTyped.lastName || ''}`.trim();
      if (!clientName) {
        clientName = customerTyped.email || 'Client';
      }
      this.logger.log(`Using individual name: ${clientName}`);
    }
    
    this.logger.log(`Final clientName: ${clientName}`);
    this.logger.log(`=== END DEBUG ===`);
    
    doc.text(`CLIENT : ${clientName}`);
    
    doc.moveDown();

    // En-têtes du tableau
    const tableTop = doc.y;
    const tableStartX = 50;
    const tableEndX = 550;
    const col1X = 50;   // N°
    const col2X = 100;  // Designation
    const col3X = 280;  // Quantité
    const col4X = 360;  // Prix unitaire
    const col5X = 470;  // Prix total
    
    // Position de départ du tableau (pour les bordures)
    const tableStartY = tableTop - 5;
    
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('N°', col1X, tableTop, { align: 'left', width: 45 });
    doc.text('Designation', col2X, tableTop, { align: 'left', width: 175 });
    doc.text('Quantité', col3X, tableTop, { align: 'left', width: 75 });
    doc.text('Prix unitaire', col4X, tableTop, { align: 'right', width: 105 });
    doc.text('Prix total', col5X, tableTop, { align: 'right', width: 80 });

    // Ligne horizontale sous les en-têtes (avec bordure du tableau)
    const headerBottomY = doc.y + 5;
    doc.lineWidth(0.5)
       .moveTo(tableStartX, tableStartY)
       .lineTo(tableEndX, tableStartY)
       .stroke()
       .moveTo(tableStartX, headerBottomY)
       .lineTo(tableEndX, headerBottomY)
       .stroke();
    
    // Lignes verticales entre les colonnes (en-têtes) - bordure gauche
    doc.lineWidth(0.5)
       .moveTo(tableStartX, tableStartY)
       .lineTo(tableStartX, headerBottomY)
       .stroke();
    
    // Lignes verticales entre les colonnes
    doc.moveTo(col2X, tableStartY).lineTo(col2X, headerBottomY).stroke();
    doc.moveTo(col3X, tableStartY).lineTo(col3X, headerBottomY).stroke();
    doc.moveTo(col4X, tableStartY).lineTo(col4X, headerBottomY).stroke();
    doc.moveTo(col5X, tableStartY).lineTo(col5X, headerBottomY).stroke();
    
    // Bordure droite
    doc.moveTo(tableEndX, tableStartY).lineTo(tableEndX, headerBottomY).stroke();
    
    doc.moveDown();

    // Produits
    let yPosition = doc.y;
    let lineNumber = 1;
    const rowHeight = 15; // Hauteur réduite pour enlever les espaces
    
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

      doc.fontSize(10).font('Helvetica'); // Police normale pour les données
      doc.text(lineNumber.toString(), col1X, yPosition, { align: 'left', width: 45 });
      doc.text(productName, col2X, yPosition, { align: 'left', width: 175 });
      doc.text(quantity.toString(), col3X, yPosition, { align: 'left', width: 75 });
      doc.text(`${unitPrice.toFixed(0)} FCFA`, col4X, yPosition, { align: 'right', width: 105 });
      doc.text(`${total.toFixed(0)} FCFA`, col5X, yPosition, { align: 'right', width: 80 });

      // Lignes verticales pour cette ligne (épaisseur réduite)
      doc.lineWidth(0.5)
         .moveTo(col2X, yPosition - 1)
         .lineTo(col2X, yPosition + rowHeight - 1)
         .stroke()
         .moveTo(col3X, yPosition - 1)
         .lineTo(col3X, yPosition + rowHeight - 1)
         .stroke()
         .moveTo(col4X, yPosition - 1)
         .lineTo(col4X, yPosition + rowHeight - 1)
         .stroke()
         .moveTo(col5X, yPosition - 1)
         .lineTo(col5X, yPosition + rowHeight - 1)
         .stroke();
      
      // Ligne horizontale sous chaque ligne (épaisseur réduite, sans espace)
      doc.moveTo(tableStartX, yPosition + rowHeight - 1)
         .lineTo(tableEndX, yPosition + rowHeight - 1)
         .stroke();
      
      // Bordures gauche et droite pour chaque ligne
      doc.moveTo(tableStartX, yPosition - 1)
         .lineTo(tableStartX, yPosition + rowHeight - 1)
         .stroke()
         .moveTo(tableEndX, yPosition - 1)
         .lineTo(tableEndX, yPosition + rowHeight - 1)
         .stroke();

      yPosition += rowHeight; // Pas d'espace supplémentaire
      lineNumber++;
    });

    // Ligne de séparation avant TOTAL (épaisseur réduite, sans espace)
    doc.lineWidth(0.5)
       .moveTo(tableStartX, yPosition)
       .lineTo(tableEndX, yPosition)
       .stroke();
    yPosition += 5; // Espace réduit avant TOTAL

    // Dernière ligne du tableau : TOTAL
    const orderTotal = Number(invoiceTyped.total);
    const totalRowY = yPosition;
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('TOTAL', col2X, totalRowY, { align: 'left', width: 175 });
    doc.text('', col3X, totalRowY, { align: 'left', width: 75 }); // Quantité vide
    doc.text('', col4X, totalRowY, { align: 'right', width: 105 }); // Prix unitaire vide
    doc.text(`${orderTotal.toFixed(0)} FCFA`, col5X, totalRowY, { align: 'right', width: 80 });
    
    // Lignes verticales pour la ligne TOTAL (épaisseur réduite)
    doc.lineWidth(0.5)
       .moveTo(col2X, totalRowY - 1)
       .lineTo(col2X, totalRowY + rowHeight - 1)
       .stroke()
       .moveTo(col3X, totalRowY - 1)
       .lineTo(col3X, totalRowY + rowHeight - 1)
       .stroke()
       .moveTo(col4X, totalRowY - 1)
       .lineTo(col4X, totalRowY + rowHeight - 1)
       .stroke()
       .moveTo(col5X, totalRowY - 1)
       .lineTo(col5X, totalRowY + rowHeight - 1)
       .stroke();
    
    // Ligne de séparation après TOTAL (épaisseur réduite, sans espace)
    yPosition += rowHeight+10;
    const tableBottomY = yPosition;
    doc.lineWidth(0.5)
       .moveTo(tableStartX, tableBottomY)
       .lineTo(tableEndX, tableBottomY)
       .stroke();
    
    // Bordures gauche et droite complètes du tableau
    doc.lineWidth(0.5)
       .moveTo(tableStartX, tableStartY)
       .lineTo(tableStartX, tableBottomY)
       .stroke()
       .moveTo(tableEndX, tableStartY)
       .lineTo(tableEndX, tableBottomY)
       .stroke();
    
    // Réinitialiser l'épaisseur pour le reste du document
    doc.lineWidth(1);
    
    doc.y = yPosition;
    doc.moveDown(2); // Deux sauts de ligne avant la phrase

    // Arrêtée la présente facture à la somme de (sur toute la ligne de gauche à droite)
    const total = Number(invoiceTyped.total);
    const totalInWords = this.numberToWords(total);
    
    // Écrire le préfixe en normal
    doc.fontSize(11)
       .font('Helvetica')
       .text('Arrêtée la présente facture à la somme de : ', 50, doc.y, { 
         width: doc.page.width - 100,
         continued: true
       });
    
    // Continuer avec le montant en gras sur la même ligne
    doc.font('Helvetica-Bold')
       .text(totalInWords.toUpperCase(), { 
         width: doc.page.width - 100
       });
    doc.moveDown();

    // Pied de page - positionné en bas de la page
    const pageHeight = doc.page.height;
    const footerText = 'Siège social : Abidjan − Cocody riviera palmeraie − 07 BP 54 Abidjan 07 − Tél.: 07 67 62 66 98 . Rcm: cI−ABJ−2023−B13−13583 − N˚ compte Bancaire: BGFI Bank N˚ ci 1001 002010308501 87';
    
    // Calculer la position Y pour le pied de page (en bas de la page avec une marge)
    const footerY = pageHeight - doc.page.margins.bottom - 20;
    
    // Vérifier si on doit ajouter une nouvelle page si le contenu est trop bas
    if (doc.y > footerY - 30) {
      doc.addPage();
    }
    
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#000000')
       .text(
         footerText,
         doc.page.margins.left,
         footerY,
         { align: 'left', width: doc.page.width - doc.page.margins.left - doc.page.margins.right },
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

  /**
   * Convertit un nombre en lettres en français
   */
  private numberToWords(num: number): string {
    const ones = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
      'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
    const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

    if (num === 0) return 'zéro';

    const convertHundreds = (n: number): string => {
      if (n === 0) return '';
      if (n < 20) return ones[n];
      if (n < 100) {
        const ten = Math.floor(n / 10);
        const one = n % 10;
        if (ten === 7 || ten === 9) {
          const base = ten === 7 ? 60 : 80;
          const remainder = n - base;
          if (remainder === 0) return tens[ten];
          if (remainder < 20) return `${tens[ten]}-${ones[remainder]}`;
          return `${tens[ten]}-${convertHundreds(remainder)}`;
        }
        if (one === 0) return tens[ten];
        if (one === 1 && ten !== 8) return `${tens[ten]}-et-un`;
        return `${tens[ten]}-${ones[one]}`;
      }
      const hundred = Math.floor(n / 100);
      const remainder = n % 100;
      let result = hundred === 1 ? 'cent' : `${ones[hundred]}-cent`;
      if (remainder > 0) {
        result += `-${convertHundreds(remainder)}`;
      } else if (hundred > 1) {
        result += 's';
      }
      return result;
    };

    const convert = (n: number): string => {
      if (n === 0) return '';
      if (n < 1000) return convertHundreds(n);
      
      const millions = Math.floor(n / 1000000);
      const remainder = n % 1000000;
      let result = '';
      
      if (millions > 0) {
        if (millions === 1) {
          result = 'un million';
        } else {
          result = `${convertHundreds(millions)} millions`;
        }
        if (remainder > 0) {
          result += ` ${convert(remainder)}`;
        }
        return result;
      }
      
      const thousands = Math.floor(n / 1000);
      const thousandRemainder = n % 1000;
      if (thousands > 0) {
        if (thousands === 1) {
          result = 'mille';
        } else {
          result = `${convertHundreds(thousands)} mille`;
        }
        if (thousandRemainder > 0) {
          result += ` ${convertHundreds(thousandRemainder)}`;
        }
        return result;
      }
      
      return convertHundreds(n);
    };

    const numInt = Math.floor(num);
    const numDecimal = Math.round((num - numInt) * 100);
    
    let result = convert(numInt);
    if (numDecimal > 0) {
      result += ` virgule ${convert(numDecimal)}`;
    }
    
    return `${result} francs CFA`;
  }
}

