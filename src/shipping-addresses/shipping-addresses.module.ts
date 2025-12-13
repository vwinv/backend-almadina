import { Module } from '@nestjs/common';
import { ShippingAddressesService } from './shipping-addresses.service';
import { ShippingAddressesController } from './shipping-addresses.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [ShippingAddressesController],
  providers: [ShippingAddressesService, PrismaService],
  exports: [ShippingAddressesService],
})
export class ShippingAddressesModule {}

