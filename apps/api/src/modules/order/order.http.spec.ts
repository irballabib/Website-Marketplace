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

const JWT_SECRET = 'order-http-test-secret-with-at-least-32-characters';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? JWT_SECRET;

const PERMISSION_CODES = ['order.manage', 'order.view'];

interface OrderItemBody {
  id: string;
  variantId: string;
  productName: string;
  sku: string;
  qty: number;
  unitPrice: string;
  total: string;
}

interface OrderBody {
  id: string;
  orderNumber: string;
  status: string;
  locationId: string;
  subtotal: string;
  shippingCost: string;
  total: string;
  expiresAt: string;
  courier: string | null;
  trackingNumber: string | null;
  items: OrderItemBody[];
}

interface PaymentBody {
  id: string;
  orderId: string | null;
  status: string;
  amount: string;
  snapToken: string | null;
  redirectUrl: string | null;
}

suite('Order API (HTTP)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let server: Parameters<typeof request>[0];

  const tenantId = generateUuidV7();
  const suffix = tenantId.slice(-8);
  const tenantCode = `order-${suffix}`;
  const categoryId = generateUuidV7();
  const productId = generateUuidV7();
  const variantAId = generateUuidV7();
  const variantBId = generateUuidV7();
  const locationId = generateUuidV7();
  const adminUserId = generateUuidV7();
  const adminEmail = `order-admin-${suffix}@cutbray.local`;
  const createdPermissionIds: string[] = [];
  const previousNodeEnv = process.env.NODE_ENV;
  let adminToken = '';

  beforeAll(async () => {
    process.env.NODE_ENV = 'development';

    await prisma.tenant.create({
      data: { id: tenantId, name: `Order Test ${suffix}`, code: tenantCode },
    });
    await prisma.category.create({
      data: { id: categoryId, tenantId, name: `Kategori ${suffix}`, slug: `kategori-${suffix}` },
    });
    await prisma.product.create({
      data: {
        id: productId,
        tenantId,
        categoryId,
        name: 'Celana Cutbray Test',
        slug: `celana-test-${suffix}`,
        skuPrefix: `CT-${suffix}`,
      },
    });
    await prisma.variant.create({
      data: {
        id: variantAId,
        tenantId,
        productId,
        sku: `CT-A-${suffix}`,
        color: 'Hitam',
        size: '30',
        price: '150000.00',
      },
    });
    await prisma.variant.create({
      data: {
        id: variantBId,
        tenantId,
        productId,
        sku: `CT-B-${suffix}`,
        color: 'Hitam',
        size: '31',
        price: '175000.00',
      },
    });
    await prisma.location.create({
      data: {
        id: locationId,
        tenantId,
        code: `WH-${suffix}`,
        name: 'Gudang Test',
        type: 'WAREHOUSE',
      },
    });

    const permissions: { id: string }[] = [];
    for (const code of PERMISSION_CODES) {
      const existing = await prisma.permission.findUnique({ where: { code } });
      const permission =
        existing ??
        (await prisma.permission.create({
          data: { code, name: code, category: 'Order' },
        }));
      if (!existing) {
        createdPermissionIds.push(permission.id);
      }
      permissions.push(permission);
    }

    const role = await prisma.role.create({
      data: { tenantId, name: `order-admin-${suffix}`, description: 'Order test admin' },
    });
    for (const permission of permissions) {
      await prisma.rolePermission.create({
        data: { tenantId, roleId: role.id, permissionId: permission.id },
      });
    }
    await prisma.user.create({
      data: {
        id: adminUserId,
        tenantId,
        email: adminEmail,
        fullName: 'Order Admin',
        passwordHash: 'not-used-by-this-suite',
        isActive: true,
        isVerified: true,
      },
    });
    await prisma.userRole.create({ data: { tenantId, userId: adminUserId, roleId: role.id } });
    adminToken = await new JwtService({ secret: JWT_SECRET }).signAsync({
      sub: adminUserId,
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
    await prisma.idempotencyKey.deleteMany({ where: { tenantId } });
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.order.deleteMany({ where: { tenantId } });
    await prisma.stockLedger.deleteMany({ where: { tenantId } });
    await prisma.stockBalance.deleteMany({ where: { tenantId } });

    for (const [variantId, qty] of [
      [variantAId, '10'],
      [variantBId, '5'],
    ] as const) {
      await prisma.stockBalance.create({
        data: {
          id: generateUuidV7(),
          tenantId,
          variantId,
          locationId,
          qtyOnHand: qty,
          qtyReserved: '0',
        },
      });
    }
  });

  afterAll(async () => {
    await app?.close();
    await prisma.idempotencyKey.deleteMany({ where: { tenantId } });
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.order.deleteMany({ where: { tenantId } });
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
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  function orderPayload(overrides: Record<string, unknown> = {}) {
    return {
      items: [{ variantId: variantAId, qty: 2 }],
      customerName: 'Budi Test',
      customerPhone: '08123456789',
      fulfillmentType: 'SHIP',
      shippingAddress: 'Jl. Test No. 1, Jakarta',
      shippingCost: '20000',
      ...overrides,
    };
  }

  it('creates an order, reserves stock, and reuses the row for the same Idempotency-Key', async () => {
    const first = await request(server)
      .post('/api/v1/orders')
      .set('X-Tenant-Code', tenantCode)
      .set('Idempotency-Key', `order-key-${suffix}`)
      .send(orderPayload())
      .expect(201);
    const order = first.body as OrderBody;
    expect(order).toMatchObject({
      status: 'PENDING_PAYMENT',
      subtotal: '300000.00',
      shippingCost: '20000.00',
      total: '320000.00',
    });
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({
      variantId: variantAId,
      qty: 2,
      unitPrice: '150000.00',
      total: '300000.00',
    });

    const balance = await prisma.stockBalance.findUnique({
      where: {
        tenantId_variantId_locationId: {
          tenantId,
          variantId: variantAId,
          locationId,
        },
      },
    });
    expect(balance?.qtyReserved.toString()).toBe('2');

    const second = await request(server)
      .post('/api/v1/orders')
      .set('X-Tenant-Code', tenantCode)
      .set('Idempotency-Key', `order-key-${suffix}`)
      .send(orderPayload())
      .expect(201);
    expect((second.body as OrderBody).id).toBe(order.id);
    expect(await prisma.order.count({ where: { tenantId } })).toBe(1);

    const detail = await request(server)
      .get(`/api/v1/orders/${order.id}`)
      .set('X-Tenant-Code', tenantCode)
      .expect(200);
    expect((detail.body as OrderBody).id).toBe(order.id);
  });

  it('commits stock and marks the order paid after a settled payment webhook', async () => {
    const created = await request(server)
      .post('/api/v1/orders')
      .set('X-Tenant-Code', tenantCode)
      .send(orderPayload())
      .expect(201);
    const order = created.body as OrderBody;

    const paymentResponse = await request(server)
      .post(`/api/v1/payments/order/${order.id}`)
      .set('X-Tenant-Code', tenantCode)
      .expect(201);
    const payment = paymentResponse.body as PaymentBody;
    expect(payment).toMatchObject({
      orderId: order.id,
      status: 'PENDING',
      amount: '320000.00',
    });

    const simulated = await request(server)
      .post('/api/v1/dev/payments/simulate')
      .send({ orderId: order.id, status: 'PAID' })
      .expect(200);
    const settled = simulated.body as { payment: PaymentBody; updated: boolean };
    expect(settled.updated).toBe(true);
    expect(settled.payment.status).toBe('PAID');

    const detail = await request(server)
      .get(`/api/v1/orders/${order.id}`)
      .set('X-Tenant-Code', tenantCode)
      .expect(200);
    expect((detail.body as OrderBody).status).toBe('PAID');

    const balance = await prisma.stockBalance.findUnique({
      where: {
        tenantId_variantId_locationId: { tenantId, variantId: variantAId, locationId },
      },
    });
    expect(balance?.qtyOnHand.toString()).toBe('8');
    expect(balance?.qtyReserved.toString()).toBe('0');

    const again = await request(server)
      .post('/api/v1/dev/payments/simulate')
      .send({ orderId: order.id, status: 'PAID' })
      .expect(200);
    expect((again.body as { updated: boolean }).updated).toBe(false);

    const balanceAgain = await prisma.stockBalance.findUnique({
      where: {
        tenantId_variantId_locationId: { tenantId, variantId: variantAId, locationId },
      },
    });
    expect(balanceAgain?.qtyOnHand.toString()).toBe('8');
    expect(balanceAgain?.qtyReserved.toString()).toBe('0');
  });

  it('rejects oversell without creating an order or changing reservations', async () => {
    const response = await request(server)
      .post('/api/v1/orders')
      .set('X-Tenant-Code', tenantCode)
      .send(orderPayload({ items: [{ variantId: variantAId, qty: 11 }] }))
      .expect(409);
    expect(response.body).toMatchObject({ code: 'ORDER_STOCK_INSUFFICIENT' });
    expect(await prisma.order.count({ where: { tenantId } })).toBe(0);

    const balance = await prisma.stockBalance.findUnique({
      where: {
        tenantId_variantId_locationId: { tenantId, variantId: variantAId, locationId },
      },
    });
    expect(balance?.qtyReserved.toString()).toBe('0');
  });

  it('advances paid orders to shipment and exposes tracking publicly', async () => {
    const created = await request(server)
      .post('/api/v1/orders')
      .set('X-Tenant-Code', tenantCode)
      .send(orderPayload())
      .expect(201);
    const order = created.body as OrderBody;

    await request(server)
      .patch(`/api/v1/admin/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PROCESSING' })
      .expect(409);

    await request(server)
      .patch(`/api/v1/admin/orders/${order.id}/status`)
      .send({ status: 'PROCESSING' })
      .expect(401);

    await request(server)
      .post(`/api/v1/payments/order/${order.id}`)
      .set('X-Tenant-Code', tenantCode)
      .expect(201);
    await request(server)
      .post('/api/v1/dev/payments/simulate')
      .send({ orderId: order.id, status: 'PAID' })
      .expect(200);

    const processing = await request(server)
      .patch(`/api/v1/admin/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PROCESSING' })
      .expect(200);
    expect((processing.body as OrderBody).status).toBe('PROCESSING');

    const packed = await request(server)
      .patch(`/api/v1/admin/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PACKED' })
      .expect(200);
    expect((packed.body as OrderBody).status).toBe('PACKED');

    const shipment = await request(server)
      .patch(`/api/v1/admin/orders/${order.id}/shipment`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ courier: 'JNE', trackingNumber: 'JNE123456789' })
      .expect(200);
    const shipped = shipment.body as OrderBody;
    expect(shipped).toMatchObject({
      status: 'SHIPPED',
      courier: 'JNE',
      trackingNumber: 'JNE123456789',
    });

    const publicOrder = await request(server)
      .get(`/api/v1/orders/${order.id}`)
      .set('X-Tenant-Code', tenantCode)
      .expect(200);
    expect(publicOrder.body).toMatchObject({
      status: 'SHIPPED',
      courier: 'JNE',
      trackingNumber: 'JNE123456789',
    });

    const list = await request(server)
      .get('/api/v1/admin/orders?status=SHIPPED')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((list.body as OrderBody[]).some((item) => item.id === order.id)).toBe(true);

    const completed = await request(server)
      .patch(`/api/v1/admin/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED' })
      .expect(200);
    expect((completed.body as OrderBody).status).toBe('COMPLETED');
  });

  it('cancels an unpaid order when the gateway reports failure and releases stock', async () => {
    const created = await request(server)
      .post('/api/v1/orders')
      .set('X-Tenant-Code', tenantCode)
      .send(orderPayload())
      .expect(201);
    const order = created.body as OrderBody;

    await request(server)
      .post(`/api/v1/payments/order/${order.id}`)
      .set('X-Tenant-Code', tenantCode)
      .expect(201);

    const simulated = await request(server)
      .post('/api/v1/dev/payments/simulate')
      .send({ orderId: order.id, status: 'FAILED' })
      .expect(200);
    expect((simulated.body as { payment: PaymentBody }).payment.status).toBe('FAILED');

    const detail = await request(server)
      .get(`/api/v1/orders/${order.id}`)
      .set('X-Tenant-Code', tenantCode)
      .expect(200);
    expect((detail.body as OrderBody).status).toBe('CANCELLED');

    const balance = await prisma.stockBalance.findUnique({
      where: {
        tenantId_variantId_locationId: { tenantId, variantId: variantAId, locationId },
      },
    });
    expect(balance?.qtyReserved.toString()).toBe('0');
  });

  it('cancels an unpaid order and releases its reservation', async () => {
    const created = await request(server)
      .post('/api/v1/orders')
      .set('X-Tenant-Code', tenantCode)
      .send(orderPayload())
      .expect(201);
    const order = created.body as OrderBody;

    const cancelled = await request(server)
      .patch(`/api/v1/admin/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'CANCELLED' })
      .expect(200);
    expect((cancelled.body as OrderBody).status).toBe('CANCELLED');

    const balance = await prisma.stockBalance.findUnique({
      where: {
        tenantId_variantId_locationId: { tenantId, variantId: variantAId, locationId },
      },
    });
    expect(balance?.qtyReserved.toString()).toBe('0');
  });

  it('expires overdue orders and releases the reservation exactly once', async () => {
    const response = await request(server)
      .post('/api/v1/orders')
      .set('X-Tenant-Code', tenantCode)
      .send(orderPayload({ items: [{ variantId: variantAId, qty: 3 }] }))
      .expect(201);
    const order = response.body as OrderBody;

    await prisma.order.update({
      where: { id: order.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const expired = await request(server).post('/api/v1/dev/orders/expire').expect(200);
    expect(expired.body).toMatchObject({ expired: 1 });

    const after = await request(server)
      .get(`/api/v1/orders/${order.id}`)
      .set('X-Tenant-Code', tenantCode)
      .expect(200);
    expect((after.body as OrderBody).status).toBe('CANCELLED');

    const balance = await prisma.stockBalance.findUnique({
      where: {
        tenantId_variantId_locationId: { tenantId, variantId: variantAId, locationId },
      },
    });
    expect(balance?.qtyReserved.toString()).toBe('0');

    const again = await request(server).post('/api/v1/dev/orders/expire').expect(200);
    expect(again.body).toMatchObject({ expired: 0 });
  });

  it('validates shipping address and variant existence', async () => {
    const noAddress = await request(server)
      .post('/api/v1/orders')
      .set('X-Tenant-Code', tenantCode)
      .send(orderPayload({ shippingAddress: undefined }))
      .expect(400);
    expect(noAddress.body).toMatchObject({ code: 'ORDER_ADDRESS_REQUIRED' });

    const unknownVariant = await request(server)
      .post('/api/v1/orders')
      .set('X-Tenant-Code', tenantCode)
      .send(orderPayload({ items: [{ variantId: generateUuidV7(), qty: 1 }] }))
      .expect(404);
    expect(unknownVariant.body).toMatchObject({ code: 'ORDER_VARIANT_NOT_FOUND' });
  });
});
