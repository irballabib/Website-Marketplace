import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';

import { generateUuidV7 } from '../../common/id';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  type AccessTokenPayload,
  type AuthUser,
  type UserWithAccess,
  toAuthUser,
  userAccessInclude,
} from './auth.access';
import type { LoginDto } from './auth.dto';

export const REFRESH_COOKIE_NAME = 'cutbray_refresh';

export interface SessionMetadata {
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  expiresIn: number;
  user: AuthUser;
}

type SessionClient = Pick<Prisma.TransactionClient, 'session'>;

/**
 * A valid Argon2id hash used when the email is unknown so that failed logins
 * take the same time whether or not the account exists (no user enumeration).
 */
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$phvjAJ41pR6YFvlRM78aYQ$HZXaR4fka/T5sZot75yVZ+LXPqgbNHTnB05iAgevK0I';

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseDurationSeconds(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const match = /^(\d+)\s*([smhd])?$/i.exec(value.trim());
  if (!match) {
    return fallback;
  }

  const amount = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();
  const multiplier = unit === 'd' ? 86400 : unit === 'h' ? 3600 : unit === 'm' ? 60 : 1;

  return amount * multiplier;
}

function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'AUTH_INVALID_CREDENTIALS',
    message: 'Email atau password salah',
  });
}

function invalidRefreshToken(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'AUTH_INVALID_REFRESH_TOKEN',
    message: 'Sesi tidak valid atau sudah berakhir',
  });
}

@Injectable()
export class AuthService {
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {
    this.accessTtlSeconds = parseDurationSeconds(
      this.config.get<string>('JWT_ACCESS_TTL'),
      15 * 60
    );
    this.refreshTtlSeconds = parseDurationSeconds(
      this.config.get<string>('JWT_REFRESH_TTL'),
      7 * 86400
    );
  }

  async login(input: LoginDto, metadata: SessionMetadata = {}): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: { email, isActive: true, deletedAt: null },
      include: userAccessInclude,
    });

    const passwordMatches = await argon2
      .verify(user?.passwordHash ?? DUMMY_PASSWORD_HASH, input.password)
      .catch(() => false);

    if (!user || !passwordMatches) {
      throw invalidCredentials();
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.createSession(this.prisma, user, metadata);
  }

  async refresh(refreshToken: string, metadata: SessionMetadata = {}): Promise<AuthResult> {
    const tokenHash = hashRefreshToken(refreshToken);

    return this.prisma.$transaction(async (tx) => {
      const session = await tx.session.findUnique({
        where: { refreshTokenHash: tokenHash },
      });

      if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
        throw invalidRefreshToken();
      }

      const revoked = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (revoked.count !== 1) {
        throw invalidRefreshToken();
      }

      const user = await tx.user.findFirst({
        where: {
          id: session.userId,
          tenantId: session.tenantId,
          isActive: true,
          deletedAt: null,
        },
        include: userAccessInclude,
      });

      if (!user) {
        throw invalidRefreshToken();
      }

      return this.createSession(tx, user, metadata);
    });
  }

  /** Idempotent: revoking an unknown or already revoked token is not an error. */
  async logout(refreshToken: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: hashRefreshToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getProfile(userId: string, tenantId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, isActive: true, deletedAt: null },
      include: userAccessInclude,
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH_SESSION_NOT_FOUND',
        message: 'Pengguna tidak ditemukan atau tidak aktif',
      });
    }

    return toAuthUser(user);
  }

  private async createSession(
    client: SessionClient,
    user: UserWithAccess,
    metadata: SessionMetadata
  ): Promise<AuthResult> {
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlSeconds * 1000);

    await client.session.create({
      data: {
        id: generateUuidV7(),
        userId: user.id,
        tenantId: user.tenantId,
        refreshTokenHash: hashRefreshToken(refreshToken),
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
        expiresAt: refreshExpiresAt,
      },
    });

    const payload: AccessTokenPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      type: 'access',
    };

    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: this.accessTtlSeconds,
    });

    return {
      accessToken,
      refreshToken,
      refreshExpiresAt,
      expiresIn: this.accessTtlSeconds,
      user: toAuthUser(user),
    };
  }
}
