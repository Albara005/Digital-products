/*
 * End-to-end checks for checkout, stock reservation, fulfillment and the Stripe webhook.
 * LOCAL DEVELOPMENT ONLY.
 *
 *   npx next dev -p 3100            # in another terminal, with STRIPE_SECRET_KEY empty (dev mode)
 *   npm run db:seed
 *   node --conditions=react-server --import tsx scripts/verify-payments.mts
 *   node --conditions=react-server --import tsx scripts/verify-payments.mts --cleanup-only
 *
 * (--conditions=react-server lets Node load modules that import "server-only".)
 * HTTP checks go to the dev server (dev mode). Stripe-mode checks import the route handlers
 * in-process with fake keys: webhooks are signed locally, and session creation fails because the
 * key is fake, which exercises the failure path.
 * Every order/customer it creates uses an @nitro-qa.test email and is removed at the end;
 * stock sold or reserved for those orders is put back to AVAILABLE.
 */
import { existsSync } from "node:fs";

if (existsSync(".env") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env");

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const QA_DOMAIN = "nitro-qa.test";
const RUN = Date.now().toString(36);
// Route handlers are imported in-process with these fake, local-only values
const WEBHOOK_SECRET = "whsec_local_verification_only";
process.env.STRIPE_SECRET_KEY = "sk_test_local_verification_only";
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE_URL)) {
  console.error(`Refusing to run against ${BASE_URL}: local development only.`);
  process.exit(1);
}

const { prisma } = await import("@/lib/prisma");
const { fulfillOrder, reserveStock, RESERVATION_TTL_MINUTES } = await import("@/lib/fulfillment");
const { randomToken } = await import("@/lib/crypto");
const { getStripe } = await import("@/lib/stripe");
const { POST: webhookPOST } = await import("@/app/api/stripe/webhook/route");
const { POST: checkoutPOST } = await import("@/app/api/checkout/route");

let failures = 0;
function check(condition: boolean, label: string, detail?: unknown) {
  if (condition) console.log(`  PASS  ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}`, detail ?? "");
  }
}

const ipBase = `10.${77 + Math.floor(Math.random() * 100)}`;
let ipCounter = 0;
const nextIp = () => `${ipBase}.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

async function checkout(body: unknown, ip = nextIp()) {
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
const unitsOf = (orderId: string) =>
  prisma.inventoryItem.findMany({ where: { orderItem: { orderId } }, select: { id: true, status: true }, orderBy: { id: "asc" } });
const statusOf = async (orderId: string) => (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status;
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

/** A PENDING order with its stock reserved, exactly as checkout creates it in Stripe mode. */
async function createReservedOrder(variant: string, quantity: number, stripeSessionId?: string) {
  const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant }, include: { product: true } });
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({ data: { email: qaEmail().toLowerCase() } });
    const order = await tx.order.create({
      data: {
        accessToken: randomToken(),
        customerId: customer.id,
        totalCents: v.priceCents * quantity,
        totalUsdCents: v.priceCents * quantity,
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
      include: { items: true },
    });
    await reserveStock(tx, order.items[0]);
    return order;
  });
}

async function main() {
  if (process.argv.includes("--cleanup-only")) return;

  console.log(`\n# Health (${BASE_URL})`);
  const health = await fetch(`${BASE_URL}/api/health`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  check(health?.ok === true, "GET /api/health returns { ok: true }", health);

  console.log("\n# Valid dev-mode order: reserve -> pay -> deliver");
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
      "every item delivered, all linked units SOLD (none left RESERVED)",
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
  const notJson = await fetch(`${BASE_URL}/api/checkout`, { method: "POST", body: "{oops", headers: { "X-Forwarded-For": nextIp() } });
  check(notJson.status === 400, "malformed JSON rejected (400)");
  check((await available(steam5)) === inStock, "rejected checkouts reserved nothing");

  console.log("\n# Concurrency: 10 simultaneous checkouts for a variant with 5 codes");
  const steam50 = await variantId("steam-wallet-card", "50 دولار");
  const stockBefore = await available(steam50);
  check(stockBefore === 5, `variant starts with 5 AVAILABLE codes (has ${stockBefore})`);
  const customersBefore = await prisma.customer.count({ where: { email: { endsWith: `@${QA_DOMAIN}` } } });
  const results = await Promise.all(
    Array.from({ length: 10 }, () => checkout({ email: qaEmail(), items: [{ variantId: steam50, quantity: 1 }] })),
  );
  const statusCounts = results.reduce<Record<number, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
  console.log(`        HTTP statuses: ${JSON.stringify(statusCounts)}`);
  console.log(`        409 message: ${results.find((r) => r.status === 409)?.error}`);
  check(statusCounts[200] === 5 && statusCounts[409] === 5, "exactly 5 x 200 and 5 x 409");
  const concurrentIds = results.map((r) => orderIdFromUrl(r.url)?.[1]).filter((id): id is string => !!id);
  const concurrentOrders = await prisma.order.findMany({
    where: { id: { in: concurrentIds } },
    include: { items: { include: { inventoryItems: true } } },
  });
  const byStatus = concurrentOrders.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.status]: (acc[o.status] ?? 0) + 1 }), {});
  console.log(`        order statuses: ${JSON.stringify(byStatus)}`);
  const soldUnits = concurrentOrders.flatMap((o) => o.items.flatMap((i) => i.inventoryItems.map((u) => u.id)));
  check(new Set(soldUnits).size === soldUnits.length, "no inventory unit assigned to two order items");
  check(soldUnits.length === 5 && byStatus.FULFILLED === 5 && concurrentOrders.length === 5, "5 orders created, all FULFILLED with 1 unit each");
  const variantUnits = await prisma.inventoryItem.groupBy({ by: ["status"], where: { variantId: steam50 }, _count: { _all: true } });
  console.log(`        variant stock: ${JSON.stringify(Object.fromEntries(variantUnits.map((g) => [g.status, g._count._all])))}`);
  const sold = await prisma.inventoryItem.count({ where: { variantId: steam50, status: "SOLD", orderItemId: { not: null } } });
  const reservedLeft = await prisma.inventoryItem.count({ where: { variantId: steam50, status: "RESERVED" } });
  check(sold === 5 && reservedLeft === 0 && (await available(steam50)) === 0, "DB: 5 SOLD (all linked), 0 RESERVED, 0 AVAILABLE");
  const orphanCustomers = (await prisma.customer.count({ where: { email: { endsWith: `@${QA_DOMAIN}` } } })) - customersBefore;
  check(orphanCustomers === 5, `rejected checkouts wrote nothing (customers +${orphanCustomers}, expected +5)`);

  console.log("\n# Concurrent fulfillOrder() on one order (webhook retries + admin retry)");
  const ps25 = await variantId("playstation-store-card", "25 دولار");
  const retryOrder = await createReservedOrder(ps25, 2);
  const reservedIds = (await unitsOf(retryOrder.id)).map((u) => u.id);
  await prisma.order.update({ where: { id: retryOrder.id }, data: { status: "PAID", paidAt: new Date() } });
  const infoLog = console.info;
  let emails = 0;
  console.info = (...args: unknown[]) => {
    if (String(args[0]).startsWith("[email]")) emails++;
    else infoLog(...args);
  };
  await Promise.all(Array.from({ length: 8 }, () => fulfillOrder(retryOrder.id)));
  console.info = infoLog;
  const retryUnits = await unitsOf(retryOrder.id);
  check((await statusOf(retryOrder.id)) === "FULFILLED", "order FULFILLED");
  check(
    retryUnits.length === 2 && retryUnits.every((u) => u.status === "SOLD") && retryUnits.map((u) => u.id).join() === reservedIds.join(),
    "the 2 reserved units were promoted to SOLD, nothing else taken",
  );
  check(emails === 1, `delivery email sent exactly once (got ${emails})`);

  console.log("\n# Stripe webhook handler (signed test events, in-process)");
  const stripe = getStripe();
  const sendEvent = async (type: string, session: Record<string, unknown>, secret = WEBHOOK_SECRET) => {
    const payload = JSON.stringify({ id: `evt_${randomToken(8)}`, object: "event", type, data: { object: { object: "checkout.session", ...session } } });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const res = await webhookPOST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": header } }));
    return res.status;
  };
  const paidEvent = (order: { id: string; totalCents: number; stripeSessionId: string | null }) => ({
    id: order.stripeSessionId,
    metadata: { orderId: order.id },
    client_reference_id: order.id,
    payment_status: "paid",
    amount_total: order.totalCents,
    currency: "usd",
    payment_intent: `pi_test_${randomToken(6)}`,
  });

  const ps50 = await variantId("playstation-store-card", "50 دولار");
  const webhookOrder = await createReservedOrder(ps50, 1, `cs_test_${randomToken(8)}`);
  const webhookReserved = await unitsOf(webhookOrder.id);
  check(webhookReserved.length === 1 && webhookReserved[0].status === "RESERVED", "checkout-style order holds 1 RESERVED unit");
  const sessionObj = paidEvent(webhookOrder);
  check((await sendEvent("checkout.session.completed", sessionObj, "whsec_wrong")) === 400, "bad signature -> 400");
  check((await statusOf(webhookOrder.id)) === "PENDING", "order untouched after bad signature");
  check((await sendEvent("checkout.session.completed", { ...sessionObj, payment_status: "unpaid" })) === 200, "unpaid completed session -> 200");
  check((await statusOf(webhookOrder.id)) === "PENDING", "unpaid session does not mark the order paid");
  const statuses = await Promise.all([1, 2, 3].map(() => sendEvent("checkout.session.completed", sessionObj)));
  check(statuses.every((s) => s === 200), "paid session (sent 3x concurrently) -> 200");
  const paidOrder = await prisma.order.findUniqueOrThrow({ where: { id: webhookOrder.id } });
  const paidUnits = await unitsOf(webhookOrder.id);
  check(paidOrder.status === "FULFILLED" && paidOrder.stripePaymentIntent === sessionObj.payment_intent, "order FULFILLED, payment intent stored");
  check(paidUnits.length === 1 && paidUnits[0].id === webhookReserved[0].id && paidUnits[0].status === "SOLD", "the reserved unit was sold, once");
  const mismatch = await sendEvent("checkout.session.completed", { ...sessionObj, id: `cs_test_${randomToken(8)}` });
  check(mismatch === 200, "session id not matching the order is ignored (200)");

  console.log("\n# Releasing reservations");
  const discord = await variantId("discord-nitro", "شهر واحد");
  const discordBefore = await available(discord);
  const expiredOrder = await createReservedOrder(discord, 2, `cs_test_${randomToken(8)}`);
  check((await available(discord)) === discordBefore - 2, "reservation takes 2 units out of AVAILABLE");
  check((await sendEvent("checkout.session.expired", { id: expiredOrder.stripeSessionId, metadata: { orderId: expiredOrder.id }, payment_status: "unpaid" })) === 200, "checkout.session.expired -> 200");
  check((await statusOf(expiredOrder.id)) === "FAILED", "expired session marks the order FAILED");
  check((await unitsOf(expiredOrder.id)).length === 0 && (await available(discord)) === discordBefore, "expired session returns both units to AVAILABLE (unlinked)");

  const asyncOrder = await createReservedOrder(discord, 1, `cs_test_${randomToken(8)}`);
  check((await sendEvent("checkout.session.async_payment_failed", { id: asyncOrder.stripeSessionId, metadata: { orderId: asyncOrder.id }, payment_status: "unpaid" })) === 200, "async_payment_failed -> 200");
  check((await statusOf(asyncOrder.id)) === "FAILED" && (await available(discord)) === discordBefore, "async payment failure: FAILED + stock released");

  const staleOrder = await createReservedOrder(discord, 1, `cs_test_${randomToken(8)}`);
  const freshOrder = await createReservedOrder(discord, 1, `cs_test_${randomToken(8)}`);
  await prisma.order.update({
    where: { id: staleOrder.id },
    data: { createdAt: new Date(Date.now() - (RESERVATION_TTL_MINUTES + 5) * 60_000) },
  });
  check((await available(discord)) === discordBefore - 2, "stale + fresh pending orders hold 1 unit each");
  const trigger = await checkout({}); // any checkout request runs the stale sweep first
  check(trigger.status === 400, "a checkout request (even an invalid one) runs the sweep");
  check((await statusOf(staleOrder.id)) === "FAILED" && (await unitsOf(staleOrder.id)).length === 0, `PENDING order older than ${RESERVATION_TTL_MINUTES} min -> FAILED, stock released`);
  const freshUnits = await unitsOf(freshOrder.id);
  check((await statusOf(freshOrder.id)) === "PENDING" && freshUnits.length === 1 && freshUnits[0].status === "RESERVED", "fresh PENDING order keeps its reservation");
  check((await available(discord)) === discordBefore - 1, "exactly 1 unit returned to AVAILABLE");

  // A payment webhook arriving after the sweep still delivers (from AVAILABLE stock)
  check((await sendEvent("checkout.session.completed", paidEvent(staleOrder))) === 200, "late paid webhook for the swept order -> 200");
  const lateUnits = await unitsOf(staleOrder.id);
  check((await statusOf(staleOrder.id)) === "FULFILLED" && lateUnits.length === 1 && lateUnits[0].status === "SOLD", "late payment: FAILED -> PAID -> FULFILLED via AVAILABLE stock");

  console.log("\n# Stripe session creation failure releases the reservation (in-process checkout, Stripe mode)");
  const failEmail = qaEmail();
  const discordBeforeFail = await available(discord);
  const failRes = await checkoutPOST(
    new Request("http://localhost/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": nextIp() },
      body: JSON.stringify({ email: failEmail, items: [{ variantId: discord, quantity: 1 }] }),
    }),
  );
  const failJson = (await failRes.json()) as { error?: string };
  check(failRes.status === 502 && !!failJson.error, "Stripe error -> 502 with Arabic error", failJson);
  const failedOrder = await prisma.order.findFirst({ where: { customer: { email: failEmail.toLowerCase() } } });
  check(failedOrder?.status === "FAILED" && (await unitsOf(failedOrder.id)).length === 0, "order FAILED and its reservation released");
  check((await available(discord)) === discordBeforeFail, "stock back to where it was");

  console.log("\n# Rate limit (10/min per IP)");
  const limited: number[] = [];
  const rateLimitIp = nextIp();
  for (let i = 0; i < 11; i++) limited.push((await checkout({}, rateLimitIp)).status);
  check(limited.slice(0, 10).every((s) => s === 400) && limited[10] === 429, "11th request from one IP -> 429", limited);

  console.log("\n# Global invariants");
  const qaReserved = await prisma.inventoryItem.count({
    where: { status: "RESERVED", orderItem: { order: { status: { not: "PENDING" } } } },
  });
  check(qaReserved === 0, "no RESERVED unit belongs to a non-PENDING order");
  const badSold = await prisma.inventoryItem.count({ where: { status: "SOLD", OR: [{ orderItemId: null }, { soldAt: null }] } });
  check(badSold === 0, "every SOLD unit is linked to an order item and has soldAt");
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
