import "server-only";
import type { CouponType, Prisma, ProductType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";
import { MAX_CART_LINES, MAX_LINE_QUANTITY } from "@/lib/cart";
import { getWalletBalance } from "@/lib/wallet";
import {
  BASE_CURRENCY,
  MIN_GATEWAY_CHARGE_USD_CENTS,
  chargeStep,
  convertUsdCents,
  minGatewayCharge,
  toUsdCents,
} from "@/lib/display-currency";
import { type Fx, USD_FX } from "@/lib/fx";
import { DEFAULT_LOCALE, type Locale, localized } from "@/i18n/config";
import { type Dictionary, dictionaryFor } from "@/i18n/server";

/*
 * Cart pricing: DB prices, coupon discount and wallet credit.
 *
 *   subtotal - discount = total (order value);  total - walletApplied = amountDue (charged by the gateway)
 *
 * quoteCart() is the read-only preview (cart page, checkout pre-check). Checkout re-validates the
 * coupon with claimCoupon() and the wallet balance under row locks inside its transaction, so the
 * numbers a buyer pays are always the ones computed at that moment.
 *
 * Currency: catalog prices, coupon amounts and the wallet are USD cents. A quote is made in the
 * shopper's currency (`fx`): every unit price is converted once with convertUsdCents() (the same
 * helper the storefront displays with), and every amount of the quote -- lines, subtotal, discount,
 * wallet part, total, amount due -- is in minor units of that currency. USD quotes are unchanged.
 */

type Db = Prisma.TransactionClient;

export type QuoteInput = {
  items: { variantId: string; quantity: number }[];
  couponCode?: string;
  useWallet?: boolean;
  customerId?: string | null;
  email?: string | null;
  /** Language of the shopper-facing messages and display names (default Arabic). */
  locale?: Locale;
  /** Currency to price and charge in, with its rate (resolved server-side; default USD). */
  fx?: Fx;
};

export type QuoteLine = {
  variantId: string;
  productId: string;
  categoryId: string;
  /** Arabic (canonical) names: what the order snapshot stores. */
  productName: string;
  productSlug: string;
  variantLabel: string;
  /** Names in the shopper's language, for messages and the hosted payment page. */
  displayName: string;
  displayLabel: string;
  productType: ProductType;
  imageUrl: string | null;
  quantity: number;
  /** Minor units of the quote currency (converted from the USD catalog price). */
  unitPriceCents: number;
  unitPriceUsdCents: number;
  lineTotalCents: number;
  /** This line's share of the coupon discount (0 when the coupon does not cover it) */
  discountCents: number;
};

export type Quote =
  | {
      ok: true;
      lines: QuoteLine[];
      subtotalCents: number;
      discountCents: number;
      walletAppliedCents: number;
      totalCents: number;
      amountDueCents: number;
      currency: string;
      /** Units of `currency` per USD used for this quote (1 for USD). */
      fxRate: number;
      coupon: { code: string; label: string } | null;
      couponError: string | null;
      /** Signed-in customers only, converted to the quote currency; null for guests */
      walletBalanceCents: number | null;
    }
  | { ok: false; error: string };

export type CouponRules = {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  minSubtotalCents: number | null;
  maxDiscountCents: number | null;
  maxUses: number | null;
  usedCount: number;
  perCustomerLimit: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  categoryId: string | null;
  productId: string | null;
};

type DiscountableLine = { productId: string; categoryId: string; lineTotalCents: number };

export type CouponEvaluation = { ok: true; discountCents: number; lineDiscounts: number[] } | { ok: false; error: string };

/** A coupon that cannot be used; `message` is the text for the buyer, in their language. */
export class CouponError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CouponError";
  }
}

const COUPON_CODE = /^[A-Z0-9_-]{3,32}$/;

/** Coupons are stored uppercase; lookups are case-insensitive. Null when the text cannot be a code. */
export function normalizeCouponCode(raw: string | null | undefined): string | null {
  const code = (raw ?? "").trim().toUpperCase();
  return COUPON_CODE.test(code) ? code : null;
}

function isEligible(coupon: Pick<CouponRules, "categoryId" | "productId">, line: DiscountableLine): boolean {
  if (coupon.productId && line.productId !== coupon.productId) return false;
  if (coupon.categoryId && line.categoryId !== coupon.categoryId) return false;
  return true;
}

/** Splits `total` across lines in proportion to their amounts (largest remainder, sums exactly). */
function allocate(total: number, amounts: number[]): number[] {
  const sum = amounts.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return amounts.map(() => 0);
  const exact = amounts.map((a) => (total * a) / sum);
  const shares = exact.map(Math.floor);
  let left = total - shares.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    shares[i] += 1;
    left -= 1;
  }
  return shares;
}

/**
 * Pure coupon check (everything except the per-customer limit, which needs the database).
 * Scoped coupons (category/product) discount only matching lines, and their minimum subtotal is
 * measured on those lines. PERCENT is capped by maxDiscountCents; neither type exceeds the
 * eligible subtotal.
 */
export function evaluateCoupon(
  coupon: CouponRules,
  lines: DiscountableLine[],
  currency: string,
  now: Date = new Date(),
  t: Dictionary = dictionaryFor(DEFAULT_LOCALE),
  locale: Locale = DEFAULT_LOCALE,
): CouponEvaluation {
  if (!coupon.active) return { ok: false, error: t.pricing.invalidCoupon };
  if (coupon.startsAt && coupon.startsAt > now) return { ok: false, error: t.pricing.couponNotStarted };
  if (coupon.endsAt && coupon.endsAt <= now) return { ok: false, error: t.pricing.couponExpired };
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, error: t.pricing.couponUsedUp };
  }

  const eligible = lines.map((line) => isEligible(coupon, line));
  const eligibleSubtotal = lines.reduce((sum, line, i) => (eligible[i] ? sum + line.lineTotalCents : sum), 0);
  if (eligibleSubtotal <= 0) return { ok: false, error: t.pricing.couponNotApplicable };
  if (coupon.minSubtotalCents != null && eligibleSubtotal < coupon.minSubtotalCents) {
    return {
      ok: false,
      error: t.pricing.couponMin(formatPrice(coupon.minSubtotalCents, currency, locale), !!(coupon.categoryId || coupon.productId)),
    };
  }

  let discount: number;
  if (coupon.type === "PERCENT") {
    const percent = Math.min(Math.max(coupon.value, 0), 100);
    // Rounded to the currency's charge step (0.010 for KWD/OMR/BHD) so every charge stays payable
    const step = chargeStep(currency);
    discount = Math.round((eligibleSubtotal * percent) / 100 / step) * step;
    if (coupon.maxDiscountCents != null) discount = Math.min(discount, coupon.maxDiscountCents);
  } else {
    discount = Math.max(coupon.value, 0);
  }
  discount = Math.min(discount, eligibleSubtotal);
  if (discount <= 0) return { ok: false, error: t.pricing.couponNotApplicable };

  const lineDiscounts = allocate(
    discount,
    lines.map((line, i) => (eligible[i] ? line.lineTotalCents : 0)),
  );
  return { ok: true, discountCents: discount, lineDiscounts };
}

/**
 * A coupon's USD money rules (FIXED value, minimum subtotal, PERCENT cap) converted to `fx`'s
 * currency with the storefront conversion; PERCENT values are unchanged. USD returns the coupon as is.
 */
export function couponInCurrency<C extends Pick<CouponRules, "type" | "value" | "minSubtotalCents" | "maxDiscountCents">>(
  coupon: C,
  fx: Fx,
): C {
  if (fx.currency === BASE_CURRENCY) return coupon;
  const convert = (cents: number) => convertUsdCents(Math.max(0, cents), fx.currency, fx.rate);
  return {
    ...coupon,
    value: coupon.type === "FIXED" ? convert(coupon.value) : coupon.value,
    minSubtotalCents: coupon.minSubtotalCents == null ? null : convert(coupon.minSubtotalCents),
    maxDiscountCents: coupon.maxDiscountCents == null ? null : convert(coupon.maxDiscountCents),
  };
}

/**
 * Short description, e.g. "خصم 10% (بحد أقصى $5.00)" or "خصم $5.00 على «بطاقات ألعاب»" ("10% off (up to $5.00)").
 * Money values must already be in `currency` (see couponInCurrency).
 */
export function couponLabel(
  coupon: Pick<CouponRules, "type" | "value" | "maxDiscountCents">,
  currency: string,
  scopeName?: string | null,
  t: Dictionary = dictionaryFor(DEFAULT_LOCALE),
  locale: Locale = DEFAULT_LOCALE,
): string {
  const base =
    coupon.type === "PERCENT"
      ? t.pricing.couponLabelPercent(
          coupon.value,
          coupon.maxDiscountCents != null ? formatPrice(coupon.maxDiscountCents, currency, locale) : null,
        )
      : t.pricing.couponLabelFixed(formatPrice(coupon.value, currency, locale));
  return scopeName ? t.pricing.couponScope(base, scopeName) : base;
}

/** Redemptions of this coupon by this email on orders that did not fail (pending, paid, delivered, refunded). */
export function countCustomerRedemptions(db: Db, couponId: string, email: string): Promise<number> {
  return db.couponRedemption.count({
    where: { couponId, customerEmail: email.trim().toLowerCase(), order: { status: { not: "FAILED" } } },
  });
}

type PricedCart = { ok: true; lines: QuoteLine[]; currency: string; subtotalCents: number } | { ok: false; error: string };

/** The USD catalog price of one unit in `fx`'s currency (the storefront shows exactly this). */
export function unitPriceIn(usdCents: number, fx: Fx): number {
  return convertUsdCents(usdCents, fx.currency, fx.rate);
}

const VARIANT_ID = /^[A-Za-z0-9_-]{1,64}$/;

async function priceCart(items: QuoteInput["items"], locale: Locale, fx: Fx): Promise<PricedCart> {
  const t = dictionaryFor(locale);
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: t.pricing.cartEmpty };
  if (items.length > MAX_CART_LINES) {
    return { ok: false, error: t.pricing.cartTooBig(MAX_CART_LINES) };
  }

  // Merge duplicate lines for the same variant
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!item || typeof item.variantId !== "string" || !VARIANT_ID.test(item.variantId)) {
      return { ok: false, error: t.pricing.badItem };
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) return { ok: false, error: t.pricing.badQuantity };
    quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);
  }

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: [...quantities.keys()] } },
    select: {
      id: true,
      label: true,
      labelEn: true,
      priceCents: true,
      currency: true,
      product: {
        select: { id: true, name: true, nameEn: true, slug: true, type: true, active: true, imageUrl: true, categoryId: true },
      },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  const lines: QuoteLine[] = [];
  for (const [variantId, quantity] of quantities) {
    const variant = byId.get(variantId);
    if (!variant) return { ok: false, error: t.pricing.itemGone };
    const { product } = variant;
    const displayName = localized(locale, product.name, product.nameEn);
    const displayLabel = localized(locale, variant.label, variant.labelEn);
    if (!product.active) return { ok: false, error: t.pricing.itemInactive(displayName) };
    if (quantity > MAX_LINE_QUANTITY) {
      return { ok: false, error: t.pricing.maxQuantity(`${displayName} - ${displayLabel}`, MAX_LINE_QUANTITY) };
    }
    // The catalog is priced in USD; convert each unit price once (never a converted total)
    if (variant.currency.toUpperCase() !== BASE_CURRENCY) return { ok: false, error: t.pricing.mixedCurrency };
    const unitPriceCents = unitPriceIn(variant.priceCents, fx);
    lines.push({
      variantId,
      productId: product.id,
      categoryId: product.categoryId,
      productName: product.name,
      productSlug: product.slug,
      variantLabel: variant.label,
      displayName,
      displayLabel,
      productType: product.type,
      imageUrl: product.imageUrl,
      quantity,
      unitPriceCents,
      unitPriceUsdCents: variant.priceCents,
      lineTotalCents: unitPriceCents * quantity,
      discountCents: 0,
    });
  }

  const currency = fx.currency;
  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  return { ok: true, lines, currency, subtotalCents };
}

const couponSelect = {
  id: true,
  code: true,
  type: true,
  value: true,
  minSubtotalCents: true,
  maxDiscountCents: true,
  maxUses: true,
  usedCount: true,
  perCustomerLimit: true,
  startsAt: true,
  endsAt: true,
  active: true,
  categoryId: true,
  productId: true,
  category: { select: { name: true, nameEn: true } },
  product: { select: { name: true, nameEn: true } },
} satisfies Prisma.CouponSelect;

/** Stripe rejects charges under $0.50; Tap has similar floors. Per currency: minGatewayCharge(). */
export const MIN_GATEWAY_CHARGE_CENTS = MIN_GATEWAY_CHARGE_USD_CENTS;

/**
 * How much of the wallet to spend (all amounts in the order currency): as much as possible, but
 * never leave a gateway balance below `minChargeCents` (it would be rejected); the wallet covers
 * everything or leaves at least the minimum to pay by card.
 */
export function walletShare(balanceCents: number, totalCents: number, minChargeCents = MIN_GATEWAY_CHARGE_CENTS): number {
  const applied = Math.max(0, Math.min(balanceCents, totalCents));
  const due = totalCents - applied;
  if (due > 0 && due < minChargeCents) return Math.max(0, totalCents - minChargeCents);
  return applied;
}

/**
 * The wallet part of an order in `fx`'s currency, from a USD wallet balance, and the USD cents to
 * debit for it. The balance is shown converted (convertUsdCents), so the same conversion bounds
 * what can be applied; the debit converts back rounding DOWN (the customer is never charged more
 * than shown) and never exceeds the balance. A part worth less than one USD cent is not applied.
 */
export function walletPart(balanceUsdCents: number, totalCents: number, fx: Fx): { appliedCents: number; debitUsdCents: number } {
  if (fx.currency === BASE_CURRENCY) {
    const applied = walletShare(balanceUsdCents, totalCents);
    return { appliedCents: applied, debitUsdCents: applied };
  }
  const balance = convertUsdCents(Math.max(0, balanceUsdCents), fx.currency, fx.rate);
  const applied = walletShare(balance, totalCents, minGatewayCharge(fx.currency, fx.rate));
  const debit = Math.min(balanceUsdCents, toUsdFloor(applied, fx));
  return debit > 0 ? { appliedCents: applied, debitUsdCents: debit } : { appliedCents: 0, debitUsdCents: 0 };
}

function toUsdFloor(minor: number, fx: Fx): number {
  return toUsdCents(minor, fx.currency, fx.rate, "floor");
}

/**
 * Prices a cart for display. Never throws for business reasons: cart problems return
 * { ok: false, error }, and an unusable coupon returns couponError with no discount.
 * The wallet applies only for a signed-in customer (customerId) with useWallet, up to the total.
 */
export async function quoteCart(input: QuoteInput): Promise<Quote> {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const t = dictionaryFor(locale);
  const fx = input.fx ?? USD_FX;
  const priced = await priceCart(input.items, locale, fx);
  if (!priced.ok) return priced;
  const { lines, currency, subtotalCents } = priced;

  let discountCents = 0;
  let coupon: { code: string; label: string } | null = null;
  let couponError: string | null = null;

  const rawCode = input.couponCode?.trim();
  if (rawCode) {
    const code = normalizeCouponCode(rawCode);
    const row = code ? await prisma.coupon.findUnique({ where: { code }, select: couponSelect }) : null;
    if (!row) {
      couponError = t.pricing.invalidCoupon;
    } else {
      const rules = couponInCurrency(row, fx);
      const result = evaluateCoupon(rules, lines, currency, new Date(), t, locale);
      if (!result.ok) {
        couponError = result.error;
      } else if (
        row.perCustomerLimit != null &&
        input.email &&
        (await countCustomerRedemptions(prisma, row.id, input.email)) >= row.perCustomerLimit
      ) {
        couponError = t.pricing.couponPerCustomer;
      } else {
        discountCents = result.discountCents;
        result.lineDiscounts.forEach((share, i) => (lines[i].discountCents = share));
        const scope = row.product
          ? localized(locale, row.product.name, row.product.nameEn)
          : row.category
            ? localized(locale, row.category.name, row.category.nameEn)
            : null;
        coupon = { code: row.code, label: couponLabel(rules, currency, scope, t, locale) };
      }
    }
  }

  const totalCents = subtotalCents - discountCents;
  let walletBalanceCents: number | null = null;
  let walletAppliedCents = 0;
  if (input.customerId) {
    const balanceUsd = await getWalletBalance(input.customerId);
    walletBalanceCents = convertUsdCents(balanceUsd, fx.currency, fx.rate);
    if (input.useWallet) walletAppliedCents = walletPart(balanceUsd, totalCents, fx).appliedCents;
  }

  return {
    ok: true,
    lines,
    subtotalCents,
    discountCents,
    walletAppliedCents,
    totalCents,
    amountDueCents: totalCents - walletAppliedCents,
    currency,
    fxRate: fx.rate,
    coupon,
    couponError,
    walletBalanceCents,
  };
}

/**
 * Checkout-side coupon redemption, inside the order transaction: locks the coupon row, re-checks
 * every rule on the locked row (so maxUses and perCustomerLimit hold under concurrency), counts
 * the use (conditional increment) and returns the discount. Throws CouponError to roll back.
 * The caller writes the CouponRedemption row with the order.
 */
export async function claimCoupon(
  tx: Db,
  input: { code: string; lines: DiscountableLine[]; fx: Fx; email: string; locale?: Locale },
): Promise<{ couponId: string; code: string; discountCents: number }> {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const t = dictionaryFor(locale);
  const code = normalizeCouponCode(input.code);
  if (!code) throw new CouponError(t.pricing.invalidCoupon);

  // Row lock: concurrent redemptions of this coupon run one at a time from here to commit
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Coupon" WHERE code = ${code} FOR UPDATE`;
  if (!locked[0]) throw new CouponError(t.pricing.invalidCoupon);
  const coupon = await tx.coupon.findUniqueOrThrow({ where: { id: locked[0].id }, select: couponSelect });

  const result = evaluateCoupon(couponInCurrency(coupon, input.fx), input.lines, input.fx.currency, new Date(), t, locale);
  if (!result.ok) throw new CouponError(result.error);

  // Committed redemptions of earlier lock holders are visible now (READ COMMITTED, new statement)
  if (
    coupon.perCustomerLimit != null &&
    (await countCustomerRedemptions(tx, coupon.id, input.email)) >= coupon.perCustomerLimit
  ) {
    throw new CouponError(t.pricing.couponPerCustomer);
  }

  const counted = await tx.$executeRaw`
    UPDATE "Coupon" SET "usedCount" = "usedCount" + 1
    WHERE id = ${coupon.id} AND ("maxUses" IS NULL OR "usedCount" < "maxUses")`;
  if (counted !== 1) throw new CouponError(t.pricing.couponUsedUp);

  return { couponId: coupon.id, code: coupon.code, discountCents: result.discountCents };
}
