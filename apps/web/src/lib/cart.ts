import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  variantId: string;
  productSlug: string;
  productName: string;
  color: string;
  size: string;
  price: string;
  imageUrl: string | null;
  locationId?: string;
  qty: number;
}

interface CartState {
  items: CartItem[];
  add: (item: Omit<CartItem, 'qty'>) => void;
  remove: (variantId: string) => void;
  setQty: (variantId: string, qty: number) => void;
  clear: () => void;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) =>
        set((state) => {
          const existing = state.items.find((entry) => entry.variantId === item.variantId);
          if (existing) {
            return {
              items: state.items.map((entry) =>
                entry.variantId === item.variantId
                  ? { ...entry, qty: Math.min(99, entry.qty + 1) }
                  : entry
              ),
            };
          }
          return { items: [...state.items, { ...item, qty: 1 }] };
        }),
      remove: (variantId) =>
        set((state) => ({ items: state.items.filter((entry) => entry.variantId !== variantId) })),
      setQty: (variantId, qty) =>
        set((state) => ({
          items: state.items.map((entry) =>
            entry.variantId === variantId
              ? { ...entry, qty: Math.max(1, Math.min(99, qty)) }
              : entry
          ),
        })),
      clear: () => set({ items: [] }),
    }),
    { name: 'cutbray-cart-v1', skipHydration: true }
  )
);

export function cartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + Number(item.price) * item.qty, 0);
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.qty, 0);
}
