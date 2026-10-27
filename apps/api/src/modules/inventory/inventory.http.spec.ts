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

const JWT_SECRET = 'inventory-http-test-secret-32-characters';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? JWT_SECRET;

const PERMISSION_CODE = 'inventory.adjust';

suite('Inventory API (HTTP)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let server: Parameters<typeof request>[0];

  const tenantId = generateUuidV7();
  const suffix = tenantId.slice(-8);
  const categoryId = generateUuidV7();
  const productId = generateUuidV7();
  const variantId = generateUuidV7();
  const locationAId = generateUuidV7();
  const locationBId = generateUuidV7();
  const locationACode = `WH-A-${suffix}`;
  const locationBCode = `ST-B-${suffix}`;
  const userId = generateUuidV7();
  const email = `inventory-${suffix}@cutbray.local`;
  const createdPermissionIds: string[] = [];

  let token = '';

  beforeAll(async () => {
    await prisma.tenant.create({
      data: { id: tenantId, name: `Inventory Test ${suffix}`, code: `inv-${suffix}` },
    });
    await prisma.category.create({
      data: { id: categoryId, tenantId, name: `Inv Cat ${suffix}`, slug: `inv-cat-${suffix}` },
    });
    await prisma.product.create({
      data: {
        id: productId,
        tenantId,
        categoryId,
        name: 'Celana Inventory',
        slug: `inv-product-${suffix}`,
        skuPrefix: `INV${suffix.slice(0, 3)}`,
      },
    });
    await prisma.variant.create({
      data: {
        id: variantId,
        tenantId,
        productId,
        sku: `INV-${suffix}`,
        color: 'Hitam',
        size: '32',
        price: '150000.00',
      },
    });
    await prisma.location.create({
      data: {
        id: locationAId,
        tenantId,
        code: locationACode,
        name: 'Gudang A',
        type: 'WAREHOUSE',
      },
    });
    await prisma.location.create({
      data: {
        id: locationBId,
        tenantId,
        code: locationBCode,
        name: 'Toko B',
        type: 'STORE',
      },
    });

    const existing = await prisma.permission.findUnique({ where: { code: PERMISSION_CODE } });
    const permission =
      existing ??
      (await prisma.permission.create({
        data: { code: PERMISSION_CODE, name: 'Adjust Inventory', category: 'Inventory' },
      }));
    if (!existing) {
      createdPermissionIds.push(permission.id);
    }

    const role = await prisma.role.create({
      data: { tenantId, name: `inventory-${suffix}`, description: 'Inventory test role' },
    });
    await prisma.rolePermission.create({
      data: { tenantId, roleId: role.id, permissionId: permission.id },
    });
    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        email,
        fullName: 'Inventory Admin',
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
    await prisma.stockLedger.deleteMany({ where: { tenantId } });
    await prisma.stockBalance.deleteMany({ where: { tenantId } });
    await prisma.stockBalance.createMany({
      data: [
        {
          id: generateUuidV7(),
          tenantId,
          variantId,
          locationId: locationAId,
          qtyOnHand: '10',
          qtyReserved: '0',
        },
        {
          id: generateUuidV7(),
          tenantId,
          variantId,
          locationId: locationBId,
          qtyOnHand: '2',
          qtyReserved: '0',
        },
      ],
    });
  });

  afterAll(async () => {
    await app?.close();
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

  it('lists stock and locations, adjusts stock, and writes a ledger row', async () => {
    const stock = await request(server)
      .get('/api/v1/admin/inventory/stock')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(stock.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ variantId, locationId: locationAId, qtyOnHand: '10.0000' }),
        expect.objectContaining({ variantId, locationId: locationBId, qtyOnHand: '2.0000' }),
      ])
    );

    const locations = await request(server)
      .get('/api/v1/admin/inventory/locations')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(locations.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: locationAId }),
        expect.objectContaining({ id: locationBId }),
      ])
    );

    const adjusted = await request(server)
      .post('/api/v1/admin/inventory/adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({ variantId, locationId: locationAId, qty: '5', note: 'Restock' })
      .expect(201);
    expect(adjusted.body).toMatchObject({ qtyOnHand: '15', qtyAvailable: '15' });

    const ledger = await request(server)
      .get(`/api/v1/admin/inventory/ledger?variantId=${variantId}&locationId=${locationAId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(ledger.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ movementType: 'ADJUSTMENT', qtyDelta: '5.0000' }),
      ])
    );
  });

  it('transfers stock atomically between locations', async () => {
    const transfer = await request(server)
      .post('/api/v1/admin/inventory/transfers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        variantId,
        fromLocationId: locationAId,
        toLocationId: locationBId,
        qty: '4',
      })
      .expect(201);

    expect(transfer.body).toMatchObject({
      from: { qtyOnHand: '6' },
      to: { qtyOnHand: '6' },
    });
    expect(
      await prisma.stockLedger.count({ where: { tenantId, referenceType: 'TRANSFER' } })
    ).toBe(2);
  });

  it('rolls back a transfer when the source has insufficient stock', async () => {
    const response = await request(server)
      .post('/api/v1/admin/inventory/transfers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        variantId,
        fromLocationId: locationAId,
        toLocationId: locationBId,
        qty: '100',
      })
      .expect(409);
    expect(response.body).toMatchObject({ code: 'INVENTORY_STOCK_ERROR' });

    const balances = await prisma.stockBalance.findMany({ where: { tenantId } });
    expect(balances.find((row) => row.locationId === locationAId)?.qtyOnHand.toString()).toBe('10');
    expect(balances.find((row) => row.locationId === locationBId)?.qtyOnHand.toString()).toBe('2');
    expect(await prisma.stockLedger.count({ where: { tenantId } })).toBe(0);
  });

  it('requires inventory permission', async () => {
    await request(server).get('/api/v1/admin/inventory/stock').expect(401);
  });
});
