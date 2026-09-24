import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCustomerSession, type CustomerSession } from "@/lib/customer-auth";
import { siteUrl } from "@/lib/email";
import { WALLET_CURRENCY } from "@/lib/wallet";
import {
  TOPUP_MAX_CENTS,
  TOPUP_MIN_CENTS,
  TOPUP_STEP_CENTS,
  confirmTopupPaid,
  failTopup,
  getCheckoutOptions,
  getProvider,
  resolveProvider,
} from "@/lib/payments";
import { localizePath } from "@/i18n/config";
import { type Dictionary, dictionaryFor, getRequestLocale } from "@/i18n/server";
import { clientIp, jsonError, rateLimit } from "../../_lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 5; // requests
const RATE_WINDOW_MS = 60_000; // per minute, per IP

const OK_PATH = "/account?topup=ok";
const CANCELLED_PATH = "/account?topup=cancelled";

const bodySchema = (t: Dictionary) =>
  z.object(
    {
      amountCents: z
        .number({ error: t.api.topupAmountRequired })
        .int({ error: t.api.topupAmountInvalid })
        .min(TOPUP_MIN_CENTS, { error: t.api.topupMin(TOPUP_MIN_CENTS / 100) })
        .max(TOPUP_MAX_CENTS, { error: t.api.topupMax(TOPUP_MAX_CENTS / 100) })
        .multipleOf(TOPUP_STEP_CENTS, { error: t.api.topupWhole }),
      provider: z.enum(["STRIPE", "TAP"], { error: t.api.badProvider }).optional(),
    },
    { error: t.api.badOrderData },
  );

async function currentCustomer(): Promise<CustomerSession | null> {
  try {
    return await getCustomerSession();
  } catch {
    return null;
  }
}

/** Starts a wallet top-up: a PENDING WalletTopup plus a hosted payment page. The wallet is credited on confirmation. */
export async function POST(req: Request) {
  const locale = await getRequestLocale(req);
  const t = dictionaryFor(locale);
  const okPath = localizePath(OK_PATH, locale);
  const retryAfter = rateLimit("wallet-topup", clientIp(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (retryAfter > 0) {
    return jsonError(t.api.tooMany, 429, { "Retry-After": String(retryAfter) });
  }

  const session = await currentCustomer();
  if (!session) return jsonError(t.api.signInForTopup, 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(t.api.badRequest, 400);
  }
  const parsed = bodySchema(t).safeParse(raw);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? t.api.badOrderData, 400);
  const { amountCents } = parsed.data;

  const customer = await prisma.customer.findUnique({ where: { id: session.customerId }, select: { id: true, email: true, name: true } });
  if (!customer) return jsonError(t.api.sessionExpired, 401);

  const options = getCheckoutOptions();
  try {
    if (options.devMode) {
      // Dev mode (never in production): no real charge, credit immediately
      const topup = await prisma.walletTopup.create({
        data: { customerId: customer.id, amountCents, currency: WALLET_CURRENCY, provider: "DEV" },
        select: { id: true },
      });
      await confirmTopupPaid(topup.id);
      return Response.json({ url: okPath });
    }

    if (parsed.data.provider && !resolveProvider(parsed.data.provider)) {
      return jsonError(t.api.providerUnavailable, 400);
    }
    const providerId = resolveProvider(parsed.data.provider);
    if (!providerId) return jsonError(t.api.paymentUnavailable, 503);

    const topup = await prisma.walletTopup.create({
      data: { customerId: customer.id, amountCents, currency: WALLET_CURRENCY, provider: providerId },
      select: { id: true },
    });

    const site = siteUrl();
    let payment: { ref: string; url: string };
    try {
      payment = await getProvider(providerId).createPayment({
        kind: "topup",
        refId: topup.id,
        amountMinor: amountCents,
        currency: WALLET_CURRENCY,
        email: customer.email,
        customerName: customer.name,
        description: t.api.topupDescription,
        successUrl: `${site}${okPath}`,
        cancelUrl: `${site}${localizePath(CANCELLED_PATH, locale)}`,
        idempotencyKey: `wallet-topup-${topup.id}`,
      });
    } catch (err) {
      console.error(`[wallet] ${providerId} payment creation failed for top-up ${topup.id}`, err);
      await failTopup(topup.id);
      return jsonError(t.api.paymentStartFailed, 502);
    }

    await prisma.walletTopup.update({ where: { id: topup.id }, data: { providerRef: payment.ref } });
    return Response.json({ url: payment.url });
  } catch (err) {
    console.error("[wallet] Unexpected top-up error", err);
    return jsonError(t.api.unexpected, 500);
  }
}
