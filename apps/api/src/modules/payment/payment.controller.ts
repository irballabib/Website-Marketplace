import { Body, Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CatalogService } from '../catalog/catalog.service';
import {
  CurrentUser,
  Public,
  RequirePermissions,
  type AuthUser,
} from '../identity/auth.access';
import {
  CreatePaymentDto,
  WebhookBodyDto,
  normalizeWebhook,
  type PaymentView,
} from './payment.dto';
import { PaymentService } from './payment.service';

@ApiTags('payment')
@Controller('payments')
export class PaymentController {
  constructor(
    private readonly payments: PaymentService,
    private readonly catalog: CatalogService
  ) {}

  @Post()
  @ApiBearerAuth()
  @RequirePermissions('order.manage')
  @ApiOperation({ summary: 'Create a payment (accepts Idempotency-Key)' })
  @ApiBody({ type: CreatePaymentDto })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string
  ): Promise<PaymentView> {
    return this.payments.createPayment(user.tenantId, dto, idempotencyKey, user.id);
  }

  @Get(':id')
  @ApiBearerAuth()
  @RequirePermissions('order.view')
  @ApiOperation({ summary: 'Get a payment by id' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<PaymentView> {
    return this.payments.getPayment(user.tenantId, id);
  }

  @Post('order/:orderId')
  @Public()
  @ApiOperation({ summary: 'Create or reuse a payment for an online order' })
  @ApiHeader({ name: 'X-Tenant-Code', required: false })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  createForOrder(
    @Param('orderId') orderId: string,
    @Headers('x-tenant-code') tenantCode?: string,
    @Headers('idempotency-key') idempotencyKey?: string
  ): Promise<PaymentView> {
    return this.catalog
      .resolveTenantId(tenantCode)
      .then((tenantId) => this.payments.createOrderPayment(tenantId, orderId, idempotencyKey));
  }

  @Post('webhook/midtrans')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Payment webhook with signature verification and idempotency' })
  @ApiBody({ type: WebhookBodyDto })
  webhook(@Body() body: unknown): Promise<{ payment: PaymentView; updated: boolean }> {
    return this.payments.handleWebhook(normalizeWebhook(body));
  }
}
