import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../identity/auth.access';
import { CatalogService } from '../catalog/catalog.service';
import { CreateOrderDto, type OrderView } from './order.dto';
import { OrderService } from './order.service';

@ApiTags('order')
@Controller('orders')
export class OrderController {
  constructor(
    private readonly orders: OrderService,
    private readonly catalog: CatalogService
  ) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Create an online order and reserve stock for 15 minutes' })
  @ApiHeader({ name: 'X-Tenant-Code', required: false })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiBody({ type: CreateOrderDto })
  async create(
    @Body() dto: CreateOrderDto,
    @Headers('x-tenant-code') tenantCode?: string,
    @Headers('idempotency-key') idempotencyKey?: string
  ): Promise<OrderView> {
    const tenantId = await this.catalog.resolveTenantId(tenantCode);
    return this.orders.createOrder(tenantId, dto, idempotencyKey);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get an order by id' })
  @ApiHeader({ name: 'X-Tenant-Code', required: false })
  async get(
    @Param('id') id: string,
    @Headers('x-tenant-code') tenantCode?: string
  ): Promise<OrderView> {
    const tenantId = await this.catalog.resolveTenantId(tenantCode);
    return this.orders.getOrder(tenantId, id);
  }
}

@ApiTags('order-dev')
@Controller('dev/orders')
export class DevOrderController {
  constructor(
    private readonly orders: OrderService,
    private readonly config: ConfigService
  ) {}

  @Post('expire')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Expire overdue unpaid orders (development only)' })
  async expire(): Promise<{ expired: number }> {
    const env = this.config.get<string>('NODE_ENV') ?? 'development';

    if (env !== 'development') {
      throw new NotFoundException({
        code: 'DEV_ENDPOINT_DISABLED',
        message: 'Endpoint simulasi hanya aktif pada NODE_ENV=development',
      });
    }

    return { expired: await this.orders.expireOverdueOrders() };
  }
}
