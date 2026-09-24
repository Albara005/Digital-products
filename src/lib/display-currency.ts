// Display-only currency conversion for the storefront. Prices are stored and charged in USD;
// shoppers may pick a local currency to see an approximate ("≈") converted amount next to the
// USD price. Nothing here is ever used to compute an amount that is charged.
// Pure module: safe for server, client and the admin settings form.
import { type Locale, intlLocale } from "@/i18n/config";
import { currencyDecimals } from "@/lib/payments/currency";

export const DISPLAY_CURRENCIES = ["SAR", "AED", "KWD", "QAR", "BHD", "OMR", "EGP"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

/** Units of each currency per 1 USD. Admin-editable via the `currencies` setting. */
export const DEFAULT_RATES: Record<DisplayCurrency, number> = {
  SAR: 3.75,
  AED: 3.6725,
  KWD: 0.307,
  QAR: 3.64,
  BHD: 0.376,
  OMR: 0.3845,
  EGP: 48.5,
};

/** The visitor's chosen display currency ("USD" or one of DISPLAY_CURRENCIES). */
export const CURRENCY_COOKIE = "nitro_currency";
export const BASE_CURRENCY = "USD";

export type CurrencyOption = { code: DisplayCurrency; rate: number };

export function isDisplayCurrency(value: unknown): value is DisplayCurrency {
  return typeof value === "string" && (DISPLAY_CURRENCIES as readonly string[]).includes(value);
}

/** 1875 USD cents at 3.75 SAR/USD -> "‏70.31 ر.س.‏" (ar) / "SAR 70.31" (en), with the currency's own decimals. */
export function formatConverted(usdCents: number, option: CurrencyOption, locale: Locale): string {
  const digits = currencyDecimals(option.code);
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: option.code,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format((usdCents / 100) * option.rate);
}
