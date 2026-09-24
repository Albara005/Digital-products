import "server-only";
import { randomInt } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { creditWallet } from "@/lib/wallet";

/*
 * Referral program.
 *
 * - Every signed-in customer gets a share code (ensureReferralCode) for `/?ref=CODE`.
 * - src/proxy.ts stores the code in the httpOnly `nitro_ref` cookie for 30 days.
 * - Checkout (attachReferrer, inside the order transaction) links the buyer to the referrer once:
 *   only a buyer who was never referred, never paid for an order, and isn't the referrer.
 * - PAID (recordReferralReward): the referee's first paid order, if it reaches the minimum and the
 *   program is on, creates one PENDING reward (refereeId and orderId are unique, so at most once).
 * - FULFILLED (creditReferralReward): PENDING -> CREDITED plus a wallet credit to the referrer, in
 *   one transaction holding the order row lock, so it happens exactly once and never races a refund.
 * - Refund before credit (cancelReferralRewardInTx, inside the refund transaction): PENDING ->
 *   CANCELLED. A reward already CREDITED stays with the referrer (not clawed back).
 */

export const REFERRAL_COOKIE = "nitro_ref";
export const REFERRAL_COOKIE_DAYS = 30;
/** No 0/O, 1/I/L: codes are read aloud and typed from screenshots. Mirrored in src/proxy.ts. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;
export const REFERRAL_CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;

export const REFERRAL_WALLET_NOTE = "مكافأة إحالة";

export type ReferralSettings = {
  enabled: boolean;
  rewardType: "PERCENT" | "FIXED";
  rewardValue: number;
  maxRewardCents: number | null;
  minOrderCents: number;
};

const DISABLED: ReferralSettings = { enabled: false, rewardType: "FIXED", rewardValue: 0, maxRewardCents: null, minOrderCents: 0 };

type Tx = Prisma.TransactionClient;

/** The admin's referral settings; a settings failure reads as "program off", never as an error. */
export async function getReferralSettings(): Promise<ReferralSettings> {
  try {
    const s = await getSetting("referral");
    return {
      enabled: s.enabled === true,
      rewardType: s.rewardType === "PERCENT" ? "PERCENT" : "FIXED",
      rewardValue: Number.isFinite(s.rewardValue) ? Math.max(0, s.rewardValue) : 0,
      maxRewardCents: s.maxRewardCents != null && Number.isFinite(s.maxRewardCents) ? Math.max(0, Math.trunc(s.maxRewardCents)) : null,
      minOrderCents: Number.isFinite(s.minOrderCents) ? Math.max(0, Math.trunc(s.minOrderCents)) : 0,
    };
  } catch (err) {
    console.error("[referral] Could not read referral settings; treating the program as disabled", err);
    return DISABLED;
  }
}

/** PERCENT of the order's USD value (capped at maxRewardCents), or a FIXED amount; all USD cents. */
export function computeRewardCents(totalCents: number, s: ReferralSettings): number {
  let cents = s.rewardType === "PERCENT" ? Math.floor((totalCents * s.rewardValue) / 100) : Math.trunc(s.rewardValue);
  if (s.maxRewardCents !== null) cents = Math.min(cents, s.maxRewardCents);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : 0;
}

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(0, ALPHABET.length)];
  return code;
}

export function normalizeReferralCode(raw: string | null | undefined): string | null {
  const code = raw?.trim().toUpperCase();
  return code && REFERRAL_CODE_RE.test(code) ? code : null;
}

function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/**
 * The customer's share code, created on first use. Concurrent calls converge on one code: only a
 * row whose code is still null is updated, and a collision with another customer's code retries.
 */
export async function ensureReferralCode(customerId: string): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await prisma.customer.findUnique({ where: { id: customerId }, select: { referralCode: true } });
    if (!current) throw new Error(`Customer ${customerId} not found`);
    if (current.referralCode) return current.referralCode;
    try {
      await prisma.customer.updateMany({ where: { id: customerId, referralCode: null }, data: { referralCode: generateCode() } });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // another customer already has this code: try a new one
    }
  }
  throw new Error(`Could not allocate a referral code for customer ${customerId}`);
}

/** Lowercase, and "name+tag@x" counts as "name@x", so a buyer can't refer themself with an alias. */
function canonicalEmail(email: string): string {
  const [local = "", domain = ""] = email.trim().toLowerCase().split("@");
  return `${local.split("+")[0]}@${domain}`;
}

/**
 * Links the buyer to the owner of `code`. Runs inside the checkout transaction (the buyer's row is
 * already locked there). Never throws for an unusable code: it just attaches nothing.
 * Attaches only when the buyer was never referred, has never paid for an order, and isn't the
 * referrer (same customer or same email).
 */
export async function attachReferrer(tx: Tx, buyer: { customerId: string; email: string }, rawCode: string | null): Promise<boolean> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return false;
  const referrer = await tx.customer.findUnique({ where: { referralCode: code }, select: { id: true, email: true } });
  if (!referrer || referrer.id === buyer.customerId) return false;
  if (canonicalEmail(referrer.email) === canonicalEmail(buyer.email)) return false;

  const paidBefore = await tx.order.count({ where: { customerId: buyer.customerId, paidAt: { not: null } } });
  if (paidBefore > 0) return false;

  const linked = await tx.customer.updateMany({
    where: { id: buyer.customerId, referredById: null },
    data: { referredById: referrer.id },
  });
  return linked.count === 1;
}

/**
 * Creates the PENDING reward when a referee's order becomes PAID. Idempotent: safe to call again
 * for the same order (and from the FULFILLED hook as a retry). Returns true only when it created one.
 */
export async function recordReferralReward(orderId: string): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      totalUsdCents: true,
      paidAt: true,
      customerId: true,
      referralReward: { select: { id: true } },
      customer: { select: { referredById: true } },
    },
  });
  if (!order || order.referralReward || !order.paidAt) return false;
  if (order.status !== "PAID" && order.status !== "FULFILLED") return false;
  const referrerId = order.customer.referredById;
  if (!referrerId || referrerId === order.customerId) return false;
  // Rewards are wallet credit (USD): the minimum and the percentage apply to the order's USD value,
  // whatever currency the referee paid in
  const settings = await getReferralSettings();
  if (!settings.enabled || order.totalUsdCents < settings.minOrderCents) return false;

  // Only the referee's first paid order counts (a small first order doesn't let a later one qualify)
  const earlier = await prisma.order.count({
    where: {
      customerId: order.customerId,
      id: { not: order.id },
      OR: [{ paidAt: { lt: order.paidAt } }, { paidAt: order.paidAt, id: { lt: order.id } }],
    },
  });
  if (earlier > 0) return false;

  const amountCents = computeRewardCents(order.totalUsdCents, settings);
  if (amountCents <= 0) return false;

  try {
    await prisma.referralReward.create({
      data: { referrerId, refereeId: order.customerId, orderId: order.id, amountCents, status: "PENDING" },
    });
    return true;
  } catch (e) {
    if (isUniqueViolation(e)) return false; // already recorded (this order, or another first order raced it)
    throw e;
  }
}

/**
 * PENDING -> CREDITED and the wallet credit, once the referee's order is FULFILLED. Holds the order
 * row lock (the refund path takes the same lock), so a refund and a credit never both win.
 * Returns true only for the call that credited.
 */
export async function creditReferralReward(orderId: string): Promise<boolean> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ status: string }[]>`
        SELECT status::text AS status FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
      if (rows[0]?.status !== "FULFILLED") return false;
      const claimed = await tx.referralReward.updateMany({
        where: { orderId, status: "PENDING" },
        data: { status: "CREDITED", creditedAt: new Date() },
      });
      if (claimed.count !== 1) return false;
      const reward = await tx.referralReward.findUniqueOrThrow({ where: { orderId }, select: { referrerId: true, amountCents: true } });
      // No orderId on the ledger row: it is the referee's order, and orderWalletNetDebit() sums by order
      await creditWallet(tx, reward.referrerId, reward.amountCents, { type: "ADJUSTMENT", note: REFERRAL_WALLET_NOTE });
      return true;
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}

/**
 * Inside the refund transaction: a reward not yet credited is cancelled. A CREDITED one is left as
 * is (the referrer keeps it); the caller records which case applied.
 */
export async function cancelReferralRewardInTx(tx: Tx, orderId: string): Promise<"cancelled" | "already_credited" | null> {
  const cancelled = await tx.referralReward.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "CANCELLED" } });
  if (cancelled.count > 0) return "cancelled";
  const credited = await tx.referralReward.count({ where: { orderId, status: "CREDITED" } });
  return credited > 0 ? "already_credited" : null;
}

/**
 * Self-healing sweep: credits this referrer's PENDING rewards whose order is already FULFILLED
 * (e.g. the process stopped between the fulfilment and the credit). Never throws.
 */
export async function settleReferralRewards(referrerId: string): Promise<void> {
  try {
    const due = await prisma.referralReward.findMany({
      where: { referrerId, status: "PENDING", order: { status: "FULFILLED" } },
      select: { orderId: true },
      take: 20,
    });
    for (const { orderId } of due) await creditReferralReward(orderId);
  } catch (err) {
    console.error(`[referral] Settling rewards for ${referrerId} failed`, err);
  }
}

export type ReferralSummary = { invited: number; rewarded: number; pending: number; earnedCents: number };

export async function getReferralSummary(customerId: string): Promise<ReferralSummary> {
  const [invited, groups] = await Promise.all([
    prisma.customer.count({ where: { referredById: customerId } }),
    prisma.referralReward.groupBy({
      by: ["status"],
      where: { referrerId: customerId },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
  ]);
  const by = new Map(groups.map((g) => [g.status, g]));
  return {
    invited,
    rewarded: by.get("CREDITED")?._count._all ?? 0,
    pending: by.get("PENDING")?._count._all ?? 0,
    earnedCents: by.get("CREDITED")?._sum.amountCents ?? 0,
  };
}
