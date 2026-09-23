import { StoreShell } from "@/components/store/store-shell";
import { getNavCategories } from "./_lib/queries";

// Every storefront page reads live catalog/stock data; never prerender at build time.
export const dynamic = "force-dynamic";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  // A failing nav query must not take the whole shell down; the page's own error boundary
  // (error.tsx) then reports the problem inside the normal header/footer.
  const categories = await getNavCategories().catch((err: unknown) => {
    console.error("[store] Failed to load navigation categories", err);
    return [];
  });
  return <StoreShell categories={categories}>{children}</StoreShell>;
}
