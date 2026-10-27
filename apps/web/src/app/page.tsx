import { ProductCard } from '../components/product-card';
import { SiteHeader } from '../components/site-header';
import { getCategories, getProducts } from '../lib/api';

export const dynamic = 'force-dynamic';

interface HomePageProps {
  searchParams: Promise<{ q?: string; category?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const [products, categories] = await Promise.all([
    getProducts({ q: params.q, category: params.category }),
    getCategories(),
  ]);

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />

      <section className="mx-auto max-w-6xl px-4 pt-6">
        <div className="overflow-hidden rounded-2xl bg-primary px-6 py-8 text-primary-foreground shadow-sm sm:px-10 sm:py-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground/80">
            Bale Store
          </p>
          <h1 className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
            Belanja celana cutbray, langsung dari Bale Store.
          </h1>
          <p className="mt-3 max-w-xl text-sm text-primary-foreground/90 sm:text-base">
            Pilih model, warna, dan ukuran. Stok tampil per lokasi lewat QR toko.
            Bisa kirim ke rumah atau ambil di toko.
          </p>
        </div>

        <form
          className="relative z-10 mx-3 -mt-5 flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-md sm:mx-6 sm:flex-row"
          action="/"
        >
          <input
            type="search"
            name="q"
            defaultValue={params.q ?? ''}
            placeholder="Cari model atau warna..."
            className="h-11 flex-1 rounded-lg border bg-muted/50 px-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
          />
          <select
            name="category"
            defaultValue={params.category ?? ''}
            className="h-11 rounded-lg border bg-muted/50 px-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
          >
            <option value="">Semua kategori</option>
            {(categories?.data ?? []).map((category) => (
              <option key={category.id} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-11 rounded-lg bg-primary px-6 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
          >
            Cari
          </button>
        </form>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">Produk pilihan</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Koleksi celana cutbray dari Bale Store.
            </p>
          </div>
        </div>

        {!products ? (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center text-muted-foreground">
            Katalog belum dapat dimuat. Pastikan API berjalan di localhost:3001.
          </div>
        ) : products.data.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center text-muted-foreground">
            Tidak ada produk yang cocok.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.data.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      <footer className="border-t bg-card py-8 text-center text-sm text-muted-foreground">
        Bale Store · Celana cutbray lokal. Dibuat di Indonesia.
      </footer>
    </main>
  );
}
