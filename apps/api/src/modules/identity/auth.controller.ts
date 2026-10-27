import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { CurrentUser, Public, type AuthUser } from './auth.access';
import { LoginDto } from './auth.dto';
import { AuthService, REFRESH_COOKIE_NAME, type SessionMetadata } from './auth.service';

const REFRESH_COOKIE_PATH = '/api/v1/auth';

function sessionMetadata(request: Request): SessionMetadata {
  return {
    userAgent: request.headers['user-agent'],
    ipAddress: request.ip,
  };
}

function readRefreshCookie(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (!header) {
    return undefined;
  }

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const name = part.slice(0, separator).trim();
    if (name === REFRESH_COOKIE_NAME) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }

  return undefined;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Access token issued, refresh token set as httpOnly cookie' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.authService.login(body, sessionMetadata(request));
    this.setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);

    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiResponse({ status: 200, description: 'New access token issued' })
  @ApiResponse({ status: 401, description: 'Refresh token missing, expired, or revoked' })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = readRefreshCookie(request);
    if (!refreshToken) {
      throw new UnauthorizedException({
        code: 'AUTH_REFRESH_MISSING',
        message: 'Sesi tidak ditemukan, silakan login kembali',
      });
    }

    const result = await this.authService.refresh(refreshToken, sessionMetadata(request));
    this.setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);

    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke the current session and clear the refresh cookie' })
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiResponse({ status: 204, description: 'Session revoked' })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = readRefreshCookie(request);
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    this.clearRefreshCookie(response);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user with roles and permissions' })
  @ApiResponse({ status: 200, description: 'Current user profile' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  async me(@CurrentUser() user: AuthUser) {
    return { user: await this.authService.getProfile(user.id, user.tenantId) };
  }

  private setRefreshCookie(response: Response, token: string, expiresAt: Date): void {
    response.cookie(REFRESH_COOKIE_NAME, token, {
      ...this.cookieOptions(),
      expires: expiresAt,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax' as const,
      path: REFRESH_COOKIE_PATH,
    };
  }
}
