// Shared shapes for the payment providers. Amounts are always integers in minor units ("cents").

export type ProviderId = "STRIPE" | "TAP";

/** What a payment is for; sent to the gateway as metadata.kind and checked on confirmation. */
export type PaymentKind = "order" | "topup";

export type PaymentLineItem = {
  name: string;
  quantity: number;
  unitAmountMinor: number;
  imageUrl?: string | null;
};

export type CreatePaymentInput = {
  kind: PaymentKind;
  /** Order id or WalletTopup id */
  refId: string;
  amountMinor: number;
  currency: string;
  email: string;
  customerName?: string | null;
  description: string;
  /** Itemised lines for the hosted page, only when they add up to amountMinor exactly (Stripe) */
  lineItems?: PaymentLineItem[];
  /** Where the buyer lands after paying / cancelling (Stripe; Tap returns through /api/tap/return) */
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
};

/** A hosted payment page: `ref` is stored on our record (Stripe session id / Tap charge id). */
export type PaymentSession = { ref: string; url: string };

export type RefundInput = {
  orderId: string;
  amountMinor: number;
  currency: string;
  stripePaymentIntent?: string | null;
  stripeSessionId?: string | null;
  tapChargeId?: string | null;
};

export type RefundReceipt = { refundId: string; status: string };

export interface PaymentProviderAdapter {
  id: ProviderId;
  /** Arabic label for the checkout's payment method picker */
  label: string;
  isEnabled(): boolean;
  createPayment(input: CreatePaymentInput): Promise<PaymentSession>;
  refund(input: RefundInput): Promise<RefundReceipt>;
}

/** A gateway call that failed; `message` is for logs, never shown to buyers as-is. */
export class PaymentProviderError extends Error {
  constructor(
    readonly provider: ProviderId,
    message: string,
    readonly httpStatus = 0,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "PaymentProviderError";
  }
}
