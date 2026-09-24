import "server-only";
import { cookies } from "next/headers";
import { ADMIN_CURRENCY_COOKIE, BASE_CURRENCY, CURRENCY_COOKIE, type Rates } from "@/lib/display-currency";
import { getSetting, type CurrencySettings } from "@/lib/settings";

/*
 * Server-side currency resolution. Rates always come from the admin `currencies` setting read
 * here, never from the browser. A currency is usable when it is USD or enabled in the settings.
 */

/** A currency the store can price and charge in, with its current rate (units per USD). */
export type Fx = { currency: string; rate: number };

export const USD_FX: Fx = { currency: BASE_CURRENCY, rate: 1 };

/** The `currencies` setting (enabled list + rates); USD-only when it cannot be read. */
export async function getCurrencySettings(): Promise<CurrencySettings | null> {
  try {
    return await getSetting("currencies");
  } catch (err) {
    console.error("[fx] Could not read the currency settings", err);
    return null;
  }
}

/** Enabled rates as a plain map (USD implied). */
export function ratesOf(settings: CurrencySettings | null): Rates {
  if (!settings) return {};
  return Object.fromEntries(settings.enabled.map((code) => [code, settings.rates[code]]));
}

/** USD or an enabled currency with its rate; null for anything else. */
export function fxFor(code: string | null | undefined, settings: CurrencySettings | null): Fx | null {
  const wanted = (code ?? "").trim().toUpperCase();
  if (wanted === BASE_CURRENCY) return USD_FX;
  if (!settings) return null;
  const match = settings.enabled.find((c) => c === wanted);
  return match ? { currency: match, rate: settings.rates[match] } : null;
}

async function cookieValue(name: string): Promise<string | null> {
  try {
    return (await cookies()).get(name)?.value ?? null;
  } catch {
    return null; // outside a request (scripts)
  }
}

/** The shopper's currency from the storefront cookie (USD when unset, unknown or disabled). */
export async function storefrontFx(settings?: CurrencySettings | null): Promise<Fx> {
  const resolved = settings === undefined ? await getCurrencySettings() : settings;
  return fxFor(await cookieValue(CURRENCY_COOKIE), resolved) ?? USD_FX;
}

/** The admin panel's display currency (its own cookie; USD when unset, unknown or disabled). */
export async function adminFx(settings?: CurrencySettings | null): Promise<Fx> {
  const resolved = settings === undefined ? await getCurrencySettings() : settings;
  return fxFor(await cookieValue(ADMIN_CURRENCY_COOKIE), resolved) ?? USD_FX;
}
