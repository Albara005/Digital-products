// Cart primitives shared by the client cart store and the server action that prices it.
// Safe to import from both environments: no server-only or browser-only APIs here.
import type { ProductType } from "@prisma/client";

export const CART_STORAGE_KEY = "nitro_cart";
// Both limits mirror what POST /api/checkout accepts.
/** Upper bound per line, even for items with unlimited stock (services). */
export const MAX_LINE_QUANTITY = 10;
/** Distinct variants a cart may hold. */
export const MAX_CART_LINES = 20;

export type CartItem = { variantId: string; quantity: number };

/** Fresh, server-computed view of one cart line. Prices here are the only ones to trust. */
export type CartLineInfo = {
  variantId: string;
  variantLabel: string;
  unitPriceCents: number;
  currency: string;
  productName: string;
  productSlug: string;
  productType: ProductType;
  imageUrl: string | null;
  /** Units the customer may buy right now (0 = out of stock). */
  maxQuantity: number;
  /** Services have no stock and are delivered manually. */
  manualDelivery: boolean;
};

const VARIANT_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isVariantId(value: unknown): value is string {
  return typeof value === "string" && VARIANT_ID.test(value);
}

export function clampQuantity(quantity: number, max = MAX_LINE_QUANTITY): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(Math.max(Math.trunc(quantity), 1), Math.max(max, 1));
}

/** Normalises untrusted cart data: drops bad rows, merges duplicates, clamps quantities. */
export function sanitizeCart(input: unknown): CartItem[] {
  if (!Array.isArray(input)) return [];
  const merged = new Map<string, number>();
  for (const row of input) {
    if (!row || typeof row !== "object") continue;
    const { variantId, quantity } = row as Record<string, unknown>;
    if (!isVariantId(variantId) || typeof quantity !== "number" || quantity < 1) continue;
    if (!merged.has(variantId) && merged.size >= MAX_CART_LINES) continue;
    merged.set(variantId, clampQuantity((merged.get(variantId) ?? 0) + quantity));
  }
  return Array.from(merged, ([variantId, quantity]) => ({ variantId, quantity }));
}

export function parseStoredCart(raw: string | null): CartItem[] {
  if (!raw) return [];
  try {
    return sanitizeCart(JSON.parse(raw));
  } catch {
    return [];
  }
}
