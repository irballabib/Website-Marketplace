import Link from 'next/link';

import { formatRupiah, lowestPrice, mediaUrl, type Product } from '../lib/api';

export function ProductCard({
  product,
  locationCode,
}: {
  product: Product;
  locationCode?: string;
}) {
  const image = mediaUrl(product.media.find((item) => item.isPrimary)?.url ?? product.media[0]?.url);
  const href = locationCode
    ? `/produk/${product.slug}?location=${encodeURIComponent(locationCode)}`
    : `/produk/${product.slug}`;

  return (
    <Link
      href={href}
      className="group overflow-hidden rounded-xl border border-border bg-card transition hover:shadow-md"
    >
      <div className="aspect-[4/5] overflow-hidden bg-muted">
        {image ? (
          <img
            src={image}
            alt={product.media.find((item) => item.isPrimary)?.alt ?? product.name}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl font-bold text-muted-foreground/30">
            {product.name.slice(0, 1)}
          </div>
        )}
      </div>
      <div className="space-y-1 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {product.category.name}
        </p>
        <h2 className="line-clamp-2 font-semibold leading-snug">{product.name}</h2>
        <p className="text-sm font-bold text-primary">
          {product.variants.length > 0
            ? `Mulai ${formatRupiah(lowestPrice(product))}`
            : 'Belum ada varian'}
        </p>
        <p className="text-xs text-muted-foreground">
          {product.variants.length > 0
            ? `${product.variants.length} varian warna/ukuran`
            : 'Segera tersedia'}
        </p>
      </div>
    </Link>
  );
}
