import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { requireAdminAccess } from "../../../_lib/guard";
import { parseRange } from "../range";

export const dynamic = "force-dynamic";

const MAX_ORDERS = 20_000;

const HEADER = [
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
  "المنتج",
  "الخيار",
  "الكمية",
  "سعر الوحدة",
  "قيمة السطر",
  "تكلفة الوحدة (الحالية)",
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

const money = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2));

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

  const lines: string[] = [HEADER.map(cell).join(",")];
  for (const o of orders) {
    const head = [
      o.id,
      stamp(o.createdAt),
      stamp(o.paidAt),
      o.status,
      o.paymentProvider ?? "",
      o.customer.email,
      o.coupon?.code ?? "",
      money(o.subtotalCents),
      money(o.discountCents),
      money(o.walletAppliedCents),
      money(o.totalCents),
      o.currency,
    ];
    const items = o.items.length ? o.items : [null];
    for (const it of items) {
      const tail = it
        ? [
            it.productName,
            it.variantLabel,
            it.quantity,
            money(it.unitPriceCents),
            money(it.unitPriceCents * it.quantity),
            money(it.variant.costCents),
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
