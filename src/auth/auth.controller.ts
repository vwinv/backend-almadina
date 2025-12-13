import { Controller, Post, Body, UseGuards, Get, Patch } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('admin/login')
  async adminLogin(@Body() adminLoginDto: AdminLoginDto) {
    return this.authService.adminLogin(adminLoginDto);
  }

  @Post('customer/login')
  async customerLogin(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto, false);
  }

  @Post('customer/register')
  async customerRegister(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Get('admin/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getAdminProfile(@CurrentUser() user: any) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };
  }

  @Get('customer/me')
  @UseGuards(JwtAuthGuard)
  async getCustomerProfile(@CurrentUser() user: any) {
    // Vérifier que l'utilisateur est un client
    if (user.role !== UserRole.CUSTOMER) {
      throw new Error('Accès refusé. Cette route est réservée aux clients.');
    }
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      profilePicture: user.profilePicture,
      role: user.role,
    };
  }

  @Patch('customer/profile')
  @UseGuards(JwtAuthGuard)
  async updateCustomerProfile(
    @CurrentUser() user: any,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    // Vérifier que l'utilisateur est un client
    if (user.role !== UserRole.CUSTOMER) {
      throw new Error('Accès refusé. Cette route est réservée aux clients.');
    }
    const updatedUser = await this.authService.updateProfile(user.id, updateProfileDto);
    return {
      id: updatedUser.id,
      email: updatedUser.email,
      phone: updatedUser.phone,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      profilePicture: updatedUser.profilePicture,
      role: updatedUser.role,
    };
  }
}

