import { StoreShell } from "@/components/store/store-shell";
import { getNavCategories } from "./_lib/queries";

// Every storefront page reads live catalog/stock data; never prerender at build time.
export const dynamic = "force-dynamic";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const categories = await getNavCategories();
  return <StoreShell categories={categories}>{children}</StoreShell>;
}
