import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDate, formatPrice } from "@/lib/format";
import { RevenueChart, type RevenuePoint } from "@/components/admin/RevenueChart";
import { AlertIcon, ChevronLeftIcon } from "@/components/admin/icons";
import { DataTable, EmptyState, OrderStatusBadge, PageHeader, shortId } from "@/components/admin/ui";
import { requireAdminAccess } from "../_lib/guard";
import { addDays, dayKey, startOfDay } from "../_lib/dates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "الرئيسية" };

const REVENUE_STATUSES: OrderStatus[] = ["PAID", "FULFILLED"];
const LOW_STOCK = 5;

const dayNumber = new Intl.DateTimeFormat("ar", { day: "numeric" });
const dayFull = new Intl.DateTimeFormat("ar", { weekday: "long", day: "numeric", month: "long" });

export default async function AdminDashboardPage() {
  await requireAdminAccess();

  const now = new Date();
  const today = startOfDay(now);
  const since14 = addDays(today, -13);
  const since30 = addDays(today, -29);
  const since60 = addDays(today, -59);
  const revenue = { in: REVENUE_STATUSES };

  const [todayAgg, last30Agg, prev30Agg, awaiting, chartOrders, stockVariants, soldItems, latest] = await Promise.all([
    prisma.order.aggregate({ where: { status: revenue, paidAt: { gte: today } }, _sum: { totalCents: true }, _count: true }),
    prisma.order.aggregate({ where: { status: revenue, paidAt: { gte: since30 } }, _sum: { totalCents: true }, _count: true }),
    prisma.order.aggregate({ where: { status: revenue, paidAt: { gte: since60, lt: since30 } }, _sum: { totalCents: true } }),
    prisma.order.count({ where: { status: "PAID" } }),
    prisma.order.findMany({
      where: { status: revenue, paidAt: { gte: since14 } },
      select: { paidAt: true, totalCents: true },
    }),
    prisma.productVariant.findMany({
      where: { product: { type: { not: "SERVICE" }, active: true } },
      select: {
        id: true,
        label: true,
        product: { select: { id: true, name: true } },
        _count: { select: { inventoryItems: { where: { status: "AVAILABLE" } } } },
      },
    }),
    prisma.orderItem.findMany({
      where: { order: { status: revenue, paidAt: { gte: since30 } } },
      select: { quantity: true, unitPriceCents: true, productName: true, variant: { select: { productId: true } } },
    }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        status: true,
        totalCents: true,
        currency: true,
        createdAt: true,
        customer: { select: { email: true } },
        _count: { select: { items: true } },
      },
    }),
  ]);

  // 14-day series, oldest → today
  const buckets = new Map<string, { cents: number; orders: number }>();
  for (const o of chartOrders) {
    if (!o.paidAt) continue;
    const key = dayKey(o.paidAt);
    const b = buckets.get(key) ?? { cents: 0, orders: 0 };
    b.cents += o.totalCents;
    b.orders += 1;
    buckets.set(key, b);
  }
  const points: RevenuePoint[] = Array.from({ length: 14 }, (_, i) => {
    const day = addDays(since14, i);
    const key = dayKey(day);
    const b = buckets.get(key);
    return {
      key,
      dayLabel: dayNumber.format(day),
      fullLabel: dayFull.format(day),
      cents: b?.cents ?? 0,
      orders: b?.orders ?? 0,
      isToday: i === 13,
    };
  });
  const total14 = points.reduce((s, p) => s + p.cents, 0);

  const lowStock = stockVariants
    .map((v) => ({ id: v.id, label: v.label, product: v.product, available: v._count.inventoryItems }))
    .filter((v) => v.available < LOW_STOCK)
    .sort((a, b) => a.available - b.available);

  const byProduct = new Map<string, { name: string; units: number; cents: number }>();
  for (const item of soldItems) {
    const key = item.variant.productId;
    const row = byProduct.get(key) ?? { name: item.productName, units: 0, cents: 0 };
    row.units += item.quantity;
    row.cents += item.quantity * item.unitPriceCents;
    byProduct.set(key, row);
  }
  const top = [...byProduct.entries()]
    .map(([id, r]) => ({ id, ...r }))
    .sort((a, b) => b.units - a.units || b.cents - a.cents)
    .slice(0, 5);
  const topMax = Math.max(1, ...top.map((t) => t.units));

  const rev30 = last30Agg._sum.totalCents ?? 0;
  const prev30 = prev30Agg._sum.totalCents ?? 0;
  const delta = prev30 > 0 ? Math.round(((rev30 - prev30) / prev30) * 100) : null;

  return (
    <>
      <PageHeader
        title="الرئيسية"
        description={`نظرة عامة على المتجر — ${formatDate(now)}`}
        actions={
          <Link href="/admin/products/new" className="btn-primary">
            منتج جديد
          </Link>
        }
      />

      <section aria-label="مؤشرات" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="إيراد اليوم" value={formatPrice(todayAgg._sum.totalCents ?? 0)} sub={`${todayAgg._count} طلب مدفوع`} />
        <StatTile
          label="إيراد آخر 30 يوماً"
          value={formatPrice(rev30)}
          sub={
            delta === null ? (
              `${last30Agg._count} طلب`
            ) : (
              <span>
                <span className={delta >= 0 ? "text-success" : "text-danger"} dir="ltr">
                  {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%
                </span>{" "}
                مقارنة بالـ30 يوماً السابقة
              </span>
            )
          }
        />
        <StatTile label="طلبات اليوم" value={String(todayAgg._count)} sub="مدفوعة منذ منتصف الليل" />
        <StatTile
          label="بانتظار التسليم"
          value={String(awaiting)}
          sub={awaiting > 0 ? "طلبات مدفوعة تحتاج تسليماً" : "لا شيء معلّق"}
          href="/admin/orders?status=PAID"
          tone={awaiting > 0 ? "accent" : undefined}
        />
        <StatTile
          label="مخزون منخفض"
          value={String(lowStock.length)}
          sub={lowStock.length > 0 ? `خيارات بأقل من ${LOW_STOCK} عناصر متاحة` : "المخزون بحالة جيدة"}
          href="/admin/inventory?low=1"
          tone={lowStock.length > 0 ? "warn" : undefined}
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="card p-5 xl:col-span-2" aria-labelledby="rev-title">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 id="rev-title" className="font-semibold">
                الإيراد اليومي — آخر 14 يوماً
              </h2>
              <p className="text-xs text-muted">الطلبات المدفوعة والمسلّمة حسب تاريخ الدفع · عمود اليوم مميّز</p>
            </div>
            <p className="font-display text-lg font-bold">{formatPrice(total14)}</p>
          </div>
          <RevenueChart points={points} />
        </section>

        <section className="card p-5" aria-labelledby="top-title">
          <h2 id="top-title" className="font-semibold">
            الأكثر مبيعاً
          </h2>
          <p className="mb-4 text-xs text-muted">حسب الوحدات المباعة خلال 30 يوماً</p>
          {top.length === 0 ? (
            <EmptyState title="لا مبيعات بعد" body="ستظهر هنا المنتجات الأكثر مبيعاً." />
          ) : (
            <ol className="flex flex-col gap-4">
              {top.map((t, i) => (
                <li key={t.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                    <Link href={`/admin/products/${t.id}`} className="truncate hover:text-volt">
                      <span className="me-1.5 font-display text-muted">{i + 1}.</span>
                      {t.name}
                    </Link>
                    <span className="shrink-0 text-xs text-muted">
                      <span className="font-display font-semibold text-text">{t.units}</span> وحدة ·{" "}
                      <span className="font-display">{formatPrice(t.cents)}</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-2" aria-hidden="true">
                    <div className="h-2 rounded-full bg-[#7f9c1d]" style={{ width: `${(t.units / topMax) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="card overflow-hidden xl:col-span-2" aria-labelledby="latest-title">
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <h2 id="latest-title" className="font-semibold">
              أحدث الطلبات
            </h2>
            <Link href="/admin/orders" className="inline-flex items-center gap-1 text-xs text-muted hover:text-volt">
              كل الطلبات <ChevronLeftIcon className="size-3.5" />
            </Link>
          </div>
          {latest.length === 0 ? (
            <EmptyState title="لا توجد طلبات بعد" />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th>الطلب</th>
                  <th>العميل</th>
                  <th>الحالة</th>
                  <th>الإجمالي</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {latest.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/admin/orders/${o.id}`} className="font-display font-semibold hover:text-volt" dir="ltr">
                        #{shortId(o.id)}
                      </Link>
                      <span className="block text-xs text-muted">{o._count.items} عنصر</span>
                    </td>
                    <td className="max-w-48 truncate text-muted" dir="ltr">
                      <span className="block truncate text-end">{o.customer.email}</span>
                    </td>
                    <td>
                      <OrderStatusBadge status={o.status} />
                    </td>
                    <td className="font-display tabular-nums">{formatPrice(o.totalCents, o.currency)}</td>
                    <td className="whitespace-nowrap text-xs text-muted">{formatDate(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </section>

        <section className="card p-5" aria-labelledby="low-title">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="low-title" className="font-semibold">
              مخزون منخفض
            </h2>
            <Link href="/admin/inventory?low=1" className="inline-flex items-center gap-1 text-xs text-muted hover:text-volt">
              الكل <ChevronLeftIcon className="size-3.5" />
            </Link>
          </div>
          {lowStock.length === 0 ? (
            <EmptyState title="لا يوجد نقص" body={`كل الخيارات النشطة لديها ${LOW_STOCK} عناصر متاحة أو أكثر.`} />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {lowStock.slice(0, 7).map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/admin/products/${v.product.id}/inventory?variant=${v.id}`} className="min-w-0 hover:text-volt">
                    <span className="block truncate text-sm">{v.product.name}</span>
                    <bdi className="block truncate text-xs text-muted">{v.label}</bdi>
                  </Link>
                  <span
                    className={`badge shrink-0 gap-1 ${v.available === 0 ? "bg-danger/15 text-danger" : "bg-fuchsia/15 text-fuchsia"}`}
                  >
                    {v.available === 0 && <AlertIcon className="size-3" />}
                    {v.available === 0 ? "نفد" : `${v.available} متاح`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function StatTile({
  label,
  value,
  sub,
  href,
  tone,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  href?: string;
  tone?: "accent" | "warn";
}) {
  const ring = tone === "accent" ? "border-volt/40" : tone === "warn" ? "border-fuchsia/40" : "";
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {tone && <span className={`size-1.5 rounded-full ${tone === "accent" ? "bg-volt" : "bg-fuchsia"}`} aria-hidden="true" />}
        {label}
      </p>
      <p className="mt-2 font-display text-2xl font-bold text-text">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </>
  );
  const cls = `card block p-4 ${ring}`;
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-volt/60`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
