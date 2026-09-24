/*
 * Checks for the money layer: coupons, wallet, Tap Payments, wallet top-ups and refunds.
 * LOCAL DEVELOPMENT ONLY, on a scratch database (it creates and deletes coupons, customers, orders).
 *
 *   createdb nitro_pay_test && DATABASE_URL=.../nitro_pay_test npx prisma migrate deploy && npm run db:seed
 *   export DATABASE_URL=postgresql://nitro:nitro@localhost:5432/nitro_pay_test
 *   R="node --conditions=react-server --import tsx scripts/verify-money.mts"
 *
 *   $R --phase=unit   # no server: currency conversion, Tap verification (mocked fetch), coupon math,
 *                     # Stripe webhook for top-ups / partially wallet-paid orders (signed locally)
 *   npx next dev -p 3100                                  # no payment keys = dev mode
 *   $R --phase=dev    # dev-mode top-up, full-wallet purchase, dev checkout
 *   TAP_SECRET_KEY=sk_test_mock TAP_API_BASE=http://127.0.0.1:3199/v2 npx next dev -p 3100
 *   $R --phase=tap    # serves a mock Tap API on :3199: coupon/wallet concurrency, provider failure and
 *                     # expiry restore, late payment, Tap return/webhook verification, Tap top-up, refunds
 *
 * (--conditions=react-server lets Node load modules that import "server-only".)
 * Everything it creates uses @nitro-qa.test emails / QA coupon codes and is removed at the end.
 */
import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";

if (existsSync(".env") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env");

const PHASE = (process.argv.find((a) => a.startsWith("--phase="))?.split("=")[1] ?? "unit") as "unit" | "dev" | "tap";
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const QA_DOMAIN = "nitro-qa.test";
const RUN = Date.now().toString(36).toUpperCase();
const MOCK_PORT = 3199;
const MOCK_KEY = "sk_test_mock";
const WEBHOOK_SECRET = "whsec_local_verification_only";

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE_URL) || process.env.NODE_ENV === "production") {
  console.error("Refusing to run: local development only.");
  process.exit(1);
}
// In-process modules (refunds, Stripe webhook) talk to the mock Tap API and a fake Stripe key
process.env.TAP_SECRET_KEY = MOCK_KEY;
process.env.TAP_API_BASE = `http://127.0.0.1:${MOCK_PORT}/v2`;
process.env.STRIPE_SECRET_KEY = "sk_test_local_verification_only";
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

const { SignJWT } = await import("jose");
const { prisma } = await import("@/lib/prisma");
const { randomToken } = await import("@/lib/crypto");
const { reserveStock, RESERVATION_TTL_MINUTES } = await import("@/lib/fulfillment");
const wallet = await import("@/lib/wallet");
const pricing = await import("@/lib/pricing");
const currency = await import("@/lib/payments/currency");
const tap = await import("@/lib/payments/tap");
const payments = await import("@/lib/payments");

let failures = 0;
function check(condition: boolean, label: string, detail?: unknown) {
  if (condition) console.log(`  PASS  ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}`, detail === undefined ? "" : JSON.stringify(detail, null, 0)?.slice(0, 600));
  }
}
const section = (title: string) => console.log(`\n# ${title}`);

// ---------- helpers ----------
let counter = 0;
const qaEmail = () => `qa-money+${RUN.toLowerCase()}-${++counter}@${QA_DOMAIN}`;
const couponCode = (suffix: string) => `QA${RUN}${suffix}`.slice(0, 32);
const ipBase = `10.${120 + Math.floor(Math.random() * 100)}`;
let ipCounter = 0;
const nextIp = () => `${ipBase}.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function variantId(productSlug: string, label: string) {
  const v = await prisma.productVariant.findFirst({ where: { product: { slug: productSlug }, label } });
  if (!v) throw new Error(`Variant not found: ${productSlug} / ${label}. Run npm run db:seed first.`);
  return v.id;
}
const available = (id: string) => prisma.inventoryItem.count({ where: { variantId: id, status: "AVAILABLE" } });
const balanceOf = (customerId: string) => wallet.getWalletBalance(customerId);
const usedCountOf = async (code: string) => (await prisma.coupon.findUniqueOrThrow({ where: { code } })).usedCount;
const orderOf = (id: string) =>
  prisma.order.findUniqueOrThrow({ where: { id }, include: { items: { include: { inventoryItems: true } }, couponRedemption: true } });

async function createCustomer(balanceCents = 0) {
  const customer = await prisma.customer.create({ data: { email: qaEmail() } });
  if (balanceCents > 0) {
    await prisma.$transaction((tx) => wallet.creditWallet(tx, customer.id, balanceCents, { type: "ADJUSTMENT", note: "QA" }));
  }
  const token = await new SignJWT({ email: customer.email, kind: "customer" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(customer.id)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
  return { ...customer, cookie: `nitro_customer=${token}` };
}

/** Ledger invariant: balance == sum of ledger rows, no row ever below zero. */
async function ledgerConsistent(customerId: string) {
  const [customer, rows] = await Promise.all([
    prisma.customer.findUniqueOrThrow({ where: { id: customerId } }),
    prisma.walletTransaction.findMany({ where: { customerId } }),
  ]);
  const sum = rows.reduce((s, r) => s + r.amountCents, 0);
  return sum === customer.walletBalanceCents && customer.walletBalanceCents >= 0 && rows.every((r) => r.balanceAfterCents >= 0);
}

async function createCoupon(suffix: string, data: Partial<Parameters<typeof prisma.coupon.create>[0]["data"]> = {}) {
  return prisma.coupon.create({ data: { code: couponCode(suffix), type: "PERCENT", value: 10, ...data } });
}

async function api(path: string, init: { method?: string; body?: unknown; cookie?: string; ip?: string } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init.method ?? "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": init.ip ?? nextIp(),
      ...(init.cookie ? { Cookie: init.cookie } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  return { status: res.status, location: res.headers.get("location"), ...json };
}
const checkout = (body: unknown, cookie?: string) => api("/api/checkout", { body, cookie });
const orderIdFromUrl = (url?: string) => url?.match(/\/order\/([^?]+)\?token=/)?.[1];

async function cleanup() {
  const customers = await prisma.customer.findMany({ where: { email: { endsWith: `@${QA_DOMAIN}` } }, select: { id: true } });
  const customerIds = customers.map((c) => c.id);
  const orders = await prisma.order.findMany({ where: { customerId: { in: customerIds } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  const restocked = await prisma.inventoryItem.updateMany({
    where: { orderItem: { orderId: { in: orderIds } } },
    data: { status: "AVAILABLE", soldAt: null, orderItemId: null },
  });
  await prisma.walletTransaction.deleteMany({ where: { customerId: { in: customerIds } } });
  await prisma.walletTopup.deleteMany({ where: { customerId: { in: customerIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  const coupons = await prisma.coupon.deleteMany({ where: { code: { startsWith: `QA${RUN}` } } });
  console.log(`\nCleanup: ${orderIds.length} orders, ${customerIds.length} customers, ${coupons.count} coupons removed; ${restocked.count} units restocked`);
}

// ---------- mock Tap API ----------
type MockCharge = {
  id: string;
  object: "charge";
  status: string;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
  transaction: { url: string };
  [key: string]: unknown;
};
const mockTap = {
  charges: new Map<string, MockCharge>(),
  refunds: [] as { id: string; charge_id: string; amount: number; currency: string }[],
  lastChargeBody: null as Record<string, unknown> | null,
  failCreate: false,
  failRefund: false,
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}
function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function startMockTap() {
  const server = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${MOCK_KEY}`) return send(res, 401, { errors: [{ code: "1100", description: "Unauthorized" }] });
    const url = new URL(req.url ?? "/", "http://mock");
    const body = await readBody(req);
    if (req.method === "POST" && url.pathname === "/v2/charges") {
      if (mockTap.failCreate) return send(res, 500, { errors: [{ code: "5000", description: "Mock outage" }] });
      const input = JSON.parse(body) as Record<string, unknown>;
      mockTap.lastChargeBody = input;
      const id = `chg_TS${randomBytes(9).toString("hex")}`;
      const charge: MockCharge = {
        ...input,
        id,
        object: "charge",
        status: "INITIATED",
        amount: input.amount as number,
        currency: input.currency as string,
        metadata: input.metadata as Record<string, string>,
        transaction: { url: `https://tap.mock/pay/${id}` },
      };
      mockTap.charges.set(id, charge);
      return send(res, 200, charge);
    }
    const m = url.pathname.match(/^\/v2\/charges\/([^/]+)$/);
    if (req.method === "GET" && m) {
      const charge = mockTap.charges.get(decodeURIComponent(m[1]));
      return charge ? send(res, 200, charge) : send(res, 404, { errors: [{ code: "404", description: "Charge not found" }] });
    }
    if (req.method === "POST" && url.pathname === "/v2/refunds") {
      if (mockTap.failRefund) return send(res, 400, { errors: [{ code: "2001", description: "Refund declined" }] });
      const input = JSON.parse(body) as { charge_id: string; amount: number; currency: string };
      const charge = mockTap.charges.get(input.charge_id);
      const refunded = mockTap.refunds.filter((r) => r.charge_id === input.charge_id).reduce((s, r) => s + r.amount, 0);
      if (!charge || charge.status !== "CAPTURED" || refunded + input.amount > charge.amount + 1e-9) {
        return send(res, 400, { errors: [{ code: "2002", description: "Not refundable" }] });
      }
      const refund = { id: `re_TS${randomBytes(6).toString("hex")}`, charge_id: input.charge_id, amount: input.amount, currency: input.currency };
      mockTap.refunds.push(refund);
      return send(res, 200, { ...refund, object: "refund", status: "PENDING" });
    }
    send(res, 404, { errors: [{ code: "404", description: "Not found" }] });
  });
  await new Promise<void>((resolve) => server.listen(MOCK_PORT, "127.0.0.1", resolve));
  return server;
}

const tapWebhook = (id: string, extra: Record<string, unknown> = {}) => api("/api/tap/webhook", { body: { id, ...extra } });
const tapReturn = (id: string) => api(`/api/tap/return?tap_id=${encodeURIComponent(id)}`, { method: "GET" });
const chargeFor = async (orderId: string) => {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  return mockTap.charges.get(order.tapChargeId ?? "")!;
};

// ======================================================================
async function phaseUnit() {
  section("Currency conversion");
  check(currency.minorToMajor(1099, "USD") === 10.99, "1099 USD -> 10.99");
  check(currency.minorToMajor(1250, "KWD") === 1.25 && currency.minorToMajor(1, "kwd") === 0.001, "1250 KWD -> 1.25, 1 KWD fils -> 0.001");
  check(currency.minorToMajor(1005, "BHD") === 1.005 && currency.minorToMajor(7, "OMR") === 0.007, "BHD/OMR use 3 decimals");
  check(currency.minorToMajor(500, "JPY") === 500, "JPY has no decimals");
  check(currency.majorToMinor(10.99, "USD") === 1099 && currency.majorToMinor(0.1 + 0.2, "USD") === 30, "10.99 -> 1099, 0.1+0.2 -> 30 (float safe)");
  check(currency.majorToMinor("1.250", "KWD") === 1250 && currency.majorToMinor(1.005, "BHD") === 1005, "\"1.250\" KWD -> 1250 fils");
  check(currency.majorToMinor(10.005, "USD") === null && currency.majorToMinor("abc", "USD") === null && currency.majorToMinor(NaN, "USD") === null, "too precise / non-numeric -> null");
  let threw = false;
  try {
    currency.minorToMajor(10.5, "USD");
  } catch {
    threw = true;
  }
  check(threw, "minorToMajor rejects non-integer minor units");

  section("Tap charge verification (mocked fetch)");
  const realFetch = globalThis.fetch;
  const base = { id: "chg_TS0123456789", status: "CAPTURED", amount: 10.99, currency: "USD", metadata: { kind: "order", orderId: "ord_1" } };
  const expected = { chargeId: base.id, amountMinor: 1099, currency: "USD", kind: "order" as const, refId: "ord_1" };
  const seen: { url: string; auth: string | null; method: string; body?: string }[] = [];
  const mockFetch = (charge: unknown, status = 200) =>
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), auth: new Headers(init?.headers).get("authorization"), method: init?.method ?? "GET", body: init?.body as string | undefined });
      return new Response(JSON.stringify(charge), { status, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
  try {
    globalThis.fetch = mockFetch(base);
    const ok = await tap.verifyTapCharge(expected);
    check(ok.verdict.result === "paid", "CAPTURED + matching amount/currency/metadata -> paid", ok.verdict);
    check(seen[0]?.method === "GET" && seen[0].url.endsWith(`/v2/charges/${base.id}`) && seen[0].auth === `Bearer ${MOCK_KEY}`, "re-fetches GET /v2/charges/{id} with the secret key", seen[0]);

    globalThis.fetch = mockFetch({ ...base, amount: 10.98 });
    check((await tap.verifyTapCharge(expected)).verdict.result === "mismatch", "CAPTURED but amount 10.98 != 10.99 -> mismatch");
    globalThis.fetch = mockFetch({ ...base, amount: "10.990" });
    check((await tap.verifyTapCharge(expected)).verdict.result === "paid", "amount as string \"10.990\" -> paid");
    globalThis.fetch = mockFetch({ ...base, currency: "SAR" });
    check((await tap.verifyTapCharge(expected)).verdict.result === "mismatch", "currency mismatch -> mismatch");
    globalThis.fetch = mockFetch({ ...base, metadata: { kind: "order", orderId: "someone_else" } });
    check((await tap.verifyTapCharge(expected)).verdict.result === "mismatch", "metadata for another order -> mismatch");
    globalThis.fetch = mockFetch({ ...base, metadata: { kind: "topup", topupId: "ord_1" } });
    check((await tap.verifyTapCharge(expected)).verdict.result === "mismatch", "metadata kind topup for an order -> mismatch");
    globalThis.fetch = mockFetch({ ...base, status: "FAILED" });
    const failed = await tap.verifyTapCharge(expected);
    check(failed.verdict.result === "failed", "FAILED -> failed (not paid)", failed.verdict);
    globalThis.fetch = mockFetch({ ...base, status: "DECLINED", amount: 1 });
    check((await tap.verifyTapCharge(expected)).verdict.result === "failed", "DECLINED -> failed");
    globalThis.fetch = mockFetch({ ...base, status: "INITIATED" });
    check((await tap.verifyTapCharge(expected)).verdict.result === "pending", "INITIATED -> pending (no action)");
    globalThis.fetch = mockFetch({ ...base, currency: "KWD", amount: 1.25 });
    check((await tap.verifyTapCharge({ ...expected, currency: "KWD", amountMinor: 1250 })).verdict.result === "paid", "KWD 1.25 == 1250 fils -> paid");
    globalThis.fetch = mockFetch({ errors: [{ code: "1100", description: "Unauthorized" }] }, 401);
    let apiError: unknown = null;
    try {
      await tap.verifyTapCharge(expected);
    } catch (err) {
      apiError = err;
    }
    check(apiError instanceof payments.PaymentProviderError, "Tap HTTP 401 -> PaymentProviderError (never treated as paid)");
    check(tap.evaluateTapCharge({ ...base, id: "chg_TSother" }, expected).result === "mismatch", "different charge id -> mismatch");

    seen.length = 0;
    globalThis.fetch = mockFetch({ id: "chg_TSnew0001", status: "INITIATED", amount: 1.25, currency: "KWD", transaction: { url: "https://pay.tap.test/x" } });
    const created = await tap.createTapCharge({
      kind: "topup",
      refId: "top_1",
      amountMinor: 1250,
      currency: "KWD",
      email: "buyer@example.com",
      description: "test",
      successUrl: "",
      cancelUrl: "",
      idempotencyKey: "k",
    });
    const sent = JSON.parse(seen[0]?.body ?? "{}");
    check(created.ref === "chg_TSnew0001" && created.url === "https://pay.tap.test/x", "createTapCharge returns charge id + transaction.url");
    check(
      sent.amount === 1.25 && sent.currency === "KWD" && sent.source?.id === "src_all" && sent.metadata?.kind === "topup" &&
        sent.metadata?.topupId === "top_1" && sent.customer?.first_name === "buyer" && /\/api\/tap\/return$/.test(sent.redirect?.url) &&
        /\/api\/tap\/webhook$/.test(sent.post?.url) && sent.reference?.order === "top_1",
      "charge body: major-unit amount, src_all, redirect/post URLs, metadata, reference",
      sent,
    );
  } finally {
    globalThis.fetch = realFetch;
  }

  section("Coupon math (quoteCart)");
  const ps10 = await variantId("playstation-store-card", "10 دولار"); // 1099, game-cards
  const ps25 = await variantId("playstation-store-card", "25 دولار"); // 2649, game-cards
  const discord = await variantId("discord-nitro", "شهر واحد"); // 999, subscriptions
  const gameCards = await prisma.category.findUniqueOrThrow({ where: { slug: "game-cards" } });
  const discordProduct = await prisma.product.findUniqueOrThrow({ where: { slug: "discord-nitro" } });

  const capped = await createCoupon("CAP", { value: 20, maxDiscountCents: 300 });
  let q = await pricing.quoteCart({ items: [{ variantId: ps25, quantity: 1 }], couponCode: capped.code.toLowerCase() });
  check(q.ok && q.discountCents === 300 && q.totalCents === 2349 && q.coupon?.code === capped.code, "20% of 26.49 = 5.30 capped at 3.00; lowercase code accepted", q);
  q = await pricing.quoteCart({ items: [{ variantId: ps10, quantity: 1 }], couponCode: capped.code });
  check(q.ok && q.discountCents === 220, "20% of 10.99 = 2.198 -> 2.20 (under cap)", q.ok && q.discountCents);

  const byCategory = await createCoupon("CAT", { value: 50, categoryId: gameCards.id });
  q = await pricing.quoteCart({ items: [{ variantId: ps10, quantity: 1 }, { variantId: discord, quantity: 1 }], couponCode: byCategory.code });
  check(
    q.ok && q.discountCents === 550 && q.subtotalCents === 2098 && q.lines.find((l) => l.variantId === discord)?.discountCents === 0 &&
      q.lines.find((l) => l.variantId === ps10)?.discountCents === 550,
    "category scope: 50% only on the game-card line (5.50), none on Discord",
    q,
  );
  q = await pricing.quoteCart({ items: [{ variantId: discord, quantity: 1 }], couponCode: byCategory.code });
  check(q.ok && q.discountCents === 0 && !!q.couponError, "category scope, no matching line -> couponError, quote still ok", q.ok && q.couponError);

  const byProduct = await createCoupon("PRD", { type: "FIXED", value: 5000, productId: discordProduct.id });
  q = await pricing.quoteCart({ items: [{ variantId: ps10, quantity: 1 }, { variantId: discord, quantity: 2 }], couponCode: byProduct.code });
  check(q.ok && q.discountCents === 1998 && q.totalCents === 1099, "product scope FIXED $50 limited to eligible 2 x 9.99", q.ok && q.discountCents);

  const minSub = await createCoupon("MIN", { type: "FIXED", value: 500, minSubtotalCents: 2000 });
  q = await pricing.quoteCart({ items: [{ variantId: ps10, quantity: 1 }], couponCode: minSub.code });
  check(q.ok && q.discountCents === 0 && /20\.00/.test(q.couponError ?? ""), "min subtotal $20 not met -> couponError mentioning $20.00", q.ok && q.couponError);
  q = await pricing.quoteCart({ items: [{ variantId: ps10, quantity: 2 }], couponCode: minSub.code });
  check(q.ok && q.discountCents === 500 && q.totalCents === 1698, "min subtotal met (21.98) -> $5 off");

  const expired = await createCoupon("EXP", { endsAt: new Date(Date.now() - 60_000) });
  const future = await createCoupon("FUT", { startsAt: new Date(Date.now() + 3_600_000) });
  const inactive = await createCoupon("OFF", { active: false });
  const exhausted = await createCoupon("MAX", { maxUses: 2, usedCount: 2 });
  for (const [c, label] of [[expired, "expired"], [future, "not started"], [inactive, "inactive"], [exhausted, "maxUses reached"]] as const) {
    q = await pricing.quoteCart({ items: [{ variantId: ps10, quantity: 1 }], couponCode: c.code });
    check(q.ok && q.discountCents === 0 && q.totalCents === 1099 && !!q.couponError, `${label} coupon -> couponError, no discount`, q.ok && q.couponError);
  }
  q = await pricing.quoteCart({ items: [{ variantId: ps10, quantity: 1 }], couponCode: "NOPE-NOT-REAL" });
  check(q.ok && q.couponError === "كود الخصم غير صالح", "unknown code -> couponError");

  const perCustomer = await createCoupon("PER", { perCustomerLimit: 1 });
  const buyer = await createCustomer();
  const usedOrder = await prisma.order.create({
    data: { accessToken: randomToken(), customerId: buyer.id, status: "FULFILLED", totalCents: 100, totalUsdCents: 100, couponId: perCustomer.id, couponRedemption: { create: { couponId: perCustomer.id, customerEmail: buyer.email, discountCents: 10 } } },
  });
  q = await pricing.quoteCart({ items: [{ variantId: ps10, quantity: 1 }], couponCode: perCustomer.code, email: buyer.email.toUpperCase() });
  check(q.ok && !!q.couponError && q.discountCents === 0, "perCustomerLimit 1 already used by this email -> couponError", q.ok && q.couponError);
  await prisma.order.update({ where: { id: usedOrder.id }, data: { status: "FAILED" } });
  q = await pricing.quoteCart({ items: [{ variantId: ps10, quantity: 1 }], couponCode: perCustomer.code, email: buyer.email });
  check(q.ok && q.discountCents === 110 && !q.couponError, "a FAILED order does not count toward perCustomerLimit");
  q = await pricing.quoteCart({ items: [{ variantId: ps10, quantity: 1 }], couponCode: perCustomer.code, email: qaEmail() });
  check(q.ok && q.discountCents === 110, "another email may use it");

  section("Wallet in quotes");
  const rich = await createCustomer(700);
  q = await pricing.quoteCart({ items: [{ variantId: ps10, quantity: 1 }], useWallet: true, customerId: rich.id, couponCode: capped.code });
  check(q.ok && q.walletBalanceCents === 700 && q.walletAppliedCents === 700 && q.totalCents === 879 && q.amountDueCents === 179, "wallet 7.00 applied after discount: due 1.79", q);
  q = await pricing.quoteCart({ items: [{ variantId: ps10, quantity: 1 }], useWallet: false, customerId: rich.id });
  check(q.ok && q.walletAppliedCents === 0 && q.walletBalanceCents === 700, "useWallet false -> balance shown, nothing applied");
  q = await pricing.quoteCart({ items: [{ variantId: ps10, quantity: 1 }], useWallet: true });
  check(q.ok && q.walletAppliedCents === 0 && q.walletBalanceCents === null, "guest (no customerId) -> wallet ignored");
  q = await pricing.quoteCart({ items: [] });
  check(!q.ok && q.error === "السلة فارغة", "empty cart -> { ok: false } with Arabic error");
  q = await pricing.quoteCart({ items: [{ variantId: ps10, quantity: 11 }] });
  check(!q.ok, "quantity 11 -> { ok: false }");

  section("Wallet ledger primitives");
  const w = await createCustomer(1000);
  let insufficient = false;
  try {
    await prisma.$transaction((tx) => wallet.debitWallet(tx, w.id, 1001, { type: "PURCHASE" }));
  } catch (err) {
    insufficient = err instanceof wallet.InsufficientBalanceError;
  }
  check(insufficient && (await balanceOf(w.id)) === 1000, "debit above balance throws InsufficientBalanceError, balance unchanged");
  await Promise.all(Array.from({ length: 10 }, () => prisma.$transaction((tx) => wallet.debitWallet(tx, w.id, 150, { type: "PURCHASE" })).catch(() => null)));
  check((await balanceOf(w.id)) === 100 && (await ledgerConsistent(w.id)), "10 concurrent 1.50 debits on 10.00: 6 succeed, balance 1.00, ledger consistent");
  const admin = await prisma.admin.findFirst();
  const actor = { adminId: admin?.id ?? "unknown", email: admin?.email ?? "qa@nitro-qa.test" };
  const adj = await wallet.adjustWallet(w.id, 250, "QA تعديل", actor);
  const adjNeg = await wallet.adjustWallet(w.id, -1000, "QA خصم", actor);
  check(adj.ok && adj.balanceCents === 350 && !adjNeg.ok, "adjustWallet credits, refuses a debit beyond the balance", { adj, adjNeg });
  const list = await wallet.listWalletTransactions(w.id, { take: 3 });
  check(list.length === 3 && list[0].type === "ADJUSTMENT" && list[0].amountCents === 250 && (await wallet.countWalletTransactions(w.id)) === 8, "listWalletTransactions newest first, paginated");

  section("Stripe webhook: top-ups and partially wallet-paid orders (signed locally, in-process)");
  const { getStripe } = await import("@/lib/stripe");
  const { POST: webhookPOST } = await import("@/app/api/stripe/webhook/route");
  const stripe = getStripe();
  const sendEvent = async (type: string, object: Record<string, unknown>) => {
    const payload = JSON.stringify({ id: `evt_${randomToken(8)}`, object: "event", type, data: { object: { object: "checkout.session", ...object } } });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const res = await webhookPOST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": header } }));
    return res.status;
  };
  const topupCustomer = await createCustomer();
  const topup = await prisma.walletTopup.create({ data: { customerId: topupCustomer.id, amountCents: 2500, creditUsdCents: 2500, provider: "STRIPE", providerRef: `cs_test_${randomToken(8)}` } });
  const topupSession = { id: topup.providerRef, metadata: { kind: "topup", topupId: topup.id }, client_reference_id: topup.id, payment_status: "paid", amount_total: 2500, currency: "usd" };
  const statuses = await Promise.all([1, 2, 3].map(() => sendEvent("checkout.session.completed", topupSession)));
  check(statuses.every((s) => s === 200) && (await balanceOf(topupCustomer.id)) === 2500, "top-up paid event sent 3x concurrently -> credited 25.00 once");
  check((await prisma.walletTransaction.count({ where: { topupId: topup.id, type: "TOPUP" } })) === 1, "exactly one TOPUP ledger row");
  const badTopup = await prisma.walletTopup.create({ data: { customerId: topupCustomer.id, amountCents: 1000, creditUsdCents: 1000, provider: "STRIPE", providerRef: `cs_test_${randomToken(8)}` } });
  await sendEvent("checkout.session.completed", { id: badTopup.providerRef, metadata: { kind: "topup", topupId: badTopup.id }, payment_status: "paid", amount_total: 100, currency: "usd" });
  check((await prisma.walletTopup.findUniqueOrThrow({ where: { id: badTopup.id } })).status === "PENDING" && (await balanceOf(topupCustomer.id)) === 2500, "amount mismatch -> not credited");
  await sendEvent("checkout.session.expired", { id: badTopup.providerRef, metadata: { kind: "topup", topupId: badTopup.id }, payment_status: "unpaid" });
  check((await prisma.walletTopup.findUniqueOrThrow({ where: { id: badTopup.id } })).status === "FAILED", "expired top-up session -> FAILED");

  // Order paid partly from the wallet: Stripe charges only total - walletApplied
  const ps50 = await variantId("playstation-store-card", "50 دولار");
  const payer = await createCustomer(1000);
  const stripeOrder = await createPendingOrder({ customerId: payer.id, variant: ps50, walletCents: 1000, stripeSessionId: `cs_test_${randomToken(8)}` });
  const dueSession = { id: stripeOrder.stripeSessionId, metadata: { kind: "order", orderId: stripeOrder.id }, payment_status: "paid", amount_total: stripeOrder.totalCents - 1000, currency: "usd", payment_intent: `pi_test_${randomToken(6)}` };
  check((await sendEvent("checkout.session.completed", dueSession)) === 200, "paid event for amount due -> 200");
  const stripePaid = await orderOf(stripeOrder.id);
  check(stripePaid.status === "FULFILLED" && stripePaid.paymentProvider === "STRIPE" && (await balanceOf(payer.id)) === 0, "order FULFILLED, paymentProvider STRIPE, wallet part kept", stripePaid.status);
}

/** A PENDING order exactly as checkout writes it (wallet debit + reserved stock), for in-process webhook tests. */
async function createPendingOrder(opts: { customerId: string; variant: string; walletCents?: number; stripeSessionId?: string }) {
  const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: opts.variant }, include: { product: true } });
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        accessToken: randomToken(),
        customerId: opts.customerId,
        subtotalCents: v.priceCents,
        totalCents: v.priceCents,
        totalUsdCents: v.priceCents,
        walletAppliedCents: opts.walletCents ?? 0,
        walletDebitUsdCents: opts.walletCents ?? 0,
        currency: v.currency,
        stripeSessionId: opts.stripeSessionId,
        items: { create: { variantId: v.id, productName: v.product.name, variantLabel: v.label, productType: v.product.type, quantity: 1, unitPriceCents: v.priceCents } },
      },
      include: { items: true },
    });
    if (opts.walletCents) await wallet.debitWallet(tx, opts.customerId, opts.walletCents, { type: "PURCHASE", orderId: order.id });
    await reserveStock(tx, order.items[0]);
    return order;
  });
}

// ======================================================================
async function phaseDev() {
  section(`Dev mode (${BASE_URL}, no payment keys)`);
  const health = await fetch(`${BASE_URL}/api/health`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  check(health?.ok === true, "dev server is up", health);

  const ps10 = await variantId("playstation-store-card", "10 دولار");
  const guest = await checkout({ email: qaEmail(), items: [{ variantId: ps10, quantity: 1 }] });
  const guestOrder = orderIdFromUrl(guest.url);
  check(guest.status === 200 && !!guestOrder, "guest dev-mode checkout -> order page URL", guest);
  if (guestOrder) {
    const o = await orderOf(guestOrder);
    check(o.status === "FULFILLED" && o.paymentProvider === "DEV" && o.subtotalCents === 1099 && o.totalCents === 1099, "FULFILLED, paymentProvider DEV, subtotal/total stored");
  }
  check((await checkout({ items: [{ variantId: ps10, quantity: 1 }] })).status === 400, "guest without email -> 400");
  check((await checkout({ email: qaEmail(), items: [{ variantId: ps10, quantity: 1 }], useWallet: true })).status === 401, "useWallet without a session -> 401");

  section("Top-up (dev mode)");
  const c = await createCustomer();
  check((await api("/api/wallet/topup", { body: { amountCents: 1000 } })).status === 401, "no session -> 401");
  const bad = await api("/api/wallet/topup", { body: { amountCents: 1050 }, cookie: c.cookie });
  const low = await api("/api/wallet/topup", { body: { amountCents: 400 }, cookie: c.cookie });
  const high = await api("/api/wallet/topup", { body: { amountCents: 50_100 }, cookie: c.cookie });
  check(bad.status === 400 && low.status === 400 && high.status === 400, "non-multiple of 100 / below 500 / above 50000 -> 400", [bad, low, high]);
  const top = await api("/api/wallet/topup", { body: { amountCents: 2000 }, cookie: c.cookie });
  check(top.status === 200 && top.url === "/account?topup=ok", "top-up returns { url: /account?topup=ok }", top);
  const topups = await prisma.walletTopup.findMany({ where: { customerId: c.id } });
  check((await balanceOf(c.id)) === 2000 && topups.length === 1 && topups[0].status === "PAID" && topups[0].provider === "DEV", "credited 20.00 exactly once, top-up PAID (DEV)");
  check((await prisma.walletTransaction.count({ where: { customerId: c.id, type: "TOPUP" } })) === 1, "one TOPUP ledger row");

  section("Full-wallet purchase is delivered instantly");
  const before = await available(ps10);
  const paid = await checkout({ email: "ignored-for-sessions@example.com", items: [{ variantId: ps10, quantity: 1 }], useWallet: true }, c.cookie);
  const walletOrderId = orderIdFromUrl(paid.url);
  check(paid.status === 200 && !!walletOrderId, "checkout with useWallet -> order page URL", paid);
  if (walletOrderId) {
    const o = await prisma.order.findUniqueOrThrow({ where: { id: walletOrderId }, include: { customer: true, items: { include: { inventoryItems: true } } } });
    check(o.status === "FULFILLED" && o.paymentProvider === "WALLET" && o.walletAppliedCents === 1099 && o.items[0].inventoryItems[0]?.status === "SOLD", "FULFILLED via WALLET, code delivered");
    check(o.customer.email === c.email, "order belongs to the session customer (body email ignored)");
    check((await balanceOf(c.id)) === 901 && (await available(ps10)) === before - 1 && (await ledgerConsistent(c.id)), "balance 20.00 -> 9.01, stock -1, ledger consistent");
  }
  const partial = await checkout({ items: [{ variantId: ps10, quantity: 1 }], useWallet: true }, c.cookie);
  const partialId = orderIdFromUrl(partial.url);
  const po = partialId ? await orderOf(partialId) : null;
  check(po?.walletAppliedCents === 901 && po.status === "FULFILLED" && po.paymentProvider === "DEV" && (await balanceOf(c.id)) === 0, "partial wallet in dev mode: 9.01 from wallet, rest DEV");
}

// ======================================================================
async function phaseTap() {
  section(`Tap mode (${BASE_URL} with TAP_API_BASE -> mock on :${MOCK_PORT})`);
  const ps10 = await variantId("playstation-store-card", "10 دولار");
  const ps25 = await variantId("playstation-store-card", "25 دولار");
  const logo = await variantId("pro-logo-design", "الباقة الأساسية - تصميمان"); // SERVICE 1999, no stock limit
  const actorAdmin = await prisma.admin.findFirst();
  const actor = { adminId: actorAdmin?.id ?? "unknown", email: actorAdmin?.email ?? "qa@nitro-qa.test" };

  section("Coupon maxUses=3 under 10 concurrent checkouts");
  const limited = await createCoupon("LIM3", { value: 10, maxUses: 3 });
  const results = await Promise.all(
    Array.from({ length: 10 }, () => checkout({ email: qaEmail(), items: [{ variantId: logo, quantity: 1 }], couponCode: limited.code.toLowerCase() })),
  );
  const ok = results.filter((r) => r.status === 200);
  const rejected = results.filter((r) => r.status !== 200);
  console.log(`        statuses: ${JSON.stringify(results.map((r) => r.status))}; rejection: ${rejected[0]?.error}`);
  check(ok.length === 3 && ok.every((r) => r.url?.startsWith("https://tap.mock/pay/chg_")), "exactly 3 checkouts got a Tap payment URL");
  check(rejected.length === 7 && rejected.every((r) => (r.status === 409 || r.status === 400) && /استخدام/.test(r.error ?? "")), "the other 7 were refused with the Arabic coupon error");
  const redemptions = await prisma.couponRedemption.findMany({ where: { couponId: limited.id }, include: { order: true } });
  check((await usedCountOf(limited.code)) === 3 && redemptions.length === 3 && redemptions.every((r) => r.discountCents === 200 && r.order.discountCents === 200 && r.order.totalCents === 1799), "usedCount 3, 3 redemptions, each 10% (2.00) off 19.99");
  check(Object.keys(mockTap.lastChargeBody ?? {}).length > 0 && (mockTap.lastChargeBody as { amount: number }).amount === 17.99, "Tap charged 17.99 (major units) for the discounted order");

  // A failed payment gives the use back; the next buyer can use it
  const declinedOrder = redemptions[0].order;
  mockTap.charges.get(declinedOrder.tapChargeId!)!.status = "DECLINED";
  check((await tapWebhook(declinedOrder.tapChargeId!)).status === 200, "webhook for a DECLINED charge -> 200");
  check((await orderOf(declinedOrder.id)).status === "FAILED" && (await usedCountOf(limited.code)) === 2, "order FAILED, coupon use released (usedCount 2)");
  const again = await checkout({ email: qaEmail(), items: [{ variantId: logo, quantity: 1 }], couponCode: limited.code });
  check(again.status === 200 && (await usedCountOf(limited.code)) === 3, "the freed use can be redeemed again (usedCount 3)");

  section("Wallet: 10 concurrent checkouts cannot overdraw 25.00");
  const spender = await createCustomer(2500);
  const walletResults = await Promise.all(
    Array.from({ length: 10 }, () => checkout({ items: [{ variantId: logo, quantity: 1 }], useWallet: true }, spender.cookie)),
  );
  const spenderOrders = await prisma.order.findMany({ where: { customerId: spender.id } });
  const applied = spenderOrders.reduce((s, o) => s + o.walletAppliedCents, 0);
  console.log(`        statuses: ${JSON.stringify(walletResults.map((r) => r.status))}; wallet parts: ${JSON.stringify(spenderOrders.map((o) => o.walletAppliedCents).sort((a, b) => b - a))}`);
  check(walletResults.every((r) => r.status === 200) && spenderOrders.length === 10, "all 10 checkouts succeeded (wallet first, then Tap)");
  check(applied === 2500 && (await balanceOf(spender.id)) === 0 && (await ledgerConsistent(spender.id)), "wallet parts sum to exactly 25.00, balance 0, ledger consistent (never negative)");
  check(spenderOrders.filter((o) => o.paymentProvider === "WALLET").length === 1 && spenderOrders.filter((o) => o.walletAppliedCents > 0 && o.walletAppliedCents < o.totalCents).length === 1, "1 order fully wallet-paid, 1 split wallet + Tap, 8 all Tap");
  const splitOrder = spenderOrders.find((o) => o.walletAppliedCents > 0 && o.walletAppliedCents < o.totalCents)!;
  check((await chargeFor(splitOrder.id))?.amount === (splitOrder.totalCents - splitOrder.walletAppliedCents) / 100, "split order's Tap charge is total - wallet part");

  section("Partial wallet + coupon + provider failure restores everything");
  const failCoupon = await createCoupon("FAIL", { value: 10, maxUses: 5, perCustomerLimit: 1 });
  const unlucky = await createCustomer(500);
  const stockBefore = await available(ps10);
  mockTap.failCreate = true;
  const failed = await checkout({ items: [{ variantId: ps10, quantity: 1 }], useWallet: true, couponCode: failCoupon.code }, unlucky.cookie);
  mockTap.failCreate = false;
  const failedOrder = await prisma.order.findFirst({ where: { customerId: unlucky.id }, include: { couponRedemption: true } });
  check(failed.status === 502 && !!failed.error, "provider error -> 502 with Arabic error", failed);
  check(failedOrder?.status === "FAILED" && failedOrder.walletAppliedCents === 500 && failedOrder.discountCents === 110, "order FAILED (had 5.00 wallet + 1.10 coupon)");
  check((await balanceOf(unlucky.id)) === 500 && (await ledgerConsistent(unlucky.id)), "wallet back to 5.00 (PURCHASE + REFUND rows)");
  check((await available(ps10)) === stockBefore && (await usedCountOf(failCoupon.code)) === 0, "stock and coupon use restored");
  const retry = await checkout({ items: [{ variantId: ps10, quantity: 1 }], useWallet: true, couponCode: failCoupon.code }, unlucky.cookie);
  check(retry.status === 200 && (await usedCountOf(failCoupon.code)) === 1, "same customer can retry: the FAILED order does not count toward perCustomerLimit 1");
  const second = await checkout({ items: [{ variantId: ps10, quantity: 1 }], couponCode: failCoupon.code }, unlucky.cookie);
  check(second.status === 409 || second.status === 400, "a second live use by the same customer is refused", second);

  section("Expiry sweep restores wallet, stock and coupon; a late payment takes them again");
  const expCoupon = await createCoupon("EXPY", { value: 10 });
  const late = await createCustomer(300);
  const lateStock = await available(ps25);
  const pending = await checkout({ items: [{ variantId: ps25, quantity: 1 }], useWallet: true, couponCode: expCoupon.code }, late.cookie);
  const lateOrder = await prisma.order.findFirstOrThrow({ where: { customerId: late.id } });
  check(pending.status === 200 && lateOrder.status === "PENDING" && (await balanceOf(late.id)) === 0 && (await available(ps25)) === lateStock - 1 && (await usedCountOf(expCoupon.code)) === 1, "pending order holds 3.00 wallet, 1 unit, 1 coupon use");
  await prisma.order.update({ where: { id: lateOrder.id }, data: { createdAt: new Date(Date.now() - (RESERVATION_TTL_MINUTES + 5) * 60_000) } });
  check((await checkout({})).status === 400, "any checkout request runs the sweep");
  check((await orderOf(lateOrder.id)).status === "FAILED" && (await balanceOf(late.id)) === 300 && (await available(ps25)) === lateStock && (await usedCountOf(expCoupon.code)) === 0, "swept: FAILED, wallet 3.00, stock and coupon use back");
  await checkout({});
  check((await balanceOf(late.id)) === 300 && (await ledgerConsistent(late.id)), "a second sweep changes nothing (released once)");
  const lateCharge = await chargeFor(lateOrder.id);
  lateCharge.status = "CAPTURED";
  check((await tapWebhook(lateCharge.id)).status === 200, "late CAPTURED webhook -> 200");
  const latePaid = await orderOf(lateOrder.id);
  check(latePaid.status === "FULFILLED" && (await balanceOf(late.id)) === 0 && (await usedCountOf(expCoupon.code)) === 1 && (await ledgerConsistent(late.id)), "FAILED -> PAID -> FULFILLED; wallet re-debited, coupon re-counted");

  const short = await createCustomer(300);
  await checkout({ items: [{ variantId: ps25, quantity: 1 }], useWallet: true }, short.cookie);
  const shortOrder = await prisma.order.findFirstOrThrow({ where: { customerId: short.id } });
  await prisma.order.update({ where: { id: shortOrder.id }, data: { createdAt: new Date(Date.now() - (RESERVATION_TTL_MINUTES + 5) * 60_000) } });
  await checkout({});
  await prisma.$transaction((tx) => wallet.debitWallet(tx, short.id, 300, { type: "ADJUSTMENT", note: "QA spend" }));
  (await chargeFor(shortOrder.id)).status = "CAPTURED";
  await tapWebhook(shortOrder.tapChargeId!);
  const shortPaid = await orderOf(shortOrder.id);
  check(shortPaid.status === "PAID" && shortPaid.items.every((i) => !i.deliveredAt) && (await balanceOf(short.id)) === 0, "late payment with the wallet already spent: PAID, not auto-delivered, balance not negative");

  section("Tap return + webhook: re-fetched and verified, applied once");
  const guestEmail = qaEmail();
  const tapCheckout = await checkout({ email: guestEmail, items: [{ variantId: ps25, quantity: 1 }], provider: "TAP" });
  const tapOrder = await prisma.order.findFirstOrThrow({ where: { customer: { email: guestEmail } } });
  check(tapCheckout.url === (await chargeFor(tapOrder.id)).transaction.url && tapOrder.paymentProvider === "TAP", "checkout returns the charge's transaction.url; order has tapChargeId");
  check((await checkout({ email: qaEmail(), items: [{ variantId: ps25, quantity: 1 }], provider: "STRIPE" })).status === 400, "provider STRIPE (not configured) -> 400");
  const early = await tapReturn(tapOrder.tapChargeId!);
  check(early.status === 303 && early.location?.endsWith(`/order/${tapOrder.id}?token=${encodeURIComponent(tapOrder.accessToken)}`) === true, "return (INITIATED) -> 303 to the order page", early);
  check((await orderOf(tapOrder.id)).status === "PENDING", "still PENDING while INITIATED");
  const forged = await tapWebhook(tapOrder.tapChargeId!, { status: "CAPTURED", amount: 26.49, currency: "USD", metadata: { kind: "order", orderId: tapOrder.id } });
  check(forged.status === 200 && (await orderOf(tapOrder.id)).status === "PENDING", "forged CAPTURED webhook body is ignored (Tap says INITIATED)");
  const charge = await chargeFor(tapOrder.id);
  charge.status = "CAPTURED";
  charge.amount = 20.0;
  await tapWebhook(charge.id);
  check((await orderOf(tapOrder.id)).status === "PENDING", "CAPTURED with a different amount -> not paid");
  charge.amount = 26.49;
  charge.metadata = { kind: "order", orderId: "somebody-else" };
  await tapWebhook(charge.id);
  check((await orderOf(tapOrder.id)).status === "PENDING", "CAPTURED with foreign metadata -> not paid");
  charge.metadata = { kind: "order", orderId: tapOrder.id };
  const burst = await Promise.all([tapWebhook(charge.id), tapWebhook(charge.id), tapWebhook(charge.id), tapReturn(charge.id)]);
  const delivered = await orderOf(tapOrder.id);
  check(burst.slice(0, 3).every((r) => r.status === 200) && burst[3].status === 303, "3 webhooks + 1 return concurrently -> 200/303");
  check(delivered.status === "FULFILLED" && delivered.paymentProvider === "TAP" && delivered.items[0].inventoryItems.length === 1, "order FULFILLED once, one unit sold, provider TAP");
  check((await tapWebhook("chg_TSdoesnotexist1")).status === 200 && (await tapWebhook("re_TS123")).status === 200 && (await api("/api/tap/webhook", { body: {} })).status === 400, "unknown charge -> 200, non-charge id -> 200 ignored, no id -> 400");
  const junk = await tapReturn("../../etc");
  check(junk.status === 303 && junk.location?.endsWith("/") === true, "return with an invalid tap_id -> 303 home");

  const declined = await checkout({ email: qaEmail(), items: [{ variantId: ps25, quantity: 1 }] });
  const declinedId = [...mockTap.charges.values()].find((c) => c.transaction.url === declined.url)!.id;
  mockTap.charges.get(declinedId)!.status = "CANCELLED";
  const declinedStock = await available(ps25);
  await tapReturn(declinedId);
  const declinedOrder2 = await prisma.order.findFirstOrThrow({ where: { tapChargeId: declinedId } });
  check(declinedOrder2.status === "FAILED" && (await available(ps25)) === declinedStock + 1, "CANCELLED charge on return -> FAILED, stock released");

  section("Tap top-up");
  const topper = await createCustomer();
  check((await api("/api/wallet/topup", { body: { amountCents: 1500, provider: "STRIPE" }, cookie: topper.cookie })).status === 400, "top-up with an unavailable provider -> 400");
  const t = await api("/api/wallet/topup", { body: { amountCents: 1500 }, cookie: topper.cookie });
  const topupRow = await prisma.walletTopup.findFirstOrThrow({ where: { customerId: topper.id } });
  check(t.status === 200 && t.url?.startsWith("https://tap.mock/pay/") === true && topupRow.status === "PENDING" && topupRow.provider === "TAP" && !!topupRow.providerRef, "returns Tap URL, top-up PENDING with charge id");
  const tc = mockTap.charges.get(topupRow.providerRef!)!;
  check(tc.metadata.kind === "topup" && tc.metadata.topupId === topupRow.id && tc.amount === 15, "charge metadata kind=topup + topupId, amount 15");
  const r1 = await tapReturn(tc.id);
  check(r1.location?.endsWith("/account?topup=ok") === true && (await balanceOf(topper.id)) === 0, "return while INITIATED -> /account?topup=ok, nothing credited yet");
  tc.status = "CAPTURED";
  await Promise.all([tapWebhook(tc.id), tapWebhook(tc.id), tapWebhook(tc.id), tapWebhook(tc.id), tapWebhook(tc.id), tapReturn(tc.id), tapReturn(tc.id)]);
  check((await balanceOf(topper.id)) === 1500 && (await prisma.walletTransaction.count({ where: { topupId: topupRow.id } })) === 1, "5 webhooks + 2 returns -> credited 15.00 exactly once");
  const t2 = await api("/api/wallet/topup", { body: { amountCents: 500 }, cookie: topper.cookie });
  const tc2 = [...mockTap.charges.values()].find((c) => c.transaction.url === t2.url)!;
  tc2.status = "DECLINED";
  const r2 = await tapReturn(tc2.id);
  check(r2.location?.endsWith("/account?topup=cancelled") === true && (await balanceOf(topper.id)) === 1500, "declined top-up -> /account?topup=cancelled, not credited");
  mockTap.failCreate = true;
  const t3 = await api("/api/wallet/topup", { body: { amountCents: 500 }, cookie: topper.cookie });
  mockTap.failCreate = false;
  check(t3.status === 502 && (await prisma.walletTopup.count({ where: { customerId: topper.id, status: "FAILED" } })) === 2, "provider error -> 502, top-up FAILED");

  section("Refunds (in-process refundOrderPayment against the mock)");
  // WALLET method, double call, on the fulfilled guest Tap order (26.49)
  const guestCustomerId = delivered.customerId;
  const [a, b] = await Promise.all([
    payments.refundOrderPayment(tapOrder.id, { method: "WALLET", actor }),
    payments.refundOrderPayment(tapOrder.id, { method: "WALLET", actor }),
  ]);
  const walletRefunded = await orderOf(tapOrder.id);
  check([a, b].filter((r) => r.ok).length === 1 && [a, b].some((r) => !r.ok && /مسبقاً/.test(r.error)), "double call: one ok, one 'already refunded'", [a, b]);
  check([a, b].some((r) => r.ok && r.refundedCents === 2649) && (await balanceOf(guestCustomerId)) === 2649, "WALLET: whole 26.49 credited to the wallet once");
  check(walletRefunded.status === "REFUNDED" && !!walletRefunded.refundedAt && mockTap.refunds.every((r) => r.charge_id !== tapOrder.tapChargeId), "REFUNDED + refundedAt, no gateway call");
  check((await prisma.auditLog.count({ where: { action: "order.refund", targetId: tapOrder.id } })) === 1, "audited once");

  // ORIGINAL on the split wallet + Tap order: gateway part to Tap, wallet part to the wallet
  const splitter = await createCustomer(500);
  await checkout({ items: [{ variantId: ps10, quantity: 1 }], useWallet: true }, splitter.cookie);
  const splitPaid = await prisma.order.findFirstOrThrow({ where: { customerId: splitter.id } });
  (await chargeFor(splitPaid.id)).status = "CAPTURED";
  await tapWebhook(splitPaid.tapChargeId!);
  check((await orderOf(splitPaid.id)).status === "FULFILLED" && (await balanceOf(splitter.id)) === 0, "split order paid (5.00 wallet + 5.99 Tap) and delivered");
  const [o1, o2] = await Promise.all([
    payments.refundOrderPayment(splitPaid.id, { method: "ORIGINAL", actor }),
    payments.refundOrderPayment(splitPaid.id, { method: "ORIGINAL", actor }),
  ]);
  const tapRefunds = mockTap.refunds.filter((r) => r.charge_id === splitPaid.tapChargeId);
  check([o1, o2].filter((r) => r.ok).length === 1 && [o1, o2].some((r) => r.ok && r.refundedCents === 1099), "ORIGINAL double call: one ok refunding 10.99 in total", [o1, o2]);
  check(tapRefunds.length === 1 && tapRefunds[0].amount === 5.99 && tapRefunds[0].currency === "USD", "Tap refund called once for 5.99 USD (major units)", tapRefunds);
  check((await balanceOf(splitter.id)) === 500 && (await ledgerConsistent(splitter.id)), "wallet part (5.00) returned to the wallet");

  // Gateway refusal changes nothing
  const refusing = await createCustomer();
  const rc = await checkout({ items: [{ variantId: ps10, quantity: 1 }] }, refusing.cookie);
  const refuseOrder = await prisma.order.findFirstOrThrow({ where: { customerId: refusing.id } });
  (await chargeFor(refuseOrder.id)).status = "CAPTURED";
  await tapReturn(refuseOrder.tapChargeId!);
  mockTap.failRefund = true;
  const refused = await payments.refundOrderPayment(refuseOrder.id, { method: "ORIGINAL", actor });
  mockTap.failRefund = false;
  check(rc.status === 200 && !refused.ok && (await orderOf(refuseOrder.id)).status === "FULFILLED" && (await balanceOf(refusing.id)) === 0, "Tap refund refused -> { ok: false }, order still FULFILLED, no credit", refused);
  const pendingRefund = await payments.refundOrderPayment(spenderOrders.find((o) => o.status === "PENDING")!.id, { method: "WALLET", actor });
  check(!pendingRefund.ok, "PENDING order cannot be refunded");
  const walletOnly = spenderOrders.find((o) => o.paymentProvider === "WALLET")!;
  const wr = await payments.refundOrderPayment(walletOnly.id, { method: "ORIGINAL", actor });
  check(wr.ok && wr.refundedCents === 1999 && (await balanceOf(spender.id)) === 1999, "ORIGINAL on a wallet-paid order returns it to the wallet");

  section("Global invariants");
  const reservedOnDead = await prisma.inventoryItem.count({ where: { status: "RESERVED", orderItem: { order: { status: { not: "PENDING" } } } } });
  check(reservedOnDead === 0, "no RESERVED unit belongs to a non-PENDING order");
  const coupons = await prisma.coupon.findMany({ where: { code: { startsWith: `QA${RUN}` } }, include: { redemptions: { include: { order: true } } } });
  const drift = coupons.filter((c) => c.redemptions.length > 0 && c.usedCount !== c.redemptions.filter((r) => r.order.status !== "FAILED").length);
  check(drift.length === 0, "every coupon's usedCount == its redemptions on non-FAILED orders", drift.map((c) => c.code));
  const qaCustomers = await prisma.customer.findMany({ where: { email: { endsWith: `@${QA_DOMAIN}` } }, select: { id: true } });
  const inconsistent = [];
  for (const c of qaCustomers) if (!(await ledgerConsistent(c.id))) inconsistent.push(c.id);
  check(inconsistent.length === 0, "every QA wallet balance equals its ledger sum", inconsistent);
}

let mock: Awaited<ReturnType<typeof startMockTap>> | null = null;
try {
  if (PHASE === "tap") mock = await startMockTap();
  if (PHASE === "unit") await phaseUnit();
  else if (PHASE === "dev") await phaseDev();
  else await phaseTap();
} catch (err) {
  failures++;
  console.error(err);
} finally {
  await sleep(200);
  await cleanup().catch((err) => console.error("Cleanup failed", err));
  mock?.close();
  await prisma.$disconnect();
}
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
