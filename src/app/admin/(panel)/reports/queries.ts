import "server-only";
import { Prisma, type OrderStatus, type PaymentProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { currenciesWithDecimals } from "@/lib/payments/currency";
import { addDays, dayKey } from "../../_lib/dates";
import { serverTimeZone, type ReportRange } from "./range";

/*
 * Sales report for orders PAID in the range (cohort by paidAt, like the dashboard):
 *   gross sales   = totals of every order paid in the range (PAID, FULFILLED, and since REFUNDED)
 *   refunds       = totals of those orders that are now REFUNDED
 *   net revenue   = gross − refunds = PAID + FULFILLED totals
 * Everything else (cost, discounts, providers, coupons, products) is over the net (kept) orders.
 * Cost of goods is estimated from each variant's CURRENT costCents over delivered lines.
 * All aggregation happens in SQL: a fixed number of queries whatever the range size.
 *
 * Every amount here is USD cents: orders are charged in the shopper's currency, so totals use
 * Order.totalUsdCents, wallet parts Order.walletDebitUsdCents, and other order-currency amounts
 * (discounts, line prices) are converted with the order's own fxRate (usdOf below).
 */

const KEPT: OrderStatus[] = ["PAID", "FULFILLED"];

export type ProductRow = {
  productId: string;
  name: string;
  categoryId: string;
  categoryName: string;
  units: number;
  revenueCents: number;
  /** quantity × costCents over delivered lines with a known cost */
  costCents: number;
  /** delivered lines without a cost */
  missingCostLines: number;
  /** revenue of delivered lines with a known cost − their cost */
  profitCents: number;
};

export type CategoryRow = {
  categoryId: string;
  name: string;
  units: number;
  revenueCents: number;
  costCents: number;
  profitCents: number;
  missingCostLines: number;
};

export type DayRow = { key: string; cents: number; orders: number };

export type ProviderRow = { provider: PaymentProvider | null; orders: number; cents: number; walletCents: number };

export type CouponRow = { couponId: string; code: string; uses: number; discountCents: number; revenueCents: number };

export type Report = {
  grossCents: number;
  grossOrders: number;
  refundCents: number;
  refundOrders: number;
  netCents: number;
  orders: number;
  avgOrderCents: number;
  discountCents: number;
  walletCents: number;
  walletShare: number | null;
  cogsCents: number;
  deliveredLines: number;
  missingCostLines: number;
  grossProfitCents: number;
  marginPct: number | null;
  newCustomers: number;
  days: DayRow[];
  categories: CategoryRow[];
  topProducts: ProductRow[];
  providers: ProviderRow[];
  coupons: CouponRow[];
};

/** Range bounds as SQL expressions comparable with Prisma's `timestamp(3)` (UTC) columns. */
function bounds(range: ReportRange) {
  return {
    start: Prisma.sql`(${range.start.toISOString()}::timestamptz AT TIME ZONE 'UTC')`,
    end: Prisma.sql`(${range.end.toISOString()}::timestamptz AT TIME ZONE 'UTC')`,
  };
}

const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

const inList = (codes: string[]) => Prisma.join(codes.map((c) => Prisma.sql`${c}`));

/** SQL: an amount in minor units of the order "o"'s currency -> USD cents at the order's fxRate. */
function usdOf(amount: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`ROUND((${amount})::numeric / (o."fxRate"::numeric * (CASE
    WHEN o.currency IN (${inList(currenciesWithDecimals(3))}) THEN 10
    WHEN o.currency IN (${inList(currenciesWithDecimals(0))}) THEN 0.01
    ELSE 1 END)))`;
}

export async function getReport(range: ReportRange): Promise<Report> {
  const paidIn = { gte: range.start, lt: range.end };
  const { start, end } = bounds(range);
  const tz = serverTimeZone();

  const [statusRows, newCustomers, dayRows, productRows, providerRows, couponRows] = await Promise.all([
    prisma.$queryRaw<{ status: OrderStatus; total: bigint; discount: bigint; wallet: bigint; orders: bigint }[]>`
      SELECT o.status::text AS status,
             SUM(o."totalUsdCents")::bigint AS total,
             SUM(${usdOf(Prisma.sql`o."discountCents"`)})::bigint AS discount,
             SUM(o."walletDebitUsdCents")::bigint AS wallet,
             COUNT(*)::bigint AS orders
      FROM "Order" o
      WHERE o.status IN ('PAID', 'FULFILLED', 'REFUNDED') AND o."paidAt" >= ${start} AND o."paidAt" < ${end}
      GROUP BY 1`,
    prisma.customer.count({ where: { createdAt: paidIn } }),
    prisma.$queryRaw<{ day: string; cents: bigint; orders: bigint }[]>`
      SELECT to_char((o."paidAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
             SUM(o."totalUsdCents")::bigint AS cents,
             COUNT(*)::bigint AS orders
      FROM "Order" o
      WHERE o.status IN ('PAID', 'FULFILLED') AND o."paidAt" >= ${start} AND o."paidAt" < ${end}
      GROUP BY 1`,
    prisma.$queryRaw<
      {
        productId: string;
        name: string;
        categoryId: string;
        categoryName: string;
        units: bigint;
        revenue: bigint;
        cost: bigint;
        costedRevenue: bigint;
        missing: bigint;
        delivered: bigint;
      }[]
    >`
      SELECT p.id AS "productId", p.name, c.id AS "categoryId", c.name AS "categoryName",
             SUM(oi.quantity)::bigint AS units,
             SUM(${usdOf(Prisma.sql`oi.quantity * oi."unitPriceCents"`)})::bigint AS revenue,
             COALESCE(SUM(oi.quantity * v."costCents") FILTER (WHERE oi."deliveredAt" IS NOT NULL AND v."costCents" IS NOT NULL), 0)::bigint AS cost,
             COALESCE(SUM(${usdOf(Prisma.sql`oi.quantity * oi."unitPriceCents"`)}) FILTER (WHERE oi."deliveredAt" IS NOT NULL AND v."costCents" IS NOT NULL), 0)::bigint AS "costedRevenue",
             COUNT(*) FILTER (WHERE oi."deliveredAt" IS NOT NULL AND v."costCents" IS NULL)::bigint AS missing,
             COUNT(*) FILTER (WHERE oi."deliveredAt" IS NOT NULL)::bigint AS delivered
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      JOIN "ProductVariant" v ON v.id = oi."variantId"
      JOIN "Product" p ON p.id = v."productId"
      JOIN "Category" c ON c.id = p."categoryId"
      WHERE o.status IN ('PAID', 'FULFILLED') AND o."paidAt" >= ${start} AND o."paidAt" < ${end}
      GROUP BY p.id, p.name, c.id, c.name`,
    prisma.order.groupBy({
      by: ["paymentProvider"],
      where: { paidAt: paidIn, status: { in: KEPT } },
      _sum: { totalUsdCents: true, walletDebitUsdCents: true },
      _count: { _all: true },
    }),
    prisma.$queryRaw<{ couponId: string; uses: bigint; discount: bigint; revenue: bigint }[]>`
      SELECT o."couponId" AS "couponId",
             COUNT(*)::bigint AS uses,
             SUM(${usdOf(Prisma.sql`o."discountCents"`)})::bigint AS discount,
             SUM(o."totalUsdCents")::bigint AS revenue
      FROM "Order" o
      WHERE o.status IN ('PAID', 'FULFILLED') AND o."couponId" IS NOT NULL AND o."paidAt" >= ${start} AND o."paidAt" < ${end}
      GROUP BY 1`,
  ]);
  const byStatus = statusRows.map((r) => ({
    status: r.status,
    _sum: { totalCents: n(r.total), discountCents: n(r.discount), walletAppliedCents: n(r.wallet) },
    _count: { _all: n(r.orders) },
  }));

  // Headline numbers
  const kept = byStatus.filter((s) => KEPT.includes(s.status));
  const refunded = byStatus.find((s) => s.status === "REFUNDED");
  const sum = (rows: typeof byStatus, f: "totalCents" | "discountCents" | "walletAppliedCents") =>
    rows.reduce((a, r) => a + (r._sum[f] ?? 0), 0);
  const netCents = sum(kept, "totalCents");
  const orders = kept.reduce((a, r) => a + r._count._all, 0);
  const refundCents = refunded?._sum.totalCents ?? 0;
  const refundOrders = refunded?._count._all ?? 0;
  const walletCents = sum(kept, "walletAppliedCents");

  // Products / categories
  const products: ProductRow[] = productRows.map((r) => ({
    productId: r.productId,
    name: r.name,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    units: n(r.units),
    revenueCents: n(r.revenue),
    costCents: n(r.cost),
    missingCostLines: n(r.missing),
    profitCents: n(r.costedRevenue) - n(r.cost),
  }));
  const cogsCents = products.reduce((a, p) => a + p.costCents, 0);
  const missingCostLines = products.reduce((a, p) => a + p.missingCostLines, 0);
  const deliveredLines = productRows.reduce((a, r) => a + n(r.delivered), 0);

  const catMap = new Map<string, CategoryRow>();
  for (const p of products) {
    const c = catMap.get(p.categoryId) ?? {
      categoryId: p.categoryId,
      name: p.categoryName,
      units: 0,
      revenueCents: 0,
      costCents: 0,
      profitCents: 0,
      missingCostLines: 0,
    };
    c.units += p.units;
    c.revenueCents += p.revenueCents;
    c.costCents += p.costCents;
    c.profitCents += p.profitCents;
    c.missingCostLines += p.missingCostLines;
    catMap.set(p.categoryId, c);
  }

  // Daily series, every day of the range (zero-filled), oldest first
  const byDay = new Map(dayRows.map((d) => [d.day, d]));
  const days: DayRow[] = [];
  for (let d = new Date(range.start); d < range.end; d = addDays(d, 1)) {
    const key = dayKey(d);
    const row = byDay.get(key);
    days.push({ key, cents: n(row?.cents), orders: n(row?.orders) });
  }

  // Coupons: codes for the grouped ids
  const couponIds = couponRows.flatMap((c) => (c.couponId ? [c.couponId] : []));
  const codes = couponIds.length
    ? new Map((await prisma.coupon.findMany({ where: { id: { in: couponIds } }, select: { id: true, code: true } })).map((c) => [c.id, c.code]))
    : new Map<string, string>();

  const grossProfitCents = netCents - cogsCents;
  return {
    grossCents: netCents + refundCents,
    grossOrders: orders + refundOrders,
    refundCents,
    refundOrders,
    netCents,
    orders,
    avgOrderCents: orders ? Math.round(netCents / orders) : 0,
    discountCents: sum(kept, "discountCents"),
    walletCents,
    walletShare: netCents > 0 ? walletCents / netCents : null,
    cogsCents,
    deliveredLines,
    missingCostLines,
    grossProfitCents,
    marginPct: netCents > 0 ? (grossProfitCents / netCents) * 100 : null,
    newCustomers,
    days,
    categories: [...catMap.values()].sort((a, b) => b.revenueCents - a.revenueCents),
    topProducts: [...products].sort((a, b) => b.revenueCents - a.revenueCents || b.units - a.units).slice(0, 10),
    providers: providerRows
      .map((p) => ({
        provider: p.paymentProvider,
        orders: p._count._all,
        cents: p._sum.totalUsdCents ?? 0,
        walletCents: p._sum.walletDebitUsdCents ?? 0,
      }))
      .sort((a, b) => b.cents - a.cents),
    coupons: couponRows
      .flatMap((c) =>
        c.couponId
          ? [
              {
                couponId: c.couponId,
                code: codes.get(c.couponId) ?? "—",
                uses: n(c.uses),
                discountCents: n(c.discount),
                revenueCents: n(c.revenue),
              },
            ]
          : [],
      )
      .sort((a, b) => b.uses - a.uses || b.revenueCents - a.revenueCents),
  };
}
