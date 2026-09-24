"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { quoteCart } from "@/lib/pricing";
import { type CartLineInfo, MAX_CART_LINES, MAX_LINE_QUANTITY } from "@/lib/cart";
import { localized } from "@/i18n/config";
import { dictionaryFor, getLocale } from "@/i18n/server";
import { getSignedInCustomer } from "../_lib/session";
import { hit, requestIp, throttled } from "../_lib/rate-limit";

const variantIdsSchema = z
  .array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/))
  .max(MAX_CART_LINES);

/**
 * Prices the cart from the database. The browser only stores variant ids and quantities;
 * names, prices and stock always come from here. Unknown or inactive variants are omitted,
 * which the cart treats as "no longer available". Never returns inventory payloads.
 */
export async function getCartLines(variantIds: unknown): Promise<CartLineInfo[]> {
  const parsed = variantIdsSchema.safeParse(variantIds);
  if (!parsed.success) return [];
  const ids = [...new Set(parsed.data)];
  if (ids.length === 0) return [];

  const locale = await getLocale();
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: ids }, product: { active: true } },
    select: {
      id: true,
      label: true,
      labelEn: true,
      priceCents: true,
      currency: true,
      product: { select: { name: true, nameEn: true, slug: true, type: true, imageUrl: true } },
      _count: { select: { inventoryItems: { where: { status: "AVAILABLE" } } } },
    },
  });

  return variants.map((v) => {
    const manualDelivery = v.product.type === "SERVICE";
    return {
      variantId: v.id,
      variantLabel: localized(locale, v.label, v.labelEn),
      unitPriceCents: v.priceCents,
      currency: v.currency,
      productName: localized(locale, v.product.name, v.product.nameEn),
      productSlug: v.product.slug,
      productType: v.product.type,
      imageUrl: v.product.imageUrl,
      maxQuantity: manualDelivery ? MAX_LINE_QUANTITY : Math.min(v._count.inventoryItems, MAX_LINE_QUANTITY),
      manualDelivery,
    };
  });
}

// ---------------------------------------------------------------------------
// Checkout quote: the totals shown in the cart summary (coupon, wallet, amount due).
// ---------------------------------------------------------------------------

export type CheckoutQuote =
  | {
      ok: true;
      subtotalCents: number;
      discountCents: number;
      walletAppliedCents: number;
      totalCents: number;
      amountDueCents: number;
      currency: string;
      coupon: { code: string; label: string } | null;
      couponError: string | null;
      walletBalanceCents: number | null;
    }
  | { ok: false; error: string };

const quoteSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
        quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
      }),
    )
    .min(1)
    .max(MAX_CART_LINES),
  couponCode: z.string().trim().max(40).optional(),
  useWallet: z.boolean().optional(),
});

// Wrong coupon codes are throttled per IP so the quote can't be used to guess codes.
const COUPON_FAILS_MAX = 12;
const COUPON_FAILS_WINDOW_MS = 15 * 60_000;

/**
 * Prices the cart exactly as checkout will. Identity (customer, email, wallet) always comes
 * from the session, never from the browser; guests can't use the wallet.
 */
export async function quoteCheckout(input: unknown): Promise<CheckoutQuote> {
  const locale = await getLocale();
  const t = dictionaryFor(locale);
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t.pricing.cartInvalid };
  const { items, useWallet } = parsed.data;
  const couponCode = parsed.data.couponCode?.toUpperCase() || undefined;

  const customer = await getSignedInCustomer();
  const ipKey = couponCode ? `coupon-fail:${await requestIp()}` : null;
  if (ipKey) {
    const wait = throttled(ipKey, COUPON_FAILS_MAX);
    if (wait) {
      const quote = await priceCart(items, undefined, useWallet, customer, locale);
      return quote.ok ? { ...quote, couponError: t.pricing.couponThrottled(t.common.minutes(wait)) } : quote;
    }
  }

  const quote = await priceCart(items, couponCode, useWallet, customer, locale);
  if (ipKey && quote.ok && quote.couponError) hit(ipKey, COUPON_FAILS_WINDOW_MS);
  return quote;
}

async function priceCart(
  items: { variantId: string; quantity: number }[],
  couponCode: string | undefined,
  useWallet: boolean | undefined,
  customer: Awaited<ReturnType<typeof getSignedInCustomer>>,
  locale: Awaited<ReturnType<typeof getLocale>>,
): Promise<CheckoutQuote> {
  const result = await quoteCart({
    locale,
    items,
    couponCode,
    useWallet: !!customer && !!useWallet,
    customerId: customer?.id ?? null,
    email: customer?.email ?? null,
  });
  if (!result.ok) return { ok: false, error: result.error };
  // Only the summary fields travel to the browser.
  return {
    ok: true,
    subtotalCents: result.subtotalCents,
    discountCents: result.discountCents,
    walletAppliedCents: result.walletAppliedCents,
    totalCents: result.totalCents,
    amountDueCents: result.amountDueCents,
    currency: result.currency,
    coupon: result.coupon ? { code: result.coupon.code, label: result.coupon.label } : null,
    couponError: result.couponError,
    walletBalanceCents: customer ? result.walletBalanceCents : null,
  };
}
