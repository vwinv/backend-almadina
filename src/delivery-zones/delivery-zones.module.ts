import { Module } from '@nestjs/common';
import { DeliveryZonesService } from './delivery-zones.service';
import { DeliveryZonesController } from './delivery-zones.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [DeliveryZonesController],
  providers: [DeliveryZonesService, PrismaService],
  exports: [DeliveryZonesService],
})
export class DeliveryZonesModule {}

