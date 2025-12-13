import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('api/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('customers')
  findAll(@Query('search') search?: string) {
    return this.usersService.findAllCustomers(search);
  }

  @Get('customers/search-by-phone')
  findByPhone(@Query('phone') phone: string) {
    return this.usersService.findCustomerByPhone(phone);
  }

  @Post('customers')
  create(@Body() createCustomerDto: { firstName: string; lastName: string; phone: string; email?: string }) {
    return this.usersService.createCustomer(createCustomerDto);
  }
}

