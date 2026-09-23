import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDate, formatPrice, orderStatusLabel } from "@/lib/format";
import { SearchIcon } from "@/components/admin/icons";
import { Pagination, firstParam, pageParam } from "@/components/admin/Pagination";
import { DataTable, EmptyState, OrderStatusBadge, PageHeader, shortId } from "@/components/admin/ui";
import { requireAdminAccess } from "../../_lib/guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "الطلبات" };

const PAGE_SIZE = 25;
const STATUSES: OrderStatus[] = ["PAID", "FULFILLED", "PENDING", "FAILED", "REFUNDED"];
const statusParam = z.enum(OrderStatus).optional().catch(undefined);

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requireAdminAccess();
  const sp = await searchParams;
  const status = statusParam.parse(firstParam(sp.status) || undefined);
  const q = firstParam(sp.q).replace(/^#/, "");
  const page = pageParam(sp.page);

  const search: Prisma.OrderWhereInput | undefined = q
    ? {
        OR: [
          { id: q },
          { id: { endsWith: q.toLowerCase() } }, // the short #ID shown in lists is the id's last 8 chars
          { id: { startsWith: q } },
          { customer: { email: { contains: q, mode: "insensitive" } } },
        ],
      }
    : undefined;
  const where: Prisma.OrderWhereInput = { ...search, ...(status && { status }) };

  const [total, orders, statusCounts] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        status: true,
        totalCents: true,
        currency: true,
        createdAt: true,
        paidAt: true,
        customer: { select: { email: true, name: true } },
        items: { select: { productName: true, variantLabel: true, quantity: true }, take: 2 },
        _count: { select: { items: true } },
      },
    }),
    prisma.order.groupBy({ by: ["status"], where: search, _count: { _all: true } }),
  ]);

  const countBy = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])) as Partial<Record<OrderStatus, number>>;
  const all = statusCounts.reduce((s, c) => s + c._count._all, 0);
  const tabHref = (s?: OrderStatus) => {
    const qs = new URLSearchParams();
    if (s) qs.set("status", s);
    if (q) qs.set("q", q);
    const str = qs.toString();
    return str ? `/admin/orders?${str}` : "/admin/orders";
  };
  const tabs: { key?: OrderStatus; label: string; count: number }[] = [
    { label: "الكل", count: all },
    ...STATUSES.map((s) => ({ key: s, label: orderStatusLabel[s], count: countBy[s] ?? 0 })),
  ];

  return (
    <>
      <PageHeader title="الطلبات" description="كل الطلبات مع حالتها. الطلبات المدفوعة بانتظار التسليم تحتاج تدخلك." />

      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <nav aria-label="تصفية حسب الحالة" className="card flex gap-1 overflow-x-auto p-1">
          {tabs.map((t) => {
            const active = t.key === status;
            return (
              <Link
                key={t.key ?? "all"}
                href={tabHref(t.key)}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-volt text-bg" : "text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                {t.label}
                <span
                  className={`rounded-full px-1.5 font-display text-[11px] ${active ? "bg-bg/15" : "bg-surface-2 text-muted"}`}
                >
                  {t.count}
                </span>
              </Link>
            );
          })}
        </nav>
        <form method="get" role="search" className="flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <div className="relative flex-1 xl:w-80">
            <SearchIcon className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" />
            <input
              name="q"
              defaultValue={q}
              placeholder="رقم الطلب أو بريد العميل…"
              className="input ps-9!"
              aria-label="بحث في الطلبات"
            />
          </div>
          <button type="submit" className="btn-ghost">
            بحث
          </button>
          {q && (
            <Link href={tabHref(status)} className="btn text-muted hover:text-text">
              مسح
            </Link>
          )}
        </form>
      </div>

      <section className="card overflow-hidden" aria-label="قائمة الطلبات">
        {orders.length === 0 ? (
          <EmptyState title={q || status ? "لا توجد طلبات مطابقة" : "لا توجد طلبات بعد"} body={q ? "جرّب رقم طلب أو بريداً آخر." : undefined} />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>الطلب</th>
                <th>العميل</th>
                <th>المنتجات</th>
                <th>الإجمالي</th>
                <th>الحالة</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/admin/orders/${o.id}`} className="font-display font-semibold hover:text-volt" dir="ltr">
                      #{shortId(o.id)}
                    </Link>
                  </td>
                  <td className="max-w-56">
                    <span className="block truncate text-end" dir="ltr">
                      {o.customer.email}
                    </span>
                    {o.customer.name && <span className="block truncate text-xs text-muted">{o.customer.name}</span>}
                  </td>
                  <td className="max-w-64">
                    {o.items.map((it, i) => (
                      <span key={i} className="block truncate text-xs">
                        {it.productName} <span className="text-muted">· {it.variantLabel}</span>
                        {it.quantity > 1 && <span className="font-display text-muted"> ×{it.quantity}</span>}
                      </span>
                    ))}
                    {o._count.items > o.items.length && (
                      <span className="text-xs text-muted">+{o._count.items - o.items.length} أخرى</span>
                    )}
                  </td>
                  <td className="font-display tabular-nums">{formatPrice(o.totalCents, o.currency)}</td>
                  <td>
                    <OrderStatusBadge status={o.status} />
                  </td>
                  <td className="whitespace-nowrap text-xs text-muted">{formatDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        <Pagination pathname="/admin/orders" params={{ status, q: q || undefined }} page={page} pageSize={PAGE_SIZE} total={total} />
      </section>
    </>
  );
}
