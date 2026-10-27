import { VersioningType, type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module';
import { generateUuidV7 } from '../../common/id';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

const PASSWORD = 'password123';
const JWT_SECRET = 'http-test-secret-with-at-least-32-characters';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? JWT_SECRET;

interface LoginResponseBody {
  accessToken: string;
  user: { id: string; email: string; permissions: string[] };
}

interface MeResponseBody {
  user: { email: string };
}

interface ErrorResponseBody {
  code?: string;
  details?: unknown;
}

function readSetCookie(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string {
  const raw = headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));

  if (!match) {
    throw new Error(`Cookie ${name} was not set`);
  }

  return match.split(';')[0] ?? '';
}

suite('Auth API (HTTP)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let server: Parameters<typeof request>[0];

  const tenantId = generateUuidV7();
  const userId = generateUuidV7();
  const email = `http-admin-${tenantId.slice(-8)}@cutbray.local`;
  const permissionCode = `test.http.${tenantId.slice(-8)}`;

  beforeAll(async () => {
    const suffix = tenantId.slice(-8);
    const passwordHash = await argon2.hash(PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 4096,
      timeCost: 2,
      parallelism: 1,
    });

    await prisma.tenant.create({
      data: { id: tenantId, name: `HTTP Test ${suffix}`, code: `http-${suffix}` },
    });

    const permission = await prisma.permission.create({
      data: { code: permissionCode, name: 'HTTP Test Permission', category: 'Test' },
    });

    const role = await prisma.role.create({
      data: { tenantId, name: `http-role-${suffix}`, description: 'HTTP test role' },
    });

    await prisma.rolePermission.create({
      data: { tenantId, roleId: role.id, permissionId: permission.id },
    });

    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        email,
        fullName: 'HTTP Test Admin',
        passwordHash,
        isActive: true,
        isVerified: true,
      },
    });

    await prisma.userRole.create({ data: { tenantId, userId, roleId: role.id } });

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
    await prisma.session.deleteMany({ where: { tenantId } });
  });

  afterAll(async () => {
    await app?.close();
    await prisma.session.deleteMany({ where: { tenantId } });
    await prisma.userRole.deleteMany({ where: { tenantId } });
    await prisma.rolePermission.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.role.deleteMany({ where: { tenantId } });
    await prisma.permission.deleteMany({ where: { code: permissionCode } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('serves the public health endpoint without a token', async () => {
    await request(server).get('/api/v1/health').expect(200);
  });

  it('logs in, sets an httpOnly refresh cookie, and authorises /me', async () => {
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);

    const loginBody = login.body as LoginResponseBody;
    expect(loginBody.accessToken).toBeTypeOf('string');
    expect(loginBody.user).toMatchObject({ id: userId, email, permissions: [permissionCode] });

    const cookie = readSetCookie(login.headers, 'cutbray_refresh');
    expect(cookie.startsWith('cutbray_refresh=')).toBe(true);
    expect(login.headers['set-cookie']?.toString()).toMatch(/HttpOnly/i);
    expect(login.headers['set-cookie']?.toString()).toMatch(/Path=\/api\/v1\/auth/i);

    const me = await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${loginBody.accessToken}`)
      .expect(200);
    expect((me.body as MeResponseBody).user.email).toBe(email);
  });

  it('returns a uniform 401 error without an access token', async () => {
    const response = await request(server).get('/api/v1/auth/me').expect(401);

    expect(response.body).toMatchObject({ code: 'AUTH_INVALID_TOKEN' });
  });

  it('rejects invalid credentials and validation errors with the standard envelope', async () => {
    const invalid = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
    expect(invalid.body).toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });

    const validation = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'x' })
      .expect(400);
    const validationBody = validation.body as ErrorResponseBody;
    expect(validationBody).toMatchObject({ code: 'BAD_REQUEST' });
    expect(Array.isArray(validationBody.details)).toBe(true);
  });

  it('rotates the refresh cookie and rejects reuse of the old cookie', async () => {
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    const firstCookie = readSetCookie(login.headers, 'cutbray_refresh');

    const refreshed = await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(200);
    const secondCookie = readSetCookie(refreshed.headers, 'cutbray_refresh');
    expect(secondCookie).not.toBe(firstCookie);

    const reuse = await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', firstCookie)
      .expect(401);
    expect(reuse.body).toMatchObject({ code: 'AUTH_INVALID_REFRESH_TOKEN' });
  });

  it('revokes the session on logout', async () => {
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    const cookie = readSetCookie(login.headers, 'cutbray_refresh');

    await request(server).post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);

    const refresh = await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .expect(401);
    expect(refresh.body).toMatchObject({ code: 'AUTH_INVALID_REFRESH_TOKEN' });
  });
});
