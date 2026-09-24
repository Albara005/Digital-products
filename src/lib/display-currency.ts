// Store currencies. Catalog prices, coupon amounts, the wallet and every admin setting are kept in
// USD cents; a shopper who selects another currency (SAR, KWD, ...) sees AND pays in that currency.
// Every conversion goes through toMinor()/convertUsdCents() below, so the amount displayed is
// exactly the amount charged. Pure module: safe for server, client, scripts and tests.
import { type Locale, intlLocale } from "@/i18n/config";
import { currencyDecimals } from "@/lib/payments/currency";

export const DISPLAY_CURRENCIES = ["SAR", "AED", "KWD", "QAR", "BHD", "OMR", "EGP"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];
/** USD or one of DISPLAY_CURRENCIES. */
export type StoreCurrency = DisplayCurrency | "USD";

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

/** The visitor's chosen currency ("USD" or one of DISPLAY_CURRENCIES). */
export const CURRENCY_COOKIE = "nitro_currency";
/** The admin panel's own currency choice (separate from the storefront cookie). */
export const ADMIN_CURRENCY_COOKIE = "nitro_admin_currency";
export const BASE_CURRENCY = "USD";

export type CurrencyOption = { code: DisplayCurrency; rate: number };
/** Units per USD, by currency code. USD is always 1 and need not be listed. */
export type Rates = Readonly<Partial<Record<string, number>>>;

export function isDisplayCurrency(value: unknown): value is DisplayCurrency {
  return typeof value === "string" && (DISPLAY_CURRENCIES as readonly string[]).includes(value);
}

/**
 * Smallest amount step, in minor units, that the store charges in `currency`. Stripe requires
 * three-decimal currencies (KWD, BHD, OMR, ...) to be charged in multiples of 10 (the last digit
 * must be 0), so converted amounts in those currencies are rounded to 0.010.
 */
export function chargeStep(currency: string): number {
  return currencyDecimals(currency) === 3 ? 10 : 1;
}

/** Units of `currency` per USD from `rates`; 1 for USD; null when the currency has no valid rate. */
export function rateFor(currency: string, rates: Rates): number | null {
  const code = currency.trim().toUpperCase();
  if (code === BASE_CURRENCY) return 1;
  const rate = rates[code];
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null;
}

// Float products such as 1875 * 0.3845 * 10 carry binary noise (7209.374999...); trimming to
// 9 significant decimals first makes exact halves round the same way everywhere.
const clean = (value: number) => Number(value.toFixed(9));

/**
 * USD cents -> minor units of `currency` at `rate` (units per USD):
 * round(usdCents / 100 * rate * 10^decimals), to the currency's charge step. USD is unchanged.
 * `precise: true` skips the charge step (admin inputs, so they round-trip to the same USD cents).
 */
export function convertUsdCents(usdCents: number, currency: string, rate: number, opts: { precise?: boolean } = {}): number {
  if (!Number.isSafeInteger(usdCents)) throw new RangeError(`USD amount must be an integer number of cents, got ${usdCents}`);
  if (currency.trim().toUpperCase() === BASE_CURRENCY) return usdCents;
  if (!Number.isFinite(rate) || rate <= 0) throw new RangeError(`Invalid rate ${rate} for ${currency}`);
  const exact = clean((usdCents * rate * 10 ** currencyDecimals(currency)) / 100);
  const step = opts.precise ? 1 : chargeStep(currency);
  return Math.round(clean(exact / step)) * step;
}

/** The single conversion used by display and checkout alike: USD cents -> minor units of `currency`. */
export function toMinor(usdCents: number, currency: string, rates: Rates, opts: { precise?: boolean } = {}): number {
  const rate = rateFor(currency, rates);
  if (rate === null) throw new RangeError(`No exchange rate for ${currency}`);
  return convertUsdCents(usdCents, currency, rate, opts);
}

/**
 * Minor units of `currency` -> USD cents at `rate`. "floor" never gives more USD than the amount
 * is worth (wallet debits: the customer is never charged more than shown), "round" is the nearest.
 */
export function toUsdCents(minor: number, currency: string, rate: number, rounding: "floor" | "round" | "ceil" = "round"): number {
  if (currency.trim().toUpperCase() === BASE_CURRENCY) return minor;
  if (!Number.isFinite(rate) || rate <= 0) throw new RangeError(`Invalid rate ${rate} for ${currency}`);
  const exact = clean((minor * 100) / (rate * 10 ** currencyDecimals(currency)));
  return rounding === "floor" ? Math.floor(exact) : rounding === "ceil" ? Math.ceil(exact) : Math.round(exact);
}

/** Minor units -> major-unit decimal string for form inputs: 1875 USD -> "18.75", 7210 OMR -> "7.210". */
export function minorToInput(minor: number, currency: string): string {
  const decimals = currencyDecimals(currency);
  return (minor / 10 ** decimals).toFixed(decimals);
}

/** "18.75" / "7.21" / "7" -> minor units of `currency`; null when not a plain non-negative amount with at most the currency's decimals. */
export function inputToMinor(raw: string, currency: string): number | null {
  const decimals = currencyDecimals(currency);
  const match = raw.trim().replace(/,/g, "").match(/^(\d{1,9})(?:\.(\d*))?$/);
  if (!match) return null;
  const frac = match[2] ?? "";
  if (frac.length > decimals) return null;
  return Number(match[1]) * 10 ** decimals + Number((frac + "0".repeat(decimals)).slice(0, decimals) || 0);
}

/** Stripe rejects charges under the equivalent of USD 0.50 (AED has its own 2.00 floor); Tap has similar floors. */
export const MIN_GATEWAY_CHARGE_USD_CENTS = 50;
const MIN_GATEWAY_CHARGE_FLOOR: Readonly<Record<string, number>> = { AED: 200 };

/** The smallest amount a gateway may charge in `currency`, in its minor units (0.50 USD converted, rounded up to the step). */
export function minGatewayCharge(currency: string, rate: number): number {
  const step = chargeStep(currency);
  const converted =
    currency.trim().toUpperCase() === BASE_CURRENCY
      ? MIN_GATEWAY_CHARGE_USD_CENTS
      : Math.ceil(clean((MIN_GATEWAY_CHARGE_USD_CENTS * rate * 10 ** currencyDecimals(currency)) / 100 / step)) * step;
  return Math.max(converted, MIN_GATEWAY_CHARGE_FLOOR[currency.trim().toUpperCase()] ?? 0);
}

/**
 * Minor units -> display text with the currency's own decimals. USD keeps the store's usual
 * "$18.75" in both languages; other currencies follow the language ("‏7.210 ر.ع.‏" / "OMR 7.210").
 */
export function formatMoney(minor: number, currency: string, locale: Locale = "en"): string {
  const code = currency.trim().toUpperCase() || BASE_CURRENCY;
  const digits = currencyDecimals(code);
  return new Intl.NumberFormat(code === BASE_CURRENCY ? "en-US" : intlLocale(locale), {
    style: "currency",
    currency: code,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 10 ** digits);
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

/** Wallet top-up limits in USD cents ($5 to $500). */
export const TOPUP_MIN_USD_CENTS = 500;
export const TOPUP_MAX_USD_CENTS = 50_000;
const TOPUP_USD_PRESETS = [1000, 2500, 5000, 10000];

export type TopupLimits = { min: number; max: number; step: number; presets: number[] };

/**
 * Wallet top-ups in `currency` (minor units): whole units only (step = 1 major unit), between the
 * equivalents of $5 and $500, with round preset amounts ($10/$25/$50/$100 in USD; 30/100/200/300 SAR...).
 */
export function topupLimits(currency: string, rate: number): TopupLimits {
  const code = currency.trim().toUpperCase();
  const step = 10 ** currencyDecimals(code);
  if (code === BASE_CURRENCY) return { min: TOPUP_MIN_USD_CENTS, max: TOPUP_MAX_USD_CENTS, step, presets: [...TOPUP_USD_PRESETS] };
  const exact = (usdCents: number) => clean((usdCents * rate * step) / 100);
  const min = Math.ceil(exact(TOPUP_MIN_USD_CENTS) / step) * step;
  const max = Math.max(min, Math.floor(exact(TOPUP_MAX_USD_CENTS) / step) * step);
  const presets: number[] = [];
  for (const usd of TOPUP_USD_PRESETS) {
    const units = niceUnits(exact(usd) / step);
    const minor = Math.min(max, Math.max(min, units * step));
    if (!presets.includes(minor)) presets.push(minor);
  }
  return { min, max, step, presets };
}

/** Nearest (in ratio) "round" whole amount: 1, 2, 3 or 5 x 10^k. */
function niceUnits(value: number): number {
  if (value <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  let best = magnitude;
  for (const m of [1, 2, 3, 5, 10]) {
    const candidate = m * magnitude;
    if (Math.abs(Math.log(candidate / value)) < Math.abs(Math.log(best / value))) best = candidate;
  }
  return best;
}

// Admin money inputs: amounts are typed in the admin's currency and stored as USD cents.

/** Stored USD cents -> input text in `currency` (precise, so saving it unchanged keeps the same cents): 1875 -> "18.75", OMR -> "7.209". */
export function usdToInput(usdCents: number, currency: string, rate: number): string {
  const text = minorToInput(convertUsdCents(usdCents, currency, rate, { precise: true }), currency);
  return text.includes(".") ? text.replace(/\.0+$/, "") : text;
}

/** Input text in `currency` -> USD cents = round(value / rate x 100); null when it is not a valid amount. Accepts a leading sign when `signed`. */
export function inputToUsdCents(raw: string, currency: string, rate: number, opts: { signed?: boolean } = {}): number | null {
  const text = raw.trim();
  const sign = opts.signed && /^[-−]/.test(text) ? -1 : 1;
  const unsigned = opts.signed ? text.replace(/^[+\-−]/, "") : text;
  const minor = inputToMinor(unsigned, currency);
  if (minor === null) return null;
  const usd = toUsdCents(minor, currency, rate, "round");
  return Number.isSafeInteger(usd) ? sign * usd : null;
}

/** Arabic currency names (admin panel). */
export const CURRENCY_NAMES_AR: Record<StoreCurrency, string> = {
  USD: "دولار أمريكي",
  SAR: "ريال سعودي",
  AED: "درهم إماراتي",
  KWD: "دينار كويتي",
  QAR: "ريال قطري",
  BHD: "دينار بحريني",
  OMR: "ريال عماني",
  EGP: "جنيه مصري",
};

/**
 * Deterministic formatting without Intl (client charts: server and browser ICU builds differ on
 * compact notation, which would break hydration). "$1,234.50" for USD, "OMR 1,234.500" otherwise.
 */
export function formatPlain(minor: number, currency: string): string {
  const code = currency.trim().toUpperCase();
  const decimals = currencyDecimals(code);
  const [whole, frac] = (Math.abs(minor) / 10 ** decimals).toFixed(decimals).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const number = frac ? `${grouped}.${frac}` : grouped;
  return `${minor < 0 ? "-" : ""}${code === BASE_CURRENCY ? "$" : `${code} `}${number}`;
}

/** Short axis label: "$1.5K", "OMR 250", "SAR 1.2M". */
export function formatCompactPlain(minor: number, currency: string): string {
  const code = currency.trim().toUpperCase();
  const d = minor / 10 ** currencyDecimals(code);
  const abs = Math.abs(d);
  const short = (n: number) => String(Number(n.toFixed(Math.abs(n) < 10 ? 2 : 1)));
  const prefix = code === BASE_CURRENCY ? "$" : `${code} `;
  if (abs >= 1_000_000) return `${prefix}${short(d / 1_000_000)}M`;
  if (abs >= 1_000) return `${prefix}${short(d / 1_000)}K`;
  return `${prefix}${short(d)}`;
}
