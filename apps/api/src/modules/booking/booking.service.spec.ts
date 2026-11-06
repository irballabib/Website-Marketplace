import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Booking as PrismaBooking } from '@prisma/client';
import Decimal from 'decimal.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../common/prisma/prisma.service';
import { BookingStatus, BookingType } from './booking.dto';
import { BookingService } from './booking.service';

const tenantId = 'tenant-a';
const bookingId = 'booking-a';

function createBookingRecord(overrides: Partial<PrismaBooking> = {}): PrismaBooking {
  const now = new Date('2026-10-28T00:00:00.000Z');
  return {
    id: bookingId,
    tenantId,
    type: BookingType.PREORDER_BATCH,
    name: 'Preorder Cutbray',
    status: BookingStatus.DRAFT,
    dpAmount: new Decimal('150000.00'),
    dpPaid: false,
    startDate: null,
    endDate: null,
    quotaValue: 100,
    quotaType: 'BATCH',
    refundRule: 'FULL_UNTIL_H3',
    payDeadlineMinutes: 1440,
    dpCreditable: true,
    productSku: null,
    customerName: 'Pembeli Bale',
    customerPhone: null,
    customerEmail: 'pembeli@example.com',
    createdAt: now,
    updatedAt: now,
    createdBy: 'user-a',
    cancelledAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe('BookingService', () => {
  const prisma = {
    booking: {
      create: vi.fn<PrismaService['booking']['create']>(),
      findFirst: vi.fn<PrismaService['booking']['findFirst']>(),
      findMany: vi.fn<PrismaService['booking']['findMany']>(),
      updateMany: vi.fn<PrismaService['booking']['updateMany']>(),
    },
    setting: {
      findFirst: vi.fn<PrismaService['setting']['findFirst']>(),
    },
  };
  const service = new BookingService(prisma as unknown as PrismaService);

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.setting.findFirst.mockResolvedValue(null);
  });

  it('creates a persisted booking scoped to its tenant with policy defaults', async () => {
    const record = createBookingRecord();
    prisma.booking.create.mockResolvedValue(record);

    const result = await service.createBooking(tenantId, {
      type: BookingType.PREORDER_BATCH,
      name: 'Preorder Cutbray',
      customerName: 'Pembeli Bale',
      customerEmail: 'PEMBELI@example.com',
      dpAmount: 150000,
    }, 'user-a');

    expect(prisma.booking.create).toHaveBeenCalledTimes(1);
    const args = prisma.booking.create.mock.calls[0]?.[0];
    expect(args?.data.tenantId).toBe(tenantId);
    expect(args?.data.status).toBe(BookingStatus.DRAFT);
    expect(args?.data.dpAmount).toBeInstanceOf(Decimal);
    expect(args?.data.quotaValue).toBe(100);
    expect(args?.data.createdBy).toBe('user-a');
    expect(args?.data.customerEmail).toBe('pembeli@example.com');
    expect(result.id).toBe(bookingId);
    expect(result.dpAmount).toBe(150000);
  });

  it('does not allow a new booking to bypass the initial state', async () => {
    await expect(
      service.createBooking(tenantId, {
        type: BookingType.PREORDER_BATCH,
        name: 'Preorder Cutbray',
        customerName: 'Pembeli Bale',
        status: BookingStatus.CONFIRMED,
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it('scopes booking lookup to the active tenant', async () => {
    prisma.booking.findFirst.mockResolvedValue(null);

    await expect(service.getBooking('tenant-b', bookingId)).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(prisma.booking.findFirst).toHaveBeenCalledWith({
      where: { id: bookingId, tenantId: 'tenant-b', deletedAt: null },
    });
  });

  it('rejects invalid status transitions', async () => {
    prisma.booking.findFirst.mockResolvedValue(
      createBookingRecord({ status: BookingStatus.COMPLETED })
    );

    await expect(
      service.updateBookingStatus(tenantId, bookingId, BookingStatus.CONFIRMED)
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it('calculates DP amounts to two decimal places', () => {
    expect(service.calculateDpAmount(9999, 30)).toBe(2999.7);
    expect(service.calculateDpAmount(100, 0)).toBe(0);
  });

  it('detects an expired payment deadline using the supplied current time', () => {
    const createdAt = new Date('2026-10-28T00:00:00.000Z');

    expect(
      service.isDpDeadlineExceeded(
        createdAt,
        60,
        new Date('2026-10-28T01:00:01.000Z')
      )
    ).toBe(true);
    expect(
      service.isDpDeadlineExceeded(
        createdAt,
        60,
        new Date('2026-10-28T00:59:59.000Z')
      )
    ).toBe(false);
  });
});
