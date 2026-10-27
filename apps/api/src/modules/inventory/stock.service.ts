import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

import { PrismaService } from '../../common/prisma/prisma.service';
import { generateUuidV7 } from '../../common/id';
import type {
  ListLedgerQueryDto,
  ListStockQueryDto,
  LocationOptionView,
  StockBalanceView,
  StockLedgerView,
} from './inventory.dto';

export type StockMovementType =
  | 'RESERVATION'
  | 'COMMIT'
  | 'RELEASE'
  | 'ADJUSTMENT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'OPNAME'
  | 'PRODUCTION_IN'
  | 'PRODUCTION_OUT';

export type StockErrorCode =
  | 'STOCK_INSUFFICIENT'
  | 'STOCK_RESERVATION_EXCEEDED'
  | 'STOCK_BELOW_RESERVED'
  | 'STOCK_INVALID_QUANTITY';

export class StockError extends Error {
  constructor(
    readonly code: StockErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'StockError';
  }
}

export interface StockMutationInput {
  tenantId: string;
  variantId: string;
  locationId: string;
  qty: Decimal.Value;
  createdBy: string;
  referenceId?: string;
  referenceType?: string;
  note?: string;
}

export interface StockTransferInput {
  tenantId: string;
  variantId: string;
  fromLocationId: string;
  toLocationId: string;
  qty: Decimal.Value;
  createdBy: string;
  note?: string;
}

export interface StockBalanceSnapshot {
  variantId: string;
  locationId: string;
  qtyOnHand: string;
  qtyReserved: string;
  qtyAvailable: string;
}

const ZERO = new Decimal(0);

/**
 * Stock mutations are append-only: every change writes a `StockLedger` row and
 * updates the derived `StockBalance` inside the same transaction.
 *
 * The balance row is locked with `SELECT ... FOR UPDATE` before it is read, so
 * concurrent reservations cannot oversell. Database CHECK constraints act as a
 * second line of defence (qty never negative, reserved never above on-hand).
 */
@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  /** Hold stock for an order/booking. On-hand stock is untouched. */
  reserve(
    input: StockMutationInput,
    tx?: Prisma.TransactionClient
  ): Promise<StockBalanceSnapshot> {
    return this.mutate('RESERVATION', input, tx);
  }

  /** Release a previous reservation without touching on-hand stock. */
  release(
    input: StockMutationInput,
    tx?: Prisma.TransactionClient
  ): Promise<StockBalanceSnapshot> {
    return this.mutate('RELEASE', input, tx);
  }

  /** Convert a reservation into a real deduction of on-hand stock. */
  commit(
    input: StockMutationInput,
    tx?: Prisma.TransactionClient
  ): Promise<StockBalanceSnapshot> {
    return this.mutate('COMMIT', input, tx);
  }

  /** Signed manual movement (positive = in, negative = out). */
  adjust(
    input: StockMutationInput,
    tx?: Prisma.TransactionClient
  ): Promise<StockBalanceSnapshot> {
    return this.mutate('ADJUSTMENT', input, tx);
  }

  /** Move stock between locations atomically. Both legs share one reference. */
  async transfer(input: StockTransferInput): Promise<{
    from: StockBalanceSnapshot;
    to: StockBalanceSnapshot;
  }> {
    const qty = new Decimal(input.qty);

    if (!qty.isFinite() || !qty.isPositive()) {
      throw new StockError(
        'STOCK_INVALID_QUANTITY',
        `Transfer quantity must be positive, received ${qty.toString()}`
      );
    }

    if (input.fromLocationId === input.toLocationId) {
      throw new StockError(
        'STOCK_INVALID_QUANTITY',
        'Source and destination locations must differ'
      );
    }

    const referenceId = generateUuidV7();

    return this.prisma.$transaction(async (tx) => {
      const from = await this.adjust(
        {
          tenantId: input.tenantId,
          variantId: input.variantId,
          locationId: input.fromLocationId,
          qty: qty.negated(),
          createdBy: input.createdBy,
          referenceId,
          referenceType: 'TRANSFER',
          note: input.note,
        },
        tx
      );
      const to = await this.adjust(
        {
          tenantId: input.tenantId,
          variantId: input.variantId,
          locationId: input.toLocationId,
          qty,
          createdBy: input.createdBy,
          referenceId,
          referenceType: 'TRANSFER',
          note: input.note,
        },
        tx
      );

      return { from, to };
    });
  }

  async getBalance(
    tenantId: string,
    variantId: string,
    locationId: string
  ): Promise<StockBalanceSnapshot> {
    const balance = await this.prisma.stockBalance.findUnique({
      where: { tenantId_variantId_locationId: { tenantId, variantId, locationId } },
    });

    if (!balance) {
      return { variantId, locationId, qtyOnHand: '0', qtyReserved: '0', qtyAvailable: '0' };
    }

    return this.toSnapshot(balance);
  }

  async listStock(tenantId: string, query: ListStockQueryDto): Promise<StockBalanceView[]> {
    const q = query.q?.trim();
    const where: Prisma.StockBalanceWhereInput = {
      tenantId,
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(q
        ? {
            variant: {
              OR: [
                { sku: { contains: q, mode: 'insensitive' } },
                { product: { name: { contains: q, mode: 'insensitive' } } },
              ],
            },
          }
        : {}),
    };

    const rows = await this.prisma.stockBalance.findMany({
      where,
      include: {
        variant: { select: { sku: true, product: { select: { name: true } } } },
        location: { select: { code: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    return rows.map((row) => ({
      variantId: row.variantId,
      sku: row.variant.sku,
      productName: row.variant.product.name,
      locationId: row.locationId,
      locationCode: row.location.code,
      locationName: row.location.name,
      qtyOnHand: row.qtyOnHand.toFixed(4),
      qtyReserved: row.qtyReserved.toFixed(4),
      qtyAvailable: row.qtyOnHand.minus(row.qtyReserved).toFixed(4),
    }));
  }

  async listLedger(
    tenantId: string,
    query: ListLedgerQueryDto
  ): Promise<StockLedgerView[]> {
    const rows = await this.prisma.stockLedger.findMany({
      where: {
        tenantId,
        ...(query.variantId ? { variantId: query.variantId } : {}),
        ...(query.locationId ? { locationId: query.locationId } : {}),
      },
      include: {
        variant: { select: { sku: true } },
        location: { select: { code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });

    return rows.map((row) => ({
      id: row.id,
      variantId: row.variantId,
      sku: row.variant.sku,
      locationId: row.locationId,
      locationCode: row.location.code,
      movementType: row.movementType,
      qtyDelta: row.qtyDelta.toFixed(4),
      qtyReservedDelta: row.qtyReservedDelta.toFixed(4),
      referenceId: row.referenceId,
      referenceType: row.referenceType,
      note: row.note,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async listLocations(tenantId: string): Promise<LocationOptionView[]> {
    return this.prisma.location.findMany({
      where: { tenantId, isActive: true, deletedAt: null },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: 'asc' },
    });
  }

  private async mutate(
    movementType: StockMovementType,
    input: StockMutationInput,
    tx?: Prisma.TransactionClient
  ): Promise<StockBalanceSnapshot> {
    const qty = new Decimal(input.qty);
    const signed = movementType === 'ADJUSTMENT';

    if (!qty.isFinite() || qty.isZero() || (!signed && !qty.isPositive())) {
      throw new StockError(
        'STOCK_INVALID_QUANTITY',
        `Quantity must be a ${signed ? 'non-zero' : 'positive'} number, received ${qty.toString()}`
      );
    }

    if (tx) {
      return this.mutateInTransaction(movementType, input, tx);
    }

    return this.prisma.$transaction((client) =>
      this.mutateInTransaction(movementType, input, client)
    );
  }

  private async mutateInTransaction(
    movementType: StockMovementType,
    input: StockMutationInput,
    tx: Prisma.TransactionClient
  ): Promise<StockBalanceSnapshot> {
    const qty = new Decimal(input.qty);

      await tx.$executeRaw`
        INSERT INTO "stock_balances" (
          "id", "tenant_id", "variant_id", "location_id",
          "qty_on_hand", "qty_reserved", "updated_at"
        )
        VALUES (
          ${generateUuidV7()}, ${input.tenantId}, ${input.variantId}, ${input.locationId},
          0, 0, now()
        )
        ON CONFLICT ("tenant_id", "variant_id", "location_id") DO NOTHING
      `;

      const locked = await tx.$queryRaw<{ qty_on_hand: string; qty_reserved: string }[]>`
        SELECT "qty_on_hand", "qty_reserved"
        FROM "stock_balances"
        WHERE "tenant_id" = ${input.tenantId}
          AND "variant_id" = ${input.variantId}
          AND "location_id" = ${input.locationId}
        FOR UPDATE
      `;

      const current = locked[0];
      if (!current) {
        throw new StockError('STOCK_INSUFFICIENT', 'Stock balance row could not be locked');
      }

      const onHand = new Decimal(current.qty_on_hand);
      const reserved = new Decimal(current.qty_reserved);
      const { nextOnHand, nextReserved } = this.apply(movementType, qty, onHand, reserved);

      await tx.stockBalance.update({
        where: {
          tenantId_variantId_locationId: {
            tenantId: input.tenantId,
            variantId: input.variantId,
            locationId: input.locationId,
          },
        },
        data: {
          qtyOnHand: nextOnHand.toString(),
          qtyReserved: nextReserved.toString(),
        },
      });

      await tx.stockLedger.create({
        data: {
          id: generateUuidV7(),
          tenantId: input.tenantId,
          variantId: input.variantId,
          locationId: input.locationId,
          movementType,
          qtyDelta: this.deltaForLedger(movementType, 'qty', qty).toString(),
          qtyReservedDelta: this.deltaForLedger(movementType, 'reserved', qty).toString(),
          referenceId: input.referenceId,
          referenceType: input.referenceType,
          note: input.note,
          createdBy: input.createdBy,
        },
      });

      return {
        variantId: input.variantId,
        locationId: input.locationId,
        qtyOnHand: nextOnHand.toString(),
        qtyReserved: nextReserved.toString(),
        qtyAvailable: nextOnHand.minus(nextReserved).toString(),
      };
  }

  private apply(
    movementType: StockMovementType,
    qty: Decimal,
    onHand: Decimal,
    reserved: Decimal
  ): { nextOnHand: Decimal; nextReserved: Decimal } {
    switch (movementType) {
      case 'RESERVATION': {
        const available = onHand.minus(reserved);
        if (qty.greaterThan(available)) {
          throw new StockError(
            'STOCK_INSUFFICIENT',
            `Only ${available.toString()} available, requested ${qty.toString()}`
          );
        }
        return { nextOnHand: onHand, nextReserved: reserved.plus(qty) };
      }
      case 'RELEASE':
      case 'COMMIT': {
        if (qty.greaterThan(reserved)) {
          throw new StockError(
            'STOCK_RESERVATION_EXCEEDED',
            `Only ${reserved.toString()} reserved, requested ${qty.toString()}`
          );
        }
        return {
          nextOnHand: movementType === 'COMMIT' ? onHand.minus(qty) : onHand,
          nextReserved: reserved.minus(qty),
        };
      }
      case 'ADJUSTMENT': {
        const nextOnHand = onHand.plus(qty);
        if (nextOnHand.lessThan(reserved)) {
          throw new StockError(
            'STOCK_BELOW_RESERVED',
            `Adjustment would leave ${nextOnHand.toString()} on hand while ${reserved.toString()} is reserved`
          );
        }
        return { nextOnHand, nextReserved: reserved };
      }
      default:
        return { nextOnHand: onHand, nextReserved: reserved };
    }
  }

  private deltaForLedger(
    movementType: StockMovementType,
    dimension: 'qty' | 'reserved',
    qty: Decimal
  ): Decimal {
    if (dimension === 'qty') {
      switch (movementType) {
        case 'COMMIT':
        case 'TRANSFER_OUT':
        case 'PRODUCTION_OUT':
          return qty.negated();
        case 'ADJUSTMENT':
        case 'TRANSFER_IN':
        case 'PRODUCTION_IN':
        case 'OPNAME':
          return qty;
        default:
          return ZERO;
      }
    }

    switch (movementType) {
      case 'RESERVATION':
        return qty;
      case 'RELEASE':
      case 'COMMIT':
        return qty.negated();
      default:
        return ZERO;
    }
  }

  private toSnapshot(balance: {
    variantId: string;
    locationId: string;
    qtyOnHand: Prisma.Decimal;
    qtyReserved: Prisma.Decimal;
  }): StockBalanceSnapshot {
    const onHand = new Decimal(balance.qtyOnHand.toString());
    const reserved = new Decimal(balance.qtyReserved.toString());

    return {
      variantId: balance.variantId,
      locationId: balance.locationId,
      qtyOnHand: onHand.toString(),
      qtyReserved: reserved.toString(),
      qtyAvailable: onHand.minus(reserved).toString(),
    };
  }
}
