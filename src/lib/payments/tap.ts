import "server-only";
import { z } from "zod";
import { siteUrl } from "@/lib/email";
import { majorToMinor, minorToMajor } from "./currency";
import {
  PaymentProviderError,
  type CreatePaymentInput,
  type PaymentKind,
  type PaymentProviderAdapter,
  type PaymentSession,
  type RefundInput,
  type RefundReceipt,
} from "./types";

/*
 * Tap Payments (https://api.tap.company/v2): cards, mada, KNET, Apple Pay for Gulf / MENA buyers.
 *
 * Flow: POST /charges with source "src_all" -> redirect the buyer to charge.transaction.url ->
 * Tap sends the buyer back to /api/tap/return?tap_id=chg_... and POSTs the charge to /api/tap/webhook.
 * Neither the redirect nor the webhook body is trusted: both only carry a charge id, and we
 * re-fetch GET /charges/{id} with the secret key, then act only if it is CAPTURED and amount,
 * currency and metadata (kind + our id) match our record (evaluateTapCharge).
 */

const DEFAULT_API_BASE = "https://api.tap.company/v2";
const REQUEST_TIMEOUT_MS = 15_000;

export const TAP_CAPTURED = "CAPTURED";
/** Final, unpaid charge states: the order/top-up can be failed. INITIATED, IN_PROGRESS, UNKNOWN... mean "wait". */
export const TAP_FAILED_STATUSES: ReadonlySet<string> = new Set([
  "ABANDONED",
  "CANCELLED",
  "DECLINED",
  "FAILED",
  "RESTRICTED",
  "TIMEDOUT",
  "VOID",
]);

const CHARGE_ID = /^chg_[A-Za-z0-9_-]{4,100}$/;

export function isTapChargeId(value: unknown): value is string {
  return typeof value === "string" && CHARGE_ID.test(value);
}

export function isTapEnabled(): boolean {
  return Boolean(process.env.TAP_SECRET_KEY?.trim());
}

/** TAP_API_BASE (e.g. a local mock) is honoured outside production only. */
function apiBase(): string {
  const override = process.env.TAP_API_BASE?.trim();
  if (override && process.env.NODE_ENV !== "production") return override.replace(/\/+$/, "");
  return DEFAULT_API_BASE;
}

const tapErrorSchema = z.object({
  errors: z.array(z.object({ code: z.unknown().optional(), description: z.string().optional() })).optional(),
  message: z.string().optional(),
});

async function tapRequest(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
  const key = process.env.TAP_SECRET_KEY?.trim();
  if (!key) throw new PaymentProviderError("TAP", "TAP_SECRET_KEY is not set");

  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    throw new PaymentProviderError("TAP", `Tap ${method} ${path}: network error`, 0, { cause: err });
  }

  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // handled below
  }
  if (!res.ok) {
    const parsed = tapErrorSchema.safeParse(json);
    const detail = parsed.success
      ? parsed.data.errors?.map((e) => `${String(e.code ?? "")} ${e.description ?? ""}`.trim()).join("; ") || parsed.data.message
      : undefined;
    throw new PaymentProviderError("TAP", `Tap ${method} ${path}: HTTP ${res.status} ${detail ?? text.slice(0, 300)}`, res.status);
  }
  if (json === null || typeof json !== "object") {
    throw new PaymentProviderError("TAP", `Tap ${method} ${path}: unexpected response`, res.status);
  }
  return json;
}

const chargeSchema = z.object({
  id: z.string(),
  status: z.string(),
  amount: z.union([z.number(), z.string()]),
  currency: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  transaction: z.object({ url: z.string().nullish() }).partial().nullish(),
});

export type TapCharge = z.infer<typeof chargeSchema>;

function parseCharge(json: unknown): TapCharge {
  const parsed = chargeSchema.safeParse(json);
  if (!parsed.success) throw new PaymentProviderError("TAP", "Tap returned a charge in an unexpected format");
  return parsed.data;
}

/** First name for Tap's required customer object: the email's local part, or a generic label. */
function firstNameFor(input: CreatePaymentInput): string {
  const name = input.customerName?.trim() || input.email.split("@")[0]?.trim() || "";
  return name.slice(0, 50) || "Customer";
}

export async function createTapCharge(input: CreatePaymentInput): Promise<PaymentSession> {
  const site = siteUrl();
  const idKey = input.kind === "order" ? "orderId" : "topupId";
  const json = await tapRequest("POST", "/charges", {
    amount: minorToMajor(input.amountMinor, input.currency),
    currency: input.currency.toUpperCase(),
    threeDSecure: true,
    save_card: false,
    description: input.description.slice(0, 250),
    customer: { first_name: firstNameFor(input), email: input.email },
    source: { id: "src_all" },
    redirect: { url: `${site}/api/tap/return` },
    post: { url: `${site}/api/tap/webhook` },
    reference: { transaction: input.refId, order: input.refId },
    metadata: { kind: input.kind, [idKey]: input.refId },
  });
  const charge = parseCharge(json);
  const url = charge.transaction?.url;
  if (!isTapChargeId(charge.id) || !url || !/^https?:\/\//.test(url)) {
    throw new PaymentProviderError("TAP", `Tap charge ${charge.id} has no payment URL (status ${charge.status})`);
  }
  return { ref: charge.id, url };
}

export async function retrieveTapCharge(chargeId: string): Promise<TapCharge> {
  if (!isTapChargeId(chargeId)) throw new PaymentProviderError("TAP", "Invalid Tap charge id");
  return parseCharge(await tapRequest("GET", `/charges/${encodeURIComponent(chargeId)}`));
}

export type TapExpectation = {
  chargeId: string;
  /** What the gateway should have collected, in minor units */
  amountMinor: number;
  currency: string;
  kind: PaymentKind;
  /** Our order / top-up id, as sent in metadata */
  refId: string;
};

export type TapVerdict =
  | { result: "paid" }
  | { result: "failed"; status: string }
  | { result: "pending"; status: string }
  | { result: "mismatch"; reason: string };

/**
 * Decides what a re-fetched charge means for our record. Pure: no I/O.
 * Identity (id, metadata kind + id, currency) must match before any state is trusted; a CAPTURED
 * charge must also carry exactly the expected amount.
 */
export function evaluateTapCharge(charge: TapCharge, expected: TapExpectation): TapVerdict {
  if (charge.id !== expected.chargeId) return { result: "mismatch", reason: `charge id ${charge.id} != ${expected.chargeId}` };
  const metadata = charge.metadata ?? {};
  const idKey = expected.kind === "order" ? "orderId" : "topupId";
  if (metadata.kind !== expected.kind || metadata[idKey] !== expected.refId) {
    return { result: "mismatch", reason: `metadata ${JSON.stringify(metadata).slice(0, 200)} does not match ${expected.kind} ${expected.refId}` };
  }
  if (charge.currency.toUpperCase() !== expected.currency.toUpperCase()) {
    return { result: "mismatch", reason: `currency ${charge.currency} != ${expected.currency}` };
  }

  const status = charge.status.toUpperCase();
  if (status === TAP_CAPTURED) {
    const paid = majorToMinor(charge.amount, expected.currency);
    if (paid !== expected.amountMinor) {
      return { result: "mismatch", reason: `captured ${charge.amount} ${charge.currency}, expected ${expected.amountMinor} minor units` };
    }
    return { result: "paid" };
  }
  if (TAP_FAILED_STATUSES.has(status)) return { result: "failed", status };
  return { result: "pending", status };
}

/** Re-fetches the charge with the secret key and evaluates it against what we stored. */
export async function verifyTapCharge(expected: TapExpectation): Promise<{ verdict: TapVerdict; charge: TapCharge }> {
  const charge = await retrieveTapCharge(expected.chargeId);
  return { verdict: evaluateTapCharge(charge, expected), charge };
}

const refundSchema = z.object({ id: z.string(), status: z.string().optional() });
const REFUND_FAILED_STATUSES = new Set(["FAILED", "DECLINED", "CANCELLED", "REJECTED"]);

export async function createTapRefund(input: RefundInput): Promise<RefundReceipt> {
  if (!input.tapChargeId) throw new PaymentProviderError("TAP", `Order ${input.orderId} has no Tap charge id`);
  const json = await tapRequest("POST", "/refunds", {
    charge_id: input.tapChargeId,
    amount: minorToMajor(input.amountMinor, input.currency),
    currency: input.currency.toUpperCase(),
    reason: "requested_by_customer",
    reference: { merchant: input.orderId },
    metadata: { kind: "refund", orderId: input.orderId },
  });
  const parsed = refundSchema.safeParse(json);
  if (!parsed.success) throw new PaymentProviderError("TAP", "Tap returned a refund in an unexpected format");
  const status = (parsed.data.status ?? "PENDING").toUpperCase();
  if (REFUND_FAILED_STATUSES.has(status)) {
    throw new PaymentProviderError("TAP", `Tap refund ${parsed.data.id} for order ${input.orderId} is ${status}`);
  }
  return { refundId: parsed.data.id, status };
}

export const tapProvider: PaymentProviderAdapter = {
  id: "TAP",
  label: "بطاقة / مدى / Apple Pay (Tap)",
  isEnabled: isTapEnabled,
  createPayment: createTapCharge,
  refund: createTapRefund,
};
