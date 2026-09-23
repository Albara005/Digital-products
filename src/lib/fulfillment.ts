import "server-only";
import { prisma } from "@/lib/prisma";
import { sendOrderDeliveredEmail } from "@/lib/email";

/*
 * Automatic delivery of codes / account credentials from stock.
 *
 * Guarantees:
 * - A stock unit is sold at most once: units are claimed with row locks
 *   (FOR UPDATE SKIP LOCKED) and flipped AVAILABLE -> SOLD in the same transaction.
 * - An order item is delivered at most once: its row is locked (FOR UPDATE) before claiming
 *   stock, so concurrent callers (webhook retries, the admin "retry" button) serialize on it
 *   and the loser sees deliveredAt already set.
 * - Only one caller moves an order PAID -> FULFILLED (conditional updateMany), and only that
 *   caller sends the delivery email.
 */

type ItemToDeliver = {
  id: string;
  variantId: string;
  quantity: number;
  productName: string;
  variantLabel: string;
};

type DeliveryOutcome =
  | { kind: "delivered" }
  | { kind: "skipped" }
  | { kind: "shortfall"; claimable: number; available: number };

const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;
const MAX_ATTEMPTS = 4;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** PENDING -> PAID exactly once. Returns true only for the caller that made the transition. */
export async function markOrderPaid(
  orderId: string,
  payment: { stripeSessionId?: string; paymentIntent?: string } = {},
): Promise<boolean> {
  const result = await prisma.order.updateMany({
    where: { id: orderId, status: "PENDING" },
    data: {
      status: "PAID",
      paidAt: new Date(),
      ...(payment.stripeSessionId ? { stripeSessionId: payment.stripeSessionId } : {}),
      ...(payment.paymentIntent ? { stripePaymentIntent: payment.paymentIntent } : {}),
    },
  });
  return result.count === 1;
}

async function deliverItemOnce(orderId: string, item: ItemToDeliver): Promise<DeliveryOutcome> {
  return prisma.$transaction(async (tx) => {
    // Serialize every fulfiller of this order item and re-check state under the lock
    const current = await tx.$queryRaw<{ deliveredAt: Date | null; status: string }[]>`
      SELECT oi."deliveredAt", o."status"::text AS "status"
      FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
      WHERE oi."id" = ${item.id} AND oi."orderId" = ${orderId}
      FOR UPDATE OF oi`;
    const row = current[0];
    if (!row || row.deliveredAt || row.status !== "PAID") return { kind: "skipped" };

    const claimed = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "InventoryItem"
      WHERE "variantId" = ${item.variantId} AND status = 'AVAILABLE'
      ORDER BY "createdAt"
      LIMIT ${item.quantity}
      FOR UPDATE SKIP LOCKED`;

    if (claimed.length < item.quantity) {
      // Rows locked by other in-flight transactions still count here; used to decide on a retry
      const available = await tx.inventoryItem.count({
        where: { variantId: item.variantId, status: "AVAILABLE" },
      });
      return { kind: "shortfall", claimable: claimed.length, available };
    }

    const now = new Date();
    const ids = claimed.map((r) => r.id);
    const sold = await tx.inventoryItem.updateMany({
      where: { id: { in: ids }, status: "AVAILABLE" },
      data: { status: "SOLD", soldAt: now, orderItemId: item.id },
    });
    if (sold.count !== ids.length) {
      // Cannot happen while the rows are locked; abort rather than deliver a partial set
      throw new Error(`Claimed ${ids.length} units for order item ${item.id} but updated ${sold.count}`);
    }
    await tx.orderItem.update({ where: { id: item.id }, data: { deliveredAt: now } });
    return { kind: "delivered" };
  }, TX_OPTIONS);
}

async function deliverItem(orderId: string, item: ItemToDeliver): Promise<DeliveryOutcome> {
  for (let attempt = 1; ; attempt++) {
    const outcome = await deliverItemOnce(orderId, item);
    if (outcome.kind !== "shortfall") return outcome;
    // Enough stock exists but some of it is locked by a concurrent transaction that may release it
    if (outcome.available < item.quantity || attempt >= MAX_ATTEMPTS) return outcome;
    await sleep(75 * attempt + Math.floor(Math.random() * 75));
  }
}

/**
 * Delivers stock for every undelivered, non-SERVICE item of a PAID order, then refreshes the
 * order status. Idempotent and safe to call concurrently. Items without enough stock are left
 * undelivered (order stays PAID) for manual delivery by an admin.
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
 * and emails the customer. Call after any manual delivery too.
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
    await sendOrderDeliveredEmail(orderId);
  }
}
