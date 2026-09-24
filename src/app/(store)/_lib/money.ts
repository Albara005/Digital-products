import "server-only";
import { cache } from "react";
import { convertUsdCents } from "@/lib/display-currency";
import { formatPrice } from "@/lib/format";
import { type Fx, storefrontFx } from "@/lib/fx";
import type { Locale } from "@/i18n/config";
import { getLocale } from "@/i18n/server";

export type ShopperMoney = {
  fx: Fx;
  locale: Locale;
  /** A USD amount (catalog, wallet, referral settings) in the shopper's currency, as text. */
  usd: (usdCents: number) => string;
  /** A fixed amount in its own currency (an order's or top-up's charged currency). */
  fixed: (minor: number, currency: string) => string;
};

/**
 * Server-rendered money for storefront pages: the shopper's currency from the cookie, converted
 * with the same helper the client and checkout use. The client refreshes the page when the
 * currency changes, so this always matches what client components show.
 */
export const getShopperMoney = cache(async (): Promise<ShopperMoney> => {
  const [fx, locale] = await Promise.all([storefrontFx(), getLocale()]);
  return {
    fx,
    locale,
    usd: (usdCents) => formatPrice(convertUsdCents(usdCents, fx.currency, fx.rate), fx.currency, locale),
    fixed: (minor, currency) => formatPrice(minor, currency, locale),
  };
});
