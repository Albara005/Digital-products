import type { OrderStatus, ProductType } from "@prisma/client";

export function formatPrice(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
}

export const productTypeLabel: Record<ProductType, string> = {
  CARD: "بطاقة",
  SUBSCRIPTION: "اشتراك",
  ACCOUNT: "حساب",
  SERVICE: "خدمة",
};

export const orderStatusLabel: Record<OrderStatus, string> = {
  PENDING: "بانتظار الدفع",
  PAID: "مدفوع - بانتظار التسليم",
  FULFILLED: "تم التسليم",
  FAILED: "فشل",
  REFUNDED: "مسترجع",
};

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
