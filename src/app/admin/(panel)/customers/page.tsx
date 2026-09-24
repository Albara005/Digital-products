import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDate, formatPrice } from "@/lib/format";
import { SearchIcon } from "@/components/admin/icons";
import { Pagination, firstParam, pageParam } from "@/components/admin/Pagination";
import { DataTable, EmptyState, PageHeader } from "@/components/admin/ui";
import { requireAdminAccess } from "../../_lib/guard";
import { SPENT_STATUSES } from "./spent";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "العملاء" };

const PAGE_SIZE = 25;

export default async function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  await requireAdminAccess();
  const sp = await searchParams;
  const q = firstParam(sp.q);
  const page = pageParam(sp.page);

  const where: Prisma.CustomerWhereInput = q ? { email: { contains: q, mode: "insensitive" } } : {};

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        email: true,
        name: true,
        emailVerifiedAt: true,
        walletBalanceCents: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
    }),
  ]);

  // One grouped query for the page, not one per row
  const spentRows = customers.length
    ? await prisma.order.groupBy({
        by: ["customerId"],
        where: { customerId: { in: customers.map((c) => c.id) }, status: { in: SPENT_STATUSES } },
        _sum: { totalCents: true },
        _count: { _all: true },
      })
    : [];
  const spent = new Map(spentRows.map((r) => [r.customerId, { cents: r._sum.totalCents ?? 0, orders: r._count._all }]));

  return (
    <>
      <PageHeader
        title="العملاء"
        description="كل من سجّل الدخول أو اشترى من المتجر. «المُنفَق» = الطلبات المدفوعة والمسلّمة (دون المسترجعة)."
      />

      <form method="get" role="search" className="mb-4 flex max-w-xl gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" />
          <input name="q" defaultValue={q} placeholder="بريد العميل…" className="input ps-9!" aria-label="بحث في العملاء" dir="auto" />
        </div>
        <button type="submit" className="btn-ghost">
          بحث
        </button>
        {q && (
          <Link href="/admin/customers" className="btn text-muted hover:text-text">
            مسح
          </Link>
        )}
      </form>

      <section className="card overflow-hidden" aria-label="قائمة العملاء">
        {customers.length === 0 ? (
          <EmptyState
            title={q ? "لا يوجد عملاء مطابقون" : "لا يوجد عملاء بعد"}
            body={q ? "جرّب جزءاً آخر من البريد." : "يظهر العميل هنا بعد أول تسجيل دخول أو طلب."}
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>العميل</th>
                <th>الطلبات</th>
                <th>المُنفَق</th>
                <th>رصيد المحفظة</th>
                <th>تاريخ الانضمام</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const s = spent.get(c.id);
                return (
                  <tr key={c.id}>
                    <td className="max-w-72">
                      <span className="flex items-center gap-2">
                        <Link href={`/admin/customers/${c.id}`} className="truncate font-medium hover:text-volt" dir="ltr">
                          {c.email}
                        </Link>
                        {c.emailVerifiedAt ? (
                          <span className="badge shrink-0 bg-success/15 text-success ring-1 ring-success/30" title={`تم التحقق ${formatDate(c.emailVerifiedAt)}`}>
                            موثّق
                          </span>
                        ) : (
                          <span className="badge shrink-0 bg-surface-2 text-muted ring-1 ring-border">غير موثّق</span>
                        )}
                      </span>
                      {c.name && <span className="block truncate text-xs text-muted">{c.name}</span>}
                    </td>
                    <td className="font-display tabular-nums">
                      {c._count.orders}
                      {s && s.orders !== c._count.orders && <span className="ms-1 text-xs text-muted">({s.orders} مدفوع)</span>}
                    </td>
                    <td className="font-display tabular-nums">{formatPrice(s?.cents ?? 0)}</td>
                    <td className={`font-display tabular-nums ${c.walletBalanceCents > 0 ? "text-volt" : "text-muted"}`}>
                      {formatPrice(c.walletBalanceCents)}
                    </td>
                    <td className="whitespace-nowrap text-xs text-muted">{formatDate(c.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
        <Pagination pathname="/admin/customers" params={{ q: q || undefined }} page={page} pageSize={PAGE_SIZE} total={total} />
      </section>
    </>
  );
}
