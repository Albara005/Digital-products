import type { Metadata } from "next";
import { NotFoundView } from "@/components/store/not-found-view";
import { StoreShell } from "@/components/store/store-shell";

export const metadata: Metadata = {
  title: "الصفحة غير موجودة",
};

// Unmatched URLs render here, outside the (store) layout. This page is prerendered at build
// time, so it must not touch the database: the shell is shown without the category bar.
export default function NotFound() {
  return (
    <StoreShell categories={[]}>
      <NotFoundView />
    </StoreShell>
  );
}
