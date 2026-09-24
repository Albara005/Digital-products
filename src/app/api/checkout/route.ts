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
import { type Locale, localizePath } from "@/i18n/config";
import { type Dictionary, dictionaryFor, getRequestLocale } from "@/i18n/server";
import { clientIp, jsonError, rateLimit } from "../_lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LINES = 20;
const MAX_QUANTITY = 10;
const RATE_LIMIT = 10; // requests
const RATE_WINDOW_MS = 60_000; // per minute, per IP
const RESERVE_ATTEMPTS = 5;

const emailSchema = (t: Dictionary) =>
  z
    .string({ error: t.api.emailRequired })
    .trim()
    .toLowerCase()
    .min(1, { error: t.api.emailRequired })
    .max(254, { error: t.api.emailTooLong })
    .pipe(z.email({ error: t.api.emailInvalid }));

const bodySchema = (t: Dictionary) =>
  z.object(
    {
      // Validated below: ignored for signed-in customers, required for guests
      email: z.unknown().optional(),
      items: z
        .array(
          z.object({
            variantId: z.string({ error: t.api.badItem }).trim().min(1, { error: t.api.badItem }).max(64),
            quantity: z
              .number({ error: t.api.badQuantity })
              .int({ error: t.api.quantityInt })
              .min(1, { error: t.api.quantityMin })
              .max(MAX_QUANTITY, { error: t.api.quantityMax(MAX_QUANTITY) }),
          }),
          { error: t.api.cartInvalid },
        )
        .min(1, { error: t.api.cartEmpty })
        .max(MAX_LINES, { error: t.api.cartTooBig(MAX_LINES) }),
      couponCode: z.string({ error: t.api.invalidCoupon }).trim().max(64, { error: t.api.invalidCoupon }).nullish(),
      useWallet: z.boolean({ error: t.api.badOrderData }).optional(),
      provider: z.enum(["STRIPE", "TAP"], { error: t.api.badProvider }).optional(),
    },
    { error: t.api.badOrderData },
  );

function outOfStockMessage(t: Dictionary, item: string, available: number) {
  return available <= 0 ? t.api.outOfStock(item) : t.api.notEnough(item, available);
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

/** A checkout the buyer must fix (HTTP status + message in their language); thrown inside the transaction to roll it back. */
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
  locale: Locale;
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
            if (!customer) throw new CheckoutRejection(dictionaryFor(req.locale).api.sessionExpired, 401);
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
            coupon = await claimCoupon(tx, {
              code: req.couponCode,
              lines: req.lines,
              currency: req.currency,
              email: req.email,
              locale: req.locale,
            });
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
  // Messages (and the payment return URLs) follow the storefront language the cart page sends.
  const locale = await getRequestLocale(req);
  const t = dictionaryFor(locale);
  const retryAfter = rateLimit("checkout", clientIp(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (retryAfter > 0) {
    return jsonError(t.api.tooMany, 429, { "Retry-After": String(retryAfter) });
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
    return jsonError(t.api.badRequest, 400);
  }
  const parsed = bodySchema(t).safeParse(raw);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? t.api.badOrderData, 400);
  }
  const body = parsed.data;

  const session = await currentCustomer();
  let email: string;
  if (session) {
    email = normalizeEmail(session.email); // the account's email, whatever the form sent
  } else {
    const checked = emailSchema(t).safeParse(body.email ?? "");
    if (!checked.success) return jsonError(checked.error.issues[0]?.message ?? t.api.emailInvalid, 400);
    email = checked.data;
  }
  const useWallet = body.useWallet === true;
  if (useWallet && !session) return jsonError(t.api.signInForWallet, 401);

  const options = getCheckoutOptions();
  if (body.provider && !options.devMode && !resolveProvider(body.provider)) {
    return jsonError(t.api.providerUnavailable, 400);
  }

  const rawCode = body.couponCode?.trim() || null;
  const couponCode = rawCode ? normalizeCouponCode(rawCode) : null;
  if (rawCode && !couponCode) return jsonError(t.api.invalidCoupon, 400);

  try {
    const quote = await quoteCart({
      items: body.items,
      couponCode: couponCode ?? undefined,
      useWallet,
      customerId: session?.customerId ?? null,
      email,
      locale,
    });
    if (!quote.ok) return jsonError(quote.error, 400);
    // Never charge more than the buyer was shown: an unusable coupon stops the checkout
    if (couponCode && quote.couponError) return jsonError(quote.couponError, 400);
    if (quote.amountDueCents > 0 && options.providers.length === 0 && !options.devMode) {
      return jsonError(t.api.paymentUnavailable, 503);
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
          return jsonError(outOfStockMessage(t, `${line.displayName} - ${line.displayLabel}`, inStock), 409);
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
        locale,
      });
    } catch (err) {
      if (err instanceof CouponError) return jsonError(err.message, 409);
      if (err instanceof CheckoutRejection) return jsonError(err.message, err.status);
      throw err;
    }
    if (reservation instanceof OutOfStockError) {
      // The reservation reports the stored (Arabic) names; show the shopper's own wording when we have it
      const line = quote.lines.find((l) => l.productName === reservation.productName && l.variantLabel === reservation.variantLabel);
      const item = line ? `${line.displayName} - ${line.displayLabel}` : `${reservation.productName} - ${reservation.variantLabel}`;
      return jsonError(
        reservation.transient ? t.api.highDemand(item) : outOfStockMessage(t, item, reservation.available),
        409,
      );
    }
    const order = reservation;

    if (order.amountDueCents === 0) {
      // Fully covered by the wallet (and/or coupon): no gateway, deliver now
      await completeWithoutGateway(order.id, "WALLET");
      return Response.json({ url: localizePath(orderPagePath(order), locale) });
    }
    if (options.devMode) {
      // Dev mode (never in production): no real charge, deliver immediately
      await completeWithoutGateway(order.id, "DEV");
      return Response.json({ url: localizePath(orderPagePath(order), locale) });
    }

    const providerId: ProviderId | null = resolveProvider(body.provider);
    if (!providerId) {
      await failPendingOrder(order.id); // the wallet balance changed and no gateway is available
      return jsonError(t.api.paymentUnavailable, 503);
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
        description: t.api.orderDescription(shortId),
        // Itemised on the hosted page only when nothing was deducted (the adapter re-checks the sum)
        lineItems: quote.lines.map((line) => ({
          name: `${line.displayName} - ${line.displayLabel}`,
          quantity: line.quantity,
          unitAmountMinor: line.unitPriceCents,
          imageUrl: line.imageUrl,
        })),
        successUrl: `${site}${localizePath(orderPagePath(order), locale)}`,
        cancelUrl: `${site}${localizePath("/cart", locale)}`,
        idempotencyKey: `checkout-session-${order.id}`,
      });
    } catch (err) {
      console.error(`[checkout] ${providerId} payment creation failed for order ${order.id}`, err);
      await failPendingOrder(order.id); // releases stock, returns the wallet debit and the coupon use
      return jsonError(t.api.paymentStartFailed, 502);
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
    return jsonError(t.api.unexpected, 500);
  }
}
