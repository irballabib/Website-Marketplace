import { createHmac } from 'node:crypto';
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

const JWT_SECRET = 'payment-http-test-secret-with-at-least-32-chars';
const MOCK_SECRET = 'payment-http-test-mock-secret';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? JWT_SECRET;

interface PaymentBody {
  id: string;
  orderId: string | null;
  bookingId: string | null;
  gatewayReference: string | null;
  amount: string;
  currency: string;
  method: string;
  status: string;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface WebhookResponseBody {
  payment: PaymentBody;
  updated: boolean;
}

const PERMISSION_CODES = ['order.manage', 'order.view'];

suite('Payment API (HTTP)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let server: Parameters<typeof request>[0];

  const tenantId = generateUuidV7();
  const suffix = tenantId.slice(-8);
  const adminUserId = generateUuidV7();
  const viewerUserId = generateUuidV7();
  const adminEmail = `payment-admin-${suffix}@cutbray.local`;
  const viewerEmail = `payment-viewer-${suffix}@cutbray.local`;
  const createdPermissionIds: string[] = [];
  const previousNodeEnv = process.env.NODE_ENV;

  let adminToken = '';
  let viewerToken = '';

  beforeAll(async () => {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET must be set for the payment HTTP suite');
    }

    process.env.NODE_ENV = 'development';
    process.env.PAYMENT_ADAPTER = 'mock';
    process.env.PAYMENT_MOCK_SECRET = MOCK_SECRET;

    await prisma.tenant.create({
      data: { id: tenantId, name: `Payment Test ${suffix}`, code: `payment-${suffix}` },
    });

    const permissions: string[] = [];
    for (const code of PERMISSION_CODES) {
      const existing = await prisma.permission.findUnique({ where: { code } });
      if (existing) {
        permissions.push(existing.id);
        continue;
      }

      const created = await prisma.permission.create({
        data: { code, name: code, category: 'Order' },
      });
      createdPermissionIds.push(created.id);
      permissions.push(created.id);
    }

    const adminRole = await prisma.role.create({
      data: { tenantId, name: `payment-admin-${suffix}`, description: 'Payment test admin' },
    });
    const viewerRole = await prisma.role.create({
      data: { tenantId, name: `payment-viewer-${suffix}`, description: 'Payment test viewer' },
    });

    for (const permissionId of permissions) {
      await prisma.rolePermission.create({
        data: { tenantId, roleId: adminRole.id, permissionId },
      });
    }

    await prisma.user.create({
      data: {
        id: adminUserId,
        tenantId,
        email: adminEmail,
        fullName: 'Payment Admin',
        passwordHash: 'not-used-by-this-suite',
        isActive: true,
        isVerified: true,
      },
    });
    await prisma.user.create({
      data: {
        id: viewerUserId,
        tenantId,
        email: viewerEmail,
        fullName: 'Payment Viewer',
        passwordHash: 'not-used-by-this-suite',
        isActive: true,
        isVerified: true,
      },
    });

    await prisma.userRole.create({
      data: { tenantId, userId: adminUserId, roleId: adminRole.id },
    });
    await prisma.userRole.create({
      data: { tenantId, userId: viewerUserId, roleId: viewerRole.id },
    });

    const jwt = new JwtService({ secret: jwtSecret });
    adminToken = await jwt.signAsync({ sub: adminUserId, tenantId, type: 'access' });
    viewerToken = await jwt.signAsync({ sub: viewerUserId, tenantId, type: 'access' });

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
  });

  afterAll(async () => {
    await app?.close();
    await prisma.idempotencyKey.deleteMany({ where: { tenantId } });
    await prisma.payment.deleteMany({ where: { tenantId } });
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

  async function createPayment(
    orderId = 'ORDER-1001',
    idempotencyKey = `payment-key-${suffix}`
  ): Promise<PaymentBody> {
    const response = await request(server)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ orderId, amount: '150000', method: 'QRIS' })
      .expect(201);

    return response.body as PaymentBody;
  }

  function signWebhook(input: {
    orderId: string;
    status: string;
    gatewayReference: string;
    amount: string;
    statusCode: string;
  }): string {
    return createHmac('sha256', MOCK_SECRET)
      .update(
        [
          input.orderId,
          input.status,
          input.gatewayReference,
          input.amount,
          input.statusCode,
        ].join(':')
      )
      .digest('hex');
  }

  it('creates a pending payment and returns the same row for a repeated Idempotency-Key', async () => {
    const first = await createPayment();
    expect(first).toMatchObject({
      orderId: 'ORDER-1001',
      amount: '150000.00',
      currency: 'IDR',
      method: 'QRIS',
      status: 'PENDING',
      paidAt: null,
    });
    expect(first.gatewayReference).toMatch(/^MOCK-/);

    const second = await createPayment();
    expect(second.id).toBe(first.id);
    expect(await prisma.payment.count({ where: { tenantId } })).toBe(1);
  });

  it('rejects payment creation without permission and invalid amounts', async () => {
    await request(server)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ orderId: 'ORDER-1002', amount: '150000', method: 'QRIS' })
      .expect(403);

    await request(server)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderId: 'ORDER-1003', amount: '0', method: 'QRIS' })
      .expect(400);
  });

  it('rejects a bad signature and settles a payment through a signed webhook idempotently', async () => {
    const payment = await createPayment('ORDER-2001', `payment-webhook-${suffix}`);
    expect(payment.gatewayReference).not.toBeNull();
    const gatewayReference = payment.gatewayReference as string;

    await request(server)
      .post('/api/v1/payments/webhook/midtrans')
      .send({
        orderId: 'ORDER-2001',
        gatewayReference,
        amount: payment.amount,
        status: 'PAID',
        statusCode: '200',
        signature: 'bad-signature',
      })
      .expect(401);

    const signature = signWebhook({
      orderId: 'ORDER-2001',
      status: 'PAID',
      gatewayReference,
      amount: '150000.00',
      statusCode: '200',
    });

    const firstWebhook = await request(server)
      .post('/api/v1/payments/webhook/midtrans')
      .send({
        orderId: 'ORDER-2001',
        gatewayReference,
        amount: '150000.00',
        status: 'PAID',
        statusCode: '200',
        signature,
      })
      .expect(200);
    const firstBody = firstWebhook.body as WebhookResponseBody;
    expect(firstBody.updated).toBe(true);
    expect(firstBody.payment.status).toBe('PAID');
    expect(firstBody.payment.paidAt).not.toBeNull();

    const secondWebhook = await request(server)
      .post('/api/v1/payments/webhook/midtrans')
      .send({
        orderId: 'ORDER-2001',
        gatewayReference,
        amount: '150000.00',
        status: 'PAID',
        statusCode: '200',
        signature,
      })
      .expect(200);
    const secondBody = secondWebhook.body as WebhookResponseBody;
    expect(secondBody.updated).toBe(false);
    expect(secondBody.payment.status).toBe('PAID');

    expect(await prisma.payment.count({ where: { tenantId } })).toBe(1);
    expect(
      await prisma.idempotencyKey.count({
        where: { tenantId, scope: 'payment.webhook' },
      })
    ).toBe(1);
  });

  it('simulates a webhook only in development and is idempotent', async () => {
    const payment = await createPayment('ORDER-3001', `payment-simulate-${suffix}`);

    const first = await request(server)
      .post('/api/v1/dev/payments/simulate')
      .send({ orderId: 'ORDER-3001', status: 'PAID' })
      .expect(200);
    const firstBody = first.body as WebhookResponseBody;
    expect(firstBody.updated).toBe(true);
    expect(firstBody.payment.id).toBe(payment.id);
    expect(firstBody.payment.status).toBe('PAID');

    const second = await request(server)
      .post('/api/v1/dev/payments/simulate')
      .send({ orderId: 'ORDER-3001', status: 'PAID' })
      .expect(200);
    expect((second.body as WebhookResponseBody).updated).toBe(false);
  });

  it('returns payment details for the owning tenant', async () => {
    const payment = await createPayment('ORDER-4001', `payment-get-${suffix}`);

    const detail = await request(server)
      .get(`/api/v1/payments/${payment.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((detail.body as PaymentBody).id).toBe(payment.id);

    await request(server)
      .get('/api/v1/payments/00000000-0000-7000-8000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
