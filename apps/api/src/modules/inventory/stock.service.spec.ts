import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { generateUuidV7 } from '../../common/id';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { StockError, StockService } from './stock.service';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('StockService (integration)', () => {
  const prisma = new PrismaClient();
  const stock = new StockService(prisma as unknown as PrismaService);

  const tenantId = generateUuidV7();
  const locationId = generateUuidV7();
  const variantId = generateUuidV7();
  const createdBy = generateUuidV7();

  beforeAll(async () => {
    const suffix = tenantId.slice(-8);

    await prisma.tenant.create({
      data: { id: tenantId, name: `Test ${suffix}`, code: `test-${suffix}` },
    });

    const category = await prisma.category.create({
      data: { tenantId, name: 'Celana', slug: `celana-${suffix}` },
    });

    const product = await prisma.product.create({
      data: {
        tenantId,
        categoryId: category.id,
        name: 'Cutbray Test',
        slug: `cutbray-${suffix}`,
        skuPrefix: 'TST',
      },
    });

    await prisma.variant.create({
      data: {
        id: variantId,
        tenantId,
        productId: product.id,
        sku: `TST-${suffix}`,
        color: 'Hitam',
        size: '30',
        price: '199000.00',
      },
    });

    await prisma.location.create({
      data: { id: locationId, tenantId, code: `WH-${suffix}`, name: 'Gudang Test', type: 'WAREHOUSE' },
    });
  });

  afterAll(async () => {
    await prisma.stockLedger.deleteMany({ where: { tenantId } });
    await prisma.stockBalance.deleteMany({ where: { tenantId } });
    await prisma.variant.deleteMany({ where: { tenantId } });
    await prisma.product.deleteMany({ where: { tenantId } });
    await prisma.category.deleteMany({ where: { tenantId } });
    await prisma.location.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  const base = {
    tenantId,
    variantId,
    locationId,
    createdBy,
  };

  it('reserves stock without changing on-hand quantity', async () => {
    await stock.adjust({ ...base, qty: '10' });

    const result = await stock.reserve({ ...base, qty: '3', referenceId: 'order-1', referenceType: 'ORDER' });

    expect(result.qtyOnHand).toBe('10');
    expect(result.qtyReserved).toBe('3');
    expect(result.qtyAvailable).toBe('7');
  });

  it('never oversells under concurrent reservations', async () => {
    await stock.adjust({ ...base, qty: '5' });
    const before = await stock.getBalance(tenantId, variantId, locationId);
    const available = Number(before.qtyAvailable);
    expect(available).toBeGreaterThan(0);

    const attempts = await Promise.allSettled(
      Array.from({ length: available + 8 }, (_, index) =>
        stock.reserve({
          ...base,
          qty: '1',
          referenceId: `concurrent-${index}`,
          referenceType: 'ORDER',
        })
      )
    );

    const fulfilled = attempts.filter((attempt) => attempt.status === 'fulfilled');
    const rejected = attempts.filter((attempt) => attempt.status === 'rejected');

    // Exactly the available quantity may succeed; the rest must be refused.
    expect(fulfilled).toHaveLength(available);
    expect(rejected).toHaveLength(8);
    for (const attempt of rejected) {
      expect(attempt.reason).toBeInstanceOf(StockError);
      expect((attempt.reason as StockError).code).toBe('STOCK_INSUFFICIENT');
    }

    const after = await stock.getBalance(tenantId, variantId, locationId);
    expect(after.qtyReserved).toBe(after.qtyOnHand);
    expect(after.qtyOnHand).toBe(before.qtyOnHand);
    expect(after.qtyAvailable).toBe('0');
  });

  it('commits a reservation and keeps balance equal to the ledger sum', async () => {
    const balanceBefore = await stock.getBalance(tenantId, variantId, locationId);
    const reserved = Number(balanceBefore.qtyReserved);
    expect(reserved).toBeGreaterThan(0);

    await stock.commit({
      ...base,
      qty: String(reserved),
      referenceId: 'commit-1',
      referenceType: 'ORDER',
    });

    const balance = await stock.getBalance(tenantId, variantId, locationId);
    const ledger = await prisma.stockLedger.aggregate({
      where: { tenantId, variantId, locationId },
      _sum: { qtyDelta: true, qtyReservedDelta: true },
    });

    expect(balance.qtyReserved).toBe('0');
    expect(balance.qtyOnHand).toBe(ledger._sum.qtyDelta?.toString());
    expect(balance.qtyReserved).toBe((ledger._sum.qtyReservedDelta ?? 0).toString());
  });

  it('rejects releasing more than is reserved', async () => {
    await expect(stock.release({ ...base, qty: '1' })).rejects.toMatchObject({
      code: 'STOCK_RESERVATION_EXCEEDED',
    });
  });

  it('rejects negative adjustments that would cut below the reservation', async () => {
    await stock.adjust({ ...base, qty: '2' });
    await stock.reserve({ ...base, qty: '2', referenceId: 'order-2', referenceType: 'ORDER' });

    await expect(stock.adjust({ ...base, qty: '-5' })).rejects.toMatchObject({
      code: 'STOCK_BELOW_RESERVED',
    });
  });

  it('rejects zero or negative reservation quantities', async () => {
    await expect(stock.reserve({ ...base, qty: '0' })).rejects.toMatchObject({
      code: 'STOCK_INVALID_QUANTITY',
    });
    await expect(stock.reserve({ ...base, qty: '-1' })).rejects.toMatchObject({
      code: 'STOCK_INVALID_QUANTITY',
    });
  });
});
