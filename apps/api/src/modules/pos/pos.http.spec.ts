import { VersioningType, ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { generateUuidV7 } from '../../common/id';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

const JWT_SECRET = 'pos-http-test-secret-with-at-least-32-characters';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? JWT_SECRET;

const PERMISSION_CODES = ['pos.shift.manage', 'pos.sale.create', 'pos.sale.void', 'order.view'];

interface ShiftBody {
  id: string;
  status: string;
  openingCash: string;
  closingCash: string | null;
  expectedCash: string | null;
  difference: string | null;
}

interface SaleBody {
  id: string;
  receiptNumber: string;
  status: string;
  subtotal: string;
  discount: string;
  total: string;
  paymentTotal: string;
  payments: { method: string; amount: string }[];
  items: { variantId: string; qty: number }[];
}

suite('POS API (HTTP)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let server: Parameters<typeof request>[0];

  const tenantId = generateUuidV7();
  const suffix = tenantId.slice(-8);
  const tenantCode = `pos-${suffix}`;
  const categoryId = generateUuidV7();
  const productId = generateUuidV7();
  const variantId = generateUuidV7();
  const locationId = generateUuidV7();
  const locationCode = `POS-${suffix}`.toUpperCase();
  const userId = generateUuidV7();
  const email = `pos-${suffix}@cutbray.local`;
  const createdPermissionIds: string[] = [];

  let token = '';

  beforeAll(async () => {
    await prisma.tenant.create({
      data: { id: tenantId, name: `POS Test ${suffix}`, code: tenantCode },
    });
    await prisma.category.create({
      data: { id: categoryId, tenantId, name: `POS Category ${suffix}`, slug: `pos-cat-${suffix}` },
    });
    await prisma.product.create({
      data: {
        id: productId,
        tenantId,
        categoryId,
        name: 'Celana POS Test',
        slug: `pos-product-${suffix}`,
        skuPrefix: `POS${suffix.slice(0, 3)}`,
      },
    });
    await prisma.variant.create({
      data: {
        id: variantId,
        tenantId,
        productId,
        sku: `POS-V-${suffix}`,
        color: 'Hitam',
        size: '30',
        price: '150000.00',
      },
    });
    await prisma.location.create({
      data: {
        id: locationId,
        tenantId,
        code: locationCode,
        name: 'Toko POS Test',
        type: 'STORE',
      },
    });

    const permissions: { id: string }[] = [];
    for (const code of PERMISSION_CODES) {
      const existing = await prisma.permission.findUnique({ where: { code } });
      const permission =
        existing ??
        (await prisma.permission.create({
          data: { code, name: code, category: 'POS' },
        }));
      if (!existing) {
        createdPermissionIds.push(permission.id);
      }
      permissions.push(permission);
    }

    const role = await prisma.role.create({
      data: { tenantId, name: `pos-cashier-${suffix}`, description: 'POS test cashier' },
    });
    for (const permission of permissions) {
      await prisma.rolePermission.create({
        data: { tenantId, roleId: role.id, permissionId: permission.id },
      });
    }

    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        email,
        fullName: 'POS Cashier',
        passwordHash: 'not-used-by-this-suite',
        isActive: true,
        isVerified: true,
      },
    });
    await prisma.userRole.create({ data: { tenantId, userId, roleId: role.id } });

    token = await new JwtService({ secret: JWT_SECRET }).signAsync({
      sub: userId,
      tenantId,
      type: 'access',
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      })
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });

  beforeEach(async () => {
    await prisma.posSale.deleteMany({ where: { tenantId } });
    await prisma.posShift.deleteMany({ where: { tenantId } });
    await prisma.posSequence.deleteMany({ where: { tenantId } });
    await prisma.stockLedger.deleteMany({ where: { tenantId } });
    await prisma.stockBalance.deleteMany({ where: { tenantId } });
    await prisma.stockBalance.create({
      data: {
        id: generateUuidV7(),
        tenantId,
        variantId,
        locationId,
        qtyOnHand: '10',
        qtyReserved: '0',
      },
    });
  });

  afterAll(async () => {
    await app?.close();
    await prisma.posSale.deleteMany({ where: { tenantId } });
    await prisma.posShift.deleteMany({ where: { tenantId } });
    await prisma.posSequence.deleteMany({ where: { tenantId } });
    await prisma.stockLedger.deleteMany({ where: { tenantId } });
    await prisma.stockBalance.deleteMany({ where: { tenantId } });
    await prisma.variant.deleteMany({ where: { tenantId } });
    await prisma.product.deleteMany({ where: { tenantId } });
    await prisma.category.deleteMany({ where: { tenantId } });
    await prisma.location.deleteMany({ where: { tenantId } });
    await prisma.userRole.deleteMany({ where: { tenantId } });
    await prisma.rolePermission.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.role.deleteMany({ where: { tenantId } });
    if (createdPermissionIds.length > 0) {
      await prisma.permission.deleteMany({ where: { id: { in: createdPermissionIds } } });
    }
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  async function openShift(): Promise<ShiftBody> {
    const response = await request(server)
      .post('/api/v1/pos/shifts/open')
      .set('Authorization', `Bearer ${token}`)
      .send({ locationId, openingCash: '100000' })
      .expect(201);

    return response.body as ShiftBody;
  }

  function salePayload(shiftId: string, overrides: Record<string, unknown> = {}) {
    return {
      shiftId,
      items: [{ variantId, qty: 2 }],
      discount: '0',
      payments: [
        { method: 'CASH', amount: '200000' },
        { method: 'QRIS', amount: '100000' },
      ],
      customerName: 'Walk-in',
      ...overrides,
    };
  }

  it('opens a shift, records a split-payment sale, and is idempotent', async () => {
    const locations = await request(server)
      .get('/api/v1/pos/locations')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((locations.body as { id: string }[]).some((item) => item.id === locationId)).toBe(true);

    const catalog = await request(server)
      .get(`/api/v1/pos/catalog?locationId=${locationId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((catalog.body as { variantId: string; stockAvailable: string }[])[0]).toMatchObject({
      variantId,
      stockAvailable: '10',
    });

    const shift = await openShift();
    const key = `pos-sale-${suffix}`;
    const first = await request(server)
      .post('/api/v1/pos/sales')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send(salePayload(shift.id))
      .expect(201);
    const sale = first.body as SaleBody;

    expect(sale).toMatchObject({
      status: 'COMPLETED',
      subtotal: '300000.00',
      discount: '0.00',
      total: '300000.00',
      paymentTotal: '300000.00',
    });
    expect(sale.receiptNumber).toBe(`POS-${locationCode}-000001`);
    expect(sale.payments).toHaveLength(2);

    const balance = await prisma.stockBalance.findUnique({
      where: { tenantId_variantId_locationId: { tenantId, variantId, locationId } },
    });
    expect(balance?.qtyOnHand.toString()).toBe('8');

    const second = await request(server)
      .post('/api/v1/pos/sales')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send(salePayload(shift.id))
      .expect(201);
    expect((second.body as SaleBody).id).toBe(sale.id);
    const balanceAfter = await prisma.stockBalance.findUnique({
      where: { tenantId_variantId_locationId: { tenantId, variantId, locationId } },
    });
    expect(balanceAfter?.qtyOnHand.toString()).toBe('8');
    expect(await prisma.posSale.count({ where: { tenantId } })).toBe(1);
  });

  it('closes a shift with the expected cash and difference', async () => {
    const shift = await openShift();
    await request(server)
      .post('/api/v1/pos/sales')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `pos-close-${suffix}`)
      .send(salePayload(shift.id))
      .expect(201);

    const closed = await request(server)
      .post(`/api/v1/pos/shifts/${shift.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ closingCash: '300000' })
      .expect(201);
    const body = closed.body as ShiftBody;
    expect(body).toMatchObject({
      status: 'CLOSED',
      openingCash: '100000.00',
      closingCash: '300000.00',
      expectedCash: '300000.00',
      difference: '0.00',
    });
  });

  it('voids a sale and returns the stock', async () => {
    const shift = await openShift();
    const created = await request(server)
      .post('/api/v1/pos/sales')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `pos-void-${suffix}`)
      .send(salePayload(shift.id))
      .expect(201);
    const sale = created.body as SaleBody;

    const voided = await request(server)
      .post(`/api/v1/pos/sales/${sale.id}/void`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Salah input ukuran' })
      .expect(201);
    expect((voided.body as SaleBody).status).toBe('VOID');

    const balance = await prisma.stockBalance.findUnique({
      where: { tenantId_variantId_locationId: { tenantId, variantId, locationId } },
    });
    expect(balance?.qtyOnHand.toString()).toBe('10');
  });

  it('rejects a large discount without approval and a payment mismatch', async () => {
    const shift = await openShift();

    const discount = await request(server)
      .post('/api/v1/pos/sales')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `pos-discount-${suffix}`)
      .send(
        salePayload(shift.id, {
          discount: '20000',
          payments: [{ method: 'CASH', amount: '280000' }],
        })
      )
      .expect(403);
    expect(discount.body).toMatchObject({ code: 'POS_DISCOUNT_APPROVAL_REQUIRED' });

    const mismatch = await request(server)
      .post('/api/v1/pos/sales')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `pos-mismatch-${suffix}`)
      .send(salePayload(shift.id, { payments: [{ method: 'CASH', amount: '100000' }] }))
      .expect(400);
    expect(mismatch.body).toMatchObject({ code: 'POS_PAYMENT_MISMATCH' });
  });
});
