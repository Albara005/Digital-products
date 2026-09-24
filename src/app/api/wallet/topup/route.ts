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
import { clientIp, jsonError, rateLimit } from "../../_lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 5; // requests
const RATE_WINDOW_MS = 60_000; // per minute, per IP

const OK_PATH = "/account?topup=ok";
const CANCELLED_PATH = "/account?topup=cancelled";

const bodySchema = z.object(
  {
    amountCents: z
      .number({ error: "أدخل مبلغ الشحن" })
      .int({ error: "مبلغ الشحن غير صالح" })
      .min(TOPUP_MIN_CENTS, { error: `أقل مبلغ للشحن هو ${TOPUP_MIN_CENTS / 100} دولار` })
      .max(TOPUP_MAX_CENTS, { error: `أقصى مبلغ للشحن هو ${TOPUP_MAX_CENTS / 100} دولار` })
      .multipleOf(TOPUP_STEP_CENTS, { error: "مبلغ الشحن يجب أن يكون بالدولار الكامل" }),
    provider: z.enum(["STRIPE", "TAP"], { error: "طريقة الدفع غير صالحة" }).optional(),
  },
  { error: "بيانات الطلب غير صالحة" },
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
  const retryAfter = rateLimit("wallet-topup", clientIp(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (retryAfter > 0) {
    return jsonError("طلبات كثيرة جداً، يرجى المحاولة بعد دقيقة", 429, { "Retry-After": String(retryAfter) });
  }

  const session = await currentCustomer();
  if (!session) return jsonError("يجب تسجيل الدخول لشحن المحفظة", 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError("طلب غير صالح", 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "بيانات الطلب غير صالحة", 400);
  const { amountCents } = parsed.data;

  const customer = await prisma.customer.findUnique({ where: { id: session.customerId }, select: { id: true, email: true, name: true } });
  if (!customer) return jsonError("انتهت جلستك، يرجى تسجيل الدخول من جديد", 401);

  const options = getCheckoutOptions();
  try {
    if (options.devMode) {
      // Dev mode (never in production): no real charge, credit immediately
      const topup = await prisma.walletTopup.create({
        data: { customerId: customer.id, amountCents, currency: WALLET_CURRENCY, provider: "DEV" },
        select: { id: true },
      });
      await confirmTopupPaid(topup.id);
      return Response.json({ url: OK_PATH });
    }

    if (parsed.data.provider && !resolveProvider(parsed.data.provider)) {
      return jsonError("طريقة الدفع المختارة غير متاحة حالياً", 400);
    }
    const providerId = resolveProvider(parsed.data.provider);
    if (!providerId) return jsonError("الدفع غير متاح حالياً، يرجى المحاولة لاحقاً", 503);

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
        description: "شحن رصيد محفظة Nitro Store",
        successUrl: `${site}${OK_PATH}`,
        cancelUrl: `${site}${CANCELLED_PATH}`,
        idempotencyKey: `wallet-topup-${topup.id}`,
      });
    } catch (err) {
      console.error(`[wallet] ${providerId} payment creation failed for top-up ${topup.id}`, err);
      await failTopup(topup.id);
      return jsonError("تعذر بدء عملية الدفع، يرجى المحاولة مرة أخرى", 502);
    }

    await prisma.walletTopup.update({ where: { id: topup.id }, data: { providerRef: payment.ref } });
    return Response.json({ url: payment.url });
  } catch (err) {
    console.error("[wallet] Unexpected top-up error", err);
    return jsonError("حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى", 500);
  }
}
