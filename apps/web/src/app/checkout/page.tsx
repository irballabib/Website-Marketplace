'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { SiteHeader } from '../../components/site-header';
import {
  ApiError,
  createOrder,
  createOrderPayment,
  formatRupiah,
} from '../../lib/api';
import { cartSubtotal, useCart } from '../../lib/cart';

const FLAT_SHIPPING = 20000;

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCart((state) => state.items);
  const clear = useCart((state) => state.clear);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string>('');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState<'SHIP' | 'PICKUP'>('SHIP');
  const [shippingAddress, setShippingAddress] = useState('');

  useEffect(() => {
    setMounted(true);
    if (!idempotencyKey.current) {
      idempotencyKey.current = crypto.randomUUID();
    }
  }, []);

  if (!mounted) {
    return (
      <main className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">
          Memuat checkout...
        </div>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="min-h-screen bg-background">
        <SiteHeader />
        <section className="mx-auto max-w-4xl px-4 py-10">
          <h1 className="font-heading text-3xl font-bold">Checkout</h1>
          <p className="mt-3 text-muted-foreground">Keranjang kosong. Pilih produk terlebih dahulu.</p>
          <Link
            href="/"
            className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Lihat katalog
          </Link>
        </section>
      </main>
    );
  }

  const subtotal = cartSubtotal(items);
  const shippingCost = fulfillmentType === 'SHIP' ? FLAT_SHIPPING : 0;
  const total = subtotal + shippingCost;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (customerName.trim().length < 2) {
      setError('Nama penerima minimal 2 karakter.');
      return;
    }
    if (!/^\+?[0-9]{8,15}$/.test(customerPhone.trim())) {
      setError('Nomor telepon harus 8-15 digit.');
      return;
    }
    if (fulfillmentType === 'SHIP' && shippingAddress.trim().length < 5) {
      setError('Alamat pengiriman wajib diisi.');
      return;
    }

    setLoading(true);
    try {
      const order = await createOrder(
        {
          items: items.map((item) => ({ variantId: item.variantId, qty: item.qty })),
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim() || undefined,
          fulfillmentType,
          shippingAddress: fulfillmentType === 'SHIP' ? shippingAddress.trim() : undefined,
          shippingCost: String(shippingCost),
        },
        idempotencyKey.current || crypto.randomUUID()
      );
      const payment = await createOrderPayment(order.id);
      clear();

      if (payment.redirectUrl) {
        window.location.href = payment.redirectUrl;
        return;
      }

      router.push(`/pesanan/${order.id}`);
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : 'Checkout gagal. Periksa koneksi lalu coba lagi.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />
      <section className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Checkout</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Isi data penerima. Stok dikunci 15 menit setelah pesanan dibuat.
        </p>

        <form onSubmit={(event) => { void submit(event); }} className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
            {error ? (
              <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label htmlFor="name" className="text-sm font-medium">Nama penerima</label>
              <input
                id="name"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                autoComplete="name"
                required
                className="min-h-11 w-full rounded-xl border bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="phone" className="text-sm font-medium">Nomor WhatsApp</label>
                <input
                  id="phone"
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="08123456789"
                  required
                  className="min-h-11 w-full rounded-xl border bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium">Email (opsional)</label>
                <input
                  id="email"
                  type="email"
                  value={customerEmail}
                  onChange={(event) => setCustomerEmail(event.target.value)}
                  autoComplete="email"
                  className="min-h-11 w-full rounded-xl border bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Metode pengambilan</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['SHIP', 'PICKUP'] as const).map((type) => (
                  <label
                    key={type}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 text-sm transition ${
                      fulfillmentType === type ? 'border-primary bg-primary/5' : 'bg-background'
                    }`}
                  >
                    <input
                      type="radio"
                      name="fulfillment"
                      value={type}
                      checked={fulfillmentType === type}
                      onChange={() => setFulfillmentType(type)}
                    />
                    {type === 'SHIP' ? 'Kirim ke alamat' : 'Ambil di toko'}
                  </label>
                ))}
              </div>
            </fieldset>

            {fulfillmentType === 'SHIP' ? (
              <div className="space-y-1.5">
                <label htmlFor="address" className="text-sm font-medium">Alamat pengiriman</label>
                <textarea
                  id="address"
                  value={shippingAddress}
                  onChange={(event) => setShippingAddress(event.target.value)}
                  rows={3}
                  autoComplete="street-address"
                  required
                  className="w-full rounded-xl border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
                />
                <p className="text-xs text-muted-foreground">
                  Ongkir sementara flat {formatRupiah(FLAT_SHIPPING)}; adapter ongkir menyusul.
                </p>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="min-h-12 w-full rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Memproses pesanan...' : 'Buat Pesanan & Bayar'}
            </button>
          </div>

          <aside className="h-fit rounded-2xl border bg-card p-5 shadow-sm lg:sticky lg:top-24">
            <h2 className="font-heading text-xl font-semibold">Pesanan</h2>
            <ul className="mt-4 space-y-3">
              {items.map((item) => (
                <li key={item.variantId} className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium">{item.productName}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.color} · {item.size} × {item.qty}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium">
                    {formatRupiah(Number(item.price) * item.qty)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-2 border-t pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatRupiah(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ongkir</span>
                <span>{shippingCost === 0 ? 'Gratis / ambil di toko' : formatRupiah(shippingCost)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <span>Total</span>
                <span className="text-primary">{formatRupiah(total)}</span>
              </div>
            </div>
          </aside>
        </form>
      </section>
    </main>
  );
}
