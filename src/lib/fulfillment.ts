import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendOrderDeliveredEmail } from "@/lib/email";

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

/** PENDING (or FAILED, e.g. a late webhook after expiry) -> PAID once. True only for the caller that transitioned. */
export async function markOrderPaid(
  orderId: string,
  payment: { stripeSessionId?: string; paymentIntent?: string } = {},
): Promise<boolean> {
  const result = await prisma.order.updateMany({
    where: { id: orderId, status: { in: ["PENDING", "FAILED"] } },
    data: {
      status: "PAID",
      paidAt: new Date(),
      ...(payment.stripeSessionId ? { stripeSessionId: payment.stripeSessionId } : {}),
      ...(payment.paymentIntent ? { stripePaymentIntent: payment.paymentIntent } : {}),
    },
  });
  return result.count === 1;
}

/** Returns an order's RESERVED units to AVAILABLE. Safe to call any time; SOLD units are never touched. */
export async function releaseOrderReservations(orderId: string, tx: Prisma.TransactionClient = prisma): Promise<number> {
  const released = await tx.inventoryItem.updateMany({
    where: { status: "RESERVED", orderItem: { orderId } },
    data: { status: "AVAILABLE", orderItemId: null },
  });
  return released.count;
}

/** PENDING -> FAILED and release its reservations, atomically. True if this call failed the order. */
export async function failPendingOrder(orderId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const failed = await tx.order.updateMany({ where: { id: orderId, status: "PENDING" }, data: { status: "FAILED" } });
    if (failed.count === 0) return false;
    await releaseOrderReservations(orderId, tx);
    return true;
  }, TX_OPTIONS);
}

/**
 * Fails PENDING orders older than RESERVATION_TTL_MINUTES and frees their reserved stock, in one
 * statement. Covers lost/late webhooks; cheap enough to run at the start of every checkout.
 */
export async function releaseStaleReservations(): Promise<{ orders: number; units: number }> {
  const [result] = await prisma.$queryRaw<{ orders: number; units: number }[]>`
    WITH stale AS (
      UPDATE "Order" SET status = 'FAILED', "updatedAt" = NOW()
      WHERE status = 'PENDING' AND "createdAt" < NOW() - make_interval(mins => ${RESERVATION_TTL_MINUTES}::int)
      RETURNING id
    ), released AS (
      UPDATE "InventoryItem" SET status = 'AVAILABLE', "orderItemId" = NULL
      WHERE status = 'RESERVED'
        AND "orderItemId" IN (SELECT oi.id FROM "OrderItem" oi WHERE oi."orderId" IN (SELECT id FROM stale))
      RETURNING id
    )
    SELECT (SELECT COUNT(*) FROM stale)::int AS orders, (SELECT COUNT(*) FROM released)::int AS units`;
  if (result && result.orders > 0) {
    console.info(`[fulfillment] Released ${result.units} reserved unit(s) from ${result.orders} stale pending order(s)`);
  }
  return result ?? { orders: 0, units: 0 };
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
