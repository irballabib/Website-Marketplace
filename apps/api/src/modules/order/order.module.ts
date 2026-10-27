import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module';
import { AccountingModule } from '../accounting/accounting.module';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationModule } from '../notification/notification.module';
import { AdminOrderController } from './admin-order.controller';
import { DevOrderController, OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [CatalogModule, InventoryModule, NotificationModule, AccountingModule],
  controllers: [OrderController, AdminOrderController, DevOrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
