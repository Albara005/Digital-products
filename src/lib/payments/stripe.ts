import "server-only";
import type Stripe from "stripe";
import { getStripe, isStripeEnabled } from "@/lib/stripe";
import {
  PaymentProviderError,
  type CreatePaymentInput,
  type PaymentProviderAdapter,
  type PaymentSession,
  type RefundInput,
  type RefundReceipt,
} from "./types";

/*
 * Stripe Checkout (international cards). Sessions carry metadata { kind, orderId | topupId };
 * /api/stripe/webhook confirms them from signed events.
 */

// Stripe requires expires_at to be at least 30 minutes away; one extra minute absorbs clock skew.
// PENDING orders are failed after RESERVATION_TTL_MINUTES (35).
const SESSION_TTL_SECONDS = 31 * 60;
// Refunds run while the order row is locked: keep each call bounded.
const REFUND_REQUEST = { timeout: 15_000, maxNetworkRetries: 1 } as const;

function wrap(err: unknown, what: string): PaymentProviderError {
  if (err instanceof PaymentProviderError) return err;
  const status = typeof (err as { statusCode?: unknown })?.statusCode === "number" ? (err as { statusCode: number }).statusCode : 0;
  const message = err instanceof Error ? err.message : String(err);
  return new PaymentProviderError("STRIPE", `Stripe ${what}: ${message}`, status, { cause: err });
}

export async function createStripeCheckout(input: CreatePaymentInput): Promise<PaymentSession> {
  const currency = input.currency.toLowerCase();
  const itemised =
    input.lineItems &&
    input.lineItems.length > 0 &&
    input.lineItems.reduce((sum, line) => sum + line.unitAmountMinor * line.quantity, 0) === input.amountMinor;
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = itemised
    ? input.lineItems!.map((line) => ({
        quantity: line.quantity,
        price_data: {
          currency,
          unit_amount: line.unitAmountMinor,
          product_data: {
            name: line.name,
            ...(line.imageUrl?.startsWith("https://") ? { images: [line.imageUrl] } : {}),
          },
        },
      }))
    : [{ quantity: 1, price_data: { currency, unit_amount: input.amountMinor, product_data: { name: input.description } } }];
  const metadata = { kind: input.kind, [input.kind === "order" ? "orderId" : "topupId"]: input.refId };

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        line_items: lineItems,
        customer_email: input.email,
        client_reference_id: input.refId,
        metadata,
        payment_intent_data: { metadata, description: input.description },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
        locale: "auto",
      },
      { idempotencyKey: input.idempotencyKey },
    );
  } catch (err) {
    throw wrap(err, "session creation");
  }
  if (!session.url) throw new PaymentProviderError("STRIPE", `Stripe session ${session.id} has no URL`);
  return { ref: session.id, url: session.url };
}

export async function refundStripePayment(input: RefundInput): Promise<RefundReceipt> {
  const stripe = getStripe();
  try {
    let paymentIntent = input.stripePaymentIntent ?? null;
    if (!paymentIntent && input.stripeSessionId) {
      const session = await stripe.checkout.sessions.retrieve(input.stripeSessionId, undefined, REFUND_REQUEST);
      const pi = session.payment_intent;
      paymentIntent = typeof pi === "string" ? pi : (pi?.id ?? null);
    }
    if (!paymentIntent) throw new PaymentProviderError("STRIPE", `Order ${input.orderId} has no Stripe payment to refund`);

    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntent,
        amount: input.amountMinor,
        reason: "requested_by_customer",
        metadata: { orderId: input.orderId },
      },
      // Same key for a retried refund of the same order: Stripe returns the first refund instead of a second one
      { ...REFUND_REQUEST, idempotencyKey: `refund-${input.orderId}-${input.amountMinor}` },
    );
    if (refund.status === "failed" || refund.status === "canceled") {
      throw new PaymentProviderError("STRIPE", `Stripe refund ${refund.id} for order ${input.orderId} is ${refund.status}`);
    }
    return { refundId: refund.id, status: refund.status ?? "pending" };
  } catch (err) {
    throw wrap(err, "refund");
  }
}

export const stripeProvider: PaymentProviderAdapter = {
  id: "STRIPE",
  label: "بطاقة دولية (Stripe)",
  isEnabled: isStripeEnabled,
  createPayment: createStripeCheckout,
  refund: refundStripePayment,
};
