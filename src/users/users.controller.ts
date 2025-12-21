import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Query,
  Param,
  Put,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateCashRegisterDto } from './dto/create-cash-register.dto';

@Controller('api/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('customers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)
  findAll(@Query('search') search?: string) {
    return this.usersService.findAllCustomers(search);
  }

  @Get('customers/search-by-phone')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)
  findByPhone(@Query('phone') phone: string) {
    return this.usersService.findCustomerByPhone(phone);
  }

  @Get('customers/search')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)
  findByPhoneOrEmail(@Query('q') search: string) {
    return this.usersService.findCustomerByPhoneOrEmail(search);
  }

  @Post('customers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)
  create(@Body() createCustomerDto: { firstName: string; lastName: string; phone: string; email: string }) {
    return this.usersService.createCustomer(createCustomerDto);
  }

  @Put('customers/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)
  updateCustomer(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCustomerDto: { firstName?: string; lastName?: string; phone?: string; email?: string },
  ) {
    return this.usersService.updateCustomer(id, updateCustomerDto);
  }

  /**
   * Liste tous les administrateurs
   */
  @Get('admins')
  findAllAdmins() {
    return this.usersService.findAllAdmins();
  }

  /**
   * Liste tous les managers avec leurs caisses
   */
  @Get('managers')
  findAllManagers() {
    return this.usersService.findAllManagers();
  }

  /**
   * Trouve un utilisateur par son ID (avec historique des caisses si manager)
   * DOIT être après les routes spécifiques pour éviter les conflits
   */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOneWithCashRegisters(id);
  }

  /**
   * Crée un utilisateur (admin ou manager) avec génération de mot de passe
   */
  @Post()
  createUser(@Body() createUserDto: CreateUserDto) {
    return this.usersService.createUser(createUserDto);
  }

  /**
   * Met à jour un utilisateur
   */
  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  /**
   * Supprime un utilisateur
   */
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.remove(id);
  }

  /**
   * Crée une caisse pour un gestionnaire existant
   */
  @Post(':id/cash-register')
  createCashRegisterForManager(
    @Param('id', ParseIntPipe) id: number,
    @Body() createCashRegisterDto: CreateCashRegisterDto,
  ) {
    return this.usersService.createCashRegisterForManager(id, createCashRegisterDto.openingBalance);
  }

  /**
   * Met à jour le solde d'ouverture d'une caisse
   */
  @Post(':id/cash-register/:cashRegisterId/opening-balance')
  updateCashRegisterOpeningBalance(
    @Param('id', ParseIntPipe) userId: number,
    @Param('cashRegisterId', ParseIntPipe) cashRegisterId: number,
    @Body() updateBalanceDto: { openingBalance: number },
  ) {
    return this.usersService.updateCashRegisterOpeningBalance(userId, cashRegisterId, updateBalanceDto.openingBalance);
  }
}

