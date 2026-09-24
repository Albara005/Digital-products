import "server-only";
import type { Prisma, WalletTransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";

/*
 * Customer wallet (store credit).
 *
 * WalletTransaction is an append-only ledger; Customer.walletBalanceCents is its running total.
 * Every movement goes through post(), which locks the customer row (SELECT ... FOR UPDATE) inside
 * the caller's transaction, so concurrent debits serialize and the balance can never go negative:
 * the second of two racing checkouts sees the balance the first one left.
 *
 * Amounts are always USD cents (WALLET_CURRENCY). The customer sees the balance converted to their
 * currency; an order in another currency debits the USD equivalent of its wallet part
 * (Order.walletDebitUsdCents, see walletPart() in src/lib/pricing.ts) and refunds credit USD back.
 */

export const WALLET_CURRENCY = "USD";

/** Largest single admin adjustment, in cents ($10,000). */
const MAX_ADJUSTMENT_CENTS = 1_000_000;

type Tx = Prisma.TransactionClient;

export type WalletEntry = {
  type: WalletTransactionType;
  orderId?: string | null;
  topupId?: string | null;
  note?: string | null;
};

export type WalletPosting = { transactionId: string; balanceAfterCents: number };

export type WalletTransactionView = {
  id: string;
  type: WalletTransactionType;
  /** Positive = credit, negative = debit */
  amountCents: number;
  balanceAfterCents: number;
  note: string | null;
  orderId: string | null;
  topupId: string | null;
  createdAt: Date;
};

export const walletTransactionTypeLabel: Record<WalletTransactionType, string> = {
  TOPUP: "شحن رصيد",
  PURCHASE: "شراء",
  REFUND: "استرجاع",
  ADJUSTMENT: "تعديل من الإدارة",
};

/** Thrown by debitWallet when the locked balance is lower than the debit; the caller's transaction should roll back. */
export class InsufficientBalanceError extends Error {
  constructor(
    readonly balanceCents: number,
    readonly requestedCents: number,
  ) {
    super(`Insufficient wallet balance: ${balanceCents} < ${requestedCents}`);
    this.name = "InsufficientBalanceError";
  }
}

function assertPositiveCents(cents: number) {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new RangeError(`Wallet amount must be a positive integer, got ${cents}`);
}

/**
 * Locks the customer's row for the rest of the transaction and returns the current balance.
 * Call it early in a transaction that will debit later, to keep a consistent lock order.
 */
export async function lockWallet(tx: Tx, customerId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ walletBalanceCents: number }[]>`
    SELECT "walletBalanceCents" FROM "Customer" WHERE id = ${customerId} FOR UPDATE`;
  if (!rows[0]) throw new Error(`Customer ${customerId} not found`);
  return rows[0].walletBalanceCents;
}

async function post(tx: Tx, customerId: string, deltaCents: number, entry: WalletEntry): Promise<WalletPosting> {
  const balance = await lockWallet(tx, customerId);
  const after = balance + deltaCents;
  if (after < 0) throw new InsufficientBalanceError(balance, -deltaCents);
  await tx.customer.update({ where: { id: customerId }, data: { walletBalanceCents: after } });
  const row = await tx.walletTransaction.create({
    data: {
      customerId,
      type: entry.type,
      amountCents: deltaCents,
      balanceAfterCents: after,
      orderId: entry.orderId ?? null,
      topupId: entry.topupId ?? null,
      note: entry.note ?? null,
    },
    select: { id: true },
  });
  return { transactionId: row.id, balanceAfterCents: after };
}

/** Adds `cents` to the wallet and records it. Must run inside a transaction. */
export function creditWallet(tx: Tx, customerId: string, cents: number, entry: WalletEntry): Promise<WalletPosting> {
  assertPositiveCents(cents);
  return post(tx, customerId, cents, entry);
}

/** Takes `cents` from the wallet and records it; throws InsufficientBalanceError if short. Must run inside a transaction. */
export function debitWallet(tx: Tx, customerId: string, cents: number, entry: WalletEntry): Promise<WalletPosting> {
  assertPositiveCents(cents);
  return post(tx, customerId, -cents, entry);
}

/**
 * What an order currently holds from the wallet: its debits minus what was already given back.
 * checkout debit -> walletAppliedCents; after a failure/refund credit -> 0.
 */
export async function orderWalletNetDebit(db: Tx, orderId: string): Promise<number> {
  const sum = await db.walletTransaction.aggregate({ where: { orderId }, _sum: { amountCents: true } });
  return -(sum._sum.amountCents ?? 0);
}

/** Current balance in cents (0 for an unknown customer). */
export async function getWalletBalance(customerId: string): Promise<number> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { walletBalanceCents: true } });
  return customer?.walletBalanceCents ?? 0;
}

/** Newest first. `take` is capped at 100. */
export async function listWalletTransactions(
  customerId: string,
  { take = 20, skip = 0 }: { take?: number; skip?: number } = {},
): Promise<WalletTransactionView[]> {
  return prisma.walletTransaction.findMany({
    where: { customerId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(Math.trunc(take) || 0, 1), 100),
    skip: Math.max(Math.trunc(skip) || 0, 0),
    select: {
      id: true,
      type: true,
      amountCents: true,
      balanceAfterCents: true,
      note: true,
      orderId: true,
      topupId: true,
      createdAt: true,
    },
  });
}

/** Total ledger rows, for pagination next to listWalletTransactions. */
export function countWalletTransactions(customerId: string): Promise<number> {
  return prisma.walletTransaction.count({ where: { customerId } });
}

export type AdjustWalletResult = { ok: true; balanceCents: number } | { ok: false; error: string };

/**
 * Admin credit (positive) or debit (negative) with a mandatory reason, audited.
 * A debit larger than the balance is refused.
 */
export async function adjustWallet(
  customerId: string,
  cents: number,
  note: string,
  actor: AuditActor,
): Promise<AdjustWalletResult> {
  const reason = note.trim();
  if (!Number.isSafeInteger(cents) || cents === 0) return { ok: false, error: "أدخل مبلغاً صحيحاً غير الصفر." };
  if (Math.abs(cents) > MAX_ADJUSTMENT_CENTS) return { ok: false, error: "المبلغ أكبر من الحد المسموح للتعديل الواحد." };
  if (reason.length < 3) return { ok: false, error: "اكتب سبب التعديل." };
  if (reason.length > 200) return { ok: false, error: "سبب التعديل طويل جداً." };

  let posting: WalletPosting;
  try {
    posting = await prisma.$transaction(
      (tx) => post(tx, customerId, cents, { type: "ADJUSTMENT", note: reason }),
      { maxWait: 10_000, timeout: 20_000 },
    );
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      return { ok: false, error: "لا يمكن الخصم: الرصيد الحالي أقل من المبلغ المطلوب." };
    }
    if (err instanceof Error && err.message.startsWith("Customer ")) return { ok: false, error: "العميل غير موجود." };
    throw err;
  }

  await audit(actor, "wallet.adjust", { type: "customer", id: customerId }, {
    amountCents: cents,
    note: reason,
    balanceAfterCents: posting.balanceAfterCents,
    transactionId: posting.transactionId,
  });
  return { ok: true, balanceCents: posting.balanceAfterCents };
}
