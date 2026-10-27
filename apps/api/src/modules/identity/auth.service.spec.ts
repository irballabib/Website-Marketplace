import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { generateUuidV7 } from '../../common/id';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { AuthService } from './auth.service';

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

const JWT_SECRET = 'test-secret-with-at-least-32-characters!';
const PASSWORD = 'password123';

async function expectAuthError(promise: Promise<unknown>, code: string): Promise<void> {
  let caught: unknown;

  try {
    await promise;
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(UnauthorizedException);
  expect((caught as UnauthorizedException).getResponse()).toMatchObject({ code });
}

suite('AuthService (integration)', () => {
  const prisma = new PrismaClient();
  const jwt = new JwtService({ secret: JWT_SECRET });
  const config = {
    get: (key: string) =>
      ({ JWT_ACCESS_TTL: '15m', JWT_REFRESH_TTL: '7d' })[key],
  } as unknown as ConfigService;
  const auth = new AuthService(prisma as unknown as PrismaService, jwt, config);

  const tenantId = generateUuidV7();
  const userId = generateUuidV7();
  const email = `admin-${tenantId.slice(-8)}@cutbray.local`;
  const permissionCode = `test.auth.${tenantId.slice(-8)}`;

  beforeAll(async () => {
    const suffix = tenantId.slice(-8);
    const passwordHash = await argon2.hash(PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 4096,
      timeCost: 2,
      parallelism: 1,
    });

    await prisma.tenant.create({
      data: { id: tenantId, name: `Auth Test ${suffix}`, code: `auth-${suffix}` },
    });

    const permission = await prisma.permission.create({
      data: {
        code: permissionCode,
        name: 'Test Auth Permission',
        category: 'Test',
      },
    });

    const role = await prisma.role.create({
      data: {
        tenantId,
        name: `auth-role-${suffix}`,
        description: 'Role for auth integration tests',
      },
    });

    await prisma.rolePermission.create({
      data: { tenantId, roleId: role.id, permissionId: permission.id },
    });

    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        email,
        fullName: 'Auth Test Admin',
        passwordHash,
        isActive: true,
        isVerified: true,
      },
    });

    await prisma.userRole.create({
      data: { tenantId, userId, roleId: role.id },
    });
  });

  beforeEach(async () => {
    await prisma.session.deleteMany({ where: { tenantId } });
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { tenantId } });
    await prisma.userRole.deleteMany({ where: { tenantId } });
    await prisma.rolePermission.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.role.deleteMany({ where: { tenantId } });
    await prisma.permission.deleteMany({ where: { code: permissionCode } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it('logs in with valid credentials and signs a verifiable access token', async () => {
    const result = await auth.login({ email: email.toUpperCase(), password: PASSWORD });

    expect(result.user).toMatchObject({
      id: userId,
      tenantId,
      email,
      roles: [expect.stringContaining('auth-role-')],
      permissions: [permissionCode],
    });
    expect(result.refreshToken.length).toBeGreaterThan(40);

    const payload = await jwt.verifyAsync<{ sub: string; tenantId: string; type: string }>(
      result.accessToken
    );
    expect(payload).toMatchObject({ sub: userId, tenantId, type: 'access' });

    expect(await prisma.session.count({ where: { userId, revokedAt: null } })).toBe(1);
  });

  it('rejects a wrong password and an unknown email with the same error code', async () => {
    await expectAuthError(
      auth.login({ email, password: 'wrong-password' }),
      'AUTH_INVALID_CREDENTIALS'
    );
    await expectAuthError(
      auth.login({ email: `unknown-${tenantId.slice(-8)}@cutbray.local`, password: PASSWORD }),
      'AUTH_INVALID_CREDENTIALS'
    );

    expect(await prisma.session.count({ where: { userId } })).toBe(0);
  });

  it('rotates the refresh token and rejects reuse of the old token', async () => {
    const first = await auth.login({ email, password: PASSWORD });
    const second = await auth.refresh(first.refreshToken);

    expect(second.refreshToken).not.toBe(first.refreshToken);

    const revoked = await prisma.session.findMany({ where: { userId } });
    expect(revoked.filter((session) => session.revokedAt !== null)).toHaveLength(1);
    expect(revoked.filter((session) => session.revokedAt === null)).toHaveLength(1);

    await expectAuthError(auth.refresh(first.refreshToken), 'AUTH_INVALID_REFRESH_TOKEN');
  });

  it('revokes the session on logout and treats repeated logout as success', async () => {
    const result = await auth.login({ email, password: PASSWORD });

    await auth.logout(result.refreshToken);
    await expect(auth.logout(result.refreshToken)).resolves.toBeUndefined();
    await expectAuthError(auth.refresh(result.refreshToken), 'AUTH_INVALID_REFRESH_TOKEN');
  });

  it('returns the current profile with roles and permissions', async () => {
    const profile = await auth.getProfile(userId, tenantId);

    expect(profile).toMatchObject({
      id: userId,
      email,
      roles: [expect.stringContaining('auth-role-')],
      permissions: [permissionCode],
    });
  });
});
