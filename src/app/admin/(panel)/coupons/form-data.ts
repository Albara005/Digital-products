import "server-only";
import type { Coupon } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CouponFormData } from "@/components/admin/coupons/CouponForm";

const pad = (n: number) => String(n).padStart(2, "0");

/** datetime-local value in the server's time zone (TZ = the shop's zone), the same zone the action parses in. */
function toLocalInput(date: Date | null): string {
  if (!date) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toDollars(cents: number | null): string {
  if (cents == null) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export function couponToFormData(coupon: Coupon): CouponFormData {
  return {
    id: coupon.id,
    code: coupon.code,
    type: coupon.type,
    value: coupon.type === "PERCENT" ? String(coupon.value) : toDollars(coupon.value),
    maxDiscount: toDollars(coupon.maxDiscountCents),
    minSubtotal: toDollars(coupon.minSubtotalCents),
    maxUses: coupon.maxUses == null ? "" : String(coupon.maxUses),
    perCustomerLimit: coupon.perCustomerLimit == null ? "" : String(coupon.perCustomerLimit),
    startsAt: toLocalInput(coupon.startsAt),
    endsAt: toLocalInput(coupon.endsAt),
    scope: coupon.productId ? "product" : coupon.categoryId ? "category" : "all",
    categoryId: coupon.categoryId ?? "",
    productId: coupon.productId ?? "",
    active: coupon.active,
    usedCount: coupon.usedCount,
  };
}

/** Options for the scope pickers. */
export async function loadScopeOptions() {
  const [categories, products] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.product.findMany({ orderBy: [{ name: "asc" }], select: { id: true, name: true } }),
  ]);
  return { categories, products };
}
