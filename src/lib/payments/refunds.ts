import "server-only";
import type { PaymentProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { siteUrl } from "@/lib/email";
import { formatPrice } from "@/lib/format";
import { releaseOrderReservations } from "@/lib/fulfillment";
import { notifyAdmin } from "@/lib/notify";
import { cancelReferralRewardInTx } from "@/lib/referrals";
import { creditWallet, orderWalletNetDebit } from "@/lib/wallet";
import { getProvider } from "./providers";
import { PaymentProviderError, type RefundReceipt } from "./types";

export type RefundMethod = "ORIGINAL" | "WALLET";
export type RefundResult = { ok: true; refundedCents: number } | { ok: false; error: string };

const ORDER_ID = /^[A-Za-z0-9_-]{1,64}$/;
// The order row stays locked while the gateway is called; bounded by the provider timeouts.
const REFUND_TX = { maxWait: 10_000, timeout: 90_000 } as const;

type OrderRow = {
  status: string;
  customerId: string;
  totalCents: number;
  walletAppliedCents: number;
  currency: string;
  paymentProvider: PaymentProvider | null;
  stripeSessionId: string | null;
  stripePaymentIntent: string | null;
  tapChargeId: string | null;
};

/** Orders from before paymentProvider existed: infer from the stored references. */
function providerOf(order: OrderRow): PaymentProvider {
  if (order.paymentProvider) return order.paymentProvider;
  if (order.tapChargeId) return "TAP";
  if (order.stripeSessionId || order.stripePaymentIntent) return "STRIPE";
  return "DEV";
}

class RefundRejected extends Error {}

/**
 * Refunds a PAID or FULFILLED order, once.
 *
 * - ORIGINAL: the part charged by the gateway goes back through Stripe/Tap (API refund), and the
 *   part paid from the wallet goes back to the wallet.
 * - WALLET: the whole order value is credited to the customer's wallet as store credit; no
 *   gateway call.
 *
 * Runs in one transaction holding the order row lock (SELECT ... FOR UPDATE), so a double click or
 * two admins serialize: the second call sees REFUNDED and changes nothing. The order becomes
 * REFUNDED with refundedAt, still-RESERVED stock goes back on sale (SOLD codes stay with the
 * order), and the action is audited. A gateway error rolls everything back.
 */
export async function refundOrderPayment(
  orderId: string,
  opts: { method: RefundMethod; actor: AuditActor },
): Promise<RefundResult> {
  if (opts.method !== "ORIGINAL" && opts.method !== "WALLET") return { ok: false, error: "طريقة الاسترجاع غير صالحة." };
  if (!ORDER_ID.test(orderId)) return { ok: false, error: "الطلب غير موجود." };

  // Set once the gateway accepted a refund, so a later failure is reported, not lost
  let gatewayRefund: RefundReceipt | null = null;

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<OrderRow[]>`
        SELECT status::text AS status, "customerId", "totalCents", "walletAppliedCents", currency,
               "paymentProvider"::text AS "paymentProvider", "stripeSessionId", "stripePaymentIntent", "tapChargeId"
        FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      const order = rows[0];
      if (!order) throw new RefundRejected("الطلب غير موجود.");
      if (order.status === "REFUNDED") throw new RefundRejected("تم استرجاع هذا الطلب مسبقاً.");
      if (order.status !== "PAID" && order.status !== "FULFILLED") {
        throw new RefundRejected("يمكن استرجاع الطلبات المدفوعة أو المسلّمة فقط.");
      }

      const provider = providerOf(order);
      const gatewayCents = provider === "WALLET" ? 0 : Math.max(0, order.totalCents - order.walletAppliedCents);
      // What the wallet actually paid for this order (normally walletAppliedCents)
      const walletPaidCents = Math.max(0, await orderWalletNetDebit(tx, orderId));

      let walletCreditCents: number;
      if (opts.method === "ORIGINAL") {
        if (gatewayCents > 0 && (provider === "STRIPE" || provider === "TAP")) {
          if (provider === "TAP" && !order.tapChargeId) {
            throw new RefundRejected("لا يوجد مرجع دفع Tap لهذا الطلب. استخدم الاسترجاع إلى المحفظة.");
          }
          if (provider === "STRIPE" && !order.stripePaymentIntent && !order.stripeSessionId) {
            throw new RefundRejected("لا يوجد مرجع دفع Stripe لهذا الطلب. استخدم الاسترجاع إلى المحفظة.");
          }
          const adapter = getProvider(provider);
          if (!adapter.isEnabled()) {
            throw new RefundRejected(`بوابة الدفع ${provider === "TAP" ? "Tap" : "Stripe"} غير مُعدّة على الخادم. استخدم الاسترجاع إلى المحفظة.`);
          }
          gatewayRefund = await adapter.refund({
            orderId,
            amountMinor: gatewayCents,
            currency: order.currency,
            stripePaymentIntent: order.stripePaymentIntent,
            stripeSessionId: order.stripeSessionId,
            tapChargeId: order.tapChargeId,
          });
        }
        walletCreditCents = walletPaidCents;
      } else {
        walletCreditCents = gatewayCents + walletPaidCents;
      }

      const shortId = orderId.slice(-8).toUpperCase();
      if (walletCreditCents > 0) {
        await creditWallet(tx, order.customerId, walletCreditCents, {
          type: "REFUND",
          orderId,
          note: opts.method === "WALLET" ? `استرجاع الطلب #${shortId} كرصيد في المحفظة` : `استرجاع الجزء المدفوع من المحفظة للطلب #${shortId}`,
        });
      }

      const updated = await tx.order.updateMany({
        where: { id: orderId, status: { in: ["PAID", "FULFILLED"] } },
        data: { status: "REFUNDED", refundedAt: new Date() },
      });
      if (updated.count !== 1) throw new Error(`Order ${orderId} changed while locked`);
      const releasedUnits = await releaseOrderReservations(orderId, tx);
      // A referral reward not yet credited is cancelled with the refund; a credited one stays
      // with the referrer (no claw-back) and is only noted in the audit row.
      const referralReward = await cancelReferralRewardInTx(tx, orderId);

      return {
        provider,
        currency: order.currency,
        gatewayCents: opts.method === "ORIGINAL" ? gatewayCents : 0,
        walletCreditCents,
        refundedCents: (opts.method === "ORIGINAL" ? gatewayCents : 0) + walletCreditCents,
        releasedUnits,
        referralReward,
      };
    }, REFUND_TX);

    const receipt = gatewayRefund as RefundReceipt | null;
    await audit(opts.actor, "order.refund", { type: "order", id: orderId }, {
      method: opts.method,
      provider: outcome.provider,
      currency: outcome.currency,
      refundedCents: outcome.refundedCents,
      gatewayCents: outcome.gatewayCents,
      walletCreditCents: outcome.walletCreditCents,
      releasedUnits: outcome.releasedUnits,
      referralReward: outcome.referralReward,
      gatewayRefundId: receipt?.refundId ?? null,
      gatewayRefundStatus: receipt?.status ?? null,
      // Dev-mode orders were never charged: an ORIGINAL refund has nothing to send back
      ...(outcome.provider === "DEV" && opts.method === "ORIGINAL" ? { simulated: true } : {}),
    });
    void notifyAdmin(
      "refund.done",
      `↩️ استرجاع الطلب #${orderId.slice(-8).toUpperCase()} بقيمة ${formatPrice(outcome.refundedCents, outcome.currency)} ` +
        `(${opts.method === "WALLET" ? "إلى المحفظة" : "إلى وسيلة الدفع"})\n${siteUrl()}/admin/orders/${orderId}`,
    );
    return { ok: true, refundedCents: outcome.refundedCents };
  } catch (err) {
    if (err instanceof RefundRejected) return { ok: false, error: err.message };

    const receipt = gatewayRefund as RefundReceipt | null;
    if (receipt) {
      // Money went back through the gateway but the order could not be updated: make it visible
      console.error(`[refund] Order ${orderId}: gateway refund ${receipt.refundId} succeeded but saving failed`, err);
      await audit(opts.actor, "order.refund_unrecorded", { type: "order", id: orderId }, {
        method: opts.method,
        gatewayRefundId: receipt.refundId,
        gatewayRefundStatus: receipt.status,
      });
      return {
        ok: false,
        error: `تم الاسترجاع لدى بوابة الدفع (${receipt.refundId}) لكن تعذّر تحديث الطلب. لا تكرر العملية؛ راجع سجل النشاط.`,
      };
    }
    if (err instanceof PaymentProviderError) {
      console.error(`[refund] Order ${orderId}: ${err.message}`, err.cause ?? "");
      return { ok: false, error: "رفضت بوابة الدفع عملية الاسترجاع أو تعذّر الاتصال بها. لم يتغير شيء، حاول مجدداً أو استرجع إلى المحفظة." };
    }
    console.error(`[refund] Order ${orderId}: refund failed`, err);
    return { ok: false, error: "تعذّر تنفيذ الاسترجاع، لم يتغير شيء. حاول مرة أخرى." };
  }
}
