import { LocaleProvider } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { BASE_CURRENCY, type CurrencyOption } from "@/lib/display-currency";
import type { HeaderAccount } from "./account-button";
import { CartProvider } from "./cart-provider";
import type { NavCategory } from "./category-nav";
import { CurrencyProvider } from "./currency";
import { PageTransition } from "./page-transition";
import { StoreFooter } from "./store-footer";
import { StoreHeader } from "./store-header";

export type ShellCurrency = { selected: string; options: CurrencyOption[]; manual: boolean };

/** Storefront chrome. Used by the (store) layout and by the root 404 (which has no DB access). */
export async function StoreShell({
  categories,
  account,
  currency = { selected: BASE_CURRENCY, options: [], manual: false },
  children,
}: {
  categories: NavCategory[];
  /** Signed-in state for the header; omitted where no session can be read (static 404). */
  account?: HeaderAccount;
  /** Display currency choice and the enabled currencies (USD only when omitted). */
  currency?: ShellCurrency;
  children: React.ReactNode;
}) {
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <LocaleProvider locale={locale}>
      <CurrencyProvider initial={currency.selected} options={currency.options} manual={currency.manual}>
        <CartProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-50 focus:rounded-lg focus:bg-volt focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-bg"
          >
            {t.shell.skip}
          </a>
          <StoreHeader categories={categories} account={account} />
          <main id="main" className="flex-1">
            {children}
          </main>
          <StoreFooter />
          <PageTransition />
        </CartProvider>
      </CurrencyProvider>
    </LocaleProvider>
  );
}
