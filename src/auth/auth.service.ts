import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
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
}

