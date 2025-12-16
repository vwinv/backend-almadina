import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../upload/cloudinary.service';
import { OpenCashRegisterDto } from './dto/open-cash-register.dto';
import { CloseCashRegisterDto } from './dto/close-cash-register.dto';
import { ReconcileCashRegisterDto } from './dto/reconcile-cash-register.dto';
import { AddCashTransactionDto } from './dto/add-cash-transaction.dto';
import { UserRole } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { CashRegisterStatus, CashRegisterTransactionType, UserRoleExtended } from './types/cash-register.types';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CashRegistersService {
  private readonly logger = new Logger(CashRegistersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  /**
   * Ouvrir une caisse pour un manager
   */
  async openCashRegister(userId: number, openCashRegisterDto: OpenCashRegisterDto) {
    // Vérifier que l'utilisateur est un manager
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || (user.role as any) !== 'MANAGER') {
      throw new ForbiddenException('Seuls les managers peuvent ouvrir une caisse');
    }

    // Vérifier qu'il n'y a pas déjà une caisse ouverte aujourd'hui pour ce manager
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingOpenCashRegister = await (this.prisma as any).cashRegister.findFirst({
      where: {
        userId,
        date: today,
        status: CashRegisterStatus.OPEN,
      },
    });

    if (existingOpenCashRegister) {
      throw new BadRequestException('Une caisse est déjà ouverte pour aujourd\'hui');
    }

    // Chercher d'abord une caisse fermée existante pour aujourd'hui
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    let existingClosedCashRegister = await (this.prisma as any).cashRegister.findFirst({
      where: {
        userId,
        date: {
          gte: today,
          lt: tomorrow,
        },
        status: CashRegisterStatus.CLOSED,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Si aucune caisse fermée pour aujourd'hui, chercher la dernière caisse fermée (peu importe la date)
    if (!existingClosedCashRegister) {
      existingClosedCashRegister = await (this.prisma as any).cashRegister.findFirst({
        where: {
          userId,
          status: CashRegisterStatus.CLOSED,
        },
        orderBy: {
          date: 'desc',
          createdAt: 'desc',
        },
      });
    }

    let openingBalance: Decimal;
    if (existingClosedCashRegister) {
      // Utiliser le solde de fermeture (closingBalance) ou le solde réel (actualBalance) de la dernière caisse fermée
      // S'il n'y en a pas, utiliser le solde d'ouverture
      openingBalance = existingClosedCashRegister.closingBalance || 
                      existingClosedCashRegister.actualBalance || 
                      existingClosedCashRegister.openingBalance || 
                      new Decimal(0);

      // Si la caisse fermée est pour aujourd'hui, la réouvrir
      const cashRegisterDate = new Date(existingClosedCashRegister.date);
      cashRegisterDate.setHours(0, 0, 0, 0);
      const isToday = cashRegisterDate.getTime() === today.getTime();

      if (isToday) {
        // Mettre à jour la caisse existante pour l'ouvrir
        const cashRegister = await (this.prisma as any).cashRegister.update({
          where: { id: existingClosedCashRegister.id },
          data: {
            status: CashRegisterStatus.OPEN,
            openTime: new Date(),
            closeTime: null,
            openingBalance: openingBalance,
          },
        });

        // Créer une transaction d'ouverture
        await (this.prisma as any).cashRegisterTransaction.create({
          data: {
            cashRegisterId: cashRegister.id,
            type: CashRegisterTransactionType.OPENING,
            amount: openingBalance,
            description: 'Ouverture de caisse',
          },
        });

        return await (this.prisma as any).cashRegister.findUnique({
          where: { id: cashRegister.id },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            transactions: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 10,
            },
          },
        });
      } else {
        // Créer une nouvelle caisse pour aujourd'hui avec le solde de fermeture de la dernière caisse
        const newCashRegister = await (this.prisma as any).cashRegister.create({
          data: {
            userId,
            date: today,
            status: CashRegisterStatus.OPEN,
            openTime: new Date(),
            openingBalance: openingBalance,
          },
        });

        // Créer une transaction d'ouverture
        await (this.prisma as any).cashRegisterTransaction.create({
          data: {
            cashRegisterId: newCashRegister.id,
            type: CashRegisterTransactionType.OPENING,
            amount: openingBalance,
            description: `Ouverture de caisse - Solde initial: ${openingBalance}`,
          },
        });

        return await (this.prisma as any).cashRegister.findUnique({
          where: { id: newCashRegister.id },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            transactions: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 10,
            },
          },
        });
      }
    } else {
      // Aucune caisse fermée trouvée - une caisse doit être créée par l'admin d'abord
      throw new BadRequestException('Aucune caisse fermée trouvée. Veuillez demander à un administrateur de créer une caisse d\'abord.');
    }
  }

  /**
   * Fermer une caisse
   */
  async closeCashRegister(userId: number, cashRegisterId: number, closeCashRegisterDto: CloseCashRegisterDto) {
    const cashRegister = await (this.prisma as any).cashRegister.findUnique({
      where: { id: cashRegisterId },
      include: {
        transactions: true,
      },
    });

    if (!cashRegister) {
      throw new NotFoundException('Caisse introuvable');
    }

    if (cashRegister.userId !== userId) {
      throw new ForbiddenException('Vous ne pouvez fermer que votre propre caisse');
    }

    if (cashRegister.status === CashRegisterStatus.CLOSED) {
      throw new BadRequestException('Cette caisse est déjà fermée');
    }

    // Calculer le solde attendu
    const expectedBalance = this.calculateExpectedBalance(cashRegister);

    // Utiliser le solde réel fourni ou le solde attendu
    const actualBalance = closeCashRegisterDto.actualBalance 
      ? new Decimal(closeCashRegisterDto.actualBalance)
      : expectedBalance;

    const closingBalance = closeCashRegisterDto.closingBalance
      ? new Decimal(closeCashRegisterDto.closingBalance)
      : actualBalance;

    const difference = closingBalance.minus(expectedBalance);

    // Fermer la caisse
    const updatedCashRegister = await (this.prisma as any).cashRegister.update({
      where: { id: cashRegisterId },
      data: {
        closeTime: new Date(),
        status: CashRegisterStatus.CLOSED,
        closingBalance,
        expectedBalance,
        actualBalance,
        difference,
        transactions: {
          create: {
            type: CashRegisterTransactionType.CLOSING,
            amount: closingBalance,
            description: `Fermeture de caisse - Solde attendu: ${expectedBalance}, Solde réel: ${actualBalance}`,
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        transactions: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    return updatedCashRegister;
  }

  /**
   * Réconcilier une caisse
   */
  async reconcileCashRegister(userId: number, cashRegisterId: number, reconcileDto: ReconcileCashRegisterDto) {
    const cashRegister = await (this.prisma as any).cashRegister.findUnique({
      where: { id: cashRegisterId },
      include: {
        transactions: true,
      },
    });

    if (!cashRegister) {
      throw new NotFoundException('Caisse introuvable');
    }

    if (cashRegister.userId !== userId) {
      throw new ForbiddenException('Vous ne pouvez réconcilier que votre propre caisse');
    }

    if (cashRegister.status !== CashRegisterStatus.CLOSED) {
      throw new BadRequestException('Seules les caisses fermées peuvent être réconciliées');
    }

    const actualBalance = new Decimal(reconcileDto.actualBalance);
    const expectedBalance = cashRegister.expectedBalance || this.calculateExpectedBalance(cashRegister);
    const difference = actualBalance.minus(expectedBalance);

    // Mettre à jour avec les valeurs de réconciliation
    const reconciledCashRegister = await (this.prisma as any).cashRegister.update({
      where: { id: cashRegisterId },
      data: {
        actualBalance,
        difference,
        notes: reconcileDto.notes,
        transactions: {
          create: {
            type: CashRegisterTransactionType.RECONCILIATION,
            amount: difference,
            description: `Réconciliation - Solde attendu: ${expectedBalance}, Solde réel: ${actualBalance}, Différence: ${difference}`,
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        transactions: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    return reconciledCashRegister;
  }

  /**
   * Ajouter une transaction de caisse
   */
  async addTransaction(userId: number, cashRegisterId: number, addTransactionDto: AddCashTransactionDto) {
    const cashRegister = await (this.prisma as any).cashRegister.findUnique({
      where: { id: cashRegisterId },
    });

    if (!cashRegister) {
      throw new NotFoundException('Caisse introuvable');
    }

    if (cashRegister.userId !== userId) {
      throw new ForbiddenException('Vous ne pouvez ajouter des transactions qu\'à votre propre caisse');
    }

    if (cashRegister.status === CashRegisterStatus.CLOSED) {
      throw new BadRequestException('Impossible d\'ajouter une transaction à une caisse fermée');
    }

    // Vérifier que la commande existe si orderId est fourni
    if (addTransactionDto.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: addTransactionDto.orderId },
      });

      if (!order) {
        throw new NotFoundException('Commande introuvable');
      }
    }

    const transaction = await (this.prisma as any).cashRegisterTransaction.create({
      data: {
        cashRegisterId,
        type: addTransactionDto.type,
        amount: new Decimal(addTransactionDto.amount),
        description: addTransactionDto.description,
        orderId: addTransactionDto.orderId,
      },
      include: {
        order: {
          select: {
            id: true,
            total: true,
          },
        },
      },
    });

    return transaction;
  }

  /**
   * Obtenir la caisse ouverte du manager pour aujourd'hui
   */
  async getTodayCashRegister(userId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cashRegister = await (this.prisma as any).cashRegister.findFirst({
      where: {
        userId,
        date: today,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        transactions: {
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            order: {
              select: {
                id: true,
                total: true,
              },
            },
          },
        },
      },
    });

    if (cashRegister) {
      // Calculer le solde actuel si la caisse est ouverte
      if (cashRegister.status === CashRegisterStatus.OPEN) {
        const expectedBalance = this.calculateExpectedBalance(cashRegister);
        return {
          ...cashRegister,
          currentExpectedBalance: expectedBalance,
        };
      }
    }

    return cashRegister;
  }

  /**
   * Obtenir l'historique des caisses d'un manager
   */
  async getCashRegisterHistory(userId: number, startDate?: Date, endDate?: Date) {
    const where: any = { userId };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        where.date.gte = startDate;
      }
      if (endDate) {
        where.date.lte = endDate;
      }
    }

    const cashRegisters = await (this.prisma as any).cashRegister.findMany({
      where,
      include: {
        transactions: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 5, // Limiter pour la liste
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    return cashRegisters;
  }

  /**
   * Obtenir une caisse par ID avec son historique complet
   */
  async findOne(id: number, userId: number) {
    const cashRegister = await (this.prisma as any).cashRegister.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        transactions: {
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            order: {
              select: {
                id: true,
                total: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!cashRegister) {
      throw new NotFoundException('Caisse introuvable');
    }

    if (cashRegister.userId !== userId) {
      throw new ForbiddenException('Accès refusé');
    }

    // Calculer le solde attendu si la caisse est ouverte
    if (cashRegister.status === CashRegisterStatus.OPEN) {
      const expectedBalance = this.calculateExpectedBalance(cashRegister);
      return {
        ...cashRegister,
        currentExpectedBalance: expectedBalance,
      };
    }

    return cashRegister;
  }

  /**
   * Calculer le solde attendu d'une caisse
   */
  private calculateExpectedBalance(cashRegister: any): Decimal {
    let balance = new Decimal(cashRegister.openingBalance);

    if (cashRegister.transactions) {
      for (const transaction of cashRegister.transactions) {
        // Ignorer les transactions d'ouverture et de fermeture dans le calcul
        if (
          transaction.type !== CashRegisterTransactionType.OPENING &&
          transaction.type !== CashRegisterTransactionType.CLOSING &&
          transaction.type !== CashRegisterTransactionType.RECONCILIATION
        ) {
          balance = balance.plus(transaction.amount);
        }
      }
    }

    return balance;
  }

  /**
   * Fermer automatiquement toutes les caisses ouvertes de la veille
   * Appelé par une tâche planifiée chaque jour à minuit
   */
  async autoCloseOpenCashRegisters() {
    // Calculer la date d'aujourd'hui à minuit
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Trouver toutes les caisses ouvertes d'avant aujourd'hui
    const openCashRegisters = await (this.prisma as any).cashRegister.findMany({
      where: {
        status: CashRegisterStatus.OPEN,
        date: {
          lt: today, // Avant aujourd'hui (donc hier ou avant)
        },
      },
      include: {
        transactions: true,
      },
    });

    const closedRegisters = [];

    for (const cashRegister of openCashRegisters) {
      try {
        // Calculer le solde attendu
        const expectedBalance = this.calculateExpectedBalance(cashRegister);
        
        // Utiliser le solde attendu comme solde réel et solde de fermeture
        const actualBalance = expectedBalance;
        const closingBalance = expectedBalance;
        const difference = new Decimal(0);

        // Fermer la caisse
        const updatedCashRegister = await (this.prisma as any).cashRegister.update({
          where: { id: cashRegister.id },
          data: {
            closeTime: new Date(),
            status: CashRegisterStatus.CLOSED,
            closingBalance,
            expectedBalance,
            actualBalance,
            difference,
            transactions: {
              create: {
                type: CashRegisterTransactionType.CLOSING,
                amount: closingBalance,
                description: `Fermeture automatique à la fin de la journée - Solde attendu: ${expectedBalance}`,
              },
            },
          },
        });

        closedRegisters.push(updatedCashRegister as never);
        console.log(`Caisse ${cashRegister.id} fermée automatiquement`);
      } catch (error) {
        console.error(`Erreur lors de la fermeture automatique de la caisse ${cashRegister.id}:`, error);
      }
    }

    return {
      message: `${closedRegisters.length} caisse(s) fermée(s) automatiquement`,
      closedRegisters: closedRegisters.length,
    };
  }

  /**
   * Obtenir la réconciliation pour un manager sur une période
   */
  async getReconciliation(userId: number, startDate?: Date, endDate?: Date) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const where: any = {
      userId,
      status: CashRegisterStatus.CLOSED,
    };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        where.date.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.date.lte = end;
      }
    }

    const cashRegisters = await (this.prisma as any).cashRegister.findMany({
      where,
      orderBy: {
        date: 'asc',
      },
      include: {
        transactions: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    // Calculer les totaux
    let totalOpening = new Decimal(0);
    let totalClosing = new Decimal(0);
    let totalDifference = new Decimal(0);
    let totalCashIn = new Decimal(0);
    let totalCashOut = new Decimal(0);
    let totalCashSales = new Decimal(0);

    cashRegisters.forEach((cr: any) => {
      totalOpening = totalOpening.plus(cr.openingBalance || 0);
      totalClosing = totalClosing.plus(cr.closingBalance || cr.actualBalance || 0);
      totalDifference = totalDifference.plus(cr.difference || 0);

      cr.transactions?.forEach((tx: any) => {
        if (tx.type === CashRegisterTransactionType.CASH_IN) {
          totalCashIn = totalCashIn.plus(tx.amount || 0);
        } else if (tx.type === CashRegisterTransactionType.CASH_OUT) {
          totalCashOut = totalCashOut.plus(Math.abs(Number(tx.amount)) || 0);
        } else if (tx.type === CashRegisterTransactionType.CASH_SALE) {
          totalCashSales = totalCashSales.plus(tx.amount || 0);
        }
      });
    });

    return {
      user,
      period: {
        startDate: startDate || null,
        endDate: endDate || null,
      },
      cashRegisters,
      totals: {
        openingBalance: totalOpening.toString(),
        closingBalance: totalClosing.toString(),
        difference: totalDifference.toString(),
        cashIn: totalCashIn.toString(),
        cashOut: totalCashOut.toString(),
        cashSales: totalCashSales.toString(),
      },
    };
  }

  /**
   * Générer le PDF de réconciliation
   */
  async generateReconciliationPDF(userId: number, startDate?: Date, endDate?: Date): Promise<string> {
    const reconciliation = await this.getReconciliation(userId, startDate, endDate);

    const doc = new PDFDocument({ margin: 50 });
    const filename = `reconciliation-${userId}-${Date.now()}.pdf`;
    
    // Créer le dossier public s'il n'existe pas
    const publicDir = path.join(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    // Créer le dossier temp s'il n'existe pas
    const tempDir = path.join(publicDir, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const filepath = path.join(tempDir, filename);
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    // En-tête
    doc.fontSize(20).text('Rapport de Réconciliation de Caisse', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`${reconciliation.user.firstName} ${reconciliation.user.lastName}`, { align: 'center' });
    doc.text(reconciliation.user.email || '', { align: 'center' });
    
    if (reconciliation.period.startDate || reconciliation.period.endDate) {
      doc.moveDown();
      const startStr = reconciliation.period.startDate 
        ? reconciliation.period.startDate.toLocaleDateString('fr-FR')
        : 'Début';
      const endStr = reconciliation.period.endDate
        ? reconciliation.period.endDate.toLocaleDateString('fr-FR')
        : 'Fin';
      doc.text(`Période: ${startStr} - ${endStr}`, { align: 'center' });
    }

    doc.moveDown(2);

    // Totaux
    doc.fontSize(14).text('Totaux', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text(`Solde d'ouverture total: ${Number(reconciliation.totals.openingBalance).toFixed(2)} CFA`);
    doc.text(`Solde de fermeture total: ${Number(reconciliation.totals.closingBalance).toFixed(2)} CFA`);
    doc.text(`Différence totale: ${Number(reconciliation.totals.difference).toFixed(2)} CFA`);
    doc.text(`Total entrées de fonds: ${Number(reconciliation.totals.cashIn).toFixed(2)} CFA`);
    doc.text(`Total sorties de fonds: ${Number(reconciliation.totals.cashOut).toFixed(2)} CFA`);
    doc.text(`Total ventes en espèces: ${Number(reconciliation.totals.cashSales).toFixed(2)} CFA`);

    doc.moveDown(2);

    // Détails par caisse
    reconciliation.cashRegisters.forEach((cr: any, index: number) => {
      if (index > 0) {
        doc.addPage();
      }

      doc.fontSize(14).text(`Caisse du ${new Date(cr.date).toLocaleDateString('fr-FR')}`, { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      doc.text(`Statut: ${cr.status}`);
      doc.text(`Solde d'ouverture: ${Number(cr.openingBalance).toFixed(2)} CFA`);
      doc.text(`Solde réel: ${Number(cr.actualBalance || cr.closingBalance || 0).toFixed(2)} CFA`);
      doc.text(`Solde de fermeture: ${Number(cr.closingBalance || 0).toFixed(2)} CFA`);
      if (cr.difference !== null && cr.difference !== undefined) {
        doc.text(`Différence: ${Number(cr.difference).toFixed(2)} CFA`);
      }
      if (cr.openTime) {
        doc.text(`Ouverture: ${new Date(cr.openTime).toLocaleString('fr-FR')}`);
      }
      if (cr.closeTime) {
        doc.text(`Fermeture: ${new Date(cr.closeTime).toLocaleString('fr-FR')}`);
      }

      doc.moveDown(1);

      // Transactions
      if (cr.transactions && cr.transactions.length > 0) {
        doc.fontSize(12).text('Transactions:', { underline: true });
        doc.moveDown(0.3);
        
        cr.transactions.forEach((tx: any) => {
          const txTypeLabels: Record<string, string> = {
            OPENING: 'Ouverture',
            CLOSING: 'Fermeture',
            CASH_SALE: 'Vente espèces',
            CASH_RETURN: 'Retour',
            CASH_IN: 'Entrée de fonds',
            CASH_OUT: 'Sortie de fonds',
            RECONCILIATION: 'Réconciliation',
          };
          
          const txType = txTypeLabels[tx.type] || tx.type;
          const amount = Number(tx.amount);
          const amountStr = amount >= 0 
            ? `+${amount.toFixed(2)} CFA`
            : `${amount.toFixed(2)} CFA`;
          
          doc.fontSize(9);
          doc.text(
            `${new Date(tx.createdAt).toLocaleString('fr-FR')} - ${txType}: ${amountStr}`,
            { indent: 20 }
          );
          if (tx.description) {
            doc.text(tx.description, { indent: 30, continued: true });
          }
        });
      }
    });

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', async () => {
        this.logger.log(`PDF généré: ${filepath}`);
        
        try {
          // Vérifier que le fichier a bien été créé
          if (!fs.existsSync(filepath)) {
            reject(new Error('Le fichier PDF n\'a pas été créé'));
            return;
          }

          // Lire le fichier PDF
          const pdfBuffer = fs.readFileSync(filepath);
          
          // Créer un objet File-like pour Cloudinary
          const pdfFile: Express.Multer.File = {
            fieldname: 'file',
            originalname: filename,
            encoding: '7bit',
            mimetype: 'application/pdf',
            size: pdfBuffer.length,
            buffer: pdfBuffer,
            destination: '',
            filename: filename,
            path: filepath,
            stream: null as any,
          } as Express.Multer.File;

          // Uploader sur Cloudinary
          this.logger.log(`Upload de la réconciliation PDF sur Cloudinary...`);
          const cloudinaryUrl = await this.cloudinaryService.uploadFile(
            pdfFile,
            'documents',
          );
          
          this.logger.log(`Réconciliation PDF uploadée sur Cloudinary: ${cloudinaryUrl}`);

          // Supprimer le fichier local après l'upload
          try {
            fs.unlinkSync(filepath);
            this.logger.log(`Fichier local supprimé: ${filepath}`);
          } catch (deleteError) {
            this.logger.warn(`Impossible de supprimer le fichier local: ${deleteError}`);
          }
          
          // Retourner l'URL Cloudinary
          resolve(cloudinaryUrl);
        } catch (uploadError) {
          this.logger.error(`Erreur lors de l'upload sur Cloudinary: ${uploadError}`);
          // En cas d'erreur d'upload, retourner quand même le chemin local
          if (fs.existsSync(filepath)) {
            resolve(filepath);
          } else {
            reject(new Error(`Erreur lors de l'upload: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`));
          }
        }
      });
      stream.on('error', (error) => {
        this.logger.error('Erreur lors de l\'écriture du PDF:', error);
        reject(error);
      });
      
      doc.on('error', (error) => {
        this.logger.error('Erreur lors de la génération du PDF:', error);
        reject(error);
      });
    });
  }
}
