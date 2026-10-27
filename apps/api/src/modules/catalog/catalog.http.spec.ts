import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { VersioningType, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module';
import { generateUuidV7 } from '../../common/id';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { MAX_IMAGE_BYTES } from './catalog-media';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

const JWT_SECRET = 'catalog-http-test-secret-with-at-least-32-characters';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? JWT_SECRET;

const PERMISSION_CODE = 'catalog.product.manage';
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64'
);

interface CategoryBody {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  sortOrder: number;
}

interface VariantBody {
  id: string;
  productId: string;
  sku: string;
  barcode: string | null;
  price: string;
  costPrice: string | null;
  isActive: boolean;
  stockAvailable?: string;
}

interface ProductMediaBody {
  id: string;
  url: string;
  alt: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

interface ProductBody {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  media: ProductMediaBody[];
  variants: VariantBody[];
}

interface ListBody {
  data: ProductBody[];
  nextCursor: string | null;
}

interface ErrorBody {
  code?: string;
  details?: unknown;
}

type ProductOverrides = Partial<{
  name: string;
  slug: string;
  skuPrefix: string;
  description: string | null;
  isActive: boolean;
}>;

type VariantOverrides = Partial<{
  sku: string;
  barcode: string | null;
  color: string;
  size: string;
  price: string;
  costPrice: string | null;
  weight: string | null;
  isActive: boolean;
}>;

suite('Catalog API (HTTP)', () => {
  const prisma = new PrismaClient();
  let app: NestExpressApplication;
  let server: Parameters<typeof request>[0];

  const tenantId = generateUuidV7();
  const suffix = tenantId.slice(-8);
  const tenantCode = `catalog-${suffix}`;
  const otherTenantId = generateUuidV7();
  const otherTenantCode = `catalog-other-${suffix}`;
  const categoryId = generateUuidV7();
  const categorySlug = `celana-${suffix}`;
  const locationId = generateUuidV7();
  const locationCode = `ST-${suffix}`.toUpperCase();

  const adminUserId = generateUuidV7();
  const viewerUserId = generateUuidV7();
  const adminEmail = `catalog-admin-${suffix}@cutbray.local`;
  const viewerEmail = `catalog-viewer-${suffix}@cutbray.local`;

  let adminToken = '';
  let viewerToken = '';
  let permissionWasSeeded = false;
  let productCounter = 0;
  let storagePath = '';

  beforeAll(async () => {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET must be set for the catalog HTTP suite');
    }

    storagePath = mkdtempSync(join(tmpdir(), 'cutbray-catalog-media-'));
    process.env.STORAGE_ADAPTER = 'mock';
    process.env.STORAGE_LOCAL_PATH = storagePath;

    await prisma.tenant.create({
      data: { id: tenantId, name: `Catalog Test ${suffix}`, code: tenantCode },
    });
    await prisma.tenant.create({
      data: { id: otherTenantId, name: `Catalog Other ${suffix}`, code: otherTenantCode },
    });

    await prisma.category.create({
      data: {
        id: categoryId,
        tenantId,
        name: `Celana Panjang ${suffix}`,
        slug: categorySlug,
        sortOrder: 1,
      },
    });

    await prisma.location.create({
      data: {
        id: locationId,
        tenantId,
        code: locationCode,
        name: `Toko ${suffix}`,
        type: 'STORE',
      },
    });

    const existingPermission = await prisma.permission.findUnique({
      where: { code: PERMISSION_CODE },
    });
    permissionWasSeeded = existingPermission !== null;
    const permission =
      existingPermission ??
      (await prisma.permission.create({
        data: { code: PERMISSION_CODE, name: 'Manage catalog', category: 'Catalog' },
      }));

    const adminRole = await prisma.role.create({
      data: { tenantId, name: `catalog-admin-${suffix}`, description: 'Catalog test admin' },
    });
    const viewerRole = await prisma.role.create({
      data: { tenantId, name: `catalog-viewer-${suffix}`, description: 'Catalog test viewer' },
    });

    await prisma.rolePermission.create({
      data: { tenantId, roleId: adminRole.id, permissionId: permission.id },
    });

    await prisma.user.create({
      data: {
        id: adminUserId,
        tenantId,
        email: adminEmail,
        fullName: 'Catalog Admin',
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
        fullName: 'Catalog Viewer',
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

    app = moduleRef.createNestApplication<NestExpressApplication>();
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
    app.useStaticAssets(resolve(process.cwd(), storagePath, 'catalog'), {
      prefix: '/uploads/catalog/',
      index: false,
    });

    await app.init();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });

  beforeEach(async () => {
    productCounter = 0;
    await prisma.stockBalance.deleteMany({ where: { tenantId } });
    await prisma.variant.deleteMany({ where: { tenantId } });
    await prisma.product.deleteMany({ where: { tenantId } });
  });

  afterAll(async () => {
    await app?.close();
    await prisma.stockBalance.deleteMany({ where: { tenantId } });
    await prisma.variant.deleteMany({ where: { tenantId } });
    await prisma.product.deleteMany({ where: { tenantId } });
    await prisma.category.deleteMany({ where: { tenantId } });
    await prisma.location.deleteMany({ where: { tenantId } });
    await prisma.userRole.deleteMany({ where: { tenantId } });
    await prisma.rolePermission.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.role.deleteMany({ where: { tenantId } });
    if (!permissionWasSeeded) {
      await prisma.permission.deleteMany({ where: { code: PERMISSION_CODE } });
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
    if (storagePath) {
      rmSync(storagePath, { recursive: true, force: true });
    }
  });

  function publicHeader() {
    return { 'X-Tenant-Code': tenantCode };
  }

  async function createProduct(overrides: ProductOverrides = {}): Promise<ProductBody> {
    productCounter += 1;
    const response = await request(server)
      .post('/api/v1/admin/catalog/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categoryId,
        name: `Produk ${productCounter}`,
        slug: `produk-${productCounter}`,
        skuPrefix: `P${productCounter}`,
        ...overrides,
      })
      .expect(201);

    return response.body as ProductBody;
  }

  async function createVariant(
    productId: string,
    overrides: VariantOverrides = {}
  ): Promise<VariantBody> {
    const response = await request(server)
      .post(`/api/v1/admin/catalog/products/${productId}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: `SKU-${generateUuidV7().slice(-8).toUpperCase()}`,
        barcode: `899${generateUuidV7().replace(/-/g, '').slice(-10).toUpperCase()}`,
        color: 'Hitam',
        size: '30',
        price: '199000',
        ...overrides,
      })
      .expect(201);

    return response.body as VariantBody;
  }

  it('serves active categories and an empty public product list', async () => {
    const categories = await request(server)
      .get('/api/v1/catalog/categories')
      .set(publicHeader())
      .expect(200);

    expect((categories.body as { data: CategoryBody[] }).data).toContainEqual({
      id: categoryId,
      name: `Celana Panjang ${suffix}`,
      slug: categorySlug,
      imageUrl: null,
      sortOrder: 1,
    });

    const products = await request(server)
      .get('/api/v1/catalog/products')
      .set(publicHeader())
      .expect(200);

    expect(products.body).toEqual({ data: [], nextCursor: null });
  });

  it('protects admin writes with JWT and the catalog permission', async () => {
    const payload = {
      categoryId,
      name: 'Produk Auth',
      slug: `produk-auth-${suffix}`,
      skuPrefix: 'AUTH',
    };

    const anonymous = await request(server)
      .post('/api/v1/admin/catalog/products')
      .send(payload)
      .expect(401);
    expect(anonymous.body).toMatchObject({ code: 'AUTH_INVALID_TOKEN' });

    const forbidden = await request(server)
      .post('/api/v1/admin/catalog/products')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send(payload)
      .expect(403);
    expect(forbidden.body).toMatchObject({ code: 'AUTH_FORBIDDEN' });

    const created = await request(server)
      .post('/api/v1/admin/catalog/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload)
      .expect(201);
    expect(created.body).toMatchObject({
      name: 'Produk Auth',
      slug: `produk-auth-${suffix}`,
      variants: [],
    });
  });

  it('creates variants and rejects duplicate SKU, duplicate barcode, and invalid prices', async () => {
    const product = await createProduct({ name: 'Produk Varian', slug: 'produk-varian' });
    const variant = await createVariant(product.id, {
      sku: 'SKU-DUPLICATE-1',
      barcode: '8991234567890',
      price: '199000',
    });

    expect(variant).toMatchObject({
      sku: 'SKU-DUPLICATE-1',
      barcode: '8991234567890',
      price: '199000.00',
      isActive: true,
    });

    const duplicateSku = await request(server)
      .post(`/api/v1/admin/catalog/products/${product.id}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: 'SKU-DUPLICATE-1', color: 'Hitam', size: '31', price: '199000' })
      .expect(409);
    expect(duplicateSku.body).toMatchObject({ code: 'CATALOG_SKU_TAKEN' });

    const duplicateBarcode = await request(server)
      .post(`/api/v1/admin/catalog/products/${product.id}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sku: 'SKU-DUPLICATE-2',
        barcode: '8991234567890',
        color: 'Hitam',
        size: '32',
        price: '199000',
      })
      .expect(409);
    expect(duplicateBarcode.body).toMatchObject({ code: 'CATALOG_BARCODE_TAKEN' });

    const malformed = await request(server)
      .post(`/api/v1/admin/catalog/products/${product.id}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: 'SKU-BAD-PRICE', color: 'Hitam', size: '33', price: '12.345' })
      .expect(400);
    expect(malformed.body).toMatchObject({ code: 'BAD_REQUEST' });
    expect(Array.isArray((malformed.body as ErrorBody).details)).toBe(true);

    const zero = await request(server)
      .post(`/api/v1/admin/catalog/products/${product.id}/variants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: 'SKU-ZERO-PRICE', color: 'Hitam', size: '34', price: '0' })
      .expect(400);
    expect(zero.body).toMatchObject({ code: 'CATALOG_INVALID_PRICE' });
  });

  it('returns per-location stock on the public product detail', async () => {
    const product = await createProduct({ name: 'Produk Stok', slug: 'produk-stok' });
    const variant = await createVariant(product.id, {
      sku: `SKU-STOCK-${suffix}`,
      barcode: null,
      price: '199000',
    });

    await prisma.stockBalance.create({
      data: {
        id: generateUuidV7(),
        tenantId,
        variantId: variant.id,
        locationId,
        qtyOnHand: '7',
        qtyReserved: '2',
      },
    });

    const detail = await request(server)
      .get(`/api/v1/catalog/products/produk-stok?locationCode=${locationCode}`)
      .set(publicHeader())
      .expect(200);
    const body = detail.body as ProductBody;
    expect(body.variants.find((item) => item.id === variant.id)?.stockAvailable).toBe('5');

    const location = await request(server)
      .get(`/api/v1/catalog/locations/${locationCode}`)
      .set(publicHeader())
      .expect(200);
    expect(location.body).toMatchObject({ code: locationCode, type: 'STORE' });
  });

  it('uploads, lists, and deletes product media with local storage', async () => {
    const product = await createProduct({ name: 'Produk Media', slug: 'produk-media' });

    const first = await request(server)
      .post(`/api/v1/admin/catalog/products/${product.id}/media`)
      .set('Authorization', `Bearer ${adminToken}`)
      .field('alt', 'Tampak depan')
      .attach('file', PNG_1X1, { filename: 'depan.png', contentType: 'image/png' })
      .expect(201);
    const firstMedia = first.body as ProductMediaBody;
    expect(firstMedia).toMatchObject({ alt: 'Tampak depan', isPrimary: true, sortOrder: 0 });
    expect(firstMedia.url).toMatch(/^\/uploads\/catalog\/[0-9a-f-]+\/[0-9a-f-]+\.png$/);
    expect(existsSync(join(storagePath, firstMedia.url.replace('/uploads/', '')))).toBe(true);

    const served = await request(server).get(firstMedia.url).expect(200);
    expect(served.headers['content-type']).toContain('image/png');

    const second = await request(server)
      .post(`/api/v1/admin/catalog/products/${product.id}/media`)
      .set('Authorization', `Bearer ${adminToken}`)
      .field('sortOrder', '5')
      .attach('file', PNG_1X1, { filename: 'belakang.png', contentType: 'image/png' })
      .expect(201);
    const secondMedia = second.body as ProductMediaBody;
    expect(secondMedia).toMatchObject({ isPrimary: false, sortOrder: 5 });

    const third = await request(server)
      .post(`/api/v1/admin/catalog/products/${product.id}/media`)
      .set('Authorization', `Bearer ${adminToken}`)
      .field('isPrimary', 'true')
      .attach('file', PNG_1X1, { filename: 'utama.png', contentType: 'image/png' })
      .expect(201);
    const thirdMedia = third.body as ProductMediaBody;
    expect(thirdMedia.isPrimary).toBe(true);

    const detail = await request(server)
      .get('/api/v1/catalog/products/produk-media')
      .set(publicHeader())
      .expect(200);
    const detailBody = detail.body as ProductBody;
    expect(detailBody.media).toHaveLength(3);
    expect(detailBody.media.filter((media) => media.isPrimary)).toHaveLength(1);
    expect(detailBody.media.find((media) => media.isPrimary)?.id).toBe(thirdMedia.id);

    const invalidType = await request(server)
      .post(`/api/v1/admin/catalog/products/${product.id}/media`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('plain text'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      })
      .expect(400);
    expect(invalidType.body).toMatchObject({ code: 'CATALOG_INVALID_MEDIA_TYPE' });

    const invalidContent = await request(server)
      .post(`/api/v1/admin/catalog/products/${product.id}/media`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('not a real png'), {
        filename: 'fake.png',
        contentType: 'image/png',
      })
      .expect(400);
    expect(invalidContent.body).toMatchObject({ code: 'CATALOG_INVALID_MEDIA_CONTENT' });

    const tooLarge = await request(server)
      .post(`/api/v1/admin/catalog/products/${product.id}/media`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.alloc(MAX_IMAGE_BYTES + 1), {
        filename: 'too-large.png',
        contentType: 'image/png',
      })
      .expect(413);
    expect(tooLarge.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });

    await request(server)
      .delete(`/api/v1/admin/catalog/products/${product.id}/media/${firstMedia.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);
    expect(existsSync(join(storagePath, firstMedia.url.replace('/uploads/', '')))).toBe(false);

    const adminList = await request(server)
      .get('/api/v1/admin/catalog/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const updatedProduct = (adminList.body as ListBody).data.find((item) => item.id === product.id);
    expect(updatedProduct?.media.map((media) => media.id)).not.toContain(firstMedia.id);
  });

  it('paginates public products, filters by search, and resolves a variant by SKU', async () => {
    const first = await createProduct({ name: 'Alpha Cutbray', slug: 'alpha-cutbray' });
    const second = await createProduct({ name: 'Beta Cutbray', slug: 'beta-cutbray' });
    const third = await createProduct({ name: 'Gamma Celana', slug: 'gamma-celana' });
    const variant = await createVariant(first.id, { sku: 'SKU-PUBLIC-1', price: '250000' });

    const page1 = await request(server)
      .get('/api/v1/catalog/products?limit=2')
      .set(publicHeader())
      .expect(200);
    const page1Body = page1.body as ListBody;
    expect(page1Body.data.map((product) => product.id)).toEqual([third.id, second.id]);
    if (!page1Body.nextCursor) {
      throw new Error('Expected a next cursor');
    }

    const page2 = await request(server)
      .get(`/api/v1/catalog/products?limit=2&cursor=${page1Body.nextCursor}`)
      .set(publicHeader())
      .expect(200);
    const page2Body = page2.body as ListBody;
    expect(page2Body.data.map((product) => product.id)).toEqual([first.id]);
    expect(page2Body.nextCursor).toBeNull();

    const search = await request(server)
      .get('/api/v1/catalog/products?q=Alpha')
      .set(publicHeader())
      .expect(200);
    expect((search.body as ListBody).data.map((product) => product.slug)).toEqual([
      'alpha-cutbray',
    ]);

    const byCategory = await request(server)
      .get(`/api/v1/catalog/products?category=${categorySlug}`)
      .set(publicHeader())
      .expect(200);
    expect((byCategory.body as ListBody).data).toHaveLength(3);

    const detail = await request(server)
      .get('/api/v1/catalog/products/alpha-cutbray')
      .set(publicHeader())
      .expect(200);
    expect(detail.body).toMatchObject({
      id: first.id,
      variants: [{ id: variant.id, sku: 'SKU-PUBLIC-1', price: '250000.00' }],
    });

    const bySku = await request(server)
      .get('/api/v1/catalog/variants/SKU-PUBLIC-1')
      .set(publicHeader())
      .expect(200);
    expect(bySku.body).toMatchObject({
      id: variant.id,
      sku: 'SKU-PUBLIC-1',
      price: '250000.00',
      product: { id: first.id, slug: 'alpha-cutbray' },
    });
  });

  it('updates products and variants and hides inactive products from public reads', async () => {
    const product = await createProduct({ name: 'Produk Update', slug: 'produk-update' });
    const variant = await createVariant(product.id, { sku: 'SKU-UPDATE-1', price: '100000' });

    const updatedProduct = await request(server)
      .patch(`/api/v1/admin/catalog/products/${product.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Produk Update Baru', isActive: false })
      .expect(200);
    expect(updatedProduct.body).toMatchObject({
      name: 'Produk Update Baru',
      isActive: false,
    });

    const updatedVariant = await request(server)
      .patch(`/api/v1/admin/catalog/variants/${variant.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: '125000', costPrice: '75000', weight: '0.35' })
      .expect(200);
    expect(updatedVariant.body).toMatchObject({
      price: '125000.00',
      costPrice: '75000.00',
      weight: '0.350',
    });

    const publicList = await request(server)
      .get('/api/v1/catalog/products')
      .set(publicHeader())
      .expect(200);
    expect((publicList.body as ListBody).data).toEqual([]);

    await request(server)
      .get('/api/v1/catalog/products/produk-update')
      .set(publicHeader())
      .expect(404);
    await request(server)
      .get('/api/v1/catalog/variants/SKU-UPDATE-1')
      .set(publicHeader())
      .expect(404);

    const adminList = await request(server)
      .get('/api/v1/admin/catalog/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((adminList.body as ListBody).data.map((item) => item.id)).toContain(product.id);
  });

  it('soft-deletes variants and products so public reads return 404', async () => {
    const product = await createProduct({ name: 'Produk Hapus', slug: 'produk-hapus' });
    const removedVariant = await createVariant(product.id, { sku: 'SKU-DELETE-1' });
    const remainingVariant = await createVariant(product.id, { sku: 'SKU-DELETE-2' });

    await request(server)
      .delete(`/api/v1/admin/catalog/variants/${removedVariant.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    await request(server)
      .get('/api/v1/catalog/variants/SKU-DELETE-1')
      .set(publicHeader())
      .expect(404);

    const detail = await request(server)
      .get('/api/v1/catalog/products/produk-hapus')
      .set(publicHeader())
      .expect(200);
    expect((detail.body as ProductBody).variants.map((variant) => variant.id)).toEqual([
      remainingVariant.id,
    ]);

    await request(server)
      .delete(`/api/v1/admin/catalog/products/${product.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    await request(server)
      .get('/api/v1/catalog/products/produk-hapus')
      .set(publicHeader())
      .expect(404);
    await request(server)
      .get('/api/v1/catalog/variants/SKU-DELETE-2')
      .set(publicHeader())
      .expect(404);
    await request(server)
      .get(`/api/v1/admin/catalog/products/${product.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('does not leak products across tenants', async () => {
    const product = await createProduct({ name: 'Produk Tenant', slug: 'produk-tenant' });

    const list = await request(server)
      .get('/api/v1/catalog/products')
      .set('X-Tenant-Code', otherTenantCode)
      .expect(200);
    expect((list.body as ListBody).data).toEqual([]);

    await request(server)
      .get('/api/v1/catalog/products/produk-tenant')
      .set('X-Tenant-Code', otherTenantCode)
      .expect(404);

    const ownList = await request(server)
      .get('/api/v1/catalog/products')
      .set(publicHeader())
      .expect(200);
    expect((ownList.body as ListBody).data.map((item) => item.id)).toEqual([product.id]);
  });
});
