import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Payment } from '@prisma/client';
import Decimal from 'decimal.js';

import { generateUuidV7 } from '../../common/id';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrderService } from '../order/order.service';
import { PAYMENT_WEBHOOK_IDEMPOTENCY_TTL_DAYS } from './payment.constant';
import type { CreatePaymentInput, PaymentView } from './payment.dto';
import {
  PAYMENT_ADAPTER,
  type PaymentGateway,
  type PaymentStatus,
  type WebhookPayload,
} from './payment.gateway';

const ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: ['PAID', 'FAILED', 'EXPIRED'],
  PAID: [],
  FAILED: [],
  EXPIRED: [],
};

const WEBHOOK_SCOPE = 'payment.webhook';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_ADAPTER) private readonly gateway: PaymentGateway,
    private readonly orders: OrderService
  ) {}

  async createPayment(
    tenantId: string,
    dto: CreatePaymentInput,
    idempotencyKey?: string,
    createdBy?: string
  ): Promise<PaymentView> {
    const amount = new Decimal(dto.amount);
    if (!amount.isFinite() || amount.lte(0)) {
      throw new BadRequestException({
        code: 'PAYMENT_INVALID_AMOUNT',
        message: 'Jumlah pembayaran harus lebih dari 0',
      });
    }

    const normalizedKey = idempotencyKey?.trim() || undefined;

    if (normalizedKey) {
      const existing = await this.prisma.payment.findFirst({
        where: { tenantId, idempotencyKey: normalizedKey, deletedAt: null },
      });

      if (existing) {
        return this.toView(existing);
      }
    }

    const paymentId = generateUuidV7();
    const currency = dto.currency ?? 'IDR';
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, tenantId, deletedAt: null },
      select: { customerName: true, customerEmail: true, customerPhone: true },
    });

    const charge = await this.gateway.charge({
      paymentId,
      tenantId,
      orderId: dto.orderId,
      amount: amount.toFixed(2),
      currency,
      method: dto.method,
      description: dto.description,
      customer: order
        ? {
            name: order.customerName,
            email: order.customerEmail ?? undefined,
            phone: order.customerPhone ?? undefined,
          }
        : undefined,
    });

    try {
      const payment = await this.prisma.payment.create({
        data: {
          id: paymentId,
          tenantId,
          orderId: dto.orderId,
          gatewayReference: charge.reference || null,
          snapToken: charge.snapToken ?? null,
          redirectUrl: charge.redirectUrl ?? null,
          amount: new Prisma.Decimal(amount.toFixed(2)),
          currency,
          method: dto.method,
          status: charge.status,
          idempotencyKey: normalizedKey,
          paidAt: charge.status === 'PAID' ? new Date() : null,
          expiresAt: charge.expiresAt ?? null,
          createdBy,
        },
      });

      return this.toView(payment);
    } catch (error) {
      if (
        normalizedKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.payment.findFirst({
          where: { tenantId, idempotencyKey: normalizedKey, deletedAt: null },
        });

        if (existing) {
          return this.toView(existing);
        }
      }

      throw error;
    }
  }

  /**
   * Public checkout entry point. Reuses an unexpired pending payment so a
   * double-click does not create two Snap sessions.
   */
  async createOrderPayment(
    tenantId: string,
    orderId: string,
    idempotencyKey?: string
  ): Promise<PaymentView> {
    const order = await this.orders.getOrder(tenantId, orderId);

    if (order.status !== 'PENDING_PAYMENT') {
      throw new ConflictException({
        code: 'PAYMENT_ORDER_NOT_PAYABLE',
        message: `Pesanan berstatus ${order.status} tidak dapat dibayar`,
      });
    }

    const existing = await this.prisma.payment.findFirst({
      where: { tenantId, orderId, status: 'PENDING', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (existing && (!existing.expiresAt || existing.expiresAt > new Date())) {
      return this.toView(existing);
    }

    return this.createPayment(
      tenantId,
      {
        orderId,
        amount: order.total,
        currency: order.currency,
        method: 'QRIS',
        description: `Order ${order.orderNumber}`,
      },
      idempotencyKey
    );
  }

  async handleWebhook(
    payload: WebhookPayload
  ): Promise<{ payment: PaymentView; updated: boolean }> {
    const isValid = this.gateway.verifyWebhook(payload);
    if (!isValid) {
      throw new UnauthorizedException({
        code: 'PAYMENT_INVALID_SIGNATURE',
        message: 'Signature webhook tidak valid',
      });
    }

    const payment = await this.prisma.payment.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { id: payload.orderId },
          { orderId: payload.orderId, gatewayReference: payload.gatewayReference },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!payment) {
      throw new NotFoundException({
        code: 'PAYMENT_NOT_FOUND',
        message: 'Pembayaran tidak ditemukan',
      });
    }

    if (payment.status === payload.status) {
      if (payload.status === 'PAID' && payment.orderId) {
        await this.orders.markPaid(payment.tenantId, payment.orderId, new Date(), payment.method);
      }

      if (
        (payload.status === 'FAILED' || payload.status === 'EXPIRED') &&
        payment.orderId
      ) {
        await this.orders.cancelUnpaidOrder(
          payment.tenantId,
          payment.orderId,
          `Payment ${payload.status.toLowerCase()}`
        );
      }

      return { payment: this.toView(payment), updated: false };
    }

    this.assertTransition(payment.status, payload.status);

    if (payload.status === 'PAID' && payment.orderId) {
      const marked = await this.orders.markPaid(
        payment.tenantId,
        payment.orderId,
        new Date(),
        payment.method
      );
      if (!marked) {
        this.logger.warn(
          `Payment ${payment.id} is paid but order ${payment.orderId} was not found; stock was not committed`
        );
      }
    }

    if (
      (payload.status === 'FAILED' || payload.status === 'EXPIRED') &&
      payment.orderId
    ) {
      await this.orders.cancelUnpaidOrder(
        payment.tenantId,
        payment.orderId,
        `Payment ${payload.status.toLowerCase()}`
      );
    }

    const dedupeId = createHash('sha256')
      .update(`${payload.gatewayReference}:${payload.orderId}:${payload.status}`)
      .digest('hex');
    const expiresAt = new Date(
      Date.now() + PAYMENT_WEBHOOK_IDEMPOTENCY_TTL_DAYS * 24 * 60 * 60 * 1000
    );

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const existingKey = await tx.idempotencyKey.findFirst({
          where: { tenantId: payment.tenantId, scope: WEBHOOK_SCOPE, id: dedupeId },
        });

        if (existingKey) {
          const current = await tx.payment.findUnique({ where: { id: payment.id } });
          if (!current) {
            throw new NotFoundException({
              code: 'PAYMENT_NOT_FOUND',
              message: 'Pembayaran tidak ditemukan',
            });
          }

          return { payment: current, updated: false };
        }

        const updated = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: payload.status,
            gatewayReference: payment.gatewayReference ?? payload.gatewayReference,
            paidAt: payload.status === 'PAID' ? (payment.paidAt ?? new Date()) : payment.paidAt,
          },
        });

        await tx.idempotencyKey.create({
          data: {
            id: dedupeId,
            tenantId: payment.tenantId,
            scope: WEBHOOK_SCOPE,
            response: { paymentId: updated.id, status: updated.status },
            expiresAt,
          },
        });

        return { payment: updated, updated: true };
      });

      this.logger.log(
        `Webhook ${payload.gatewayReference} processed for payment ${result.payment.id}: ${
          result.updated ? payload.status : 'duplicate'
        }`
      );

      return { payment: this.toView(result.payment), updated: result.updated };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const current = await this.prisma.payment.findUnique({ where: { id: payment.id } });
        if (current) {
          return { payment: this.toView(current), updated: false };
        }
      }

      throw error;
    }
  }

  async simulateWebhook(
    orderId: string,
    status: PaymentStatus
  ): Promise<{ payment: PaymentView; updated: boolean }> {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!payment) {
      throw new NotFoundException({
        code: 'PAYMENT_NOT_FOUND',
        message: 'Pembayaran tidak ditemukan',
      });
    }

    // Midtrans identifies the transaction by our payment id; the mock adapter
    // uses the order id. Both are signed with the active adapter's secret.
    const gatewayOrderId = this.gateway.name === 'midtrans' ? payment.id : orderId;
    const gatewayReference = payment.gatewayReference ?? `SIM-${payment.id}`;
    const unsigned: Omit<WebhookPayload, 'signature'> = {
      orderId: gatewayOrderId,
      status,
      gatewayReference,
      amount: payment.amount.toFixed(2),
      statusCode: '200',
    };

    return this.handleWebhook({
      ...unsigned,
      signature: this.gateway.signWebhook(unsigned),
    });
  }

  async getPayment(tenantId: string, id: string): Promise<PaymentView> {
    const payment = await this.prisma.payment.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!payment) {
      throw new NotFoundException({
        code: 'PAYMENT_NOT_FOUND',
        message: 'Pembayaran tidak ditemukan',
      });
    }

    return this.toView(payment);
  }

  private assertTransition(current: string, next: PaymentStatus): void {
    const allowed = ALLOWED_TRANSITIONS[current as PaymentStatus] ?? [];

    if (!allowed.includes(next)) {
      throw new ConflictException({
        code: 'PAYMENT_INVALID_STATUS_TRANSITION',
        message: `Status pembayaran tidak dapat berubah dari ${current} ke ${next}`,
      });
    }
  }

  private toView(payment: Payment): PaymentView {
    return {
      id: payment.id,
      orderId: payment.orderId,
      bookingId: payment.bookingId,
      gatewayReference: payment.gatewayReference,
      snapToken: payment.snapToken,
      redirectUrl: payment.redirectUrl,
      amount: payment.amount.toFixed(2),
      currency: payment.currency,
      method: payment.method,
      status: payment.status,
      paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
      expiresAt: payment.expiresAt ? payment.expiresAt.toISOString() : null,
      createdAt: payment.createdAt.toISOString(),
    };
  }
}
