import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PosShift } from '@prisma/client';
import Decimal from 'decimal.js';

import { generateUuidV7 } from '../../common/id';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { StockError, StockService } from '../inventory/stock.service';
import type {
  CloseShiftDto,
  CreatePosSaleDto,
  ListPosSalesQueryDto,
  OpenShiftDto,
  PosCatalogItemView,
  PosLocationView,
  PosSaleView,
  PosShiftView,
  VoidSaleDto,
} from './pos.dto';

const DISCOUNT_APPROVAL_LIMIT = new Decimal(10000);
const CASHIER_DISCOUNT_PERMISSION = 'pos.discount.approve';

type PosSaleWithDetails = Prisma.PosSaleGetPayload<{
  include: { items: true; payments: true };
}>;

@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly accounting: AccountingService
  ) {}

  async openShift(
    tenantId: string,
    cashierId: string,
    dto: OpenShiftDto
  ): Promise<PosShiftView> {
    const openingCash = this.parseMoney(dto.openingCash, 'openingCash');
    const location = await this.prisma.location.findFirst({
      where: { id: dto.locationId, tenantId, isActive: true, deletedAt: null },
    });

    if (!location) {
      throw new NotFoundException({
        code: 'POS_LOCATION_NOT_FOUND',
        message: 'Lokasi kasir tidak ditemukan',
      });
    }

    const existing = await this.prisma.posShift.findFirst({
      where: { tenantId, locationId: location.id, cashierId, status: 'OPEN' },
    });

    if (existing) {
      throw new ConflictException({
        code: 'POS_SHIFT_ALREADY_OPEN',
        message: 'Shift kasir masih terbuka',
      });
    }

    const shift = await this.prisma.posShift.create({
      data: {
        id: generateUuidV7(),
        tenantId,
        locationId: location.id,
        cashierId,
        openingCash: new Prisma.Decimal(openingCash.toFixed(2)),
        status: 'OPEN',
      },
    });

    return this.toShiftView(shift);
  }

  async closeShift(
    tenantId: string,
    cashierId: string,
    shiftId: string,
    dto: CloseShiftDto
  ): Promise<PosShiftView> {
    const shift = await this.prisma.posShift.findFirst({
      where: { id: shiftId, tenantId, cashierId, status: 'OPEN' },
    });

    if (!shift) {
      throw new NotFoundException({
        code: 'POS_SHIFT_NOT_FOUND',
        message: 'Shift aktif tidak ditemukan',
      });
    }

    const closingCash = this.parseMoney(dto.closingCash, 'closingCash');
    const cash = await this.prisma.posPayment.aggregate({
      where: {
        tenantId,
        method: 'CASH',
        sale: { shiftId: shift.id, status: 'COMPLETED' },
      },
      _sum: { amount: true },
    });
    const expected = new Decimal(shift.openingCash.toString()).plus(
      cash._sum.amount?.toString() ?? '0'
    );
    const difference = closingCash.minus(expected);

    const updated = await this.prisma.posShift.update({
      where: { id: shift.id },
      data: {
        status: 'CLOSED',
        closingCash: new Prisma.Decimal(closingCash.toFixed(2)),
        expectedCash: new Prisma.Decimal(expected.toFixed(2)),
        difference: new Prisma.Decimal(difference.toFixed(2)),
        closedAt: new Date(),
      },
    });

    return this.toShiftView(updated);
  }

  async getCurrentShift(
    tenantId: string,
    cashierId: string,
    locationId?: string
  ): Promise<PosShiftView | null> {
    const shift = await this.prisma.posShift.findFirst({
      where: {
        tenantId,
        cashierId,
        status: 'OPEN',
        ...(locationId ? { locationId } : {}),
      },
      orderBy: { openedAt: 'desc' },
    });

    return shift ? this.toShiftView(shift) : null;
  }

  async listLocations(tenantId: string): Promise<PosLocationView[]> {
    return this.prisma.location.findMany({
      where: { tenantId, isActive: true, deletedAt: null },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: 'asc' },
    });
  }

  async getCatalog(tenantId: string, locationId: string): Promise<PosCatalogItemView[]> {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId, isActive: true, deletedAt: null },
      select: { id: true },
    });

    if (!location) {
      throw new NotFoundException({
        code: 'POS_LOCATION_NOT_FOUND',
        message: 'Lokasi kasir tidak ditemukan',
      });
    }

    const variants = await this.prisma.variant.findMany({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
        product: { isActive: true, deletedAt: null },
      },
      include: { product: { select: { name: true } } },
      orderBy: [{ product: { name: 'asc' } }, { color: 'asc' }, { size: 'asc' }],
    });
    const balances = await this.prisma.stockBalance.findMany({
      where: {
        tenantId,
        locationId: location.id,
        variantId: { in: variants.map((variant) => variant.id) },
      },
      select: { variantId: true, qtyOnHand: true, qtyReserved: true },
    });
    const stockByVariant = new Map(
      balances.map((balance) => [
        balance.variantId,
        new Decimal(balance.qtyOnHand.toString())
          .minus(new Decimal(balance.qtyReserved.toString()))
          .toString(),
      ])
    );

    return variants.map((variant) => ({
      variantId: variant.id,
      productName: variant.product.name,
      sku: variant.sku,
      color: variant.color,
      size: variant.size,
      price: variant.price.toFixed(2),
      stockAvailable: stockByVariant.get(variant.id) ?? '0',
    }));
  }

  async createSale(
    tenantId: string,
    cashierId: string,
    permissions: string[],
    dto: CreatePosSaleDto,
    idempotencyKey?: string
  ): Promise<PosSaleView> {
    const key = idempotencyKey?.trim();
    if (!key) {
      throw new BadRequestException({
        code: 'POS_IDEMPOTENCY_KEY_REQUIRED',
        message: 'Header Idempotency-Key wajib diisi',
      });
    }

    const existing = await this.prisma.posSale.findFirst({
      where: { tenantId, idempotencyKey: key },
      include: { items: true, payments: true },
    });
    if (existing) {
      return this.toSaleView(existing);
    }

    const shift = await this.prisma.posShift.findFirst({
      where: { id: dto.shiftId, tenantId, cashierId, status: 'OPEN' },
    });

    if (!shift) {
      throw new NotFoundException({
        code: 'POS_SHIFT_NOT_FOUND',
        message: 'Shift aktif tidak ditemukan',
      });
    }

    const location = await this.prisma.location.findFirst({
      where: { id: shift.locationId, tenantId },
      select: { code: true },
    });

    if (!location) {
      throw new NotFoundException({
        code: 'POS_LOCATION_NOT_FOUND',
        message: 'Lokasi kasir tidak ditemukan',
      });
    }

    const variantIds = dto.items.map((item) => item.variantId);
    if (new Set(variantIds).size !== variantIds.length) {
      throw new BadRequestException({
        code: 'POS_DUPLICATE_VARIANT',
        message: 'Satu varian hanya boleh muncul satu kali',
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
        code: 'POS_VARIANT_NOT_FOUND',
        message: 'Sebagian varian tidak ditemukan atau tidak aktif',
        details: { variantIds: missing },
      });
    }

    const lines = dto.items.map((item) => {
      const variant = variantMap.get(item.variantId);
      if (!variant) {
        throw new NotFoundException({ code: 'POS_VARIANT_NOT_FOUND' });
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
    const costOfGoods = lines.reduce((sum, line) => {
      return line.variant.costPrice
        ? sum.plus(new Decimal(line.variant.costPrice.toString()).mul(line.qty))
        : sum;
    }, new Decimal(0));
    const discount = this.parseMoney(dto.discount ?? '0', 'discount');

    if (discount.greaterThan(subtotal)) {
      throw new BadRequestException({
        code: 'POS_DISCOUNT_EXCEEDS_SUBTOTAL',
        message: 'Diskon melebihi subtotal',
      });
    }

    if (
      discount.greaterThan(DISCOUNT_APPROVAL_LIMIT) &&
      !permissions.includes(CASHIER_DISCOUNT_PERMISSION)
    ) {
      throw new ForbiddenException({
        code: 'POS_DISCOUNT_APPROVAL_REQUIRED',
        message: 'Diskon di atas Rp10.000 membutuhkan persetujuan supervisor',
      });
    }

    const total = subtotal.minus(discount);
    const payments = dto.payments.map((payment) => ({
      method: payment.method,
      amount: this.parseMoney(payment.amount, 'amount'),
      reference: payment.reference?.trim() || null,
    }));
    const paymentTotal = payments.reduce((sum, payment) => sum.plus(payment.amount), new Decimal(0));

    if (payments.some((payment) => payment.amount.lte(0))) {
      throw new BadRequestException({
        code: 'POS_INVALID_PAYMENT',
        message: 'Jumlah pembayaran harus lebih dari 0',
      });
    }

    if (!paymentTotal.equals(total)) {
      throw new BadRequestException({
        code: 'POS_PAYMENT_MISMATCH',
        message: `Total pembayaran ${paymentTotal.toString()} tidak sama dengan total ${total.toString()}`,
      });
    }

    const saleId = generateUuidV7();

    try {
      const sale = await this.prisma.$transaction(async (tx) => {
        const sequence = await tx.posSequence.upsert({
          where: { tenantId_locationId: { tenantId, locationId: shift.locationId } },
          create: {
            id: generateUuidV7(),
            tenantId,
            locationId: shift.locationId,
            lastNumber: 1,
          },
          update: { lastNumber: { increment: 1 } },
        });
        const receiptNumber = `POS-${location.code}-${String(sequence.lastNumber).padStart(6, '0')}`;

        const created = await tx.posSale.create({
          data: {
            id: saleId,
            tenantId,
            locationId: shift.locationId,
            shiftId: shift.id,
            cashierId,
            receiptNumber,
            idempotencyKey: key,
            status: 'COMPLETED',
            customerName: dto.customerName?.trim() || null,
            subtotal: new Prisma.Decimal(subtotal.toFixed(2)),
            discount: new Prisma.Decimal(discount.toFixed(2)),
            total: new Prisma.Decimal(total.toFixed(2)),
            paymentTotal: new Prisma.Decimal(paymentTotal.toFixed(2)),
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
            payments: {
              create: payments.map((payment) => ({
                id: generateUuidV7(),
                tenantId,
                method: payment.method,
                amount: new Prisma.Decimal(payment.amount.toFixed(2)),
                reference: payment.reference,
              })),
            },
          },
          include: { items: true, payments: true },
        });

        for (const line of lines) {
          await this.stock.adjust(
            {
              tenantId,
              variantId: line.variant.id,
              locationId: shift.locationId,
              qty: line.qty * -1,
              createdBy: cashierId,
              referenceId: created.id,
              referenceType: 'POS_SALE',
              note: `POS ${receiptNumber}`,
            },
            tx
          );
        }

        await this.accounting.recordSale(tx, {
          tenantId,
          referenceType: 'POS_SALE',
          referenceId: created.id,
          date: created.createdAt,
          total,
          costOfGoods,
          payments: payments.map((payment) => ({
            method: payment.method,
            amount: payment.amount,
          })),
          postedBy: cashierId,
        });

        return created;
      });

      return this.toSaleView(sale);
    } catch (error) {
      if (error instanceof StockError) {
        throw new ConflictException({
          code: 'POS_STOCK_INSUFFICIENT',
          message: error.message,
          details: { stockCode: error.code },
        });
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.posSale.findFirst({
          where: { tenantId, idempotencyKey: key },
          include: { items: true, payments: true },
        });
        if (duplicate) {
          return this.toSaleView(duplicate);
        }
      }

      throw error;
    }
  }

  async voidSale(
    tenantId: string,
    cashierId: string,
    saleId: string,
    dto: VoidSaleDto
  ): Promise<PosSaleView> {
    const sale = await this.prisma.posSale.findFirst({
      where: { id: saleId, tenantId },
      include: { items: true, payments: true },
    });

    if (!sale) {
      throw new NotFoundException({
        code: 'POS_SALE_NOT_FOUND',
        message: 'Transaksi POS tidak ditemukan',
      });
    }

    if (sale.status === 'VOID') {
      throw new ConflictException({
        code: 'POS_SALE_ALREADY_VOID',
        message: 'Transaksi sudah dibatalkan',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.posSale.update({
        where: { id: sale.id },
        data: {
          status: 'VOID',
          voidedAt: new Date(),
          voidReason: dto.reason.trim(),
        },
        include: { items: true, payments: true },
      });

      for (const item of sale.items) {
        await this.stock.adjust(
          {
            tenantId,
            variantId: item.variantId,
            locationId: sale.locationId,
            qty: item.qty,
            createdBy: cashierId,
            referenceId: sale.id,
            referenceType: 'POS_VOID',
            note: `Void ${sale.receiptNumber}`,
          },
          tx
        );
      }

      return current;
    });

    return this.toSaleView(updated);
  }

  async getSale(tenantId: string, saleId: string): Promise<PosSaleView> {
    const sale = await this.prisma.posSale.findFirst({
      where: { id: saleId, tenantId },
      include: { items: true, payments: true },
    });

    if (!sale) {
      throw new NotFoundException({
        code: 'POS_SALE_NOT_FOUND',
        message: 'Transaksi POS tidak ditemukan',
      });
    }

    return this.toSaleView(sale);
  }

  async listSales(
    tenantId: string,
    query: ListPosSalesQueryDto
  ): Promise<PosSaleView[]> {
    const sales = await this.prisma.posSale.findMany({
      where: {
        tenantId,
        ...(query.shiftId ? { shiftId: query.shiftId } : {}),
      },
      include: { items: true, payments: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return sales.map((sale) => this.toSaleView(sale));
  }

  private parseMoney(value: string, field: string): Decimal {
    const amount = new Decimal(value);

    if (!amount.isFinite() || amount.isNegative() || amount.decimalPlaces() > 2) {
      throw new BadRequestException({
        code: 'POS_INVALID_AMOUNT',
        message: `${field} tidak valid`,
      });
    }

    return amount;
  }

  private toShiftView(shift: PosShift): PosShiftView {
    return {
      id: shift.id,
      locationId: shift.locationId,
      cashierId: shift.cashierId,
      status: shift.status,
      openingCash: shift.openingCash.toFixed(2),
      closingCash: shift.closingCash ? shift.closingCash.toFixed(2) : null,
      expectedCash: shift.expectedCash ? shift.expectedCash.toFixed(2) : null,
      difference: shift.difference ? shift.difference.toFixed(2) : null,
      openedAt: shift.openedAt.toISOString(),
      closedAt: shift.closedAt ? shift.closedAt.toISOString() : null,
    };
  }

  private toSaleView(sale: PosSaleWithDetails): PosSaleView {
    return {
      id: sale.id,
      receiptNumber: sale.receiptNumber,
      shiftId: sale.shiftId,
      locationId: sale.locationId,
      cashierId: sale.cashierId,
      status: sale.status,
      customerName: sale.customerName,
      subtotal: sale.subtotal.toFixed(2),
      discount: sale.discount.toFixed(2),
      total: sale.total.toFixed(2),
      paymentTotal: sale.paymentTotal.toFixed(2),
      createdAt: sale.createdAt.toISOString(),
      voidedAt: sale.voidedAt ? sale.voidedAt.toISOString() : null,
      voidReason: sale.voidReason,
      items: sale.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        productName: item.productName,
        sku: item.sku,
        qty: item.qty,
        unitPrice: item.unitPrice.toFixed(2),
        total: item.total.toFixed(2),
      })),
      payments: sale.payments.map((payment) => ({
        id: payment.id,
        method: payment.method,
        amount: payment.amount.toFixed(2),
        reference: payment.reference,
      })),
    };
  }
}
