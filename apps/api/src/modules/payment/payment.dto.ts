import { BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

import type { PaymentStatus, WebhookPayload } from './payment.gateway';

export const PAYMENT_METHODS = ['CASH', 'QRIS', 'TRANSFER', 'EDC'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'EXPIRED'] as const;

function trimUnknown(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function upperUnknown(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export interface PaymentView {
  id: string;
  orderId: string | null;
  bookingId: string | null;
  gatewayReference: string | null;
  snapToken: string | null;
  redirectUrl: string | null;
  amount: string;
  currency: string;
  method: string;
  status: string;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface CreatePaymentInput {
  orderId: string;
  amount: string;
  currency?: string;
  method: PaymentMethod;
  description?: string;
}

export class CreatePaymentDto implements CreatePaymentInput {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => trimUnknown(value))
  orderId!: string;

  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'amount harus berupa angka dengan maksimal 2 desimal',
  })
  amount!: string;

  @IsOptional()
  @Transform(({ value }) => upperUnknown(value))
  @IsString()
  @Length(3, 3)
  currency?: string;

  @Transform(({ value }) => upperUnknown(value))
  @IsIn(PAYMENT_METHODS)
  method!: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => trimUnknown(value))
  description?: string;
}

/** Accepts both our canonical fields and Midtrans snake_case fields. */
export class WebhookBodyDto {
  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  order_id?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  transaction_status?: string;

  @IsOptional()
  @IsString()
  transaction_id?: string;

  @IsOptional()
  @IsString()
  gatewayReference?: string;

  @IsOptional()
  @IsString()
  amount?: string;

  @IsOptional()
  @IsString()
  gross_amount?: string;

  @IsOptional()
  @IsString()
  statusCode?: string;

  @IsOptional()
  @IsString()
  status_code?: string;

  @IsOptional()
  @IsString()
  signature?: string;

  @IsOptional()
  @IsString()
  signature_key?: string;

  @IsOptional()
  @IsString()
  fraud_status?: string;
}

export class SimulateWebhookDto {
  @IsString()
  @MinLength(1)
  orderId!: string;

  @IsIn(PAYMENT_STATUSES)
  status!: PaymentStatus;
}

const MIDTRANS_STATUS: Record<string, PaymentStatus> = {
  capture: 'PAID',
  settlement: 'PAID',
  pending: 'PENDING',
  deny: 'FAILED',
  cancel: 'FAILED',
  expire: 'EXPIRED',
  failure: 'FAILED',
};

export function normalizeWebhook(body: unknown): WebhookPayload {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException({
      code: 'PAYMENT_INVALID_WEBHOOK',
      message: 'Payload webhook harus berupa objek JSON',
    });
  }

  const record = body as Record<string, unknown>;
  const orderId = readString(record, 'orderId') ?? readString(record, 'order_id');
  const rawStatus = readString(record, 'status') ?? readString(record, 'transaction_status');
  const signature = readString(record, 'signature') ?? readString(record, 'signature_key');
  const gatewayReference =
    readString(record, 'gatewayReference') ?? readString(record, 'transaction_id');
  const amount = readString(record, 'amount') ?? readString(record, 'gross_amount');
  const fraudStatus = readString(record, 'fraud_status');
  const status = normalizeStatus(rawStatus, fraudStatus);
  const statusCode = readString(record, 'statusCode') ?? readString(record, 'status_code');

  if (!orderId || !status || !signature || !gatewayReference || !amount) {
    throw new BadRequestException({
      code: 'PAYMENT_INVALID_WEBHOOK',
      message: 'Payload webhook tidak lengkap',
    });
  }

  return {
    orderId: orderId.trim(),
    status,
    gatewayReference: gatewayReference.trim(),
    amount,
    statusCode,
    signature,
  };
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function normalizeStatus(
  value: string | undefined,
  fraudStatus?: string
): PaymentStatus | undefined {
  if (!value) {
    return undefined;
  }

  const raw = value.trim().toLowerCase();
  if (raw === 'capture' && fraudStatus?.trim().toLowerCase() === 'challenge') {
    return 'PENDING';
  }

  const upper = raw.toUpperCase();
  if ((PAYMENT_STATUSES as readonly string[]).includes(upper)) {
    return upper as PaymentStatus;
  }

  return MIDTRANS_STATUS[raw];
}
