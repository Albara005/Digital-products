import "server-only";
import type { PaymentProvider, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendOrderDeliveredEmail } from "@/lib/email";
import { InsufficientBalanceError, creditWallet, debitWallet, orderWalletNetDebit } from "@/lib/wallet";

/*
 * Stock reservation and automatic delivery of codes / account credentials.
 *
 * Lifecycle of a stock unit:  AVAILABLE --checkout--> RESERVED --payment--> SOLD
 *                                  ^                      |
 *                                  +--expired / failed ---+
 *
 * Guarantees:
 * - A stock unit is sold at most once: units are claimed with row locks (FOR UPDATE SKIP LOCKED)
 *   and change status in the same transaction.
 * - A customer can only pay for stock that exists: checkout reserves every unit in the transaction
 *   that creates the order, or creates nothing.
 * - An order item is delivered at most once: its row is locked (FOR UPDATE) before its units are
 *   sold, so concurrent callers (webhook retries, the admin "retry" button) serialize on it and
 *   the loser sees deliveredAt already set.
 * - Only one caller moves an order PAID -> FULFILLED (conditional updateMany), and only that
 *   caller sends the delivery email.
 *
 * Wallet credit and coupon use ("holds") follow the order status, in the same transaction as the
 * status change, so each happens exactly once:
 * - checkout: wallet debit (PURCHASE) + coupon usedCount+1, with the PENDING order
 * - PENDING -> FAILED (payment failed/expired, provider error, stale sweep): debit given back
 *   (REFUND) and coupon use released
 * - FAILED -> PAID (payment confirmed after the order was failed): both taken again; if the wallet
 *   no longer covers it, the order is PAID but not delivered automatically (see fulfillOrder)
 */

/** Minutes after which a PENDING order's reservation is released (Stripe sessions expire at ~31). */
export const RESERVATION_TTL_MINUTES = 35;

type StockLine = {
  id: string; // order item id
  variantId: string;
  quantity: number;
  productName: string;
  variantLabel: string;
};

type DeliveryOutcome =
  | { kind: "delivered" }
  | { kind: "skipped" }
  | { kind: "shortfall"; available: number };

const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;
const MAX_ATTEMPTS = 4;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Thrown by reserveStock inside a transaction; the caller must let the transaction roll back. */
export class OutOfStockError extends Error {
  constructor(
    readonly productName: string,
    readonly variantLabel: string,
    readonly requested: number,
    /** Committed AVAILABLE units, including ones locked by in-flight transactions */
    readonly available: number,
  ) {
    super(`Not enough stock for ${productName} - ${variantLabel}: requested ${requested}, available ${available}`);
    this.name = "OutOfStockError";
  }

  /** Enough stock exists but other transactions hold locks on it; retrying may succeed. */
  get transient(): boolean {
    return this.available >= this.requested;
  }
}

async function claimAvailable(tx: Prisma.TransactionClient, variantId: string, limit: number): Promise<string[]> {
  if (limit <= 0) return [];
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "InventoryItem"
    WHERE "variantId" = ${variantId} AND status = 'AVAILABLE'
    ORDER BY "createdAt"
    LIMIT ${limit}
    FOR UPDATE SKIP LOCKED`;
  return rows.map((row) => row.id);
}

/**
 * Reserves `quantity` AVAILABLE units of the variant for an order item. Must run inside the
 * transaction that creates the order; throws OutOfStockError (rolling it back) if short.
 */
export async function reserveStock(tx: Prisma.TransactionClient, line: StockLine): Promise<void> {
  const claimed = await claimAvailable(tx, line.variantId, line.quantity);
  if (claimed.length < line.quantity) {
    const available = await tx.inventoryItem.count({ where: { variantId: line.variantId, status: "AVAILABLE" } });
    throw new OutOfStockError(line.productName, line.variantLabel, line.quantity, available);
  }
  const reserved = await tx.inventoryItem.updateMany({
    where: { id: { in: claimed }, status: "AVAILABLE" },
    data: { status: "RESERVED", orderItemId: line.id },
  });
  if (reserved.count !== claimed.length) {
    throw new Error(`Locked ${claimed.length} units for order item ${line.id} but reserved ${reserved.count}`);
  }
}

export type PaymentConfirmation = {
  provider: PaymentProvider;
  stripeSessionId?: string;
  paymentIntent?: string;
  tapChargeId?: string;
};

type HoldRow = { customerId: string; walletAppliedCents: number; couponId: string | null };

/** Gives back what a failing order holds: its wallet debit and its coupon use. Call only on PENDING -> FAILED. */
async function releaseOrderHolds(tx: Prisma.TransactionClient, orderId: string, order: HoldRow): Promise<void> {
  const walletHeld = await orderWalletNetDebit(tx, orderId);
  if (walletHeld > 0) {
    await creditWallet(tx, order.customerId, walletHeld, {
      type: "REFUND",
      orderId,
      note: `إرجاع رصيد طلب لم يكتمل #${orderId.slice(-8).toUpperCase()}`,
    });
  }
  if (order.couponId && (await tx.couponRedemption.count({ where: { orderId } })) > 0) {
    await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = GREATEST("usedCount" - 1, 0) WHERE id = ${order.couponId}`;
  }
}

/** Takes the holds again when a FAILED order turns out to be paid. Never throws for a short wallet. */
async function reacquireOrderHolds(tx: Prisma.TransactionClient, orderId: string, order: HoldRow): Promise<void> {
  const missing = order.walletAppliedCents - (await orderWalletNetDebit(tx, orderId));
  if (missing > 0) {
    try {
      await debitWallet(tx, order.customerId, missing, {
        type: "PURCHASE",
        orderId,
        note: `طلب #${orderId.slice(-8).toUpperCase()} (دفع متأخر)`,
      });
    } catch (err) {
      if (!(err instanceof InsufficientBalanceError)) throw err;
      console.error(
        `[fulfillment] Order ${orderId}: late payment but the wallet no longer covers ${missing} cents ` +
          `(balance ${err.balanceCents}). Marked PAID without automatic delivery; review manually.`,
      );
    }
  }
  if (order.couponId && (await tx.couponRedemption.count({ where: { orderId } })) > 0) {
    // The buyer already paid the discounted price: count the use even past maxUses
    await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = "usedCount" + 1 WHERE id = ${order.couponId}`;
  }
}

/**
 * PENDING (or FAILED, e.g. a late webhook after expiry) -> PAID once, recording how it was paid.
 * True only for the caller that transitioned.
 */
export async function markOrderPaid(orderId: string, payment: PaymentConfirmation): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<(HoldRow & { status: string })[]>`
      SELECT status::text AS status, "customerId", "walletAppliedCents", "couponId"
      FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = rows[0];
    if (!order || (order.status !== "PENDING" && order.status !== "FAILED")) return false;
    if (order.status === "FAILED") await reacquireOrderHolds(tx, orderId, order);

    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paymentProvider: payment.provider,
        ...(payment.stripeSessionId ? { stripeSessionId: payment.stripeSessionId } : {}),
        ...(payment.paymentIntent ? { stripePaymentIntent: payment.paymentIntent } : {}),
        ...(payment.tapChargeId ? { tapChargeId: payment.tapChargeId } : {}),
      },
    });
    return true;
  }, TX_OPTIONS);
}

/** Returns an order's RESERVED units to AVAILABLE. Safe to call any time; SOLD units are never touched. */
export async function releaseOrderReservations(orderId: string, tx: Prisma.TransactionClient = prisma): Promise<number> {
  const released = await tx.inventoryItem.updateMany({
    where: { status: "RESERVED", orderItem: { orderId } },
    data: { status: "AVAILABLE", orderItemId: null },
  });
  return released.count;
}

async function failPendingOrderTx(orderId: string): Promise<number | null> {
  return prisma.$transaction(async (tx) => {
    const failed = await tx.$queryRaw<HoldRow[]>`
      UPDATE "Order" SET status = 'FAILED', "updatedAt" = NOW()
      WHERE id = ${orderId} AND status = 'PENDING'
      RETURNING "customerId", "walletAppliedCents", "couponId"`;
    if (!failed[0]) return null;
    const units = await releaseOrderReservations(orderId, tx);
    await releaseOrderHolds(tx, orderId, failed[0]);
    return units;
  }, TX_OPTIONS);
}

/**
 * PENDING -> FAILED, atomically with releasing its reserved stock, returning its wallet debit and
 * releasing its coupon use. True if this call failed the order (only one caller ever does).
 */
export async function failPendingOrder(orderId: string): Promise<boolean> {
  return (await failPendingOrderTx(orderId)) !== null;
}

/**
 * Fails PENDING orders older than RESERVATION_TTL_MINUTES through failPendingOrder (stock, wallet
 * and coupon released exactly once each). Covers lost/late webhooks; cheap enough to run at the
 * start of every checkout (indexed lookup, usually empty).
 */
export async function releaseStaleReservations(): Promise<{ orders: number; units: number }> {
  const stale = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Order"
    WHERE status = 'PENDING' AND "createdAt" < NOW() - make_interval(mins => ${RESERVATION_TTL_MINUTES}::int)
    ORDER BY "createdAt"
    LIMIT 100`;
  let orders = 0;
  let units = 0;
  for (const { id } of stale) {
    const released = await failPendingOrderTx(id);
    if (released === null) continue; // another request got there first
    orders += 1;
    units += released;
  }
  if (orders > 0) {
    console.info(`[fulfillment] Released ${units} reserved unit(s) from ${orders} stale pending order(s)`);
  }
  return { orders, units };
}

async function deliverItemOnce(orderId: string, item: StockLine): Promise<DeliveryOutcome> {
  return prisma.$transaction(async (tx) => {
    // Serialize every fulfiller of this order item and re-check state under the lock
    const current = await tx.$queryRaw<{ deliveredAt: Date | null; status: string }[]>`
      SELECT oi."deliveredAt", o."status"::text AS "status"
      FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
      WHERE oi."id" = ${item.id} AND oi."orderId" = ${orderId}
      FOR UPDATE OF oi`;
    const row = current[0];
    if (!row || row.deliveredAt || row.status !== "PAID") return { kind: "skipped" };

    // 1) Units reserved for this item at checkout
    const reserved = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "InventoryItem"
      WHERE "orderItemId" = ${item.id} AND status = 'RESERVED'
      ORDER BY "createdAt"
      LIMIT ${item.quantity}
      FOR UPDATE`;
    // 2) Only if the reservation is missing/short (e.g. released after expiry): take AVAILABLE stock
    const missing = item.quantity - reserved.length;
    const extra = await claimAvailable(tx, item.variantId, missing);
    if (extra.length < missing) {
      // Keep any reservation in place for a later retry once stock is added
      const available = await tx.inventoryItem.count({ where: { variantId: item.variantId, status: "AVAILABLE" } });
      return { kind: "shortfall", available };
    }

    const now = new Date();
    const ids = [...reserved.map((r) => r.id), ...extra];
    const sold = await tx.inventoryItem.updateMany({
      where: { id: { in: ids }, status: { in: ["RESERVED", "AVAILABLE"] } },
      data: { status: "SOLD", soldAt: now, orderItemId: item.id },
    });
    if (sold.count !== ids.length) {
      // Cannot happen while the rows are locked; abort rather than deliver a partial set
      throw new Error(`Locked ${ids.length} units for order item ${item.id} but sold ${sold.count}`);
    }
    await tx.orderItem.update({ where: { id: item.id }, data: { deliveredAt: now } });
    return { kind: "delivered" };
  }, TX_OPTIONS);
}

async function deliverItem(orderId: string, item: StockLine): Promise<DeliveryOutcome> {
  for (let attempt = 1; ; attempt++) {
    const outcome = await deliverItemOnce(orderId, item);
    if (outcome.kind !== "shortfall") return outcome;
    // Enough stock exists but some of it is locked by a concurrent transaction that may release it
    if (outcome.available < item.quantity || attempt >= MAX_ATTEMPTS) return outcome;
    await sleep(75 * attempt + Math.floor(Math.random() * 75));
  }
}

/**
 * Delivers every undelivered, non-SERVICE item of a PAID order (reserved units first, then
 * AVAILABLE stock if the reservation was released), then refreshes the order status.
 * Idempotent and safe to call concurrently. Items that still lack stock stay undelivered
 * (order stays PAID) for manual delivery or a retry after restocking.
 */
export async function fulfillOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      walletAppliedCents: true,
      items: {
        where: { deliveredAt: null, productType: { not: "SERVICE" } },
        select: { id: true, variantId: true, quantity: true, productName: true, variantLabel: true },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!order) {
    console.warn(`[fulfillment] Order ${orderId} not found`);
    return;
  }
  if (order.status !== "PAID") return;
  if (order.walletAppliedCents > 0) {
    // A late payment whose wallet part could not be taken again: don't hand out unpaid goods
    const covered = await orderWalletNetDebit(prisma, orderId);
    if (covered < order.walletAppliedCents) {
      console.error(
        `[fulfillment] Order ${orderId}: wallet part not covered (${covered}/${order.walletAppliedCents} cents). ` +
          "Not delivering automatically; review manually.",
      );
      return;
    }
  }

  const failures: unknown[] = [];
  for (const item of order.items) {
    try {
      const outcome = await deliverItem(orderId, item);
      if (outcome.kind === "shortfall") {
        console.warn(
          `[fulfillment] Order ${orderId}: not enough stock for "${item.productName} - ${item.variantLabel}" ` +
            `(needed ${item.quantity}, available ${outcome.available}). Left in PAID for manual delivery.`,
        );
      }
    } catch (err) {
      failures.push(err);
      console.error(`[fulfillment] Order ${orderId}: delivering item ${item.id} failed`, err);
    }
  }

  await refreshOrderStatus(orderId);

  if (failures.length > 0) {
    throw new Error(`Fulfillment failed for ${failures.length} item(s) of order ${orderId}`, { cause: failures[0] });
  }
}

/**
 * Moves a PAID order to FULFILLED once every item is delivered (stock or manual delivery),
 * frees any leftover reservation and emails the customer. Call after any manual delivery too.
 */
export async function refreshOrderStatus(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, items: { select: { deliveredAt: true } } },
  });
  if (!order || order.status !== "PAID") return;
  if (order.items.length === 0 || order.items.some((item) => !item.deliveredAt)) return;

  const transitioned = await prisma.order.updateMany({
    where: { id: orderId, status: "PAID", items: { none: { deliveredAt: null } } },
    data: { status: "FULFILLED", fulfilledAt: new Date() },
  });
  if (transitioned.count === 1) {
    // Items delivered manually may still hold reserved units that were never sold
    await releaseOrderReservations(orderId);
    await sendOrderDeliveredEmail(orderId);
  }
}
