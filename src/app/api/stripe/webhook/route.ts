import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeEnabled } from "@/lib/stripe";
import { failPendingOrder, fulfillOrder, markOrderPaid } from "@/lib/fulfillment";
import { confirmTopupPaid, failTopup } from "@/lib/payments";

// Raw body + Node crypto for signature verification; never cached
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sessions created for wallet top-ups carry metadata.kind = "topup"; everything else is an order. */
function isTopup(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.kind === "topup";
}

function paymentIntentOf(session: Stripe.Checkout.Session): string | undefined {
  const pi = session.payment_intent;
  if (!pi) return undefined;
  return typeof pi === "string" ? pi : pi.id;
}

function isPaid(session: Stripe.Checkout.Session): boolean {
  // Async payment methods complete later: wait for checkout.session.async_payment_succeeded
  return session.payment_status === "paid" || session.payment_status === "no_payment_required";
}

/** Loads the order a session belongs to, refusing sessions that don't match what we created. */
async function findOrderForSession(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId || session.client_reference_id || null;
  if (!orderId) return null;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, totalCents: true, walletAppliedCents: true, currency: true, stripeSessionId: true },
  });
  if (!order) {
    console.warn(`[stripe] Session ${session.id} references unknown order ${orderId}`);
    return null;
  }
  if (order.stripeSessionId && order.stripeSessionId !== session.id) {
    console.warn(`[stripe] Session ${session.id} does not match order ${order.id} (expected ${order.stripeSessionId})`);
    return null;
  }
  return order;
}

async function findTopupForSession(session: Stripe.Checkout.Session) {
  const topupId = session.metadata?.topupId || session.client_reference_id || null;
  if (!topupId) return null;
  const topup = await prisma.walletTopup.findUnique({
    where: { id: topupId },
    select: { id: true, provider: true, amountCents: true, currency: true, providerRef: true },
  });
  if (!topup || topup.provider !== "STRIPE") {
    console.warn(`[stripe] Session ${session.id} references unknown top-up ${topupId}`);
    return null;
  }
  if (topup.providerRef && topup.providerRef !== session.id) {
    console.warn(`[stripe] Session ${session.id} does not match top-up ${topup.id} (expected ${topup.providerRef})`);
    return null;
  }
  return topup;
}

async function handleOrderPaid(session: Stripe.Checkout.Session) {
  const order = await findOrderForSession(session);
  if (!order) return;

  await markOrderPaid(order.id, { provider: "STRIPE", stripeSessionId: session.id, paymentIntent: paymentIntentOf(session) });

  // The session charged only what the wallet did not cover
  const amountDue = order.totalCents - order.walletAppliedCents;
  const amountMatches =
    session.amount_total === amountDue && session.currency?.toUpperCase() === order.currency.toUpperCase();
  if (!amountMatches) {
    console.error(
      `[stripe] Order ${order.id}: paid ${session.amount_total} ${session.currency} but amount due is ` +
        `${amountDue} ${order.currency}. Not delivering automatically; review manually.`,
    );
    return;
  }

  // Runs for retries too: fulfillOrder is idempotent and picks up anything not yet delivered
  await fulfillOrder(order.id);
}

async function handleTopupPaid(session: Stripe.Checkout.Session) {
  const topup = await findTopupForSession(session);
  if (!topup) return;
  const amountMatches =
    session.amount_total === topup.amountCents && session.currency?.toUpperCase() === topup.currency.toUpperCase();
  if (!amountMatches) {
    console.error(
      `[stripe] Top-up ${topup.id}: paid ${session.amount_total} ${session.currency} but expected ` +
        `${topup.amountCents} ${topup.currency}. Not crediting; review manually.`,
    );
    return;
  }
  // Credits the wallet exactly once, however many times the event is delivered
  await confirmTopupPaid(topup.id, { providerRef: session.id });
}

async function handleFailed(session: Stripe.Checkout.Session) {
  if (isTopup(session)) {
    const topup = await findTopupForSession(session);
    if (topup) await failTopup(topup.id);
    return;
  }
  const order = await findOrderForSession(session);
  if (!order) return;
  // PENDING -> FAILED: reserved stock, wallet debit and coupon use are released atomically
  await failPendingOrder(order.id);
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!isStripeEnabled() || !secret) {
    return Response.json({ error: "Stripe غير مُعد على الخادم" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "توقيع Stripe مفقود" }, { status: 400 });
  }

  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch (err) {
    console.warn("[stripe] Webhook signature verification failed", err instanceof Error ? err.message : err);
    return Response.json({ error: "توقيع Stripe غير صالح" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        if (!isPaid(session)) break;
        if (isTopup(session)) await handleTopupPaid(session);
        else await handleOrderPaid(session);
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        await handleFailed(event.data.object);
        break;
      default:
        break;
    }
  } catch (err) {
    // 500 makes Stripe retry later; every handler above is idempotent
    console.error(`[stripe] Failed to process ${event.type} (${event.id})`, err);
    return Response.json({ error: "تعذرت معالجة الحدث" }, { status: 500 });
  }

  return Response.json({ received: true });
}
