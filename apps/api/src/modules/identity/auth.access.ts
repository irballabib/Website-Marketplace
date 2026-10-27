import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';

import { PrismaService } from '../../common/prisma/prisma.service';

export interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  type: 'access';
}

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
}

export const userAccessInclude = {
  roles: {
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  },
} satisfies Prisma.UserInclude;

export type UserWithAccess = Prisma.UserGetPayload<{ include: typeof userAccessInclude }>;

export function toAuthUser(user: UserWithAccess): AuthUser {
  const roles = user.roles.map((userRole) => userRole.role.name).sort();
  const permissions = [
    ...new Set(
      user.roles.flatMap((userRole) =>
        userRole.role.permissions.map((rolePermission) => rolePermission.permission.code)
      )
    ),
  ].sort();

  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    fullName: user.fullName,
    roles,
    permissions,
  };
}

const IS_PUBLIC_KEY = 'auth:public';
const REQUIRED_PERMISSIONS_KEY = 'auth:permissions';

/** Marks a route as reachable without a bearer token (login, health, ...). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Requires every listed permission; verified against the database on each request. */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new UnauthorizedException({
        code: 'AUTH_MISSING_USER',
        message: 'Sesi pengguna tidak ditemukan',
      });
    }
    return request.user;
  }
);

export type AuthenticatedRequest = Request & { user?: AuthUser };

function isPublic(context: ExecutionContext, reflector: Reflector): boolean {
  return (
    reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? false
  );
}

function unauthorized(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'AUTH_INVALID_TOKEN',
    message: 'Token akses tidak valid atau sudah kedaluwarsa',
  });
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublic(context, this.reflector)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined;

    if (!token) {
      throw unauthorized();
    }

    let payload: AccessTokenPayload;

    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw unauthorized();
    }

    if (payload.type !== 'access') {
      throw unauthorized();
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        tenantId: payload.tenantId,
        isActive: true,
        deletedAt: null,
      },
      include: userAccessInclude,
    });

    if (!user) {
      throw unauthorized();
    }

    request.user = toAuthUser(user);
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (isPublic(context, this.reflector)) {
      return true;
    }

    const required =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    const allowed = user && required.every((permission) => user.permissions.includes(permission));

    if (!allowed) {
      throw new ForbiddenException({
        code: 'AUTH_FORBIDDEN',
        message: 'Anda tidak memiliki izin untuk melakukan aksi ini',
      });
    }

    return true;
  }
}
