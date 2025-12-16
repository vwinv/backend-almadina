import { Module } from '@nestjs/common';
import { CashRegistersService } from './cash-registers.service';
import { CashRegistersController } from './cash-registers.controller';
import { CashRegistersSchedulerService } from './cash-registers-scheduler.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [AuthModule, UploadModule],
  controllers: [CashRegistersController],
  providers: [CashRegistersService, CashRegistersSchedulerService, PrismaService],
  exports: [CashRegistersService],
})
export class CashRegistersModule {}
