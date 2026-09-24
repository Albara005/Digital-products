import "server-only";
import { prisma } from "@/lib/prisma";
import { siteUrl } from "@/lib/email";
import { formatPrice } from "@/lib/format";
import { notifyAdmin } from "@/lib/notify";
import { creditWallet } from "@/lib/wallet";

/** Wallet top-up limits (cents): $5 to $500 in whole dollars. */
export const TOPUP_MIN_CENTS = 500;
export const TOPUP_MAX_CENTS = 50_000;
export const TOPUP_STEP_CENTS = 100;

/**
 * PENDING (or FAILED, for a payment confirmed late) -> PAID and credits the wallet, in one
 * transaction. The conditional status update makes the credit happen exactly once however many
 * webhooks / returns confirm the same payment. Callers must have verified the paid amount.
 */
export async function confirmTopupPaid(topupId: string, payment: { providerRef?: string } = {}): Promise<boolean> {
  const credited = await prisma.$transaction(
    async (tx) => {
      const claimed = await tx.walletTopup.updateMany({
        where: { id: topupId, status: { in: ["PENDING", "FAILED"] } },
        data: { status: "PAID", paidAt: new Date(), ...(payment.providerRef ? { providerRef: payment.providerRef } : {}) },
      });
      if (claimed.count === 0) return null;
      const topup = await tx.walletTopup.findUniqueOrThrow({
        where: { id: topupId },
        select: { customerId: true, amountCents: true, currency: true, provider: true },
      });
      await creditWallet(tx, topup.customerId, topup.amountCents, { type: "TOPUP", topupId, note: "شحن رصيد المحفظة" });
      return topup;
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
  if (!credited) return false;
  // After the commit; never able to fail the credit
  void notifyAdmin(
    "topup.paid",
    `👛 شحن محفظة #${topupId.slice(-8).toUpperCase()} بقيمة ${formatPrice(credited.amountCents, credited.currency)} (${credited.provider})\n` +
      `${siteUrl()}/admin/customers/${credited.customerId}`,
  );
  return true;
}

/** PENDING -> FAILED (payment expired, declined or could not start). No money moved, nothing to undo. */
export async function failTopup(topupId: string): Promise<boolean> {
  const res = await prisma.walletTopup.updateMany({ where: { id: topupId, status: "PENDING" }, data: { status: "FAILED" } });
  return res.count === 1;
}
