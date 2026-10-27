import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MidtransPaymentGateway, type WebhookPayload } from './payment.gateway';
import { normalizeWebhook } from './payment.dto';

const SERVER_KEY = 'SB-Mid-server-test-key';

function gateway(): MidtransPaymentGateway {
  return new MidtransPaymentGateway(
    new ConfigService({
      MIDTRANS_SERVER_KEY: SERVER_KEY,
      MIDTRANS_IS_PRODUCTION: 'false',
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MidtransPaymentGateway', () => {
  it('creates a Snap transaction on the sandbox endpoint and returns the token', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          token: 'snap-token',
          redirect_url: 'https://app.sandbox.midtrans.com/snap/v3/redirection/test',
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await gateway().charge({
      paymentId: 'payment-1',
      tenantId: 'tenant-1',
      orderId: 'order-1',
      amount: '150000.00',
      currency: 'IDR',
      method: 'QRIS',
      customer: { name: 'Budi', email: 'budi@example.com', phone: '08123456789' },
    });

    expect(result).toMatchObject({
      status: 'PENDING',
      snapToken: 'snap-token',
      redirectUrl: 'https://app.sandbox.midtrans.com/snap/v3/redirection/test',
    });

    const call = fetchMock.mock.calls[0];
    const init = call?.[1];
    if (!call || !init?.body) {
      throw new Error('fetch was not called with a body');
    }

    expect(call[0]).toBe('https://api.sandbox.midtrans.com/snap/v1/transactions');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from(`${SERVER_KEY}:`).toString('base64')}`);

    if (typeof init.body !== 'string') {
      throw new Error('fetch body was not a JSON string');
    }
    const body: unknown = JSON.parse(init.body);
    const data = body as {
      transaction_details: { order_id: string; gross_amount: number };
      customer_details: { first_name: string; email: string; phone: string };
    };
    expect(data.transaction_details).toEqual({
      order_id: 'payment-1',
      gross_amount: 150000,
    });
    expect(data.customer_details).toMatchObject({
      first_name: 'Budi',
      email: 'budi@example.com',
      phone: '08123456789',
    });
  });

  it('verifies the Midtrans SHA512 webhook signature', () => {
    const payload: Omit<WebhookPayload, 'signature'> = {
      orderId: 'payment-1',
      status: 'PAID',
      gatewayReference: 'transaction-1',
      amount: '150000.00',
      statusCode: '200',
    };
    const signature = createHash('sha512')
      .update(`payment-1` + `200` + `150000.00` + SERVER_KEY)
      .digest('hex');

    expect(gateway().verifyWebhook({ ...payload, signature })).toBe(true);
    expect(gateway().verifyWebhook({ ...payload, signature: 'bad' })).toBe(false);
  });

  it('normalizes a Midtrans settlement notification', () => {
    expect(
      normalizeWebhook({
        order_id: 'payment-1',
        transaction_status: 'settlement',
        transaction_id: 'transaction-1',
        gross_amount: '150000.00',
        status_code: '200',
        signature_key: 'signature',
        fraud_status: 'accept',
      })
    ).toEqual({
      orderId: 'payment-1',
      status: 'PAID',
      gatewayReference: 'transaction-1',
      amount: '150000.00',
      statusCode: '200',
      signature: 'signature',
    });
  });

  it('fails clearly when the server key is missing', async () => {
    const empty = new MidtransPaymentGateway(new ConfigService({ MIDTRANS_IS_PRODUCTION: 'false' }));

    await expect(
      empty.charge({
        paymentId: 'payment-1',
        tenantId: 'tenant-1',
        orderId: 'order-1',
        amount: '10000.00',
        currency: 'IDR',
        method: 'QRIS',
      })
    ).rejects.toMatchObject({ response: { code: 'PAYMENT_MIDTRANS_NOT_CONFIGURED' } });
  });
});
