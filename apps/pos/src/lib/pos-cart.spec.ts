import { describe, expect, it } from 'vitest';

import type { PosCatalogItem } from './pos-api';
import {
  clearPersistedCart,
  readPersistedCart,
  reconcileCart,
  resolveCheckoutKey,
  writePersistedCart,
  type PersistedPosCart,
} from './pos-cart';

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

function catalogItem(overrides: Partial<PosCatalogItem> = {}): PosCatalogItem {
  return {
    variantId: 'variant-1',
    productName: 'Cutbray Classic',
    sku: 'CTB-30-HIT',
    color: 'Hitam',
    size: '30',
    price: '199000.00',
    stockAvailable: '3',
    ...overrides,
  };
}

function persistedCart(overrides: Partial<PersistedPosCart> = {}): PersistedPosCart {
  return {
    version: 1,
    ownerId: 'user-1',
    locationId: 'location-1',
    shiftId: 'shift-1',
    idempotencyKey: null,
    items: [{ variantId: 'variant-1', qty: 2 }],
    ...overrides,
  };
}

const context = { ownerId: 'user-1', locationId: 'location-1', shiftId: 'shift-1' };

describe('POS cart persistence', () => {
  it('round-trips a cart without storing catalog prices', () => {
    const storage = createStorage();
    const cart = persistedCart({ idempotencyKey: 'checkout-key' });

    writePersistedCart(storage, cart);

    expect(readPersistedCart(storage)).toEqual(cart);
  });

  it('drops malformed or old-version storage', () => {
    const storage = createStorage();
    storage.setItem('bale-pos-cart-v1', JSON.stringify({ version: 2, items: [] }));

    expect(readPersistedCart(storage)).toBeNull();
    expect(storage.getItem('bale-pos-cart-v1')).toBeNull();
  });
});

describe('POS cart reconciliation', () => {
  it('discards a cart owned by another cashier', () => {
    const result = reconcileCart(
      persistedCart({ ownerId: 'other-user' }),
      [catalogItem()],
      context
    );

    expect(result).toMatchObject({ lines: [], reason: 'owner' });
  });

  it('discards a cart from another location or shift', () => {
    expect(
      reconcileCart(persistedCart({ locationId: 'other-location' }), [catalogItem()], context)
    ).toMatchObject({ lines: [], reason: 'location' });
    expect(
      reconcileCart(persistedCart({ shiftId: 'other-shift' }), [catalogItem()], context)
    ).toMatchObject({ lines: [], reason: 'shift' });
  });

  it('drops variants that are missing, inactive, or out of stock', () => {
    const result = reconcileCart(
      persistedCart({
        items: [
          { variantId: 'missing', qty: 1 },
          { variantId: 'variant-1', qty: 1 },
        ],
      }),
      [catalogItem({ stockAvailable: '0' })],
      context
    );

    expect(result).toMatchObject({ lines: [], removed: 2, adjusted: 0, reason: null });
  });

  it('clamps quantity to the latest stock and uses fresh catalog data', () => {
    const result = reconcileCart(
      persistedCart({ items: [{ variantId: 'variant-1', qty: 5 }] }),
      [catalogItem({ stockAvailable: '2', price: '219000.00', productName: 'Cutbray Baru' })],
      context
    );

    expect(result).toMatchObject({ removed: 0, adjusted: 1, reason: null });
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.qty).toBe(2);
    expect(result.lines[0]?.item).toMatchObject({
      price: '219000.00',
      productName: 'Cutbray Baru',
    });
  });

  it('combines duplicate variants before clamping', () => {
    const result = reconcileCart(
      persistedCart({
        items: [
          { variantId: 'variant-1', qty: 1 },
          { variantId: 'variant-1', qty: 2 },
        ],
      }),
      [catalogItem({ stockAvailable: '3' })],
      context
    );

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.qty).toBe(3);
  });
});

describe('POS checkout key', () => {
  it('reuses the stored key so a retry cannot create a second sale', () => {
    expect(resolveCheckoutKey('stored-key')).toBe('stored-key');
  });

  it('creates a new key only when no attempt is stored', () => {
    expect(resolveCheckoutKey(null, () => 'new-key')).toBe('new-key');
  });
});

describe('POS cart clearing', () => {
  it('removes the persisted cart', () => {
    const storage = createStorage();
    writePersistedCart(storage, persistedCart());

    clearPersistedCart(storage);

    expect(readPersistedCart(storage)).toBeNull();
  });
});
