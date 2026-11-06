import Link from 'next/link';

import { SiteHeader } from '../components/site-header';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />
      <section className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">404</p>
        <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight">
          Halaman tidak ditemukan
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Tautan yang Anda buka sudah tidak tersedia atau salah ketik.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
        >
          Kembali ke katalog
        </Link>
      </section>
    </main>
  );
}
