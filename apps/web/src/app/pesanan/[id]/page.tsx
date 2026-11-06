import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SiteHeader } from '../../../components/site-header';
import { formatRupiah, getOrder } from '../../../lib/api';
import { PaymentActions } from './payment-actions';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Menunggu pembayaran',
  PAID: 'Dibayar',
  PROCESSING: 'Diproses',
  PACKED: 'Dikemas',
  SHIPPED: 'Dikirim',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
  RETURNED: 'Dikembalikan',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);

  if (!order) {
    notFound();
  }

  const isPaid = order.status === 'PAID' || order.status === 'PROCESSING' || order.status === 'PACKED' || order.status === 'SHIPPED' || order.status === 'COMPLETED';
  const steps: { status: string; label: string }[] = [
    { status: 'PENDING_PAYMENT', label: 'Dibuat' },
    { status: 'PAID', label: 'Dibayar' },
    { status: 'PROCESSING', label: 'Diproses' },
    { status: 'PACKED', label: 'Dikemas' },
    { status: 'SHIPPED', label: 'Dikirim' },
    { status: 'COMPLETED', label: 'Selesai' },
  ];
  const currentStep = steps.findIndex((step) => step.status === order.status);

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />
      <section className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Pesanan
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-heading text-3xl font-bold tracking-tight">{order.orderNumber}</h1>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                isPaid
                  ? 'bg-primary/10 text-primary'
                  : order.status === 'CANCELLED'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-accent/10 text-accent-foreground'
              }`}
            >
              {STATUS_LABELS[order.status] ?? order.status}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Dibuat {formatDate(order.createdAt)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Batas pembayaran: {formatDate(order.expiresAt)}
          </p>
        </div>

        {order.status !== 'CANCELLED' && order.status !== 'RETURNED' ? (
          <div className="mt-6 rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="font-heading text-xl font-semibold">Status pesanan</h2>
            <ol className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
              {steps.map((step, index) => {
                const done = index <= currentStep;
                return (
                  <li key={step.status} className="flex flex-col items-center gap-1 text-center">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                        done
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span
                      className={`text-xs ${
                        done ? 'font-semibold text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {step.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
            Pesanan ini {order.status === 'CANCELLED' ? 'dibatalkan' : 'dikembalikan'}.
          </div>
        )}

        <div className="mt-6 rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="font-heading text-xl font-semibold">Item</h2>
          <ul className="mt-4 space-y-3">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 text-sm">
                <span>
                  <span className="block font-medium">{item.productName}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.sku} · {item.qty} × {formatRupiah(item.unitPrice)}
                  </span>
                </span>
                <span className="font-medium">{formatRupiah(item.total)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-2 border-t pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatRupiah(order.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ongkir</span>
              <span>{formatRupiah(order.shippingCost)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="text-primary">{formatRupiah(order.total)}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="font-heading text-xl font-semibold">Pengiriman</h2>
          <p className="mt-2 text-sm">
            {order.fulfillmentType === 'SHIP' ? 'Dikirim ke alamat' : 'Ambil di toko'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{order.customerName}</p>
          {order.customerPhone ? (
            <p className="text-sm text-muted-foreground">{order.customerPhone}</p>
          ) : null}
          {order.shippingAddress ? (
            <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
              {order.shippingAddress}
            </p>
          ) : null}
          {order.courier ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Kurir: <span className="font-medium text-foreground">{order.courier}</span>
            </p>
          ) : null}
          {order.trackingNumber ? (
            <p className="text-sm text-muted-foreground">
              Resi: <span className="font-medium text-foreground">{order.trackingNumber}</span>
            </p>
          ) : null}
        </div>

        <PaymentActions
          orderId={order.id}
          status={order.status}
          devMode={process.env.NODE_ENV === 'development'}
        />

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm font-medium text-primary hover:underline">
            Kembali ke katalog
          </Link>
        </div>
      </section>
    </main>
  );
}
