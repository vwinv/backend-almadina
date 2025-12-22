import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('api/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(@Body() createNotificationDto: CreateNotificationDto) {
    return this.notificationsService.create(createNotificationDto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)
  findAll(@Query('userId') userId?: string) {
    const userIdNumber = userId ? parseInt(userId, 10) : undefined;
    return this.notificationsService.findAll(userIdNumber);
  }

  @Get('unread/count')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)
  async countUnread(@Query('userId') userId: string) {
    const userIdNumber = parseInt(userId, 10);
    const count = await this.notificationsService.countUnread(userIdNumber);
    return { count };
  }

  @Patch(':id/read')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MANAGER)
  markAsRead(
    @Param('id', ParseIntPipe) id: number,
    @Query('userId') userId: string,
  ) {
    const userIdNumber = parseInt(userId, 10);
    return this.notificationsService.markAsRead(id, userIdNumber);
  }
}

