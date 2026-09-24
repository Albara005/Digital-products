import type { Metadata } from "next";
import { CouponForm } from "@/components/admin/coupons/CouponForm";
import { PageHeader } from "@/components/admin/ui";
import { requireAdminAccess } from "../../../_lib/guard";
import { saveCoupon } from "../actions";
import { loadScopeOptions } from "../form-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "كوبون جديد" };

export default async function NewCouponPage() {
  await requireAdminAccess();
  const { categories, products } = await loadScopeOptions();

  return (
    <>
      <PageHeader
        title="كوبون جديد"
        description="كود خصم يُدخله العميل في السلة: نسبة أو مبلغ ثابت، مع حدود وتواريخ اختيارية."
        back={{ href: "/admin/coupons", label: "الكوبونات" }}
      />
      <CouponForm action={saveCoupon} categories={categories} products={products} />
    </>
  );
}
