import "server-only";

/*
 * Payments: Tap (Gulf / MENA cards, mada, KNET, Apple Pay) and Stripe (international cards),
 * plus refunds and wallet top-up confirmation. A provider is enabled when its secret key is set;
 * with none enabled outside production the store runs in dev mode (no real charge).
 */

export { getCheckoutOptions, getProvider, resolveProvider, type CheckoutOptions } from "./providers";
export { refundOrderPayment, type RefundMethod, type RefundResult } from "./refunds";
export { confirmTopupPaid, failTopup, TOPUP_MAX_CENTS, TOPUP_MIN_CENTS, TOPUP_STEP_CENTS } from "./topups";
export { processTapCharge, type TapChargeOutcome } from "./tap-events";
export { isTapChargeId, isTapEnabled } from "./tap";
export { currencyDecimals, majorToMinor, minorToMajor } from "./currency";
export {
  PaymentProviderError,
  type CreatePaymentInput,
  type PaymentKind,
  type PaymentLineItem,
  type PaymentSession,
  type ProviderId,
} from "./types";
