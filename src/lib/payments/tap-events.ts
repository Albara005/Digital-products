import "server-only";
import { prisma } from "@/lib/prisma";
import { failPendingOrder, fulfillOrder, markOrderPaid } from "@/lib/fulfillment";
import { isTapChargeId, verifyTapCharge, type TapVerdict } from "./tap";
import { confirmTopupPaid, failTopup } from "./topups";

export type TapChargeOutcome =
  | { kind: "order"; order: { id: string; accessToken: string }; result: TapVerdict["result"] }
  | { kind: "topup"; topupId: string; result: TapVerdict["result"] }
  | { kind: "unknown" };

/**
 * Shared by the Tap webhook and the buyer's return: finds OUR record that stored this charge id,
 * re-fetches the charge from Tap with the secret key and applies it:
 *   CAPTURED + matching amount/currency/metadata -> order PAID + delivered / top-up credited (once)
 *   final failure (DECLINED, CANCELLED, ...)     -> order FAILED (stock, wallet, coupon released) / top-up FAILED
 *   anything else                                 -> nothing yet
 * Idempotent. Throws on Tap/API errors so the webhook can answer 500 and be retried.
 */
export async function processTapCharge(chargeId: string): Promise<TapChargeOutcome> {
  if (!isTapChargeId(chargeId)) return { kind: "unknown" };

  const order = await prisma.order.findUnique({
    where: { tapChargeId: chargeId },
    select: { id: true, accessToken: true, totalCents: true, walletAppliedCents: true, currency: true },
  });
  if (order) {
    const { verdict } = await verifyTapCharge({
      chargeId,
      amountMinor: order.totalCents - order.walletAppliedCents,
      currency: order.currency,
      kind: "order",
      refId: order.id,
    });
    if (verdict.result === "paid") {
      await markOrderPaid(order.id, { provider: "TAP", tapChargeId: chargeId });
      // Also on repeats: fulfillOrder is idempotent and picks up anything not yet delivered
      await fulfillOrder(order.id);
    } else if (verdict.result === "failed") {
      await failPendingOrder(order.id);
    } else if (verdict.result === "mismatch") {
      console.error(`[tap] Charge ${chargeId} does not match order ${order.id}: ${verdict.reason}. Not acting; review manually.`);
    }
    return { kind: "order", order: { id: order.id, accessToken: order.accessToken }, result: verdict.result };
  }

  const topup = await prisma.walletTopup.findUnique({
    where: { providerRef: chargeId },
    select: { id: true, provider: true, amountCents: true, currency: true },
  });
  if (topup && topup.provider === "TAP") {
    const { verdict } = await verifyTapCharge({
      chargeId,
      amountMinor: topup.amountCents,
      currency: topup.currency,
      kind: "topup",
      refId: topup.id,
    });
    if (verdict.result === "paid") await confirmTopupPaid(topup.id);
    else if (verdict.result === "failed") await failTopup(topup.id);
    else if (verdict.result === "mismatch") {
      console.error(`[tap] Charge ${chargeId} does not match top-up ${topup.id}: ${verdict.reason}. Not crediting; review manually.`);
    }
    return { kind: "topup", topupId: topup.id, result: verdict.result };
  }

  console.warn(`[tap] Charge ${chargeId} does not belong to any order or top-up`);
  return { kind: "unknown" };
}
