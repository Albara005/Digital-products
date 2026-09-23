import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe, isStripeEnabled } from "@/lib/stripe";
import { fulfillOrder, markOrderPaid } from "@/lib/fulfillment";

// Raw body + Node crypto for signature verification; never cached
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function orderIdOf(session: Stripe.Checkout.Session): string | null {
  return session.metadata?.orderId || session.client_reference_id || null;
}

function paymentIntentOf(session: Stripe.Checkout.Session): string | undefined {
  const pi = session.payment_intent;
  if (!pi) return undefined;
  return typeof pi === "string" ? pi : pi.id;
}

/** Loads the order a session belongs to, refusing sessions that don't match what we created. */
async function findOrderForSession(session: Stripe.Checkout.Session) {
  const orderId = orderIdOf(session);
  if (!orderId) return null;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, totalCents: true, currency: true, stripeSessionId: true },
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

async function handlePaid(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
    return; // async payment methods: wait for checkout.session.async_payment_succeeded
  }
  const order = await findOrderForSession(session);
  if (!order) return;

  await markOrderPaid(order.id, { stripeSessionId: session.id, paymentIntent: paymentIntentOf(session) });

  const amountMatches =
    session.amount_total === order.totalCents && session.currency?.toUpperCase() === order.currency.toUpperCase();
  if (!amountMatches) {
    console.error(
      `[stripe] Order ${order.id}: paid ${session.amount_total} ${session.currency} but order total is ` +
        `${order.totalCents} ${order.currency}. Not delivering automatically; review manually.`,
    );
    return;
  }

  // Runs for retries too: fulfillOrder is idempotent and picks up anything not yet delivered
  await fulfillOrder(order.id);
}

async function handleFailed(session: Stripe.Checkout.Session) {
  const order = await findOrderForSession(session);
  if (!order) return;
  await prisma.order.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "FAILED" } });
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
      case "checkout.session.async_payment_succeeded":
        await handlePaid(event.data.object);
        break;
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
