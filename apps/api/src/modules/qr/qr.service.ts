import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { QRLink } from '@prisma/client';
import QRCode from 'qrcode';

import { generateUuidV7 } from '../../common/id';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CreateQrLinkDto, QrLinkView } from './qr.dto';

@Injectable()
export class QrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  private get baseUrl(): string {
    return (
      this.config.get<string>('QR_BASE_URL')?.trim().replace(/\/$/, '') || 'http://localhost:3000'
    );
  }

  async resolve(code: string): Promise<{ code: string; targetUrl: string }> {
    const link = await this.prisma.qRLink.findFirst({
      where: {
        code: code.trim().toUpperCase(),
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { code: true, targetUrl: true },
    });

    if (!link) {
      throw new NotFoundException({
        code: 'QR_NOT_FOUND',
        message: 'Kode QR tidak ditemukan atau sudah kedaluwarsa',
      });
    }

    return link;
  }

  async create(tenantId: string, dto: CreateQrLinkDto, createdBy?: string): Promise<QrLinkView> {
    const targets = [dto.locationCode, dto.productSlug, dto.targetUrl].filter(
      (value): value is string => Boolean(value?.trim())
    );

    if (targets.length !== 1) {
      throw new BadRequestException({
        code: 'QR_INVALID_TARGET',
        message: 'Isi tepat satu: locationCode, productSlug, atau targetUrl',
      });
    }

    let targetUrl: string;

    if (dto.locationCode?.trim()) {
      const location = await this.prisma.location.findFirst({
        where: {
          tenantId,
          code: dto.locationCode.trim().toUpperCase(),
          isActive: true,
          deletedAt: null,
        },
        select: { code: true },
      });

      if (!location) {
        throw new NotFoundException({
          code: 'QR_LOCATION_NOT_FOUND',
          message: 'Lokasi tidak ditemukan',
        });
      }

      targetUrl = `/c/${location.code}`;
    } else if (dto.productSlug?.trim()) {
      const product = await this.prisma.product.findFirst({
        where: {
          tenantId,
          slug: dto.productSlug.trim().toLowerCase(),
          isActive: true,
          deletedAt: null,
        },
        select: { slug: true },
      });

      if (!product) {
        throw new NotFoundException({
          code: 'QR_PRODUCT_NOT_FOUND',
          message: 'Produk tidak ditemukan',
        });
      }

      targetUrl = `/produk/${product.slug}`;
    } else {
      const raw = dto.targetUrl?.trim() ?? '';
      if (!raw.startsWith('/') || raw.startsWith('//')) {
        throw new BadRequestException({
          code: 'QR_INVALID_TARGET_URL',
          message: 'targetUrl harus berupa path lokal yang diawali /',
        });
      }
      targetUrl = raw;
    }

    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = randomBytes(6).toString('base64url').slice(0, 8).toUpperCase();

      try {
        const link = await this.prisma.qRLink.create({
          data: {
            id: generateUuidV7(),
            tenantId,
            code,
            targetUrl,
            isActive: true,
            expiresAt,
            createdBy,
          },
        });

        return this.toView(link);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          continue;
        }

        throw error;
      }
    }

    throw new InternalServerErrorException({
      code: 'QR_CODE_GENERATION_FAILED',
      message: 'Gagal membuat kode QR unik',
    });
  }

  async list(tenantId: string): Promise<QrLinkView[]> {
    const links = await this.prisma.qRLink.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return links.map((link) => this.toView(link));
  }

  async image(
    tenantId: string,
    code: string,
    format: 'png' | 'svg'
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const link = await this.prisma.qRLink.findFirst({
      where: { tenantId, code: code.trim().toUpperCase(), isActive: true },
      select: { code: true },
    });

    if (!link) {
      throw new NotFoundException({
        code: 'QR_NOT_FOUND',
        message: 'Kode QR tidak ditemukan',
      });
    }

    const shortUrl = `${this.baseUrl}/q/${link.code}`;
    const options = { width: 512, margin: 2 } as const;

    if (format === 'svg') {
      const svg = await QRCode.toString(shortUrl, { ...options, type: 'svg' });
      return { buffer: Buffer.from(svg), contentType: 'image/svg+xml' };
    }

    const png = await QRCode.toBuffer(shortUrl, { ...options, type: 'png' });
    return { buffer: png, contentType: 'image/png' };
  }

  private toView(link: QRLink): QrLinkView {
    return {
      code: link.code,
      targetUrl: link.targetUrl,
      shortUrl: `${this.baseUrl}/q/${link.code}`,
      isActive: link.isActive,
      expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
      createdAt: link.createdAt.toISOString(),
    };
  }
}
