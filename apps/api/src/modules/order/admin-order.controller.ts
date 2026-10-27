import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  CurrentUser,
  RequirePermissions,
  type AuthUser,
} from '../identity/auth.access';
import {
  ListAdminOrdersQueryDto,
  UpdateOrderStatusDto,
  UpdateShipmentDto,
  type OrderView,
} from './order.dto';
import { OrderService } from './order.service';

@ApiTags('order-admin')
@ApiBearerAuth()
@Controller('admin/orders')
export class AdminOrderController {
  constructor(private readonly orders: OrderService) {}

  @Get()
  @RequirePermissions('order.view')
  @ApiOperation({ summary: 'List orders, optionally filtered by status' })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListAdminOrdersQueryDto
  ): Promise<OrderView[]> {
    return this.orders.listAdminOrders(user.tenantId, query);
  }

  @Patch(':id/status')
  @RequirePermissions('order.manage')
  @ApiOperation({ summary: 'Advance an order status (PAID via payment only)' })
  @ApiBody({ type: UpdateOrderStatusDto })
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto
  ): Promise<OrderView> {
    return this.orders.updateStatus(user.tenantId, id, dto.status);
  }

  @Patch(':id/shipment')
  @RequirePermissions('order.manage')
  @ApiOperation({ summary: 'Set courier/tracking and mark a packed order shipped' })
  @ApiBody({ type: UpdateShipmentDto })
  updateShipment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateShipmentDto
  ): Promise<OrderView> {
    return this.orders.updateShipment(user.tenantId, id, dto);
  }
}
