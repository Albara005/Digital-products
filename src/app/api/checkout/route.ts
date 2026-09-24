import { cookies } from "next/headers";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { randomToken } from "@/lib/crypto";
import { getCustomerSession, normalizeEmail, type CustomerSession } from "@/lib/customer-auth";
import {
  OutOfStockError,
  failPendingOrder,
  fulfillOrder,
  markOrderPaid,
  releaseStaleReservations,
  reserveStock,
} from "@/lib/fulfillment";
import { orderPagePath, siteUrl } from "@/lib/email";
import { CouponError, claimCoupon, normalizeCouponCode, quoteCart, walletShare, type QuoteLine } from "@/lib/pricing";
import { REFERRAL_COOKIE, attachReferrer } from "@/lib/referrals";
import { WALLET_CURRENCY, debitWallet, lockWallet } from "@/lib/wallet";
import { getCheckoutOptions, getProvider, resolveProvider, type ProviderId } from "@/lib/payments";
import { clientIp, jsonError, rateLimit } from "../_lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LINES = 20;
const MAX_QUANTITY = 10;
const RATE_LIMIT = 10; // requests
const RATE_WINDOW_MS = 60_000; // per minute, per IP
const RESERVE_ATTEMPTS = 5;

const emailSchema = z
  .string({ error: "البريد الإلكتروني مطلوب" })
  .trim()
  .toLowerCase()
  .min(1, { error: "البريد الإلكتروني مطلوب" })
  .max(254, { error: "البريد الإلكتروني طويل جداً" })
  .pipe(z.email({ error: "البريد الإلكتروني غير صالح" }));

const bodySchema = z.object(
  {
    // Validated below: ignored for signed-in customers, required for guests
    email: z.unknown().optional(),
    items: z
      .array(
        z.object({
          variantId: z.string({ error: "منتج غير صالح في السلة" }).trim().min(1, { error: "منتج غير صالح في السلة" }).max(64),
          quantity: z
            .number({ error: "الكمية غير صالحة" })
            .int({ error: "الكمية يجب أن تكون رقماً صحيحاً" })
            .min(1, { error: "أقل كمية هي 1" })
            .max(MAX_QUANTITY, { error: `أقصى كمية للمنتج الواحد هي ${MAX_QUANTITY}` }),
        }),
        { error: "السلة غير صالحة" },
      )
      .min(1, { error: "السلة فارغة" })
      .max(MAX_LINES, { error: `لا يمكن أن تحتوي السلة على أكثر من ${MAX_LINES} منتجاً` }),
    couponCode: z.string({ error: "كود الخصم غير صالح" }).trim().max(64, { error: "كود الخصم غير صالح" }).nullish(),
    useWallet: z.boolean({ error: "بيانات الطلب غير صالحة" }).optional(),
    provider: z.enum(["STRIPE", "TAP"], { error: "طريقة الدفع غير صالحة" }).optional(),
  },
  { error: "بيانات الطلب غير صالحة" },
);

function outOfStockMessage(productName: string, variantLabel: string, available: number) {
  return available <= 0
    ? `المنتج "${productName} - ${variantLabel}" نفد من المخزون`
    : `الكمية المطلوبة من "${productName} - ${variantLabel}" غير متوفرة، المتوفر حالياً: ${available}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The signed-in customer, or null (guest). Also null outside a request scope (in-process scripts). */
async function currentCustomer(): Promise<CustomerSession | null> {
  try {
    return await getCustomerSession();
  } catch (err) {
    console.warn("[checkout] Could not read the customer session; continuing as guest", err instanceof Error ? err.message : err);
    return null;
  }
}

/** The `?ref=` code captured by src/proxy.ts, if any (validated again by attachReferrer). */
async function referralCookie(): Promise<string | null> {
  try {
    return (await cookies()).get(REFERRAL_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

/** A checkout the buyer must fix (HTTP status + Arabic message); thrown inside the transaction to roll it back. */
class CheckoutRejection extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type ReservedOrder = {
  id: string;
  accessToken: string;
  totalCents: number;
  walletAppliedCents: number;
  amountDueCents: number;
};

type OrderRequest = {
  email: string;
  sessionCustomerId: string | null;
  lines: QuoteLine[];
  currency: string;
  subtotalCents: number;
  couponCode: string | null;
  useWallet: boolean;
  referralCode: string | null;
};

/**
 * One transaction: customer, coupon use, wallet debit, the PENDING order and its items, and every
 * reserved stock unit. Either all of it is written or nothing is. Coupon and wallet are
 * re-validated here under row locks (lock order: customer, then coupon), so the amounts may
 * differ from the preview quote if something changed in between.
 * Retries briefly when stock exists but is locked by concurrent checkouts.
 */
async function createReservedOrder(req: OrderRequest): Promise<ReservedOrder | OutOfStockError> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          let customerId: string;
          if (req.sessionCustomerId) {
            const customer = await tx.customer.findUnique({ where: { id: req.sessionCustomerId }, select: { id: true } });
            if (!customer) throw new CheckoutRejection("انتهت جلستك، يرجى تسجيل الدخول من جديد", 401);
            customerId = customer.id;
          } else {
            const customer = await tx.customer.upsert({ where: { email: req.email }, create: { email: req.email }, update: {}, select: { id: true } });
            customerId = customer.id;
          }
          const walletBalance = req.useWallet && req.currency === WALLET_CURRENCY ? await lockWallet(tx, customerId) : 0;
          // Referral link: only a buyer who never paid, isn't referred yet and isn't the referrer
          if (req.referralCode) await attachReferrer(tx, { customerId, email: req.email }, req.referralCode);

          let coupon: { couponId: string; discountCents: number } | null = null;
          if (req.couponCode) {
            coupon = await claimCoupon(tx, { code: req.couponCode, lines: req.lines, currency: req.currency, email: req.email });
          }
          const discountCents = coupon?.discountCents ?? 0;
          const totalCents = req.subtotalCents - discountCents;
          const walletAppliedCents = walletShare(walletBalance, totalCents);

          const data: Prisma.OrderCreateInput = {
            accessToken: randomToken(),
            customer: { connect: { id: customerId } },
            status: "PENDING",
            subtotalCents: req.subtotalCents,
            discountCents,
            walletAppliedCents,
            totalCents,
            currency: req.currency,
            items: {
              create: req.lines.map((line) => ({
                variantId: line.variantId,
                productName: line.productName,
                variantLabel: line.variantLabel,
                productType: line.productType,
                quantity: line.quantity,
                unitPriceCents: line.unitPriceCents,
              })),
            },
          };
          if (coupon) {
            data.coupon = { connect: { id: coupon.couponId } };
            data.couponRedemption = {
              create: { coupon: { connect: { id: coupon.couponId } }, customerEmail: req.email, discountCents },
            };
          }
          const order = await tx.order.create({
            data,
            select: {
              id: true,
              accessToken: true,
              items: {
                select: { id: true, variantId: true, quantity: true, productName: true, variantLabel: true, productType: true },
              },
            },
          });

          if (walletAppliedCents > 0) {
            await debitWallet(tx, customerId, walletAppliedCents, {
              type: "PURCHASE",
              orderId: order.id,
              note: `طلب #${order.id.slice(-8).toUpperCase()}`,
            });
          }
          for (const item of order.items) {
            if (item.productType !== "SERVICE") await reserveStock(tx, item);
          }
          return {
            id: order.id,
            accessToken: order.accessToken,
            totalCents,
            walletAppliedCents,
            amountDueCents: totalCents - walletAppliedCents,
          };
        },
        { maxWait: 10_000, timeout: 20_000 },
      );
    } catch (err) {
      if (!(err instanceof OutOfStockError)) throw err;
      if (!err.transient || attempt >= RESERVE_ATTEMPTS) return err;
      await sleep(50 * attempt + Math.floor(Math.random() * 50));
    }
  }
}

/** Marks a fully covered (wallet) or dev-mode order paid and delivers it now. */
async function completeWithoutGateway(orderId: string, provider: "WALLET" | "DEV") {
  await markOrderPaid(orderId, { provider });
  try {
    await fulfillOrder(orderId);
  } catch (err) {
    console.error(`[checkout] Immediate fulfillment failed for order ${orderId} (${provider})`, err);
  }
}

export async function POST(req: Request) {
  const retryAfter = rateLimit("checkout", clientIp(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (retryAfter > 0) {
    return jsonError("طلبات كثيرة جداً، يرجى المحاولة بعد دقيقة", 429, { "Retry-After": String(retryAfter) });
  }

  // Free stock, wallet credit and coupon uses held by abandoned checkouts whose webhook never arrived
  try {
    await releaseStaleReservations();
  } catch (err) {
    console.error("[checkout] Releasing stale reservations failed", err);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError("طلب غير صالح", 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "بيانات الطلب غير صالحة", 400);
  }
  const body = parsed.data;

  const session = await currentCustomer();
  let email: string;
  if (session) {
    email = normalizeEmail(session.email); // the account's email, whatever the form sent
  } else {
    const checked = emailSchema.safeParse(body.email ?? "");
    if (!checked.success) return jsonError(checked.error.issues[0]?.message ?? "البريد الإلكتروني غير صالح", 400);
    email = checked.data;
  }
  const useWallet = body.useWallet === true;
  if (useWallet && !session) return jsonError("سجّل الدخول لاستخدام رصيد المحفظة", 401);

  const options = getCheckoutOptions();
  if (body.provider && !options.devMode && !resolveProvider(body.provider)) {
    return jsonError("طريقة الدفع المختارة غير متاحة حالياً", 400);
  }

  const rawCode = body.couponCode?.trim() || null;
  const couponCode = rawCode ? normalizeCouponCode(rawCode) : null;
  if (rawCode && !couponCode) return jsonError("كود الخصم غير صالح", 400);

  try {
    const quote = await quoteCart({
      items: body.items,
      couponCode: couponCode ?? undefined,
      useWallet,
      customerId: session?.customerId ?? null,
      email,
    });
    if (!quote.ok) return jsonError(quote.error, 400);
    // Never charge more than the buyer was shown: an unusable coupon stops the checkout
    if (couponCode && quote.couponError) return jsonError(quote.couponError, 400);
    if (quote.amountDueCents > 0 && options.providers.length === 0 && !options.devMode) {
      return jsonError("الدفع غير متاح حالياً، يرجى المحاولة لاحقاً", 503);
    }

    // Fast pre-check for delivered-from-stock products (SERVICE is delivered manually).
    // Not authoritative: the reservation below is what guarantees the stock.
    const stockLines = quote.lines.filter((line) => line.productType !== "SERVICE");
    if (stockLines.length > 0) {
      const counts = await prisma.inventoryItem.groupBy({
        by: ["variantId"],
        where: { variantId: { in: stockLines.map((line) => line.variantId) }, status: "AVAILABLE" },
        _count: { _all: true },
      });
      const available = new Map(counts.map((c) => [c.variantId, c._count._all]));
      for (const line of stockLines) {
        const inStock = available.get(line.variantId) ?? 0;
        if (line.quantity > inStock) {
          return jsonError(outOfStockMessage(line.productName, line.variantLabel, inStock), 409);
        }
      }
    }

    let reservation: ReservedOrder | OutOfStockError;
    try {
      reservation = await createReservedOrder({
        email,
        sessionCustomerId: session?.customerId ?? null,
        lines: quote.lines,
        currency: quote.currency,
        subtotalCents: quote.subtotalCents,
        couponCode,
        useWallet,
        referralCode: await referralCookie(),
      });
    } catch (err) {
      if (err instanceof CouponError) return jsonError(err.message, 409);
      if (err instanceof CheckoutRejection) return jsonError(err.message, err.status);
      throw err;
    }
    if (reservation instanceof OutOfStockError) {
      return jsonError(
        reservation.transient
          ? `الطلب مرتفع حالياً على "${reservation.productName} - ${reservation.variantLabel}"، يرجى المحاولة مرة أخرى بعد لحظات`
          : outOfStockMessage(reservation.productName, reservation.variantLabel, reservation.available),
        409,
      );
    }
    const order = reservation;

    if (order.amountDueCents === 0) {
      // Fully covered by the wallet (and/or coupon): no gateway, deliver now
      await completeWithoutGateway(order.id, "WALLET");
      return Response.json({ url: orderPagePath(order) });
    }
    if (options.devMode) {
      // Dev mode (never in production): no real charge, deliver immediately
      await completeWithoutGateway(order.id, "DEV");
      return Response.json({ url: orderPagePath(order) });
    }

    const providerId: ProviderId | null = resolveProvider(body.provider);
    if (!providerId) {
      await failPendingOrder(order.id); // the wallet balance changed and no gateway is available
      return jsonError("الدفع غير متاح حالياً، يرجى المحاولة لاحقاً", 503);
    }

    const site = siteUrl();
    const shortId = order.id.slice(-8).toUpperCase();
    let payment: { ref: string; url: string };
    try {
      payment = await getProvider(providerId).createPayment({
        kind: "order",
        refId: order.id,
        amountMinor: order.amountDueCents,
        currency: quote.currency,
        email,
        description: `طلب Nitro Store #${shortId}`,
        // Itemised on the hosted page only when nothing was deducted (the adapter re-checks the sum)
        lineItems: quote.lines.map((line) => ({
          name: `${line.productName} - ${line.variantLabel}`,
          quantity: line.quantity,
          unitAmountMinor: line.unitPriceCents,
          imageUrl: line.imageUrl,
        })),
        successUrl: `${site}${orderPagePath(order)}`,
        cancelUrl: `${site}/cart`,
        idempotencyKey: `checkout-session-${order.id}`,
      });
    } catch (err) {
      console.error(`[checkout] ${providerId} payment creation failed for order ${order.id}`, err);
      await failPendingOrder(order.id); // releases stock, returns the wallet debit and the coupon use
      return jsonError("تعذر بدء عملية الدفع، يرجى المحاولة مرة أخرى", 502);
    }

    await prisma.order.update({
      where: { id: order.id },
      data:
        providerId === "STRIPE"
          ? { paymentProvider: "STRIPE", stripeSessionId: payment.ref }
          : { paymentProvider: "TAP", tapChargeId: payment.ref },
    });
    return Response.json({ url: payment.url });
  } catch (err) {
    console.error("[checkout] Unexpected error", err);
    return jsonError("حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى", 500);
  }
}
