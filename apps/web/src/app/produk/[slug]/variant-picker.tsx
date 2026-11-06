'use client';

import Link from 'next/link';
import { useState } from 'react';

import { formatRupiah, type ProductVariant } from '../../../lib/api';
import { useCart } from '../../../lib/cart';

interface VariantPickerProps {
  variants: ProductVariant[];
  productName: string;
  productSlug: string;
  imageUrl: string | null;
  locationId?: string;
}

export function VariantPicker({
  variants,
  productName,
  productSlug,
  imageUrl,
  locationId,
}: VariantPickerProps) {
  const add = useCart((state) => state.add);
  const colors = Array.from(new Set(variants.map((variant) => variant.color)));
  const [color, setColor] = useState(colors[0] ?? '');
  const sizesForColor = variants.filter((variant) => variant.color === color);
  const [size, setSize] = useState(sizesForColor[0]?.size ?? '');
  const [added, setAdded] = useState(false);
  const selected =
    variants.find((variant) => variant.color === color && variant.size === size) ??
    sizesForColor[0];

  function chooseColor(nextColor: string) {
    setColor(nextColor);
    const first = variants.find((variant) => variant.color === nextColor);
    setSize(first?.size ?? '');
    setAdded(false);
  }

  function chooseSize(nextSize: string) {
    setSize(nextSize);
    setAdded(false);
  }

  function addToCart() {
    if (!selected) return;
    add({
      variantId: selected.id,
      productSlug,
      productName,
      color: selected.color,
      size: selected.size,
      price: selected.price,
      imageUrl,
      locationId,
    });
    setAdded(true);
  }

  if (variants.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        Varian belum tersedia.
      </p>
    );
  }

  const stock = selected?.stockAvailable === undefined ? null : Number(selected.stockAvailable);

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-medium">Warna</p>
        <div className="flex flex-wrap gap-2">
          {colors.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => chooseColor(item)}
              aria-pressed={color === item}
              className={`min-h-11 rounded-xl border px-4 text-sm font-medium transition ${
                color === item
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background hover:border-primary/50'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Ukuran</p>
        <div className="flex flex-wrap gap-2">
          {sizesForColor.map((variant) => (
            <button
              key={variant.id}
              type="button"
              onClick={() => chooseSize(variant.size)}
              aria-pressed={size === variant.size}
              className={`min-h-11 min-w-11 rounded-xl border px-4 text-sm font-medium transition ${
                size === variant.size
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background hover:border-primary/50'
              }`}
            >
              {variant.size}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-muted/50 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Harga</p>
            <p className="text-xl font-bold">{selected ? formatRupiah(selected.price) : '-'}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Stok</p>
            <p className={`text-sm font-semibold ${stock === 0 ? 'text-destructive' : ''}`}>
              {stock === null
                ? 'Pilih lokasi'
                : stock > 0
                  ? `${stock} tersedia`
                  : 'Stok habis'}
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">SKU: {selected?.sku ?? '-'}</p>
      </div>

      <button
        type="button"
        onClick={addToCart}
        disabled={!selected || stock === 0}
        className="min-h-12 w-full rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {stock === 0 ? 'Stok habis' : added ? 'Ditambahkan ke keranjang' : 'Tambah ke Keranjang'}
      </button>
      <p aria-live="polite" className="min-h-4 text-center text-xs text-muted-foreground">
        {added ? (
          <Link href="/keranjang" className="font-medium text-primary underline">
            Lihat keranjang
          </Link>
        ) : (
          'Pilih warna dan ukuran sebelum menambahkan.'
        )}
      </p>
    </div>
  );
}
