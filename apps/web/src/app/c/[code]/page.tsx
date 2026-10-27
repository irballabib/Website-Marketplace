import { notFound } from 'next/navigation';

import { ProductCard } from '../../../components/product-card';
import { SiteHeader } from '../../../components/site-header';
import { getLocation, getProducts } from '../../../lib/api';

export const dynamic = 'force-dynamic';

interface LocationPageProps {
  params: Promise<{ code: string }>;
}

export default async function LocationPage({ params }: LocationPageProps) {
  const { code } = await params;
  const [location, products] = await Promise.all([getLocation(code), getProducts()]);

  if (!location) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />

      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 rounded-2xl border bg-muted/40 p-6">
          <p className="text-xs font-medium uppercase tracking-widest text-primary">
            Katalog lokasi
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{location.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {location.code} · {location.type}
            {location.address ? ` · ${location.address}` : ''}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Stok yang tampil di halaman produk mengikuti lokasi ini.
          </p>
        </div>

        {!products ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
            Katalog belum dapat dimuat. Pastikan API berjalan.
          </div>
        ) : products.data.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
            Belum ada produk aktif.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.data.map((product) => (
              <ProductCard key={product.id} product={product} locationCode={location.code} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
