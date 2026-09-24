import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { minorToInput } from "@/lib/display-currency";
import { requireAdminAccess } from "../../../_lib/guard";
import { getAdminMoney } from "../../../_lib/money";
import { parseRange } from "../range";

export const dynamic = "force-dynamic";

const MAX_ORDERS = 20_000;

/** Order amounts are in the order's own currency (column "العملة"); the last order columns are its USD and admin-currency values. */
const header = (adminCurrency: string) => [
  "رقم الطلب",
  "تاريخ الإنشاء",
  "تاريخ الدفع",
  "الحالة",
  "وسيلة الدفع",
  "بريد العميل",
  "الكوبون",
  "المجموع الفرعي",
  "الخصم",
  "من المحفظة",
  "إجمالي الطلب",
  "العملة",
  "سعر الصرف (وحدة لكل دولار)",
  "الإجمالي بالدولار (USD)",
  `الإجمالي بعملة العرض (${adminCurrency})`,
  "المنتج",
  "الخيار",
  "الكمية",
  "سعر الوحدة",
  "قيمة السطر",
  "تكلفة الوحدة (الحالية، USD)",
  "تاريخ التسليم",
];

/** RFC 4180 field; also neutralises spreadsheet formulas (=, +, -, @ at the start of text). */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  let s = value;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Minor units -> plain decimal with the currency's own decimals ("18.75", "7.210"). */
const money = (minor: number | null, currency: string) => (minor === null ? "" : minorToInput(minor, currency));

/** Local time (the server's TZ) as "YYYY-MM-DD HH:MM", which Excel parses as a date. */
function stamp(d: Date | null): string {
  if (!d) return "";
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Orders paid in the report range (PAID, FULFILLED and REFUNDED), one row per line.
 * UTF-8 with a BOM and CRLF line endings so Excel opens the Arabic text correctly.
 */
export async function GET(request: NextRequest) {
  const session = await requireAdminAccess("SUPER_ADMIN");
  const range = parseRange(Object.fromEntries(request.nextUrl.searchParams));
  const adminMoney = await getAdminMoney();
  const adminCurrency = adminMoney.fx.currency;

  const orders = await prisma.order.findMany({
    where: { paidAt: { gte: range.start, lt: range.end }, status: { in: ["PAID", "FULFILLED", "REFUNDED"] } },
    orderBy: [{ paidAt: "asc" }, { id: "asc" }],
    take: MAX_ORDERS,
    select: {
      id: true,
      createdAt: true,
      paidAt: true,
      status: true,
      paymentProvider: true,
      subtotalCents: true,
      discountCents: true,
      walletAppliedCents: true,
      totalCents: true,
      currency: true,
      fxRate: true,
      totalUsdCents: true,
      customer: { select: { email: true } },
      coupon: { select: { code: true } },
      items: {
        orderBy: { id: "asc" },
        select: {
          productName: true,
          variantLabel: true,
          quantity: true,
          unitPriceCents: true,
          deliveredAt: true,
          variant: { select: { costCents: true } },
        },
      },
    },
  });

  const lines: string[] = [header(adminCurrency).map(cell).join(",")];
  for (const o of orders) {
    const head = [
      o.id,
      stamp(o.createdAt),
      stamp(o.paidAt),
      o.status,
      o.paymentProvider ?? "",
      o.customer.email,
      o.coupon?.code ?? "",
      money(o.subtotalCents, o.currency),
      money(o.discountCents, o.currency),
      money(o.walletAppliedCents, o.currency),
      money(o.totalCents, o.currency),
      o.currency,
      o.fxRate,
      money(o.totalUsdCents, "USD"),
      money(adminMoney.minor(o.totalUsdCents), adminCurrency),
    ];
    const items = o.items.length ? o.items : [null];
    for (const it of items) {
      const tail = it
        ? [
            it.productName,
            it.variantLabel,
            it.quantity,
            money(it.unitPriceCents, o.currency),
            money(it.unitPriceCents * it.quantity, o.currency),
            money(it.variant.costCents, "USD"),
            stamp(it.deliveredAt),
          ]
        : ["", "", "", "", "", "", ""];
      lines.push([...head, ...tail].map(cell).join(","));
    }
  }

  await audit({ adminId: session.adminId, email: session.email }, "report.export", null, {
    from: range.from,
    to: range.to,
    orders: orders.length,
  });

  const body = "﻿" + lines.join("\r\n") + "\r\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nitro-orders-${range.from}_${range.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
