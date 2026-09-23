/*
 * End-to-end checks for checkout, fulfillment and the Stripe webhook. LOCAL DEVELOPMENT ONLY.
 *
 *   npx next dev -p 3100            # in another terminal, with STRIPE_SECRET_KEY empty (dev mode)
 *   npm run db:seed
 *   node --conditions=react-server --import tsx scripts/verify-payments.mts
 *   node --conditions=react-server --import tsx scripts/verify-payments.mts --cleanup-only
 *
 * (--conditions=react-server lets Node load modules that import "server-only".)
 * Every order/customer it creates uses an @nitro-qa.test email and is removed at the end;
 * stock sold to those orders is put back to AVAILABLE.
 */
import { existsSync } from "node:fs";

if (existsSync(".env") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env");

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const QA_DOMAIN = "nitro-qa.test";
const RUN = Date.now().toString(36);
// The webhook handler is imported in-process; these are fake, local-only values
const WEBHOOK_SECRET = "whsec_local_verification_only";
process.env.STRIPE_SECRET_KEY = "sk_test_local_verification_only";
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE_URL)) {
  console.error(`Refusing to run against ${BASE_URL}: local development only.`);
  process.exit(1);
}

const { prisma } = await import("@/lib/prisma");
const { fulfillOrder } = await import("@/lib/fulfillment");
const { randomToken } = await import("@/lib/crypto");
const { getStripe } = await import("@/lib/stripe");
const { POST: webhookPOST } = await import("@/app/api/stripe/webhook/route");

let failures = 0;
function check(condition: boolean, label: string, detail?: unknown) {
  if (condition) console.log(`  PASS  ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}`, detail ?? "");
  }
}

let ipCounter = 0;
async function checkout(body: unknown, ip = `10.77.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`) {
  const res = await fetch(`${BASE_URL}/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  return { status: res.status, ...json };
}

let emailCounter = 0;
const qaEmail = () => `QA+${RUN}-${++emailCounter}@${QA_DOMAIN}`; // upper case on purpose: must be lowercased

async function variantId(productSlug: string, label: string) {
  const v = await prisma.productVariant.findFirst({ where: { product: { slug: productSlug }, label } });
  if (!v) throw new Error(`Variant not found: ${productSlug} / ${label}. Run npm run db:seed first.`);
  return v.id;
}

const available = (id: string) => prisma.inventoryItem.count({ where: { variantId: id, status: "AVAILABLE" } });
const orderIdFromUrl = (url?: string) => url?.match(/^\/order\/([^?]+)\?token=(.+)$/);

async function cleanup() {
  const orders = await prisma.order.findMany({
    where: { customer: { email: { endsWith: `@${QA_DOMAIN}` } } },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);
  const restocked = await prisma.inventoryItem.updateMany({
    where: { orderItem: { orderId: { in: orderIds } } },
    data: { status: "AVAILABLE", soldAt: null, orderItemId: null },
  });
  const deletedOrders = await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  const deletedCustomers = await prisma.customer.deleteMany({ where: { email: { endsWith: `@${QA_DOMAIN}` } } });
  console.log(
    `Cleanup: ${deletedOrders.count} orders, ${deletedCustomers.count} customers removed; ${restocked.count} stock units restocked`,
  );
}

async function createPendingOrder(variant: string, quantity: number, stripeSessionId?: string) {
  const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant }, include: { product: true } });
  const customer = await prisma.customer.create({ data: { email: qaEmail().toLowerCase() } });
  return prisma.order.create({
    data: {
      accessToken: randomToken(),
      customerId: customer.id,
      totalCents: v.priceCents * quantity,
      currency: v.currency,
      stripeSessionId,
      items: {
        create: {
          variantId: v.id,
          productName: v.product.name,
          variantLabel: v.label,
          productType: v.product.type,
          quantity,
          unitPriceCents: v.priceCents,
        },
      },
    },
  });
}

async function main() {
  if (process.argv.includes("--cleanup-only")) return;

  console.log(`\n# Health (${BASE_URL})`);
  const health = await fetch(`${BASE_URL}/api/health`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  check(health?.ok === true, "GET /api/health returns { ok: true }", health);

  console.log("\n# Valid dev-mode order is delivered from stock");
  const ps10 = await variantId("playstation-store-card", "10 دولار");
  const fortnite = await variantId("fortnite-account", "حساب مع 50+ سكن");
  const ps10Before = await available(ps10);
  const email = qaEmail();
  const ok = await checkout({ email, items: [{ variantId: ps10, quantity: 1 }, { variantId: fortnite, quantity: 1 }, { variantId: ps10, quantity: 1 }] });
  const match = orderIdFromUrl(ok.url);
  check(ok.status === 200 && !!match, "returns 200 with /order/<id>?token=<token>", ok);
  if (match) {
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: match[1] },
      include: { customer: true, items: { include: { inventoryItems: true } } },
    });
    check(order.accessToken === decodeURIComponent(match[2]), "URL token is the order's accessToken");
    check(order.customer.email === email.toLowerCase(), "customer email stored lowercased");
    check(order.status === "FULFILLED" && !!order.paidAt && !!order.fulfilledAt, "order is FULFILLED with paidAt/fulfilledAt", order.status);
    check(order.items.length === 2, "duplicate variant lines merged into one order item", order.items.length);
    const psItem = order.items.find((i) => i.variantId === ps10);
    check(psItem?.quantity === 2 && psItem.inventoryItems.length === 2, "merged line quantity 2 got 2 codes");
    check(
      order.items.every((i) => i.deliveredAt && i.inventoryItems.length === i.quantity && i.inventoryItems.every((u) => u.status === "SOLD" && u.soldAt)),
      "every item delivered with SOLD inventory linked",
    );
    check(order.totalCents === order.items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0), "total computed from DB prices");
    check((await available(ps10)) === ps10Before - 2, "stock decreased by 2");
  }

  console.log("\n# SERVICE order waits for manual delivery");
  const logo = await variantId("pro-logo-design", "الباقة الأساسية - تصميمان");
  const svc = await checkout({ email: qaEmail(), items: [{ variantId: logo, quantity: 1 }] });
  const svcId = orderIdFromUrl(svc.url)?.[1];
  const svcOrder = svcId ? await prisma.order.findUnique({ where: { id: svcId }, include: { items: true } }) : null;
  check(svcOrder?.status === "PAID" && svcOrder.items[0]?.deliveredAt === null, "SERVICE-only order stays PAID, item undelivered", svcOrder?.status);

  console.log("\n# Validation");
  const steam5 = await variantId("steam-wallet-card", "5 دولار");
  const inStock = await available(steam5);
  const over = await checkout({ email: qaEmail(), items: [{ variantId: steam5, quantity: inStock + 1 }] });
  check(over.status === 409 && /المتوفر حالياً: \d+/.test(over.error ?? ""), `quantity ${inStock + 1} > stock ${inStock} rejected (409)`, over);
  console.log(`        error: ${over.error}`);
  const half = Math.ceil((inStock + 1) / 2);
  const merged = await checkout({ email: qaEmail(), items: [{ variantId: steam5, quantity: half }, { variantId: steam5, quantity: half }] });
  check(merged.status === 409, "duplicate lines are merged before the stock check (409)", merged);
  const tooMany = await checkout({ email: qaEmail(), items: [{ variantId: steam5, quantity: 11 }] });
  check(tooMany.status === 400 && !!tooMany.error, "quantity 11 rejected (400)", tooMany);
  const badEmail = await checkout({ email: "not-an-email", items: [{ variantId: steam5, quantity: 1 }] });
  check(badEmail.status === 400 && !!badEmail.error, "invalid email rejected (400)", badEmail);
  const empty = await checkout({ email: qaEmail(), items: [] });
  check(empty.status === 400, "empty cart rejected (400)", empty);
  const unknown = await checkout({ email: qaEmail(), items: [{ variantId: "does-not-exist", quantity: 1 }] });
  check(unknown.status === 400, "unknown variant rejected (400)", unknown);
  const notJson = await fetch(`${BASE_URL}/api/checkout`, { method: "POST", body: "{oops", headers: { "X-Forwarded-For": "10.78.0.1" } });
  check(notJson.status === 400, "malformed JSON rejected (400)");

  console.log("\n# Concurrency: 10 simultaneous checkouts for a variant with 5 codes");
  const steam50 = await variantId("steam-wallet-card", "50 دولار");
  const stockBefore = await available(steam50);
  check(stockBefore === 5, `variant starts with 5 AVAILABLE codes (has ${stockBefore})`);
  const results = await Promise.all(
    Array.from({ length: 10 }, () => checkout({ email: qaEmail(), items: [{ variantId: steam50, quantity: 1 }] })),
  );
  const statusCounts = results.reduce<Record<number, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
  console.log(`        HTTP statuses: ${JSON.stringify(statusCounts)}`);
  const concurrentIds = results.map((r) => orderIdFromUrl(r.url)?.[1]).filter((id): id is string => !!id);
  const concurrentOrders = await prisma.order.findMany({
    where: { id: { in: concurrentIds } },
    include: { items: { include: { inventoryItems: true } } },
  });
  const byStatus = concurrentOrders.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.status]: (acc[o.status] ?? 0) + 1 }), {});
  console.log(`        order statuses: ${JSON.stringify(byStatus)}`);
  const soldUnits = concurrentOrders.flatMap((o) => o.items.flatMap((i) => i.inventoryItems.map((u) => u.id)));
  check(new Set(soldUnits).size === soldUnits.length, "no inventory unit assigned to two order items");
  check(soldUnits.length === 5, `exactly 5 units delivered (got ${soldUnits.length})`);
  check((byStatus.FULFILLED ?? 0) === 5, "exactly 5 orders FULFILLED");
  check(
    concurrentOrders.every((o) => o.items.every((i) => i.inventoryItems.length === 0 || i.inventoryItems.length === i.quantity)),
    "no order item over- or partially delivered",
  );
  check(
    concurrentOrders.filter((o) => o.status !== "FULFILLED").every((o) => o.status === "PAID" && o.items.every((i) => !i.deliveredAt)),
    "orders that lost the race stay PAID with nothing delivered (manual delivery)",
  );
  const variantSold = await prisma.inventoryItem.count({ where: { variantId: steam50, status: "SOLD" } });
  const variantSoldLinked = await prisma.inventoryItem.count({ where: { variantId: steam50, status: "SOLD", orderItemId: { not: null } } });
  check(variantSold === 5 && variantSoldLinked === 5 && (await available(steam50)) === 0, "DB: 5 SOLD (all linked), 0 AVAILABLE");

  console.log("\n# Concurrent fulfillOrder() on one order (webhook retries + admin retry)");
  const ps25 = await variantId("playstation-store-card", "25 دولار");
  const retryOrder = await createPendingOrder(ps25, 2);
  await prisma.order.update({ where: { id: retryOrder.id }, data: { status: "PAID", paidAt: new Date() } });
  const infoLog = console.info;
  let emails = 0;
  console.info = (...args: unknown[]) => {
    if (String(args[0]).startsWith("[email]")) emails++;
    else infoLog(...args);
  };
  await Promise.all(Array.from({ length: 8 }, () => fulfillOrder(retryOrder.id)));
  console.info = infoLog;
  const afterRetry = await prisma.order.findUniqueOrThrow({ where: { id: retryOrder.id }, include: { items: { include: { inventoryItems: true } } } });
  check(afterRetry.status === "FULFILLED", "order FULFILLED");
  check(afterRetry.items[0].inventoryItems.length === 2, `exactly 2 units assigned (got ${afterRetry.items[0].inventoryItems.length})`);
  check(emails === 1, `delivery email sent exactly once (got ${emails})`);

  console.log("\n# Stripe webhook handler (signed test events, in-process)");
  const stripe = getStripe();
  const sendEvent = async (type: string, session: Record<string, unknown>, secret = WEBHOOK_SECRET) => {
    const payload = JSON.stringify({ id: `evt_${randomToken(8)}`, object: "event", type, data: { object: { object: "checkout.session", ...session } } });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const res = await webhookPOST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": header } }));
    return res.status;
  };
  const ps50 = await variantId("playstation-store-card", "50 دولار");
  const paidSession = `cs_test_${randomToken(8)}`;
  const webhookOrder = await createPendingOrder(ps50, 1, paidSession);
  const sessionObj = {
    id: paidSession,
    metadata: { orderId: webhookOrder.id },
    client_reference_id: webhookOrder.id,
    payment_status: "paid",
    amount_total: webhookOrder.totalCents,
    currency: "usd",
    payment_intent: "pi_test_123",
  };
  check((await sendEvent("checkout.session.completed", sessionObj, "whsec_wrong")) === 400, "bad signature -> 400");
  check((await prisma.order.findUniqueOrThrow({ where: { id: webhookOrder.id } })).status === "PENDING", "order untouched after bad signature");
  check((await sendEvent("checkout.session.completed", { ...sessionObj, payment_status: "unpaid" })) === 200, "unpaid completed session -> 200");
  check((await prisma.order.findUniqueOrThrow({ where: { id: webhookOrder.id } })).status === "PENDING", "unpaid session does not mark the order paid");
  const statuses = await Promise.all([1, 2, 3].map(() => sendEvent("checkout.session.completed", sessionObj)));
  check(statuses.every((s) => s === 200), "paid session (sent 3x concurrently) -> 200");
  const paidOrder = await prisma.order.findUniqueOrThrow({ where: { id: webhookOrder.id }, include: { items: { include: { inventoryItems: true } } } });
  check(paidOrder.status === "FULFILLED" && paidOrder.stripePaymentIntent === "pi_test_123", "order FULFILLED, payment intent stored");
  check(paidOrder.items[0].inventoryItems.length === 1, "exactly 1 unit delivered despite duplicate events");
  const discord = await variantId("discord-nitro", "شهر واحد");
  const expiredSession = `cs_test_${randomToken(8)}`;
  const expiredOrder = await createPendingOrder(discord, 1, expiredSession);
  check((await sendEvent("checkout.session.expired", { id: expiredSession, metadata: { orderId: expiredOrder.id }, payment_status: "unpaid" })) === 200, "expired session -> 200");
  check((await prisma.order.findUniqueOrThrow({ where: { id: expiredOrder.id } })).status === "FAILED", "expired session marks PENDING order FAILED");
  const mismatch = await sendEvent("checkout.session.completed", { ...sessionObj, id: `cs_test_${randomToken(8)}` });
  check(mismatch === 200, "session id not matching the order is ignored (200)");

  console.log("\n# Rate limit (10/min per IP)");
  const limited: number[] = [];
  const rateLimitIp = `10.79.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  for (let i = 0; i < 11; i++) limited.push((await checkout({}, rateLimitIp)).status);
  check(limited.slice(0, 10).every((s) => s === 400) && limited[10] === 429, "11th request from one IP -> 429", limited);
}

try {
  await main();
} catch (err) {
  failures++;
  console.error(err);
} finally {
  await cleanup();
  await prisma.$disconnect();
}
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
