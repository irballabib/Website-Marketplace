import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { BookingModule } from './modules/booking/booking.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { IdentityModule } from './modules/identity/identity.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { OrderModule } from './modules/order/order.module';
import { PaymentModule } from './modules/payment/payment.module';
import { PosModule } from './modules/pos/pos.module';
import { QrModule } from './modules/qr/qr.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      cache: true,
    }),
    HealthModule,
    PrismaModule,
    IdentityModule,
    InventoryModule,
    CatalogModule,
    OrderModule,
    PaymentModule,
    PosModule,
    QrModule,
    BookingModule,
    AccountingModule,
    // ProductionModule,
    // AccountingModule,
    // NotificationModule,
    // ReportingModule,
    // PlatformModule,
  ],
})
export class AppModule {}