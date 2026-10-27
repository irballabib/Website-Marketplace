import { redirect } from 'next/navigation';

import { SiteHeader } from '../../components/site-header';

export const dynamic = 'force-dynamic';

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;

  if (id?.trim()) {
    redirect(`/pesanan/${encodeURIComponent(id.trim())}`);
  }

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />
      <section className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-3xl font-extrabold tracking-tight">Lacak pesanan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Masukkan ID pesanan yang tampil di halaman checkout atau konfirmasi.
        </p>
        <form
          action="/lacak"
          className="mt-6 space-y-3 rounded-xl border bg-card p-5 shadow-sm"
        >
          <label htmlFor="order-id" className="text-sm font-medium">
            ID pesanan
          </label>
          <input
            id="order-id"
            name="id"
            required
            placeholder="Contoh: 01a1684a-..."
            className="h-11 w-full rounded-lg border bg-muted/50 px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
          />
          <button
            type="submit"
            className="h-11 w-full rounded-lg bg-primary px-6 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
          >
            Lacak
          </button>
        </form>
      </section>
    </main>
  );
}
