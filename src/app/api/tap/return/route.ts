import { prisma } from "@/lib/prisma";
import { orderPagePath, siteUrl } from "@/lib/email";
import { isTapChargeId, processTapCharge, type TapChargeOutcome } from "@/lib/payments";
import { type Locale, localizePath } from "@/i18n/config";
import { getRequestLocale } from "@/i18n/server";
import { clientIp, rateLimit } from "../../_lib/rate-limit";

// Tap sends the buyer back here as /api/tap/return?tap_id=chg_... The query string is untrusted:
// where the buyer goes is decided from our own record for that charge id, and the payment state
// from the charge re-fetched from Tap (processTapCharge), exactly as for the webhook.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Back to the storefront in the language the buyer was browsing in (their locale cookie). */
function redirectTo(path: string, locale: Locale) {
  return new Response(null, {
    status: 303,
    headers: { Location: `${siteUrl()}${localizePath(path, locale)}`, "Cache-Control": "no-store" },
  });
}

/** The account page's "ok" banner shows the top-up's live status (credited / still processing). */
function topupPath(result: TapChargeOutcome | null, storedStatus: string): string {
  const failed = storedStatus === "FAILED" || (result?.kind === "topup" && result.result === "failed");
  return failed ? "/account?topup=cancelled" : "/account?topup=ok";
}

export async function GET(req: Request) {
  const locale = await getRequestLocale(req);
  const tapId = new URL(req.url).searchParams.get("tap_id");
  if (!isTapChargeId(tapId)) return redirectTo("/", locale);

  const order = await prisma.order.findUnique({ where: { tapChargeId: tapId }, select: { id: true, accessToken: true } });
  const topup = order
    ? null
    : await prisma.walletTopup.findUnique({ where: { providerRef: tapId }, select: { id: true, provider: true } });
  if (!order && (!topup || topup.provider !== "TAP")) return redirectTo("/", locale);

  let outcome: TapChargeOutcome | null = null;
  // Each verification calls Tap: cap reloads per IP (the webhook settles the payment regardless)
  if (rateLimit("tap-return", clientIp(req), 20, 60_000) === 0) {
    try {
      outcome = await processTapCharge(tapId);
    } catch (err) {
      // The webhook (or the stale-order sweep) settles it; the order page keeps refreshing meanwhile
      console.error(`[tap] Verifying charge ${tapId} on return failed`, err);
    }
  }

  if (order) return redirectTo(orderPagePath(order), locale);
  const stored = await prisma.walletTopup.findUnique({ where: { id: topup!.id }, select: { status: true } });
  return redirectTo(topupPath(outcome, stored?.status ?? "PENDING"), locale);
}
