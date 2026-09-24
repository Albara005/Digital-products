import { cookies } from "next/headers";
import { WALLET_CURRENCY } from "@/components/store/site";
import { type ShellCurrency, StoreShell } from "@/components/store/store-shell";
import { BASE_CURRENCY, CURRENCY_COOKIE } from "@/lib/display-currency";
import { getSetting } from "@/lib/settings";
import { getNavCategories } from "./_lib/queries";
import { getSignedInCustomer } from "./_lib/session";

// Every storefront page reads live catalog/stock data; never prerender at build time.
export const dynamic = "force-dynamic";

/** Enabled display currencies and the visitor's choice (cookie); USD only if settings can't be read. */
async function loadCurrency(): Promise<ShellCurrency> {
  const chosen = (await cookies()).get(CURRENCY_COOKIE)?.value ?? BASE_CURRENCY;
  try {
    const { enabled, rates } = await getSetting("currencies");
    const options = enabled.map((code) => ({ code, rate: rates[code] }));
    return { selected: options.some((o) => o.code === chosen) ? chosen : BASE_CURRENCY, options };
  } catch (err) {
    console.error("[store] Failed to load display currencies", err);
    return { selected: BASE_CURRENCY, options: [] };
  }
}

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  // A failing nav or session query must not take the whole shell down; the page's own error
  // boundary (error.tsx) then reports the problem inside the normal header/footer.
  const [categories, customer, currency] = await Promise.all([
    getNavCategories().catch((err: unknown) => {
      console.error("[store] Failed to load navigation categories", err);
      return [];
    }),
    getSignedInCustomer().catch((err: unknown) => {
      console.error("[store] Failed to read the customer session", err);
      return undefined;
    }),
    loadCurrency(),
  ]);
  const account =
    customer === undefined ? undefined : customer ? { walletBalanceCents: customer.walletBalanceCents, currency: WALLET_CURRENCY } : null;
  return (
    <StoreShell categories={categories} account={account} currency={currency}>
      {children}
    </StoreShell>
  );
}
