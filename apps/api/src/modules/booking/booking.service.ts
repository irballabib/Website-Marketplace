import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

import { generateUuidV7 } from '../../common/id';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  BookingStatus,
  BookingType,
  CreateBookingDto,
  QuotaType,
  RefundRule,
  type BookingView,
} from './booking.dto';

interface BookingPolicy {
  dpPercent: number;
  payDeadlineMinutes: number;
  refundRule: RefundRule;
  quotaType: QuotaType;
  quotaValue: number;
  dpCreditable: boolean;
  isActive: boolean;
  startDate?: string;
  endDate?: string;
}

const DEFAULT_POLICY: BookingPolicy = {
  dpPercent: 30,
  payDeadlineMinutes: 1440,
  refundRule: RefundRule.FULL_UNTIL_H3,
  quotaType: QuotaType.BATCH,
  quotaValue: 100,
  dpCreditable: true,
  isActive: true,
};

const VALID_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.DRAFT]: [BookingStatus.WAITING_DP, BookingStatus.CANCELLED],
  [BookingStatus.WAITING_DP]: [
    BookingStatus.CONFIRMED,
    BookingStatus.CANCELLED,
    BookingStatus.EXPIRED,
  ],
  [BookingStatus.CONFIRMED]: [BookingStatus.IN_PRODUCTION, BookingStatus.CANCELLED],
  [BookingStatus.IN_PRODUCTION]: [BookingStatus.READY_FOR_SETTLEMENT],
  [BookingStatus.READY_FOR_SETTLEMENT]: [BookingStatus.COMPLETED],
  [BookingStatus.COMPLETED]: [],
  [BookingStatus.CANCELLED]: [BookingStatus.REFUNDED],
  [BookingStatus.REFUNDED]: [],
  [BookingStatus.EXPIRED]: [],
};

@Injectable()
export class BookingService {
  constructor(private readonly prisma: PrismaService) {}

  async getBookingPolicy(tenantId: string, bookingType: BookingType): Promise<BookingPolicy> {
    const setting = await this.prisma.setting.findFirst({
      where: {
        tenantId,
        scope: 'booking',
        key: `policy_${bookingType}`,
      },
    });

    const value = setting?.value;
    const fields =
      value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const readNumber = (field: string, fallback: number): number => {
      const candidate = fields[field];
      return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : fallback;
    };
    const readString = (field: string, fallback: string): string => {
      const candidate = fields[field];
      return typeof candidate === 'string' ? candidate : fallback;
    };
    const readBoolean = (field: string, fallback: boolean): boolean => {
      const candidate = fields[field];
      return typeof candidate === 'boolean' ? candidate : fallback;
    };

    const refundRuleValue = readString('refundRule', DEFAULT_POLICY.refundRule);
    const quotaTypeValue = readString('quotaType', DEFAULT_POLICY.quotaType);
    const dpPercent = readNumber('dpPercent', DEFAULT_POLICY.dpPercent);
    const payDeadlineMinutes = readNumber(
      'payDeadlineMinutes',
      DEFAULT_POLICY.payDeadlineMinutes
    );
    const quotaValue = readNumber('quotaValue', DEFAULT_POLICY.quotaValue);

    return {
      dpPercent:
        dpPercent >= 0 && dpPercent <= 100 ? dpPercent : DEFAULT_POLICY.dpPercent,
      payDeadlineMinutes:
        Number.isInteger(payDeadlineMinutes) && payDeadlineMinutes > 0
          ? payDeadlineMinutes
          : DEFAULT_POLICY.payDeadlineMinutes,
      refundRule: Object.values(RefundRule).includes(refundRuleValue as RefundRule)
        ? (refundRuleValue as RefundRule)
        : DEFAULT_POLICY.refundRule,
      quotaType: Object.values(QuotaType).includes(quotaTypeValue as QuotaType)
        ? (quotaTypeValue as QuotaType)
        : DEFAULT_POLICY.quotaType,
      quotaValue:
        Number.isInteger(quotaValue) && quotaValue > 0
          ? quotaValue
          : DEFAULT_POLICY.quotaValue,
      dpCreditable: readBoolean('dpCreditable', DEFAULT_POLICY.dpCreditable),
      isActive: readBoolean('isActive', DEFAULT_POLICY.isActive),
      startDate: readString('startDate', '') || undefined,
      endDate: readString('endDate', '') || undefined,
    };
  }

  async createBooking(
    tenantId: string,
    dto: CreateBookingDto,
    createdBy?: string
  ): Promise<BookingView> {
    if (dto.status && dto.status !== BookingStatus.DRAFT) {
      throw new BadRequestException({
        code: 'BOOKING_INVALID_INITIAL_STATUS',
        message: 'Booking baru harus dimulai dengan status DRAFT',
      });
    }

    const policy = await this.getBookingPolicy(tenantId, dto.type);
    const booking = await this.prisma.booking.create({
      data: {
        id: generateUuidV7(),
        tenantId,
        type: dto.type,
        name: dto.name.trim(),
        status: BookingStatus.DRAFT,
        dpAmount: new Decimal(dto.dpAmount ?? 0),
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        quotaValue: dto.quotaValue ?? policy.quotaValue,
        quotaType: dto.quotaType ?? policy.quotaType,
        refundRule: dto.refundRule ?? policy.refundRule,
        payDeadlineMinutes: dto.payDeadlineMinutes ?? policy.payDeadlineMinutes,
        dpCreditable: dto.dpCreditable ?? policy.dpCreditable,
        productSku: dto.productSku?.trim() || null,
        customerName: dto.customerName.trim(),
        customerPhone: dto.customerPhone?.trim() || null,
        customerEmail: dto.customerEmail?.trim().toLowerCase() || null,
        createdBy,
      },
    });

    return this.toView(booking, policy.dpPercent);
  }

  async getBooking(tenantId: string, bookingId: string): Promise<BookingView> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, tenantId, deletedAt: null },
    });
    if (!booking) {
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: 'Booking tidak ditemukan',
      });
    }

    const policy = await this.getBookingPolicy(tenantId, booking.type as BookingType);
    return this.toView(booking, policy.dpPercent);
  }

  async updateBookingStatus(
    tenantId: string,
    bookingId: string,
    status: BookingStatus
  ): Promise<BookingView> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, tenantId, deletedAt: null },
    });
    if (!booking) {
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: 'Booking tidak ditemukan',
      });
    }

    const currentStatus = booking.status as BookingStatus;
    if (!this.getValidTransitions(currentStatus).includes(status)) {
      throw new BadRequestException({
        code: 'BOOKING_INVALID_STATUS_TRANSITION',
        message: `Transisi booking dari ${currentStatus} ke ${status} tidak diizinkan`,
      });
    }

    let nextStatus = status;
    if (
      status === BookingStatus.WAITING_DP &&
      this.isDpDeadlineExceeded(
        booking.createdAt,
        (await this.getBookingPolicy(tenantId, booking.type as BookingType)).payDeadlineMinutes
      )
    ) {
      nextStatus = BookingStatus.EXPIRED;
    }

    const result = await this.prisma.booking.updateMany({
      where: {
        id: bookingId,
        tenantId,
        status: currentStatus,
        deletedAt: null,
      },
      data: {
        status: nextStatus,
        cancelledAt: nextStatus === BookingStatus.CANCELLED ? new Date() : undefined,
      },
    });
    if (result.count !== 1) {
      throw new ConflictException({
        code: 'BOOKING_STATUS_CHANGED',
        message: 'Status booking berubah. Muat ulang data sebelum mencoba lagi.',
      });
    }

    return this.getBooking(tenantId, bookingId);
  }

  getValidTransitions(from: BookingStatus): BookingStatus[] {
    return VALID_TRANSITIONS[from];
  }

  calculateDpAmount(productPrice: number, dpPercent: number): number {
    if (!Number.isFinite(productPrice) || productPrice < 0) {
      throw new BadRequestException('Harga produk harus bernilai positif atau nol');
    }
    if (!Number.isFinite(dpPercent) || dpPercent < 0 || dpPercent > 100) {
      throw new BadRequestException('Persentase DP harus berada di antara 0 dan 100');
    }

    return new Decimal(productPrice)
      .mul(dpPercent)
      .div(100)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toNumber();
  }

  isDpDeadlineExceeded(
    bookingCreatedAt: Date,
    payDeadlineMinutes: number,
    now: Date = new Date()
  ): boolean {
    return now.getTime() > bookingCreatedAt.getTime() + payDeadlineMinutes * 60_000;
  }

  async getBookingsByTenant(
    tenantId: string,
    status?: BookingStatus
  ): Promise<BookingView[]> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    const policies = new Map<BookingType, Promise<BookingPolicy>>();
    return Promise.all(
      bookings.map(async (booking) => {
        const type = booking.type as BookingType;
        let policy = policies.get(type);
        if (!policy) {
          policy = this.getBookingPolicy(tenantId, type);
          policies.set(type, policy);
        }
        return this.toView(booking, (await policy).dpPercent);
      })
    );
  }

  private toView(
    booking: Prisma.BookingGetPayload<Record<string, never>>,
    dpPercent: number
  ): BookingView {
    return {
      id: booking.id,
      type: booking.type as BookingType,
      name: booking.name,
      status: booking.status as BookingStatus,
      dpAmount: booking.dpAmount.toNumber(),
      dpPaid: booking.dpPaid,
      startDate: booking.startDate?.toISOString() ?? null,
      endDate: booking.endDate?.toISOString() ?? null,
      dpPercent,
      customerEmail: booking.customerEmail,
    };
  }
}
