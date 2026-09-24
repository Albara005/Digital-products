import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CouponForm } from "@/components/admin/coupons/CouponForm";
import { PageHeader } from "@/components/admin/ui";
import { requireAdminAccess } from "../../../_lib/guard";
import { saveCoupon } from "../actions";
import { couponToFormData, loadScopeOptions } from "../form-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "تعديل كوبون" };

export default async function EditCouponPage({ params }: PageProps<"/admin/coupons/[id]">) {
  await requireAdminAccess();
  const { id } = await params;
  const [coupon, redemptions, options] = await Promise.all([
    prisma.coupon.findUnique({ where: { id } }),
    prisma.couponRedemption.count({ where: { couponId: id, order: { status: { not: "FAILED" } } } }),
    loadScopeOptions(),
  ]);
  if (!coupon) notFound();

  return (
    <>
      <PageHeader
        title={
          <>
            تعديل: <span dir="ltr">{coupon.code}</span>
          </>
        }
        description={`${redemptions} طلب استخدم هذا الكوبون. التعديل يسري على الطلبات الجديدة فقط.`}
        back={{ href: "/admin/coupons", label: "الكوبونات" }}
      />
      <CouponForm
        key={coupon.id}
        action={saveCoupon}
        categories={options.categories}
        products={options.products}
        coupon={couponToFormData(coupon)}
      />
    </>
  );
}
