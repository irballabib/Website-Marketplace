import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PAYMENT_EXPIRY_MINUTES } from './payment.constant';

export const PAYMENT_ADAPTER = Symbol('PAYMENT_ADAPTER');

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED';

export interface ChargeCustomer {
  name: string;
  email?: string;
  phone?: string;
}

export interface ChargeInput {
  paymentId: string;
  tenantId: string;
  orderId: string;
  amount: string;
  currency: string;
  method: string;
  description?: string;
  customer?: ChargeCustomer;
}

export interface ChargeResult {
  reference: string;
  status: PaymentStatus;
  expiresAt?: Date;
  snapToken?: string;
  redirectUrl?: string;
}

export interface WebhookPayload {
  orderId: string;
  status: PaymentStatus;
  gatewayReference: string;
  amount: string;
  statusCode?: string;
  signature: string;
}

export interface PaymentGateway {
  readonly name: string;
  charge(input: ChargeInput): Promise<ChargeResult>;
  verifyWebhook(payload: WebhookPayload): boolean;
  signWebhook(payload: Omit<WebhookPayload, 'signature'>): string;
}

function safeEqual(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

function webhookSigningPayload(payload: Omit<WebhookPayload, 'signature'>): string {
  return [
    payload.orderId,
    payload.status,
    payload.gatewayReference,
    payload.amount,
    payload.statusCode ?? '',
  ].join(':');
}

/**
 * Development default. Charges stay PENDING until a signed webhook or the
 * dev-only simulate endpoint settles them.
 */
@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  readonly name = 'mock';

  constructor(private readonly config: ConfigService) {}

  private get secret(): string {
    return this.config.get<string>('PAYMENT_MOCK_SECRET')?.trim() || 'dev-mock-payment-secret';
  }

  charge(_input: ChargeInput): Promise<ChargeResult> {
    return Promise.resolve({
      reference: `MOCK-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + PAYMENT_EXPIRY_MINUTES * 60 * 1000),
    });
  }

  signWebhook(payload: Omit<WebhookPayload, 'signature'>): string {
    return createHmac('sha256', this.secret).update(webhookSigningPayload(payload)).digest('hex');
  }

  verifyWebhook(payload: WebhookPayload): boolean {
    if (!payload.signature) {
      return false;
    }

    return safeEqual(this.signWebhook(payload), payload.signature);
  }
}

/**
 * Midtrans Snap adapter. Sandbox is the default; set MIDTRANS_IS_PRODUCTION=true
 * only when the production server key is configured.
 */
@Injectable()
export class MidtransPaymentGateway implements PaymentGateway {
  readonly name = 'midtrans';

  constructor(private readonly config: ConfigService) {}

  private get serverKey(): string {
    return this.config.get<string>('MIDTRANS_SERVER_KEY')?.trim() || '';
  }

  private get isProduction(): boolean {
    const raw = this.config.get<string>('MIDTRANS_IS_PRODUCTION');
    return raw === 'true' || raw === '1';
  }

  private get baseUrl(): string {
    return this.isProduction ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
  }

  private get webBaseUrl(): string {
    return (
      this.config.get<string>('WEB_BASE_URL')?.trim().replace(/\/$/, '') ||
      this.config.get<string>('QR_BASE_URL')?.trim().replace(/\/$/, '') ||
      'http://localhost:3000'
    );
  }

  async charge(input: ChargeInput): Promise<ChargeResult> {
    const serverKey = this.serverKey;

    if (!serverKey) {
      throw new InternalServerErrorException({
        code: 'PAYMENT_MIDTRANS_NOT_CONFIGURED',
        message: 'MIDTRANS_SERVER_KEY belum diisi; gunakan sandbox key atau PAYMENT_ADAPTER=mock',
      });
    }

    const response = await fetch(`${this.baseUrl}/snap/v1/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        transaction_details: {
          order_id: input.paymentId,
          gross_amount: Number(input.amount),
        },
        ...(input.customer
          ? {
              customer_details: {
                first_name: input.customer.name,
                ...(input.customer.email ? { email: input.customer.email } : {}),
                ...(input.customer.phone ? { phone: input.customer.phone } : {}),
              },
            }
          : {}),
        expiry: { unit: 'minutes', duration: PAYMENT_EXPIRY_MINUTES },
        page_expiry: { unit: 'minutes', duration: PAYMENT_EXPIRY_MINUTES },
        callbacks: {
          finish: `${this.webBaseUrl}/pesanan/${input.orderId}`,
        },
      }),
    });

    if (!response.ok) {
      throw new InternalServerErrorException({
        code: 'PAYMENT_MIDTRANS_CHARGE_FAILED',
        message: 'Gagal membuat transaksi Midtrans',
        details: { status: response.status },
      });
    }

    const body: unknown = await response.json();
    const data = body as { token?: unknown; redirect_url?: unknown };

    if (typeof data.token !== 'string' || typeof data.redirect_url !== 'string') {
      throw new InternalServerErrorException({
        code: 'PAYMENT_MIDTRANS_INVALID_RESPONSE',
        message: 'Respons Midtrans tidak berisi token/redirect URL',
      });
    }

    return {
      reference: '',
      status: 'PENDING',
      snapToken: data.token,
      redirectUrl: data.redirect_url,
      expiresAt: new Date(Date.now() + PAYMENT_EXPIRY_MINUTES * 60 * 1000),
    };
  }

  signWebhook(payload: Omit<WebhookPayload, 'signature'>): string {
    return createHash('sha512')
      .update(
        `${payload.orderId}${payload.statusCode ?? ''}${payload.amount}${this.serverKey}`
      )
      .digest('hex');
  }

  verifyWebhook(payload: WebhookPayload): boolean {
    if (!payload.signature || !this.serverKey) {
      return false;
    }

    return safeEqual(this.signWebhook(payload), payload.signature);
  }
}
