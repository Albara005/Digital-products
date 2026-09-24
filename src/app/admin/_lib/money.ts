import "server-only";
import { cache } from "react";
import { BASE_CURRENCY, convertUsdCents, inputToUsdCents, usdToInput } from "@/lib/display-currency";
import { formatPrice } from "@/lib/format";
import { type Fx, adminFx, fxFor, getCurrencySettings } from "@/lib/fx";

/*
 * Admin panel money. Everything the store sums or configures (revenue, "spent", wallets, catalog
 * prices, coupon and referral amounts) is stored in USD cents and shown converted to the admin's
 * chosen currency (cookie nitro_admin_currency) at the CURRENT rate. Individual orders keep their
 * own charged currency. Inputs are typed in the admin currency and stored as USD cents
 * (round(value / rate x 100)); the form posts its currency in MONEY_CURRENCY_FIELD and the
 * server re-reads that currency's rate from the settings, never from the browser.
 */

export const MONEY_CURRENCY_FIELD = "moneyCurrency";

export type AdminMoney = {
  fx: Fx;
  /** Enabled currencies for the picker (USD first). */
  options: string[];
  /** USD cents shown in the admin currency. */
  usd: (usdCents: number) => string;
  /** USD cents in the admin currency's minor units (charts, CSV). */
  minor: (usdCents: number) => number;
  /** An amount in its own currency (an order's charged currency). */
  own: (minor: number, currency: string) => string;
  /** The admin-currency equivalent of an order amount, or null when the order is already in that currency. */
  equivalent: (usdCents: number, orderCurrency: string) => string | null;
  /** Stored USD cents -> input text in the admin currency. */
  toInput: (usdCents: number) => string;
};

export const getAdminMoney = cache(async (): Promise<AdminMoney> => {
  const settings = await getCurrencySettings();
  const fx = await adminFx(settings);
  const minor = (usdCents: number) => convertUsdCents(Math.round(usdCents), fx.currency, fx.rate, { precise: true });
  return {
    fx,
    options: [BASE_CURRENCY, ...(settings?.enabled ?? [])],
    usd: (usdCents) => formatPrice(minor(usdCents), fx.currency),
    minor,
    own: (amount, currency) => formatPrice(amount, currency),
    equivalent: (usdCents, orderCurrency) =>
      orderCurrency.toUpperCase() === fx.currency ? null : formatPrice(minor(usdCents), fx.currency),
    toInput: (usdCents) => usdToInput(usdCents, fx.currency, fx.rate),
  };
});

/**
 * The currency a submitted admin form was typed in (its hidden MONEY_CURRENCY_FIELD, which must be
 * USD or enabled), with the server's current rate; falls back to the admin cookie's currency.
 */
export async function formMoneyFx(formData: FormData): Promise<Fx | null> {
  const settings = await getCurrencySettings();
  const posted = formData.get(MONEY_CURRENCY_FIELD);
  if (typeof posted === "string" && posted.trim()) return fxFor(posted, settings);
  return adminFx(settings);
}

/** Input text in `fx`'s currency -> USD cents; null when invalid. */
export function parseMoneyInput(raw: string, fx: Fx, opts: { signed?: boolean } = {}): number | null {
  return inputToUsdCents(raw, fx.currency, fx.rate, opts);
}
