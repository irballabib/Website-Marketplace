'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { SiteHeader } from '../../components/site-header';
import { formatRupiah } from '../../lib/api';
import { cartSubtotal, useCart } from '../../lib/cart';

export default function CartPage() {
  const items = useCart((state) => state.items);
  const remove = useCart((state) => state.remove);
  const setQty = useCart((state) => state.setQty);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <main className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">
          Memuat keranjang...
        </div>
      </main>
    );
  }

  const subtotal = cartSubtotal(items);

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />
      <section className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Keranjang</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {items.length > 0 ? `${items.length} varian dipilih` : 'Belum ada item.'}
        </p>

        {items.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed bg-card p-8 text-center">
            <p className="text-muted-foreground">Keranjang masih kosong.</p>
            <Link
              href="/"
              className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              Lihat katalog
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-3">
              {items.map((item) => (
                <article
                  key={item.variantId}
                  className="flex gap-3 rounded-2xl border bg-card p-3 shadow-sm sm:gap-4 sm:p-4"
                >
                  <div className="h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-28 sm:w-24">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.productName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center font-heading text-2xl text-muted-foreground/40">
                        {item.productName.slice(0, 1)}
                      </div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                    <div>
                      <Link
                        href={`/produk/${item.productSlug}`}
                        className="font-semibold leading-snug hover:text-primary"
                      >
                        {item.productName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {item.color} · Ukuran {item.size}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-primary">
                        {formatRupiah(item.price)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center rounded-xl border">
                        <button
                          type="button"
                          aria-label="Kurangi jumlah"
                          onClick={() => setQty(item.variantId, item.qty - 1)}
                          className="min-h-11 min-w-11 text-lg text-muted-foreground hover:text-foreground"
                        >
                          −
                        </button>
                        <span className="min-w-8 text-center text-sm font-medium">{item.qty}</span>
                        <button
                          type="button"
                          aria-label="Tambah jumlah"
                          onClick={() => setQty(item.variantId, item.qty + 1)}
                          className="min-h-11 min-w-11 text-lg text-muted-foreground hover:text-foreground"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(item.variantId)}
                        className="min-h-11 px-2 text-xs font-medium text-destructive hover:underline"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <aside className="h-fit rounded-2xl border bg-card p-5 shadow-sm lg:sticky lg:top-24">
              <h2 className="font-heading text-xl font-semibold">Ringkasan</h2>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold">{formatRupiah(subtotal)}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Ongkir atau ambil di toko dipilih saat checkout.
              </p>
              <Link
                href="/checkout"
                className="mt-5 flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Lanjut ke Checkout
              </Link>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}
