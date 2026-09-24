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

/** "auto" = picked from the visitor's country (may be re-detected); "manual" = the visitor chose it (never overridden). */
export const CURRENCY_SOURCE_COOKIE = "nitro_currency_src";
export type CurrencySource = "auto" | "manual";
export const CURRENCY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const COUNTRY_CURRENCY: Record<string, DisplayCurrency> = {
  SA: "SAR",
  AE: "AED",
  KW: "KWD",
  QA: "QAR",
  BH: "BHD",
  OM: "OMR",
  EG: "EGP",
};

const TIMEZONE_CURRENCY: Record<string, DisplayCurrency> = {
  "Asia/Riyadh": "SAR",
  "Asia/Dubai": "AED",
  "Asia/Kuwait": "KWD",
  "Asia/Qatar": "QAR",
  "Asia/Bahrain": "BHD",
  "Asia/Muscat": "OMR",
  "Africa/Cairo": "EGP",
};

/** ISO country code ("SA", "om") -> display currency, or null outside the supported countries. */
export function currencyForCountry(country: string | null | undefined): DisplayCurrency | null {
  return (country && COUNTRY_CURRENCY[country.trim().toUpperCase()]) || null;
}

/** IANA time zone ("Asia/Muscat") -> display currency, or null. */
export function currencyForTimeZone(timeZone: string | null | undefined): DisplayCurrency | null {
  return (timeZone && TIMEZONE_CURRENCY[timeZone]) || null;
}

/** First supported country found in Accept-Language region subtags ("ar-SA,ar;q=0.9" -> "SAR"). */
export function currencyForAcceptLanguage(acceptLanguage: string | null | undefined): DisplayCurrency | null {
  if (!acceptLanguage) return null;
  for (const part of acceptLanguage.split(",")) {
    const region = part.trim().split(";")[0]?.split("-")[1];
    const found = currencyForCountry(region);
    if (found) return found;
  }
  return null;
}
