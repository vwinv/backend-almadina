import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { GoogleCallbackDto } from './dto/google-callback.dto';
import { FacebookCallbackDto } from './dto/facebook-callback.dto';
import { MicrosoftCallbackDto } from './dto/microsoft-callback.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(emailOrPhone: string, password: string, requireAdmin: boolean = false) {
    // Déterminer si c'est un email ou un téléphone
    const isEmail = emailOrPhone.includes('@');
    
    let user;
    if (isEmail) {
      // Rechercher par email
      user = await this.prisma.user.findUnique({
        where: { email: emailOrPhone },
      });
    } else {
      // Rechercher par téléphone
      user = await (this.prisma.user as any).findFirst({
        where: { phone: emailOrPhone },
      });
    }

    if (!user) {
      throw new UnauthorizedException('Email/Téléphone ou mot de passe incorrect');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Email/Téléphone ou mot de passe incorrect');
    }

    // Vérifier que l'utilisateur est admin, super admin ou manager si requis
    if (requireAdmin && user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.MANAGER) {
      throw new UnauthorizedException('Accès refusé. Seuls les administrateurs, super administrateurs et gestionnaires peuvent accéder à cette section.');
    }

    const { password: _, ...result } = user;
    return result;
  }

  async login(loginDto: LoginDto, requireAdmin: boolean = false) {
    const user = await this.validateUser(loginDto.emailOrPhone, loginDto.password, requireAdmin);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  async adminLogin(adminLoginDto: AdminLoginDto) {
    // Pour l'admin, on utilise uniquement l'email
    const user = await this.validateUser(adminLoginDto.email, adminLoginDto.password, true);

    // Vérifier que l'utilisateur est ADMIN ou SUPER_ADMIN (pas MANAGER)
    if (user.role === UserRole.MANAGER) {
      throw new UnauthorizedException('Accès refusé. Les gestionnaires ne peuvent pas accéder à l\'espace admin.');
    }

    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new UnauthorizedException('Accès refusé. Seuls les administrateurs et super administrateurs peuvent accéder à cette section.');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  async caisseLogin(adminLoginDto: AdminLoginDto) {
    // Pour la caisse, on utilise uniquement l'email
    const user = await this.validateUser(adminLoginDto.email, adminLoginDto.password, true);

    // Vérifier que l'utilisateur est UNIQUEMENT un MANAGER (pas ADMIN ou SUPER_ADMIN)
    if (user.role !== UserRole.MANAGER) {
      throw new UnauthorizedException('Accès refusé. Seuls les gestionnaires peuvent accéder à la caisse.');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  async register(registerDto: RegisterDto) {
    // Vérifier si l'email existe déjà (si fourni)
    if (registerDto.email && registerDto.email.trim().length > 0) {
      const existingUserByEmail = await this.prisma.user.findUnique({
        where: { email: registerDto.email },
      });

      if (existingUserByEmail) {
        throw new BadRequestException('Cet email est déjà utilisé');
      }
    }

    // Vérifier si le téléphone existe déjà
    const existingUserByPhone = await (this.prisma.user as any).findFirst({
      where: { phone: registerDto.phone },
    });

    if (existingUserByPhone) {
      throw new BadRequestException('Ce numéro de téléphone est déjà utilisé');
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Créer l'utilisateur avec le rôle CUSTOMER
    const user = await (this.prisma.user as any).create({
      data: {
        email: registerDto.email ?? null,
        phone: registerDto.phone,
        password: hashedPassword,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        role: 'CUSTOMER',
      },
    });

    // Générer le token JWT
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  async updateProfile(userId: number, updateProfileDto: UpdateProfileDto) {
    const updateData: any = {};
    
    if (updateProfileDto.firstName !== undefined) {
      updateData.firstName = updateProfileDto.firstName;
    }
    
    if (updateProfileDto.lastName !== undefined) {
      updateData.lastName = updateProfileDto.lastName;
    }
    
    if (updateProfileDto.email !== undefined) {
      // Vérifier si l'email existe déjà pour un autre utilisateur
      if (updateProfileDto.email && updateProfileDto.email.trim().length > 0) {
        const existingUser = await this.prisma.user.findUnique({
          where: { email: updateProfileDto.email },
        });
        if (existingUser && existingUser.id !== userId) {
          throw new BadRequestException('Cet email est déjà utilisé');
        }
        updateData.email = updateProfileDto.email.trim() || null;
      } else {
        updateData.email = null;
      }
    }
    
    if (updateProfileDto.phone !== undefined) {
      // Vérifier si le téléphone existe déjà pour un autre utilisateur
      if (updateProfileDto.phone && updateProfileDto.phone.trim().length > 0) {
        const existingUser = await (this.prisma.user as any).findFirst({
          where: { phone: updateProfileDto.phone, id: { not: userId } },
        });
        if (existingUser) {
          throw new BadRequestException('Ce numéro de téléphone est déjà utilisé');
        }
        updateData.phone = updateProfileDto.phone.trim();
      } else {
        updateData.phone = null;
      }
    }
    
    if (updateProfileDto.profilePicture !== undefined) {
      updateData.profilePicture = updateProfileDto.profilePicture;
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    const { password: _, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  async googleAuth(googleCallbackDto: GoogleCallbackDto) {
    try {
      // Décoder le token Google (JWT) sans vérification complète (à améliorer avec google-auth-library)
      const tokenParts = googleCallbackDto.credential.split('.');
      if (tokenParts.length !== 3) {
        throw new UnauthorizedException('Token Google invalide');
      }

      // Décoder le payload (partie 2 du JWT)
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
      
      // Vérifier que le token contient les informations nécessaires
      if (!payload.email || !payload.sub) {
        throw new UnauthorizedException('Token Google invalide: informations manquantes');
      }

      // Vérifier si l'utilisateur existe déjà avec cet email
      let user = await this.prisma.user.findUnique({
        where: { email: payload.email },
      });

      if (!user) {
        // Créer un nouvel utilisateur avec Google
        // Générer un mot de passe aléatoire (l'utilisateur n'en aura pas besoin pour se connecter via Google)
        const randomPassword = Math.random().toString(36).slice(-16);
        const hashedPassword = await bcrypt.hash(randomPassword, 10);

        // Extraire le prénom et nom depuis le payload Google
        const firstName = payload.given_name || payload.name?.split(' ')[0] || 'Utilisateur';
        const lastName = payload.family_name || payload.name?.split(' ').slice(1).join(' ') || 'Google';

        // Créer l'utilisateur dans la base de données
        try {
          user = await this.prisma.user.create({
            data: {
              email: payload.email,
              password: hashedPassword, // Mot de passe aléatoire car l'utilisateur se connectera via Google
              firstName: firstName,
              lastName: lastName,
              role: UserRole.CUSTOMER,
              profilePicture: payload.picture || null,
              phone: null, // Pas de téléphone car Google ne fournit pas cette information
            },
          });
          console.log(`Utilisateur Google créé avec succès: ${user.email}`);
        } catch (createError: any) {
          console.error('Erreur lors de la création de l\'utilisateur Google:', createError);
          // Si l'email existe déjà (conflit), essayer de le récupérer
          if (createError.code === 'P2002' && createError.meta?.target?.includes('email')) {
            user = await this.prisma.user.findUnique({
              where: { email: payload.email },
            });
            if (!user) {
              throw new BadRequestException('Erreur lors de la création de l\'utilisateur');
            }
          } else {
            throw new BadRequestException('Erreur lors de la création de l\'utilisateur: ' + createError.message);
          }
        }
      } else {
        // Utilisateur existe déjà, mettre à jour la photo de profil si elle a changé
        if (payload.picture && user.profilePicture !== payload.picture) {
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: { profilePicture: payload.picture },
          });
        }
      }

      // Générer le token JWT pour notre application
      const jwtPayload: JwtPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
      };

      return {
        access_token: this.jwtService.sign(jwtPayload),
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profilePicture: user.profilePicture,
          role: user.role,
        },
      };
    } catch (error) {
      console.error('Erreur authentification Google:', error);
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      throw new UnauthorizedException('Erreur lors de l\'authentification Google');
    }
  }

  async facebookAuth(facebookCallbackDto: FacebookCallbackDto) {
    try {
      // Vérifier que les informations nécessaires sont présentes
      if (!facebookCallbackDto.userId || !facebookCallbackDto.accessToken) {
        throw new UnauthorizedException('Token Facebook invalide: informations manquantes');
      }

      // Note: En production, vous devriez vérifier le token Facebook avec l'API Facebook
      // Pour l'instant, on fait confiance au token fourni par le client
      // Vous pouvez ajouter une vérification avec: https://graph.facebook.com/me?access_token={accessToken}

      // Extraire le nom et prénom du nom complet
      const nameParts = facebookCallbackDto.name?.split(' ') || [];
      const firstName = nameParts[0] || 'Utilisateur';
      const lastName = nameParts.slice(1).join(' ') || 'Facebook';

      // Si l'email n'est pas fourni, générer un email temporaire basé sur l'ID Facebook
      // Note: Facebook peut ne pas fournir l'email si l'utilisateur ne l'a pas partagé
      const email = facebookCallbackDto.email || `facebook_${facebookCallbackDto.userId}@facebook.local`;

      // Vérifier si l'utilisateur existe déjà avec cet email
      let user = await this.prisma.user.findUnique({
        where: { email },
      });

      // Si l'utilisateur n'existe pas avec l'email, vérifier s'il existe avec le même ID Facebook
      // (Nous pourrions ajouter un champ facebookId dans le schéma Prisma pour une meilleure gestion)
      if (!user) {
        // Créer un nouvel utilisateur avec Facebook
        // Générer un mot de passe aléatoire (l'utilisateur n'en aura pas besoin pour se connecter via Facebook)
        const randomPassword = Math.random().toString(36).slice(-16);
        const hashedPassword = await bcrypt.hash(randomPassword, 10);

        // Créer l'utilisateur dans la base de données
        try {
          user = await this.prisma.user.create({
            data: {
              email,
              password: hashedPassword, // Mot de passe aléatoire car l'utilisateur se connectera via Facebook
              firstName,
              lastName,
              role: UserRole.CUSTOMER,
              profilePicture: facebookCallbackDto.picture || null,
              phone: null, // Pas de téléphone car Facebook ne fournit pas cette information par défaut
            },
          });
          console.log(`Utilisateur Facebook créé avec succès: ${user.email}`);
        } catch (createError: any) {
          console.error('Erreur lors de la création de l\'utilisateur Facebook:', createError);
          // Si l'email existe déjà (conflit), essayer de le récupérer
          if (createError.code === 'P2002' && createError.meta?.target?.includes('email')) {
            user = await this.prisma.user.findUnique({
              where: { email },
            });
            if (!user) {
              throw new BadRequestException('Erreur lors de la création de l\'utilisateur');
            }
          } else {
            throw new BadRequestException('Erreur lors de la création de l\'utilisateur: ' + createError.message);
          }
        }
      } else {
        // Utilisateur existe déjà, mettre à jour la photo de profil si elle a changé
        if (facebookCallbackDto.picture && user.profilePicture !== facebookCallbackDto.picture) {
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: { profilePicture: facebookCallbackDto.picture },
          });
        }
      }

      // Générer le token JWT pour notre application
      const jwtPayload: JwtPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
      };

      return {
        access_token: this.jwtService.sign(jwtPayload),
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profilePicture: user.profilePicture,
          role: user.role,
        },
      };
    } catch (error) {
      console.error('Erreur authentification Facebook:', error);
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      throw new UnauthorizedException('Erreur lors de l\'authentification Facebook');
    }
  }

  async microsoftAuth(microsoftCallbackDto: MicrosoftCallbackDto, targetRole: UserRole) {
    try {
      // Vérifier que les informations nécessaires sont présentes
      if (!microsoftCallbackDto.userId || !microsoftCallbackDto.accessToken) {
        throw new UnauthorizedException('Token Microsoft invalide: informations manquantes');
      }

      // Note: En production, vous devriez vérifier le token Microsoft avec l'API Microsoft Graph
      // Pour l'instant, on fait confiance au token fourni par le client
      // Vous pouvez ajouter une vérification avec: https://graph.microsoft.com/v1.0/me

      // Extraire les informations utilisateur
      const email = microsoftCallbackDto.email;
      if (!email) {
        throw new UnauthorizedException('Email Microsoft manquant');
      }

      const firstName = microsoftCallbackDto.firstName || microsoftCallbackDto.name?.split(' ')[0] || 'Utilisateur';
      const lastName = microsoftCallbackDto.lastName || microsoftCallbackDto.name?.split(' ').slice(1).join(' ') || 'Microsoft';

      // Vérifier si l'utilisateur existe déjà avec cet email
      let user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Créer un nouvel utilisateur avec Microsoft
        // Générer un mot de passe aléatoire (l'utilisateur n'en aura pas besoin pour se connecter via Microsoft)
        const randomPassword = Math.random().toString(36).slice(-16);
        const hashedPassword = await bcrypt.hash(randomPassword, 10);

        try {
          user = await this.prisma.user.create({
            data: {
              email,
              password: hashedPassword,
              firstName,
              lastName,
              role: targetRole, // ADMIN pour admin, MANAGER pour caisse
              profilePicture: microsoftCallbackDto.picture || null,
              phone: null,
            },
          });
          console.log(`Utilisateur Microsoft créé avec succès (${targetRole}): ${user.email}`);
        } catch (createError: any) {
          console.error('Erreur lors de la création de l\'utilisateur Microsoft:', createError);
          if (createError.code === 'P2002' && createError.meta?.target?.includes('email')) {
            user = await this.prisma.user.findUnique({
              where: { email },
            });
            if (!user) {
              throw new BadRequestException('Erreur lors de la création de l\'utilisateur');
            }
          } else {
            throw new BadRequestException('Erreur lors de la création de l\'utilisateur: ' + createError.message);
          }
        }
      } else {
        // Vérifier que le rôle de l'utilisateur existant correspond au rôle attendu
        if (user.role !== targetRole) {
          throw new UnauthorizedException(
            targetRole === UserRole.ADMIN
              ? 'Cet utilisateur n\'a pas les droits d\'administrateur'
              : 'Cet utilisateur n\'a pas les droits de gestionnaire'
          );
        }

        // Mettre à jour la photo de profil si elle a changé
        if (microsoftCallbackDto.picture && user.profilePicture !== microsoftCallbackDto.picture) {
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: { profilePicture: microsoftCallbackDto.picture },
          });
        }
      }

      // Générer le token JWT pour notre application
      const jwtPayload: JwtPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
      };

      return {
        access_token: this.jwtService.sign(jwtPayload),
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profilePicture: user.profilePicture,
          role: user.role,
        },
      };
    } catch (error) {
      console.error('Erreur authentification Microsoft:', error);
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      throw new UnauthorizedException('Erreur lors de l\'authentification Microsoft');
    }
  }
}

