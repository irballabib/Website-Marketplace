import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

import { generateUuidV7 } from '../../common/id';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { StockError, StockService } from '../inventory/stock.service';
import { NotificationService } from '../notification/notification.service';
import type {
  CreateOrderDto,
  ListAdminOrdersQueryDto,
  OrderStatus,
  OrderView,
  UpdateShipmentDto,
} from './order.dto';

const RESERVATION_MINUTES = 15;
const EXPIRY_INTERVAL_MS = 60_000;
const GUEST_ACTOR = 'system:online-checkout';
const EXPIRY_ACTOR = 'system:order-expiry';

const ALLOWED_TRANSITIONS: Record<string, OrderStatus[]> = {
  PENDING_PAYMENT: ['CANCELLED'],
  PAID: ['PROCESSING'],
  PROCESSING: ['PACKED'],
  PACKED: ['SHIPPED'],
  SHIPPED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  RETURNED: [],
};

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

/**
 * Online checkout owns the stock reservation. The order and its reservation
 * rows are created in one transaction, so a failed order never leaks stock.
 *
 * shortcut: in-process expiry timer, single API instance only. Replace with a
 * BullMQ scheduled job when the API runs as more than one instance.
 */
@Injectable()
export class OrderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderService.name);
  private expiryTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly notifications: NotificationService,
    private readonly accounting: AccountingService
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    this.expiryTimer = setInterval(() => {
      void this.expireOverdueOrders().catch((error: unknown) => {
        this.logger.error(
          `Order expiry sweep failed: ${error instanceof Error ? error.message : 'unknown error'}`
        );
      });
    }, EXPIRY_INTERVAL_MS);
    this.expiryTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.expiryTimer) {
      clearInterval(this.expiryTimer);
    }
  }

  async createOrder(
    tenantId: string,
    dto: CreateOrderDto,
    idempotencyKey?: string
  ): Promise<OrderView> {
    const key = idempotencyKey?.trim() || undefined;

    if (key) {
      const existing = await this.prisma.order.findFirst({
        where: { tenantId, idempotencyKey: key, deletedAt: null },
        include: { items: true },
      });

      if (existing) {
        return this.toView(existing);
      }
    }

    if (dto.fulfillmentType === 'SHIP' && !dto.shippingAddress?.trim()) {
      throw new BadRequestException({
        code: 'ORDER_ADDRESS_REQUIRED',
        message: 'Alamat pengiriman wajib diisi untuk pesanan kirim',
      });
    }

    const location = await this.resolveLocation(tenantId, dto.locationId);
    const variantIds = dto.items.map((item) => item.variantId);

    if (new Set(variantIds).size !== variantIds.length) {
      throw new BadRequestException({
        code: 'ORDER_DUPLICATE_VARIANT',
        message: 'Satu varian hanya boleh muncul satu kali dalam pesanan',
      });
    }

    const variants = await this.prisma.variant.findMany({
      where: {
        id: { in: variantIds },
        tenantId,
        isActive: true,
        deletedAt: null,
        product: { isActive: true, deletedAt: null },
      },
      include: { product: { select: { name: true } } },
    });
    const variantMap = new Map(variants.map((variant) => [variant.id, variant]));
    const missing = variantIds.filter((id) => !variantMap.has(id));

    if (missing.length > 0) {
      throw new NotFoundException({
        code: 'ORDER_VARIANT_NOT_FOUND',
        message: 'Sebagian varian tidak ditemukan atau tidak aktif',
        details: { variantIds: missing },
      });
    }

    const lines = dto.items.map((item) => {
      const variant = variantMap.get(item.variantId);
      if (!variant) {
        throw new NotFoundException({ code: 'ORDER_VARIANT_NOT_FOUND' });
      }

      const unitPrice = new Decimal(variant.price.toString());
      return {
        variant,
        qty: item.qty,
        unitPrice,
        total: unitPrice.mul(item.qty),
      };
    });

    const subtotal = lines.reduce((sum, line) => sum.plus(line.total), new Decimal(0));
    const shippingCost = new Decimal(dto.shippingCost ?? '0');

    if (!shippingCost.isFinite() || shippingCost.isNegative() || shippingCost.decimalPlaces() > 2) {
      throw new BadRequestException({
        code: 'ORDER_INVALID_SHIPPING_COST',
        message: 'Biaya pengiriman tidak valid',
      });
    }

    const total = subtotal.plus(shippingCost);
    const orderId = generateUuidV7();
    const orderNumber = `ORD-${orderId.replace(/-/g, '').slice(-10).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000);

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        for (const line of lines) {
          await this.stock.reserve(
            {
              tenantId,
              variantId: line.variant.id,
              locationId: location.id,
              qty: line.qty,
              createdBy: GUEST_ACTOR,
              referenceId: orderId,
              referenceType: 'ORDER',
              note: `Reservation for ${orderNumber}`,
            },
            tx
          );
        }

        return tx.order.create({
          data: {
            id: orderId,
            tenantId,
            orderNumber,
            idempotencyKey: key,
            status: 'PENDING_PAYMENT',
            channel: 'ONLINE',
            locationId: location.id,
            qrCode: dto.qrCode?.trim() || null,
            customerName: dto.customerName.trim(),
            customerPhone: dto.customerPhone.trim(),
            customerEmail: dto.customerEmail?.trim().toLowerCase() || null,
            fulfillmentType: dto.fulfillmentType,
            shippingAddress: dto.shippingAddress?.trim() || null,
            subtotal: new Prisma.Decimal(subtotal.toFixed(2)),
            discount: new Prisma.Decimal(0),
            shippingCost: new Prisma.Decimal(shippingCost.toFixed(2)),
            total: new Prisma.Decimal(total.toFixed(2)),
            expiresAt,
            items: {
              create: lines.map((line) => ({
                id: generateUuidV7(),
                tenantId,
                variantId: line.variant.id,
                productName: line.variant.product.name,
                sku: line.variant.sku,
                qty: line.qty,
                unitPrice: new Prisma.Decimal(line.unitPrice.toFixed(2)),
                total: new Prisma.Decimal(line.total.toFixed(2)),
              })),
            },
          },
          include: { items: true },
        });
      });

      this.notifications.orderCreated(order);
      return this.toView(order);
    } catch (error) {
      if (error instanceof StockError) {
        throw new ConflictException({
          code: 'ORDER_STOCK_INSUFFICIENT',
          message: error.message,
          details: { stockCode: error.code },
        });
      }

      if (
        key &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.order.findFirst({
          where: { tenantId, idempotencyKey: key, deletedAt: null },
          include: { items: true },
        });

        if (existing) {
          return this.toView(existing);
        }
      }

      throw error;
    }
  }

  async getOrder(tenantId: string, id: string): Promise<OrderView> {
    const order = await this.prisma.order.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Pesanan tidak ditemukan',
      });
    }

    return this.toView(order);
  }

  /**
   * Called after a verified payment. Idempotent: a paid order is a no-op, and a
   * cancelled/expired order is rejected so stock is never committed twice.
   */
  async markPaid(
    tenantId: string,
    orderId: string,
    paidAt = new Date(),
    paymentMethod = 'QRIS'
  ): Promise<boolean> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId, deletedAt: null },
      include: { items: true },
    });

    if (!order) {
      return false;
    }

    if (order.status === 'PAID') {
      return true;
    }

    if (order.status !== 'PENDING_PAYMENT') {
      throw new ConflictException({
        code: 'ORDER_NOT_PAYABLE',
        message: `Pesanan berstatus ${order.status} tidak dapat dibayar`,
      });
    }

    const costs = await this.prisma.variant.findMany({
      where: { id: { in: order.items.map((item) => item.variantId) } },
      select: { id: true, costPrice: true },
    });
    const costMap = new Map(costs.map((variant) => [variant.id, variant.costPrice]));
    const costOfGoods = order.items.reduce((sum, item) => {
      const cost = costMap.get(item.variantId);
      return cost ? sum.plus(new Decimal(cost.toString()).mul(item.qty)) : sum;
    }, new Decimal(0));

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: 'PENDING_PAYMENT' },
        data: { status: 'PAID', paidAt },
      });

      if (claimed.count === 0) {
        return;
      }

      for (const item of order.items) {
        await this.stock.commit(
          {
            tenantId,
            variantId: item.variantId,
            locationId: order.locationId,
            qty: item.qty,
            createdBy: 'system:payment',
            referenceId: order.id,
            referenceType: 'ORDER',
            note: 'Payment settled',
          },
          tx
        );
      }

      await this.accounting.recordSale(tx, {
        tenantId,
        referenceType: 'ORDER',
        referenceId: order.id,
        date: paidAt,
        total: order.total,
        costOfGoods,
        payments: [{ method: paymentMethod, amount: order.total }],
        postedBy: 'system:payment',
      });
    });

    const current = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });

    if (current?.status !== 'PAID') {
      throw new ConflictException({
        code: 'ORDER_NOT_PAYABLE',
        message: 'Pesanan tidak dapat dibayar karena sudah dibatalkan atau kedaluwarsa',
      });
    }

    this.notifications.orderPaid(order);
    return true;
  }

  async cancelUnpaidOrder(
    tenantId: string,
    orderId: string,
    reason = 'Order cancelled'
  ): Promise<OrderView | null> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId, deletedAt: null },
      include: { items: true },
    });

    if (!order || order.status !== 'PENDING_PAYMENT') {
      return null;
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: order.id, status: 'PENDING_PAYMENT' },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });

      if (claimed.count === 0) {
        return null;
      }

      for (const item of order.items) {
        await this.stock.release(
          {
            tenantId,
            variantId: item.variantId,
            locationId: order.locationId,
            qty: item.qty,
            createdBy: 'system:order-cancel',
            referenceId: order.id,
            referenceType: 'ORDER',
            note: reason,
          },
          tx
        );
      }

      return tx.order.findUnique({
        where: { id: order.id },
        include: { items: true },
      });
    });

    if (!cancelled) {
      return null;
    }

    this.notifications.orderCancelled(cancelled);
    return this.toView(cancelled);
  }

  async listAdminOrders(
    tenantId: string,
    query: ListAdminOrdersQueryDto
  ): Promise<OrderView[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return orders.map((order) => this.toView(order));
  }

  async updateStatus(
    tenantId: string,
    orderId: string,
    status: OrderStatus
  ): Promise<OrderView> {
    const order = await this.findOrder(tenantId, orderId);

    if (status === 'PAID') {
      throw new ConflictException({
        code: 'ORDER_PAYMENT_ONLY',
        message: 'Status PAID hanya dapat diubah lewat pembayaran',
      });
    }

    if (status === 'SHIPPED') {
      throw new ConflictException({
        code: 'ORDER_USE_SHIPMENT_ENDPOINT',
        message: 'Gunakan endpoint shipment untuk menandai pesanan dikirim',
      });
    }

    const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(status)) {
      throw new ConflictException({
        code: 'ORDER_INVALID_STATUS_TRANSITION',
        message: `Status pesanan tidak dapat berubah dari ${order.status} ke ${status}`,
      });
    }

    if (status === 'CANCELLED') {
      const cancelled = await this.cancelUnpaidOrder(
        tenantId,
        order.id,
        'Order cancelled by admin'
      );

      if (!cancelled) {
        throw new ConflictException({
          code: 'ORDER_INVALID_STATUS_TRANSITION',
          message: 'Pesanan sudah berubah status',
        });
      }

      return cancelled;
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status,
        ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}),
      },
      include: { items: true },
    });

    if (status === 'COMPLETED') {
      this.notifications.orderCompleted(updated);
    }

    return this.toView(updated);
  }

  async updateShipment(
    tenantId: string,
    orderId: string,
    dto: UpdateShipmentDto
  ): Promise<OrderView> {
    const order = await this.findOrder(tenantId, orderId);

    if (order.status !== 'PACKED' && order.status !== 'SHIPPED') {
      throw new ConflictException({
        code: 'ORDER_NOT_SHIPPABLE',
        message: 'Pesanan harus berstatus PACKED sebelum dikirim',
      });
    }

    const becomesShipped = order.status === 'PACKED';
    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        courier: dto.courier.trim(),
        trackingNumber: dto.trackingNumber.trim(),
        ...(becomesShipped ? { status: 'SHIPPED', shippedAt: new Date() } : {}),
      },
      include: { items: true },
    });

    if (becomesShipped) {
      this.notifications.orderShipped(updated);
    }

    return this.toView(updated);
  }

  /** Called by the dev endpoint and the in-process timer. */
  async expireOverdueOrders(limit = 50): Promise<number> {
    const orders = await this.prisma.order.findMany({
      where: {
        status: 'PENDING_PAYMENT',
        expiresAt: { lte: new Date() },
        deletedAt: null,
      },
      include: { items: true },
      orderBy: { expiresAt: 'asc' },
      take: limit,
    });

    let expired = 0;

    for (const order of orders) {
      try {
        if (await this.cancelExpiredOrder(order)) {
          this.notifications.orderCancelled(order);
          expired += 1;
        }
      } catch (error) {
        this.logger.warn(
          `Failed to expire order ${order.id}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`
        );
      }
    }

    if (expired > 0) {
      this.logger.log(`Expired ${expired} unpaid orders`);
    }

    return expired;
  }

  private async resolveLocation(tenantId: string, locationId?: string) {
    if (locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: locationId, tenantId, isActive: true, deletedAt: null },
      });

      if (!location) {
        throw new NotFoundException({
          code: 'ORDER_LOCATION_NOT_FOUND',
          message: 'Lokasi pengambilan stok tidak ditemukan',
        });
      }

      return location;
    }

    const location =
      (await this.prisma.location.findFirst({
        where: { tenantId, type: 'WAREHOUSE', isActive: true, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      })) ??
      (await this.prisma.location.findFirst({
        where: { tenantId, isActive: true, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }));

    if (!location) {
      throw new NotFoundException({
        code: 'ORDER_LOCATION_NOT_FOUND',
        message: 'Belum ada lokasi stok aktif untuk tenant ini',
      });
    }

    return location;
  }

  private async findOrder(tenantId: string, orderId: string): Promise<OrderWithItems> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId, deletedAt: null },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Pesanan tidak ditemukan',
      });
    }

    return order;
  }

  private async cancelExpiredOrder(order: OrderWithItems): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: order.id, status: 'PENDING_PAYMENT' },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });

      if (claimed.count === 0) {
        return false;
      }

      for (const item of order.items) {
        await this.stock.release(
          {
            tenantId: order.tenantId,
            variantId: item.variantId,
            locationId: order.locationId,
            qty: item.qty,
            createdBy: EXPIRY_ACTOR,
            referenceId: order.id,
            referenceType: 'ORDER',
            note: 'Reservation expired',
          },
          tx
        );
      }

      return true;
    });
  }

  private toView(order: OrderWithItems): OrderView {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      channel: order.channel,
      locationId: order.locationId,
      qrCode: order.qrCode,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      fulfillmentType: order.fulfillmentType,
      shippingAddress: order.shippingAddress,
      subtotal: order.subtotal.toFixed(2),
      discount: order.discount.toFixed(2),
      shippingCost: order.shippingCost.toFixed(2),
      total: order.total.toFixed(2),
      currency: order.currency,
      expiresAt: order.expiresAt.toISOString(),
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
      shippedAt: order.shippedAt ? order.shippedAt.toISOString() : null,
      completedAt: order.completedAt ? order.completedAt.toISOString() : null,
      courier: order.courier,
      trackingNumber: order.trackingNumber,
      cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        productName: item.productName,
        sku: item.sku,
        qty: item.qty,
        unitPrice: item.unitPrice.toFixed(2),
        total: item.total.toFixed(2),
      })),
    };
  }
}
