import { WALLET_CURRENCY } from "@/components/store/site";
import { StoreShell } from "@/components/store/store-shell";
import { getNavCategories } from "./_lib/queries";
import { getSignedInCustomer } from "./_lib/session";

// Every storefront page reads live catalog/stock data; never prerender at build time.
export const dynamic = "force-dynamic";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  // A failing nav or session query must not take the whole shell down; the page's own error
  // boundary (error.tsx) then reports the problem inside the normal header/footer.
  const [categories, customer] = await Promise.all([
    getNavCategories().catch((err: unknown) => {
      console.error("[store] Failed to load navigation categories", err);
      return [];
    }),
    getSignedInCustomer().catch((err: unknown) => {
      console.error("[store] Failed to read the customer session", err);
      return undefined;
    }),
  ]);
  const account =
    customer === undefined ? undefined : customer ? { walletBalanceCents: customer.walletBalanceCents, currency: WALLET_CURRENCY } : null;
  return (
    <StoreShell categories={categories} account={account}>
      {children}
    </StoreShell>
  );
}
