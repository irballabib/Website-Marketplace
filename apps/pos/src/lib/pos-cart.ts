import type { PosCatalogItem } from './pos-api';

export const POS_CART_STORAGE_KEY = 'bale-pos-cart-v1';

export interface PersistedPosCart {
  version: 1;
  ownerId: string;
  locationId: string;
  shiftId: string;
  idempotencyKey: string | null;
  items: { variantId: string; qty: number }[];
}

export interface PosCartLine {
  item: PosCatalogItem;
  qty: number;
}

export interface CartReconcileResult {
  lines: PosCartLine[];
  removed: number;
  adjusted: number;
  reason: 'owner' | 'location' | 'shift' | null;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPersistedCart(value: unknown): value is PersistedPosCart {
  if (!isRecord(value) || value.version !== 1) {
    return false;
  }

  if (
    typeof value.ownerId !== 'string' ||
    typeof value.locationId !== 'string' ||
    typeof value.shiftId !== 'string' ||
    (value.idempotencyKey !== null && typeof value.idempotencyKey !== 'string') ||
    !Array.isArray(value.items)
  ) {
    return false;
  }

  return value.items.every(
    (item) =>
      isRecord(item) &&
      typeof item.variantId === 'string' &&
      typeof item.qty === 'number' &&
      Number.isInteger(item.qty) &&
      item.qty > 0
  );
}

export function readPersistedCart(storage: StorageLike): PersistedPosCart | null {
  const raw = storage.getItem(POS_CART_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(raw);
    if (!isPersistedCart(value)) {
      storage.removeItem(POS_CART_STORAGE_KEY);
      return null;
    }
    return value;
  } catch {
    storage.removeItem(POS_CART_STORAGE_KEY);
    return null;
  }
}

export function writePersistedCart(storage: StorageLike, cart: PersistedPosCart): void {
  storage.setItem(POS_CART_STORAGE_KEY, JSON.stringify(cart));
}

export function clearPersistedCart(storage: StorageLike): void {
  storage.removeItem(POS_CART_STORAGE_KEY);
}

export function reconcileCart(
  persisted: PersistedPosCart | null,
  catalog: PosCatalogItem[],
  context: { ownerId: string; locationId: string; shiftId: string }
): CartReconcileResult {
  if (!persisted) {
    return { lines: [], removed: 0, adjusted: 0, reason: null };
  }

  if (persisted.ownerId !== context.ownerId) {
    return { lines: [], removed: persisted.items.length, adjusted: 0, reason: 'owner' };
  }
  if (persisted.locationId !== context.locationId) {
    return { lines: [], removed: persisted.items.length, adjusted: 0, reason: 'location' };
  }
  if (persisted.shiftId !== context.shiftId) {
    return { lines: [], removed: persisted.items.length, adjusted: 0, reason: 'shift' };
  }

  const catalogById = new Map(catalog.map((item) => [item.variantId, item]));
  const quantities = new Map<string, number>();
  for (const item of persisted.items) {
    quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.qty);
  }

  let removed = 0;
  let adjusted = 0;
  const lines: PosCartLine[] = [];

  for (const [variantId, savedQty] of quantities) {
    const item = catalogById.get(variantId);
    if (!item) {
      removed += 1;
      continue;
    }

    const stock = Math.floor(Number(item.stockAvailable));
    if (!Number.isFinite(stock) || stock <= 0) {
      removed += 1;
      continue;
    }

    const qty = Math.min(savedQty, stock);
    if (qty !== savedQty) {
      adjusted += 1;
    }
    lines.push({ item, qty });
  }

  return { lines, removed, adjusted, reason: null };
}

export function resolveCheckoutKey(
  stored: string | null,
  generate: () => string = () => crypto.randomUUID()
): string {
  return stored ?? generate();
}
