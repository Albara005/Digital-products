// Amount conversion between the minor units the store keeps ("cents": USD cents, KWD fils, ...)
// and the major units some gateways expect (Tap takes 10.5 for $10.50 and 1.25 for 1.250 KWD).
// Pure functions, no server-only imports, so scripts and tests can load them directly.

/** ISO 4217 exponents that are not 2. Anything not listed uses 2 decimals. */
const DECIMALS: Readonly<Record<string, number>> = {
  // 3 decimals: Gulf / MENA dinars and rials
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
  // 0 decimals
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
};

export function currencyDecimals(currency: string): number {
  return DECIMALS[currency.trim().toUpperCase()] ?? 2;
}

/** 1099 USD -> 10.99; 1250 KWD -> 1.25 (i.e. 1.250 KWD). Throws on non-integer input. */
export function minorToMajor(minor: number, currency: string): number {
  if (!Number.isSafeInteger(minor)) throw new RangeError(`Amount must be an integer in minor units, got ${minor}`);
  const decimals = currencyDecimals(currency);
  return Number((minor / 10 ** decimals).toFixed(decimals));
}

/**
 * 10.99 USD -> 1099; "1.250" KWD -> 1250. Returns null for anything that is not a finite amount
 * or carries more precision than the currency allows (10.005 USD), so callers treat it as a mismatch.
 */
export function majorToMinor(major: unknown, currency: string): number | null {
  let value: number;
  if (typeof major === "number") value = major;
  else if (typeof major === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(major)) value = Number(major);
  else return null;
  if (!Number.isFinite(value)) return null;

  const factor = 10 ** currencyDecimals(currency);
  const minor = Math.round(value * factor);
  if (!Number.isSafeInteger(minor)) return null;
  // Binary floats: 10.99 * 100 = 1098.9999999999999, which rounds back correctly; 10.005 does not.
  if (Math.abs(minor / factor - value) > 1e-9 * Math.max(1, Math.abs(value))) return null;
  return minor;
}
