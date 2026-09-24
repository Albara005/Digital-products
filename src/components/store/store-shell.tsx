import type { HeaderAccount } from "./account-button";
import { CartProvider } from "./cart-provider";
import type { NavCategory } from "./category-nav";
import { StoreFooter } from "./store-footer";
import { StoreHeader } from "./store-header";

/** Storefront chrome. Used by the (store) layout and by the root 404 (which has no DB access). */
export function StoreShell({
  categories,
  account,
  children,
}: {
  categories: NavCategory[];
  /** Signed-in state for the header; omitted where no session can be read (static 404). */
  account?: HeaderAccount;
  children: React.ReactNode;
}) {
  return (
    <CartProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-50 focus:rounded-lg focus:bg-volt focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-bg"
      >
        تخطَّ إلى المحتوى
      </a>
      <StoreHeader categories={categories} account={account} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <StoreFooter />
    </CartProvider>
  );
}
