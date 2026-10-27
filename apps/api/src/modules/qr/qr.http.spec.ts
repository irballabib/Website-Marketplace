import { VersioningType, ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { generateUuidV7 } from '../../common/id';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

const JWT_SECRET = 'qr-http-test-secret-with-at-least-32-characters';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? JWT_SECRET;

const PERMISSION_CODE = 'catalog.product.manage';

interface QrBody {
  code: string;
  targetUrl: string;
  shortUrl: string;
}

suite('QR API (HTTP)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let server: Parameters<typeof request>[0];

  const tenantId = generateUuidV7();
  const suffix = tenantId.slice(-8);
  const tenantCode = `qr-${suffix}`;
  const categoryId = generateUuidV7();
  const productId = generateUuidV7();
  const locationId = generateUuidV7();
  const userId = generateUuidV7();
  const productSlug = `qr-product-${suffix}`;
  const locationCode = `QR-${suffix}`.toUpperCase();

  let token = '';
  let createdPermissionId: string | undefined;

  beforeAll(async () => {
    process.env.QR_BASE_URL = 'http://localhost:3000';

    await prisma.tenant.create({
      data: { id: tenantId, name: `QR Test ${suffix}`, code: tenantCode },
    });
    await prisma.category.create({
      data: { id: categoryId, tenantId, name: `QR Category ${suffix}`, slug: `qr-cat-${suffix}` },
    });
    await prisma.product.create({
      data: {
        id: productId,
        tenantId,
        categoryId,
        name: 'QR Product',
        slug: productSlug,
        skuPrefix: `QR-${suffix}`,
      },
    });
    await prisma.location.create({
      data: {
        id: locationId,
        tenantId,
        code: locationCode,
        name: 'QR Store',
        type: 'STORE',
      },
    });

    const existing = await prisma.permission.findUnique({ where: { code: PERMISSION_CODE } });
    const permission =
      existing ??
      (await prisma.permission.create({
        data: { code: PERMISSION_CODE, name: 'Manage catalog', category: 'Catalog' },
      }));
    if (!existing) {
      createdPermissionId = permission.id;
    }

    const role = await prisma.role.create({
      data: { tenantId, name: `qr-admin-${suffix}`, description: 'QR test admin' },
    });
    await prisma.rolePermission.create({
      data: { tenantId, roleId: role.id, permissionId: permission.id },
    });
    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        email: `qr-${suffix}@cutbray.local`,
        fullName: 'QR Admin',
        passwordHash: 'not-used-by-this-suite',
        isActive: true,
        isVerified: true,
      },
    });
    await prisma.userRole.create({ data: { tenantId, userId, roleId: role.id } });

    const jwt = new JwtService({ secret: JWT_SECRET });
    token = await jwt.signAsync({ sub: userId, tenantId, type: 'access' });

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

  afterAll(async () => {
    await app?.close();
    await prisma.qRLink.deleteMany({ where: { tenantId } });
    await prisma.userRole.deleteMany({ where: { tenantId } });
    await prisma.rolePermission.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.role.deleteMany({ where: { tenantId } });
    await prisma.product.deleteMany({ where: { tenantId } });
    await prisma.category.deleteMany({ where: { tenantId } });
    await prisma.location.deleteMany({ where: { tenantId } });
    if (createdPermissionId) {
      await prisma.permission.deleteMany({ where: { id: createdPermissionId } });
    }
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  async function createQr(body: Record<string, unknown>): Promise<QrBody> {
    const response = await request(server)
      .post('/api/v1/admin/qr')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);

    return response.body as QrBody;
  }

  it('creates a location QR and resolves its short-link publicly', async () => {
    const qr = await createQr({ locationCode });
    expect(qr.targetUrl).toBe(`/c/${locationCode}`);
    expect(qr.shortUrl).toBe(`http://localhost:3000/q/${qr.code}`);

    const resolved = await request(server).get(`/api/v1/qr/${qr.code}`).expect(200);
    expect(resolved.body).toMatchObject({ code: qr.code, targetUrl: `/c/${locationCode}` });
  });

  it('creates a product QR and serves PNG/SVG images', async () => {
    const qr = await createQr({ productSlug });
    expect(qr.targetUrl).toBe(`/produk/${productSlug}`);

    const png = await request(server)
      .get(`/api/v1/admin/qr/${qr.code}/image?format=png`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(png.headers['content-type']).toContain('image/png');
    const pngBody: unknown = png.body;
    expect(Buffer.isBuffer(pngBody)).toBe(true);
    expect(pngBody instanceof Buffer ? pngBody.length : 0).toBeGreaterThan(0);

    const svg = await request(server)
      .get(`/api/v1/admin/qr/${qr.code}/image?format=svg`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(svg.headers['content-type']).toContain('image/svg+xml');
    const svgBody: unknown = svg.body;
    const svgText = Buffer.isBuffer(svgBody) ? svgBody.toString('utf8') : svg.text;
    expect(svgText).toContain('<svg');
  });

  it('rejects an empty target and returns 404 for an unknown code', async () => {
    const empty = await request(server)
      .post('/api/v1/admin/qr')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
    expect(empty.body).toMatchObject({ code: 'QR_INVALID_TARGET' });

    await request(server).get('/api/v1/qr/UNKNOWN1').expect(404);
  });
});
