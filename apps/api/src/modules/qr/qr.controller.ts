import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser, Public, RequirePermissions, type AuthUser } from '../identity/auth.access';
import { CreateQrLinkDto, type QrLinkView } from './qr.dto';
import { QrService } from './qr.service';

@ApiTags('qr')
@Public()
@Controller('qr')
export class QrController {
  constructor(private readonly qr: QrService) {}

  @Get(':code')
  @ApiOperation({ summary: 'Resolve an active short-link QR code' })
  resolve(@Param('code') code: string): Promise<{ code: string; targetUrl: string }> {
    return this.qr.resolve(code);
  }
}

@ApiTags('qr-admin')
@ApiBearerAuth()
@RequirePermissions('catalog.product.manage')
@Controller('admin/qr')
export class AdminQrController {
  constructor(private readonly qr: QrService) {}

  @Post()
  @ApiOperation({ summary: 'Create a QR short-link for a location, product, or local path' })
  @ApiBody({ type: CreateQrLinkDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateQrLinkDto): Promise<QrLinkView> {
    return this.qr.create(user.tenantId, dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List active QR short-links' })
  list(@CurrentUser() user: AuthUser): Promise<QrLinkView[]> {
    return this.qr.list(user.tenantId);
  }

  @Get(':code/image')
  @ApiOperation({ summary: 'Download a QR image (png or svg)' })
  async image(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
    @Query('format') format: string | undefined,
    @Res() response: Response
  ): Promise<void> {
    const image = await this.qr.image(
      user.tenantId,
      code,
      format?.trim().toLowerCase() === 'svg' ? 'svg' : 'png'
    );

    response.type(image.contentType).send(image.buffer);
  }
}
