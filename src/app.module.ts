import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaService } from './prisma/prisma.service';
import { UploadModule } from './upload/upload.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { SubCategoriesModule } from './sub-categories/sub-categories.module';
import { PromotionsModule } from './promotions/promotions.module';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { FavoritesModule } from './favorites/favorites.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ShippingAddressesModule } from './shipping-addresses/shipping-addresses.module';
import { PaymentsModule } from './payments/payments.module';
import { InvoicesModule } from './invoices/invoices.module';
import { StatisticsModule } from './statistics/statistics.module';
import { DeliveryZonesModule } from './delivery-zones/delivery-zones.module';
import { DeliveryPersonsModule } from './delivery-persons/delivery-persons.module';
import { CashRegistersModule } from './cash-registers/cash-registers.module';
import { InventoryModule } from './inventory/inventory.module';
import { EmailModule } from './email/email.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    UploadModule,
    CategoriesModule,
    ProductsModule,
    SubCategoriesModule,
    PromotionsModule,
    UsersModule,
    NotificationsModule,
    OrdersModule,
    FavoritesModule,
    ReviewsModule,
    ShippingAddressesModule,
    PaymentsModule,
    InvoicesModule,
    StatisticsModule,
    DeliveryZonesModule,
    DeliveryPersonsModule,
    CashRegistersModule,
    InventoryModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
