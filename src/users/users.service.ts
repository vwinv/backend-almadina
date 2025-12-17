import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { NotificationService } from './services/notification.service';
import { generateRandomPassword } from '../utils/password-generator.util';
import { normalizePhoneNumber } from '../utils/phone-normalizer.util';
import { UserRole } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { CashRegisterStatus, CashRegisterTransactionType } from '../cash-registers/types/cash-register.types';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  async findAllCustomers(search?: string) {
    const where: any = {
      role: 'CUSTOMER',
    };

    if (search) {
      const normalizedSearch = normalizePhoneNumber(search);
      
      // Si la recherche est un numéro de téléphone (contient des chiffres)
      if (normalizedSearch && /^\d+$/.test(search.replace(/\s+/g, ''))) {
        // Rechercher par numéro normalisé
        const allCustomers = await this.prisma.user.findMany({
          where: {
            role: 'CUSTOMER',
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            createdAt: true,
            _count: {
              select: {
                orders: true,
              },
            },
          },
        });

        // Filtrer les clients dont le numéro normalisé contient le numéro recherché
        return allCustomers.filter(customer => {
          const customerNormalizedPhone = normalizePhoneNumber(customer.phone);
          return customerNormalizedPhone.includes(normalizedSearch) ||
                 customer.email?.toLowerCase().includes(search.toLowerCase()) ||
                 customer.firstName?.toLowerCase().includes(search.toLowerCase()) ||
                 customer.lastName?.toLowerCase().includes(search.toLowerCase());
        });
      } else {
        // Recherche normale (nom, email)
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ];
      }
    }

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        createdAt: true,
        _count: {
          select: {
            orders: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findCustomerByPhone(phone: string) {
    // Normaliser le numéro de téléphone recherché
    const normalizedPhone = normalizePhoneNumber(phone);
    
    if (!normalizedPhone) {
      return null;
    }

    // Récupérer tous les clients pour comparer les numéros normalisés
    // (car les numéros en base peuvent ne pas être normalisés)
    const customers = await this.prisma.user.findMany({
      where: {
        role: 'CUSTOMER',
        phone: {
          not: null,
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
      },
    });

    // Trouver le client dont le numéro normalisé correspond
    const customer = customers.find(c => {
      const customerNormalizedPhone = normalizePhoneNumber(c.phone);
      return customerNormalizedPhone === normalizedPhone;
    });

    return customer || null;
  }

  async createCustomer(data: { firstName: string; lastName: string; phone: string; email?: string }) {
    // Normaliser le numéro de téléphone avant de vérifier s'il existe
    const normalizedPhone = normalizePhoneNumber(data.phone);
    
    // Vérifier si un client avec ce numéro normalisé existe déjà
    const existingCustomer = await this.findCustomerByPhone(data.phone);
    if (existingCustomer) {
      throw new ConflictException('Un client avec ce numéro de téléphone existe déjà');
    }

    // Générer un email temporaire si non fourni
    const email = data.email || `customer_${Date.now()}@temp.com`;
    
    // Générer un mot de passe temporaire (hashé)
    const hashedPassword = await bcrypt.hash('temp123', 10);

    return this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: normalizedPhone, // Sauvegarder le numéro normalisé
        role: 'CUSTOMER',
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
      },
    });
  }

  /**
   * Liste tous les administrateurs
   */
  async findAllAdmins() {
    return this.prisma.user.findMany({
      where: {
        role: {
          in: [UserRole.ADMIN, UserRole.SUPER_ADMIN],
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Liste tous les managers avec leurs caisses
   */
  async findAllManagers() {
    const managers = await this.prisma.user.findMany({
      where: {
        role: UserRole.MANAGER,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        createdAt: true,
        cashRegisters: {
          where: {
            date: new Date(new Date().setHours(0, 0, 0, 0)),
          },
          select: {
            id: true,
            status: true,
            openingBalance: true,
            expectedBalance: true,
            actualBalance: true,
            closingBalance: true,
            difference: true,
            openTime: true,
            closeTime: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return managers.map(manager => ({
      ...manager,
      todayCashRegister: manager.cashRegisters[0] || null,
    }));
  }

  /**
   * Crée un utilisateur (admin ou manager) avec génération de mot de passe
   * et envoi de notifications (email et WhatsApp)
   */
  async createUser(createUserDto: CreateUserDto) {
    // Vérifier si l'email existe déjà
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà');
    }

    // Générer un mot de passe aléatoire
    const generatedPassword = generateRandomPassword(12);
    const hashedPassword = await bcrypt.hash(generatedPassword, 10);

    // Créer l'utilisateur
    const user = await this.prisma.user.create({
      data: {
        email: createUserDto.email,
        password: hashedPassword,
        firstName: createUserDto.firstName,
        lastName: createUserDto.lastName,
        phone: createUserDto.phone ? normalizePhoneNumber(createUserDto.phone) : null,
        role: createUserDto.role,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });

    // Envoyer les notifications (email et WhatsApp) de manière asynchrone
    // Ne pas bloquer la création si l'envoi échoue
    try {
      if (createUserDto.email) {
        await this.notificationService.sendCredentialsEmail(
          createUserDto.email,
          createUserDto.firstName,
          createUserDto.lastName,
          generatedPassword,
          createUserDto.role,
        );
      }

      if (createUserDto.phone) {
        await this.notificationService.sendCredentialsWhatsApp(
          createUserDto.phone,
          createUserDto.firstName,
          createUserDto.lastName,
          generatedPassword,
          createUserDto.role,
        );
      }
    } catch (error) {
      // Logger l'erreur mais ne pas faire échouer la création
      console.error('Erreur lors de l\'envoi des notifications:', error);
    }

    // Si c'est un manager, créer automatiquement une caisse fermée
    if (createUserDto.role === UserRole.MANAGER) {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Vérifier qu'il n'y a pas déjà une caisse pour aujourd'hui
        const existingCashRegister = await (this.prisma as any).cashRegister.findFirst({
          where: {
            userId: user.id,
            date: today,
          },
        });

        if (!existingCashRegister) {
          // Créer une caisse fermée avec un solde d'ouverture de 0
          await (this.prisma as any).cashRegister.create({
            data: {
              userId: user.id,
              date: today,
              status: CashRegisterStatus.CLOSED,
              openingBalance: new Decimal(0),
            },
          });
        }
      } catch (error) {
        // Logger l'erreur mais ne pas faire échouer la création de l'utilisateur
        console.error('Erreur lors de la création de la caisse:', error);
      }
    }

    return {
      user,
      generatedPassword, // Retourner le mot de passe pour l'admin (à supprimer après affichage)
    };
  }

  /**
   * Trouve un utilisateur par son ID
   */
  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new ConflictException('Utilisateur introuvable');
    }

    return user;
  }

  /**
   * Trouve un utilisateur avec son historique de caisses (si manager)
   */
  async findOneWithCashRegisters(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new ConflictException('Utilisateur introuvable');
    }

    // Si c'est un manager, récupérer l'historique des caisses et la caisse d'aujourd'hui
    if (user.role === UserRole.MANAGER) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayCashRegister = await (this.prisma as any).cashRegister.findFirst({
        where: {
          userId: id,
          date: today,
        },
        select: {
          id: true,
          date: true,
          status: true,
          openingBalance: true,
          expectedBalance: true,
          actualBalance: true,
          closingBalance: true,
          difference: true,
          openTime: true,
          closeTime: true,
          createdAt: true,
          transactions: {
            orderBy: {
              createdAt: 'desc',
            },
            select: {
              id: true,
              type: true,
              amount: true,
              description: true,
              createdAt: true,
            },
          },
        },
      });

      const cashRegisters = await (this.prisma as any).cashRegister.findMany({
        where: {
          userId: id,
        },
        orderBy: {
          date: 'desc',
        },
        select: {
          id: true,
          date: true,
          status: true,
          openingBalance: true,
          expectedBalance: true,
          actualBalance: true,
          closingBalance: true,
          difference: true,
          openTime: true,
          closeTime: true,
          createdAt: true,
          transactions: {
            orderBy: {
              createdAt: 'asc',
            },
            select: {
              id: true,
              type: true,
              amount: true,
              description: true,
              createdAt: true,
            },
          },
        },
      });

      return {
        ...user,
        cashRegisters,
        todayCashRegister: todayCashRegister || null, // S'assurer que c'est null et non undefined
      };
    }

    return user;
  }

  /**
   * Met à jour un utilisateur
   */
  async update(id: number, updateUserDto: { firstName?: string; lastName?: string; email?: string; phone?: string }) {
    // Vérifier si l'utilisateur existe
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new ConflictException('Utilisateur introuvable');
    }

    // Si l'email change, vérifier qu'il n'existe pas déjà
    if (updateUserDto.email && updateUserDto.email !== existingUser.email) {
      const emailExists = await this.prisma.user.findUnique({
        where: { email: updateUserDto.email },
      });

      if (emailExists) {
        throw new ConflictException('Un utilisateur avec cet email existe déjà');
      }
    }

    // Mettre à jour l'utilisateur
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        ...(updateUserDto.firstName && { firstName: updateUserDto.firstName }),
        ...(updateUserDto.lastName && { lastName: updateUserDto.lastName }),
        ...(updateUserDto.email && { email: updateUserDto.email }),
        ...(updateUserDto.phone !== undefined && { phone: updateUserDto.phone ? normalizePhoneNumber(updateUserDto.phone) : null }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  /**
   * Supprime un utilisateur
   */
  async remove(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new ConflictException('Utilisateur introuvable');
    }

    await this.prisma.user.delete({
      where: { id },
    });

    return { message: 'Utilisateur supprimé avec succès' };
  }

  /**
   * Crée une caisse pour un gestionnaire existant qui n'en a pas
   */
  async createCashRegisterForManager(userId: number, openingBalance: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new ConflictException('Utilisateur introuvable');
    }

    if (user.role !== UserRole.MANAGER) {
      throw new ConflictException('Seuls les gestionnaires peuvent avoir une caisse');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Vérifier qu'il n'y a pas déjà une caisse pour aujourd'hui
    const existingCashRegister = await (this.prisma as any).cashRegister.findFirst({
      where: {
        userId,
        date: today,
      },
    });

    if (existingCashRegister) {
      throw new ConflictException('Une caisse existe déjà pour ce gestionnaire aujourd\'hui');
    }

    // Si le solde d'ouverture n'est pas fourni (0), récupérer le dernier solde réel de caisse fermée
    let finalOpeningBalance = openingBalance;
    if (openingBalance === 0) {
      const lastClosedCashRegister = await (this.prisma as any).cashRegister.findFirst({
        where: {
          userId,
          status: CashRegisterStatus.CLOSED,
          OR: [
            { actualBalance: { not: null } },
            { closingBalance: { not: null } },
          ],
        },
        orderBy: {
          date: 'desc',
        },
        select: {
          actualBalance: true,
          closingBalance: true,
        },
      });

      if (lastClosedCashRegister) {
        // Utiliser actualBalance en priorité, sinon closingBalance
        const lastBalance = lastClosedCashRegister.actualBalance || lastClosedCashRegister.closingBalance;
        if (lastBalance) {
          finalOpeningBalance = Number(lastBalance);
        }
      }
    }

    // Créer une caisse fermée avec le solde d'ouverture spécifié ou le dernier solde
    // Note: openTime est obligatoire dans le schéma, on utilise la date d'aujourd'hui
    const now = new Date();
    const cashRegister = await (this.prisma as any).cashRegister.create({
      data: {
        userId,
        date: today,
        openTime: now,
        closeTime: now, // Fermée immédiatement
        status: CashRegisterStatus.CLOSED,
        openingBalance: new Decimal(finalOpeningBalance),
      },
    });

    return cashRegister;
  }

  /**
   * Met à jour le solde d'ouverture d'une caisse
   */
  async updateCashRegisterOpeningBalance(userId: number, cashRegisterId: number, openingBalance: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new ConflictException('Utilisateur introuvable');
    }

    if (user.role !== UserRole.MANAGER) {
      throw new ConflictException('Seuls les gestionnaires peuvent avoir une caisse');
    }

    const cashRegister = await (this.prisma as any).cashRegister.findUnique({
      where: { id: cashRegisterId },
    });

    if (!cashRegister) {
      throw new ConflictException('Caisse introuvable');
    }

    if (cashRegister.userId !== userId) {
      throw new ConflictException('Cette caisse n\'appartient pas à ce gestionnaire');
    }

    // Mettre à jour le solde d'ouverture
    const updatedCashRegister = await (this.prisma as any).cashRegister.update({
      where: { id: cashRegisterId },
      data: {
        openingBalance: new Decimal(openingBalance),
      },
    });

    return updatedCashRegister;
  }
}

