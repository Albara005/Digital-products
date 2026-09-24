import "server-only";
import type { CouponType, Prisma, ProductType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";
import { MAX_CART_LINES, MAX_LINE_QUANTITY } from "@/lib/cart";
import { WALLET_CURRENCY, getWalletBalance } from "@/lib/wallet";

/*
 * Cart pricing: DB prices, coupon discount and wallet credit.
 *
 *   subtotal - discount = total (order value);  total - walletApplied = amountDue (charged by the gateway)
 *
 * quoteCart() is the read-only preview (cart page, checkout pre-check). Checkout re-validates the
 * coupon with claimCoupon() and the wallet balance under row locks inside its transaction, so the
 * numbers a buyer pays are always the ones computed at that moment.
 */

type Db = Prisma.TransactionClient;

export type QuoteInput = {
  items: { variantId: string; quantity: number }[];
  couponCode?: string;
  useWallet?: boolean;
  customerId?: string | null;
  email?: string | null;
};

export type QuoteLine = {
  variantId: string;
  productId: string;
  categoryId: string;
  productName: string;
  productSlug: string;
  variantLabel: string;
  productType: ProductType;
  imageUrl: string | null;
  quantity: number;
  unitPriceCents: number;
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
      coupon: { code: string; label: string } | null;
      couponError: string | null;
      /** Signed-in customers only; null for guests */
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

/** A coupon that cannot be used; `message` is the Arabic text for the buyer. */
export class CouponError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CouponError";
  }
}

const COUPON_CODE = /^[A-Z0-9_-]{3,32}$/;
const INVALID_COUPON = "كود الخصم غير صالح";

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
): CouponEvaluation {
  if (!coupon.active) return { ok: false, error: INVALID_COUPON };
  if (coupon.startsAt && coupon.startsAt > now) return { ok: false, error: "كود الخصم لم يبدأ العمل به بعد" };
  if (coupon.endsAt && coupon.endsAt <= now) return { ok: false, error: "انتهت صلاحية كود الخصم" };
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, error: "انتهى عدد مرات استخدام كود الخصم" };
  }

  const eligible = lines.map((line) => isEligible(coupon, line));
  const eligibleSubtotal = lines.reduce((sum, line, i) => (eligible[i] ? sum + line.lineTotalCents : sum), 0);
  if (eligibleSubtotal <= 0) return { ok: false, error: "كود الخصم لا ينطبق على المنتجات الموجودة في سلتك" };
  if (coupon.minSubtotalCents != null && eligibleSubtotal < coupon.minSubtotalCents) {
    const scoped = coupon.categoryId || coupon.productId ? " من المنتجات المشمولة بالعرض" : "";
    return {
      ok: false,
      error: `يتطلب كود الخصم مشتريات بقيمة ${formatPrice(coupon.minSubtotalCents, currency)} على الأقل${scoped}`,
    };
  }

  let discount: number;
  if (coupon.type === "PERCENT") {
    const percent = Math.min(Math.max(coupon.value, 0), 100);
    discount = Math.round((eligibleSubtotal * percent) / 100);
    if (coupon.maxDiscountCents != null) discount = Math.min(discount, coupon.maxDiscountCents);
  } else {
    discount = Math.max(coupon.value, 0);
  }
  discount = Math.min(discount, eligibleSubtotal);
  if (discount <= 0) return { ok: false, error: "كود الخصم لا ينطبق على المنتجات الموجودة في سلتك" };

  const lineDiscounts = allocate(
    discount,
    lines.map((line, i) => (eligible[i] ? line.lineTotalCents : 0)),
  );
  return { ok: true, discountCents: discount, lineDiscounts };
}

/** Short Arabic description, e.g. "خصم 10% (بحد أقصى $5.00)" or "خصم $5.00 على «بطاقات ألعاب»". */
export function couponLabel(
  coupon: Pick<CouponRules, "type" | "value" | "maxDiscountCents">,
  currency: string,
  scopeName?: string | null,
): string {
  const base =
    coupon.type === "PERCENT"
      ? `خصم ${coupon.value}%${coupon.maxDiscountCents != null ? ` (بحد أقصى ${formatPrice(coupon.maxDiscountCents, currency)})` : ""}`
      : `خصم ${formatPrice(coupon.value, currency)}`;
  return scopeName ? `${base} على «${scopeName}»` : base;
}

/** Redemptions of this coupon by this email on orders that did not fail (pending, paid, delivered, refunded). */
export function countCustomerRedemptions(db: Db, couponId: string, email: string): Promise<number> {
  return db.couponRedemption.count({
    where: { couponId, customerEmail: email.trim().toLowerCase(), order: { status: { not: "FAILED" } } },
  });
}

const PER_CUSTOMER_ERROR = "لقد استخدمت كود الخصم هذا الحد الأقصى من المرات المسموح بها";

type PricedCart = { ok: true; lines: QuoteLine[]; currency: string; subtotalCents: number } | { ok: false; error: string };

const VARIANT_ID = /^[A-Za-z0-9_-]{1,64}$/;

async function priceCart(items: QuoteInput["items"]): Promise<PricedCart> {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: "السلة فارغة" };
  if (items.length > MAX_CART_LINES) {
    return { ok: false, error: `لا يمكن أن تحتوي السلة على أكثر من ${MAX_CART_LINES} منتجاً` };
  }

  // Merge duplicate lines for the same variant
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!item || typeof item.variantId !== "string" || !VARIANT_ID.test(item.variantId)) {
      return { ok: false, error: "منتج غير صالح في السلة" };
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) return { ok: false, error: "الكمية غير صالحة" };
    quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);
  }

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: [...quantities.keys()] } },
    select: {
      id: true,
      label: true,
      priceCents: true,
      currency: true,
      product: {
        select: { id: true, name: true, slug: true, type: true, active: true, imageUrl: true, categoryId: true },
      },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  const lines: QuoteLine[] = [];
  for (const [variantId, quantity] of quantities) {
    const variant = byId.get(variantId);
    if (!variant) return { ok: false, error: "أحد المنتجات في السلة لم يعد متوفراً، يرجى تحديث السلة" };
    const { product } = variant;
    if (!product.active) return { ok: false, error: `المنتج "${product.name}" غير متاح حالياً، يرجى إزالته من السلة` };
    if (quantity > MAX_LINE_QUANTITY) {
      return { ok: false, error: `أقصى كمية من "${product.name} - ${variant.label}" هي ${MAX_LINE_QUANTITY}` };
    }
    lines.push({
      variantId,
      productId: product.id,
      categoryId: product.categoryId,
      productName: product.name,
      productSlug: product.slug,
      variantLabel: variant.label,
      productType: product.type,
      imageUrl: product.imageUrl,
      quantity,
      unitPriceCents: variant.priceCents,
      lineTotalCents: variant.priceCents * quantity,
      discountCents: 0,
    });
  }

  const currencies = new Set(variants.map((v) => v.currency.toUpperCase()));
  if (currencies.size !== 1) return { ok: false, error: "لا يمكن الدفع لمنتجات بعملات مختلفة في طلب واحد" };
  const currency = [...currencies][0];
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
  category: { select: { name: true } },
  product: { select: { name: true } },
} satisfies Prisma.CouponSelect;

/** Stripe rejects charges under $0.50; Tap has similar floors. */
export const MIN_GATEWAY_CHARGE_CENTS = 50;

/**
 * How much of the wallet to spend: as much as possible, but never leave a gateway balance
 * below MIN_GATEWAY_CHARGE_CENTS (it would be rejected); the wallet covers everything or
 * leaves at least the minimum to pay by card.
 */
export function walletShare(balanceCents: number, totalCents: number): number {
  const applied = Math.max(0, Math.min(balanceCents, totalCents));
  const due = totalCents - applied;
  if (due > 0 && due < MIN_GATEWAY_CHARGE_CENTS) return Math.max(0, totalCents - MIN_GATEWAY_CHARGE_CENTS);
  return applied;
}

/**
 * Prices a cart for display. Never throws for business reasons: cart problems return
 * { ok: false, error }, and an unusable coupon returns couponError with no discount.
 * The wallet applies only for a signed-in customer (customerId) with useWallet, up to the total.
 */
export async function quoteCart(input: QuoteInput): Promise<Quote> {
  const priced = await priceCart(input.items);
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
      couponError = INVALID_COUPON;
    } else {
      const result = evaluateCoupon(row, lines, currency);
      if (!result.ok) {
        couponError = result.error;
      } else if (
        row.perCustomerLimit != null &&
        input.email &&
        (await countCustomerRedemptions(prisma, row.id, input.email)) >= row.perCustomerLimit
      ) {
        couponError = PER_CUSTOMER_ERROR;
      } else {
        discountCents = result.discountCents;
        result.lineDiscounts.forEach((share, i) => (lines[i].discountCents = share));
        coupon = { code: row.code, label: couponLabel(row, currency, row.product?.name ?? row.category?.name) };
      }
    }
  }

  const totalCents = subtotalCents - discountCents;
  let walletBalanceCents: number | null = null;
  let walletAppliedCents = 0;
  if (input.customerId) {
    walletBalanceCents = await getWalletBalance(input.customerId);
    if (input.useWallet && currency === WALLET_CURRENCY) {
      walletAppliedCents = walletShare(walletBalanceCents, totalCents);
    }
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
  input: { code: string; lines: DiscountableLine[]; currency: string; email: string },
): Promise<{ couponId: string; code: string; discountCents: number }> {
  const code = normalizeCouponCode(input.code);
  if (!code) throw new CouponError(INVALID_COUPON);

  // Row lock: concurrent redemptions of this coupon run one at a time from here to commit
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Coupon" WHERE code = ${code} FOR UPDATE`;
  if (!locked[0]) throw new CouponError(INVALID_COUPON);
  const coupon = await tx.coupon.findUniqueOrThrow({ where: { id: locked[0].id }, select: couponSelect });

  const result = evaluateCoupon(coupon, input.lines, input.currency);
  if (!result.ok) throw new CouponError(result.error);

  // Committed redemptions of earlier lock holders are visible now (READ COMMITTED, new statement)
  if (
    coupon.perCustomerLimit != null &&
    (await countCustomerRedemptions(tx, coupon.id, input.email)) >= coupon.perCustomerLimit
  ) {
    throw new CouponError(PER_CUSTOMER_ERROR);
  }

  const counted = await tx.$executeRaw`
    UPDATE "Coupon" SET "usedCount" = "usedCount" + 1
    WHERE id = ${coupon.id} AND ("maxUses" IS NULL OR "usedCount" < "maxUses")`;
  if (counted !== 1) throw new CouponError("انتهى عدد مرات استخدام كود الخصم");

  return { couponId: coupon.id, code: coupon.code, discountCents: result.discountCents };
}
