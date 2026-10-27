'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiError, createOrderPayment, simulatePayment } from '../../../lib/api';

interface PaymentActionsProps {
  orderId: string;
  status: string;
  devMode: boolean;
}

export function PaymentActions({ orderId, status, devMode }: PaymentActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<'pay' | 'simulate' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (status !== 'PENDING_PAYMENT') {
    return null;
  }

  async function pay() {
    setError(null);
    setMessage(null);
    setLoading('pay');
    try {
      const payment = await createOrderPayment(orderId);
      if (payment.redirectUrl) {
        window.location.href = payment.redirectUrl;
        return;
      }
      setMessage('Pembayaran mock dibuat. Gunakan simulasi di bawah untuk menandai lunas.');
      router.refresh();
    } catch (payError) {
      setError(
        payError instanceof ApiError ? payError.message : 'Gagal membuat pembayaran.'
      );
    } finally {
      setLoading(null);
    }
  }

  async function simulate() {
    setError(null);
    setLoading('simulate');
    try {
      await simulatePayment(orderId);
      router.refresh();
    } catch (simulateError) {
      setError(
        simulateError instanceof ApiError ? simulateError.message : 'Gagal simulasi pembayaran.'
      );
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border bg-card p-5 shadow-sm">
      <h2 className="font-heading text-xl font-semibold">Pembayaran</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pesanan ini menunggu pembayaran. Stok dikunci sampai batas waktu.
      </p>
      {error ? (
        <p role="alert" className="mt-3 rounded-xl bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {message ? (
        <p aria-live="polite" className="mt-3 text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => { void pay(); }}
          disabled={loading !== null}
          className="min-h-12 flex-1 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {loading === 'pay' ? 'Membuka pembayaran...' : 'Bayar Sekarang'}
        </button>
        {devMode ? (
          <button
            type="button"
            onClick={() => { void simulate(); }}
            disabled={loading !== null}
            className="min-h-12 flex-1 rounded-xl border border-primary px-5 text-sm font-semibold text-primary transition hover:bg-primary/5 disabled:opacity-60"
          >
            {loading === 'simulate' ? 'Memproses...' : 'Simulasikan Lunas (dev)'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
