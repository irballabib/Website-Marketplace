import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  formatRupiah,
  getLocation,
  getProduct,
  lowestPrice,
  mediaUrl,
} from '../../../lib/api';
import { SiteHeader } from '../../../components/site-header';
import { VariantPicker } from './variant-picker';

export const dynamic = 'force-dynamic';

interface ProductPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ location?: string }>;
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { slug } = await params;
  const { location: locationCode } = await searchParams;
  const [product, location] = await Promise.all([
    getProduct(slug, locationCode),
    locationCode ? getLocation(locationCode) : Promise.resolve(null),
  ]);

  if (!product) {
    notFound();
  }

  const images = product.media.length
    ? product.media
    : [];
  const primary = images.find((item) => item.isPrimary) ?? images[0];
  const primaryUrl = mediaUrl(primary?.url);
  const backHref = location ? `/c/${location.code}` : '/';

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />

      <div className="mx-auto max-w-6xl px-4 pt-6">
        <Link href={backHref} className="text-sm text-muted-foreground hover:text-foreground">
          ← Kembali ke katalog
        </Link>
      </div>

      {location ? (
        <div className="border-b bg-muted/40">
          <div className="mx-auto max-w-6xl px-4 py-2 text-sm text-muted-foreground">
            Melihat stok untuk lokasi <span className="font-semibold">{location.name}</span> (
            {location.code})
          </div>
        </div>
      ) : null}

      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-2 md:py-12">
        <div className="space-y-3">
          <div className="aspect-[4/5] overflow-hidden rounded-2xl bg-muted">
            {primaryUrl ? (
              <img
                src={primaryUrl}
                alt={primary?.alt ?? product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-5xl font-bold text-muted-foreground/30">
                {product.name.slice(0, 1)}
              </div>
            )}
          </div>
          {images.length > 1 ? (
            <div className="grid grid-cols-4 gap-2">
              {images.map((image) => {
                const url = mediaUrl(image.url);
                return url ? (
                  <img
                    key={image.id}
                    src={url}
                    alt={image.alt ?? product.name}
                    className="aspect-square rounded-xl border object-cover"
                  />
                ) : null;
              })}
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-primary">
              {product.category.name}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{product.name}</h1>
            <p className="mt-2 text-lg font-semibold text-primary">
              {product.variants.length > 0
                ? `Mulai ${formatRupiah(lowestPrice(product))}`
                : 'Harga belum tersedia'}
            </p>
          </div>

          {product.description ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          ) : null}

          <VariantPicker
            variants={product.variants}
            productName={product.name}
            productSlug={product.slug}
            imageUrl={primaryUrl}
            locationId={location?.id}
          />

          <details className="rounded-2xl border p-4 text-sm">
            <summary className="cursor-pointer font-medium">Panduan ukuran</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-4">Ukuran</th>
                    <th className="py-1 pr-4">Lingkar pinggang</th>
                    <th className="py-1">Panjang</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="py-1 pr-4">28</td><td className="py-1 pr-4">72 cm</td><td className="py-1">98 cm</td></tr>
                  <tr><td className="py-1 pr-4">30</td><td className="py-1 pr-4">77 cm</td><td className="py-1">99 cm</td></tr>
                  <tr><td className="py-1 pr-4">32</td><td className="py-1 pr-4">82 cm</td><td className="py-1">100 cm</td></tr>
                  <tr><td className="py-1 pr-4">34</td><td className="py-1 pr-4">87 cm</td><td className="py-1">101 cm</td></tr>
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </section>
    </main>
  );
}
