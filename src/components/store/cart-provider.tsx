"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import {
  CART_STORAGE_KEY,
  MAX_CART_LINES,
  type CartItem,
  clampQuantity,
  isVariantId,
  parseStoredCart,
} from "@/lib/cart";

// ---------------------------------------------------------------------------
// External store backed by localStorage ("nitro_cart"), shared across tabs.
// Falls back to memory when storage is unavailable (private mode, blocked).
// ---------------------------------------------------------------------------

const EMPTY: CartItem[] = [];
const listeners = new Set<() => void>();
let snapshot: CartItem[] | null = null;

function load(): CartItem[] {
  try {
    return parseStoredCart(window.localStorage.getItem(CART_STORAGE_KEY));
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): CartItem[] {
  if (snapshot === null) snapshot = load();
  return snapshot;
}

function getServerSnapshot(): CartItem[] {
  return EMPTY;
}

function emit() {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== CART_STORAGE_KEY) return;
  snapshot = load();
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function commit(next: CartItem[]) {
  snapshot = next;
  try {
    if (next.length) window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(CART_STORAGE_KEY);
  } catch {
    // Storage full or blocked: keep the in-memory cart for this session.
  }
  emit();
}

function update(mutate: (items: CartItem[]) => CartItem[]) {
  commit(mutate(getSnapshot()));
}

const subscribeNoop = () => () => {};

// ---------------------------------------------------------------------------

type CartContextValue = {
  items: CartItem[];
  /** Total units across all lines. */
  count: number;
  /** False during SSR and hydration, before the stored cart is read. */
  ready: boolean;
  quantityOf: (variantId: string) => number;
  /** Adds units, capping the line at `max`. Returns the resulting line quantity. */
  add: (variantId: string, quantity: number, max?: number) => number;
  setQuantity: (variantId: string, quantity: number, max?: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    return {
      items,
      count,
      ready,
      quantityOf: (variantId) => items.find((i) => i.variantId === variantId)?.quantity ?? 0,
      add(variantId, quantity, max) {
        if (!isVariantId(variantId)) return 0;
        let result = 0;
        update((current) => {
          const existing = current.find((i) => i.variantId === variantId);
          if (!existing && current.length >= MAX_CART_LINES) {
            result = 0;
            return current;
          }
          result = clampQuantity((existing?.quantity ?? 0) + quantity, max);
          return existing
            ? current.map((i) => (i.variantId === variantId ? { ...i, quantity: result } : i))
            : [...current, { variantId, quantity: result }];
        });
        return result;
      },
      setQuantity(variantId, quantity, max) {
        update((current) =>
          current.map((i) =>
            i.variantId === variantId ? { ...i, quantity: clampQuantity(quantity, max) } : i,
          ),
        );
      },
      remove(variantId) {
        update((current) => current.filter((i) => i.variantId !== variantId));
      },
      clear() {
        commit(EMPTY);
      },
    };
  }, [items, ready]);

  return <CartContext value={value}>{children}</CartContext>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
