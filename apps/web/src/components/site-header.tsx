'use client';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cartCount, useCart } from '../lib/cart';

export function SiteHeader() {
  const items = useCart((state) => state.items);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const count = mounted ? cartCount(items) : 0;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="font-heading text-2xl font-extrabold tracking-tight text-primary">
          Bale Store
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            href="/"
            className="hidden min-h-11 items-center rounded-xl px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground sm:flex"
          >
            Katalog
          </Link>
          <Link
            href="/lacak"
            className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            Lacak
          </Link>
          <Link
            href="/keranjang"
            aria-label={`Keranjang, ${count} item`}
            className="relative flex min-h-11 min-w-11 items-center justify-center rounded-xl border bg-card text-foreground transition hover:border-primary/50 hover:bg-muted"
          >
            <ShoppingBag className="h-5 w-5" aria-hidden="true" />
            {count > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-foreground">
                {count}
              </span>
            ) : null}
          </Link>
        </nav>
      </div>
    </header>
  );
}
