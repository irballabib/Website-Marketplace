import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      cache: true,
    }),
    HealthModule,
    // Modules will be added here in Fase 1+
    // IdentityModule,
    // CatalogModule,
    // InventoryModule,
    // OrderModule,
    // PosModule,
    // BookingModule,
    // PaymentModule,
    // ProductionModule,
    // AccountingModule,
    // NotificationModule,
    // ReportingModule,
    // PlatformModule,
  ],
})
export class AppModule {}