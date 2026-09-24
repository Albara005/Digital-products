import type { Metadata } from "next";
import { NotFoundView } from "@/components/store/not-found-view";
import { StoreShell } from "@/components/store/store-shell";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).meta.notFound };
}

// Unmatched URLs render here, outside the (store) layout. It must not touch the database: the
// shell is shown without the category bar (the locale comes from the proxy's request header).
export default function NotFound() {
  return (
    <StoreShell categories={[]}>
      <NotFoundView />
    </StoreShell>
  );
}
