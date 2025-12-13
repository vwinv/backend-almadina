import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentsController } from './payments.controller';
import { PayDunyaService } from './paydunya.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [ConfigModule],
  controllers: [PaymentsController],
  providers: [PayDunyaService, PrismaService],
  exports: [PayDunyaService],
})
export class PaymentsModule {}

