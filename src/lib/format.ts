import type { OrderStatus, ProductType } from "@prisma/client";
import { type Locale, intlLocale } from "@/i18n/config";

export function formatPrice(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

/** Date and time in the given locale (Latin digits in Arabic too). Defaults to Arabic (admin panel). */
export function formatDate(date: Date | string, locale: Locale = "ar") {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
}

export function formatDay(date: Date | string, locale: Locale = "ar") {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }).format(new Date(date));
}

// Admin-panel labels (Arabic). The storefront uses the dictionaries in src/i18n instead.
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
