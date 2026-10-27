import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CatalogModule } from '../catalog/catalog.module';
import { OrderModule } from '../order/order.module';
import { DevPaymentController } from './dev-payment.controller';
import { PaymentController } from './payment.controller';
import {
  MidtransPaymentGateway,
  MockPaymentGateway,
  PAYMENT_ADAPTER,
  type PaymentGateway,
} from './payment.gateway';
import { PaymentService } from './payment.service';

@Module({
  imports: [CatalogModule, OrderModule],
  controllers: [PaymentController, DevPaymentController],
  providers: [
    PaymentService,
    {
      provide: PAYMENT_ADAPTER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PaymentGateway => {
        const adapter = (config.get<string>('PAYMENT_ADAPTER') ?? 'mock').trim().toLowerCase();

        if (adapter === 'mock') {
          return new MockPaymentGateway(config);
        }

        if (adapter === 'midtrans') {
          return new MidtransPaymentGateway(config);
        }

        throw new Error(
          `PAYMENT_ADAPTER "${adapter}" is not implemented. Use "mock" or "midtrans".`
        );
      },
    },
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
