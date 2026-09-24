import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { Prisma, TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { SearchIcon } from "@/components/admin/icons";
import { Pagination, firstParam, pageParam } from "@/components/admin/Pagination";
import { TicketStatusBadge } from "@/components/admin/tickets/TicketStatusBadge";
import { DataTable, EmptyState, PageHeader, shortId } from "@/components/admin/ui";
import { requireAdminAccess } from "../../_lib/guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "تذاكر الدعم" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const PAGE_SIZE = 25;
const TABS: { status: TicketStatus; label: string; empty: string }[] = [
  { status: "OPEN", label: "بانتظار الرد", empty: "لا توجد تذاكر بانتظار الرد" },
  { status: "ANSWERED", label: "تم الرد", empty: "لا توجد تذاكر تم الرد عليها" },
  { status: "CLOSED", label: "مغلقة", empty: "لا توجد تذاكر مغلقة" },
];
const statusParam = z.enum(TicketStatus).catch("OPEN");

export default async function TicketsPage({ searchParams }: Props) {
  await requireAdminAccess();
  const sp = await searchParams;
  const status = statusParam.parse(firstParam(sp.status) || "OPEN");
  const q = firstParam(sp.q).replace(/^#/, "");
  const page = pageParam(sp.page);

  // Prisma passes `contains` into ILIKE: escape wildcards so the search is literal
  const like = q.replace(/[\\%_]/g, "\\$&");
  const search: Prisma.TicketWhereInput | undefined = q
    ? {
        OR: [
          { email: { contains: like, mode: "insensitive" } },
          { subject: { contains: like, mode: "insensitive" } },
          { id: q },
          { id: { endsWith: q.toLowerCase() } }, // the short #ID is the id's last 8 chars
        ],
      }
    : undefined;
  const where: Prisma.TicketWhereInput = { ...search, status };

  const [counts, tickets] = await Promise.all([
    prisma.ticket.groupBy({ by: ["status"], where: search, _count: { _all: true } }),
    prisma.ticket.findMany({
      where,
      // Waiting tickets are worked oldest first; the other tabs show the latest activity first.
      orderBy: [{ lastMessageAt: status === "OPEN" ? "asc" : "desc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        subject: true,
        email: true,
        status: true,
        customerId: true,
        orderId: true,
        lastMessageAt: true,
        createdAt: true,
        _count: { select: { messages: true } },
      },
    }),
  ]);

  const countBy = Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<Record<TicketStatus, number>>;
  const total = countBy[status] ?? 0;
  const tab = TABS.find((t) => t.status === status) ?? TABS[0];
  const tabHref = (s: TicketStatus) => {
    const qs = new URLSearchParams();
    if (s !== "OPEN") qs.set("status", s);
    if (q) qs.set("q", q);
    const str = qs.toString();
    return str ? `/admin/tickets?${str}` : "/admin/tickets";
  };

  return (
    <>
      <PageHeader title="تذاكر الدعم" description="رسائل العملاء من صفحة الدعم. ردّك يصل العميل كإشعار بالبريد مع رابط التذكرة." />

      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <nav aria-label="تصفية حسب الحالة" className="card flex w-fit max-w-full gap-1 overflow-x-auto p-1">
          {TABS.map((t) => {
            const active = t.status === status;
            return (
              <Link
                key={t.status}
                href={tabHref(t.status)}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-volt text-bg" : "text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                {t.label}
                <span className={`rounded-full px-1.5 font-display text-[11px] ${active ? "bg-bg/15" : "bg-surface-2 text-muted"}`}>
                  {countBy[t.status] ?? 0}
                </span>
              </Link>
            );
          })}
        </nav>
        <form method="get" role="search" className="flex gap-2">
          {status !== "OPEN" && <input type="hidden" name="status" value={status} />}
          <div className="relative flex-1 xl:w-80">
            <SearchIcon className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" />
            <input name="q" defaultValue={q} placeholder="البريد أو العنوان أو رقم التذكرة…" className="input ps-9!" aria-label="بحث في التذاكر" />
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

      <section className="card overflow-hidden" aria-label="قائمة التذاكر">
        {tickets.length === 0 ? (
          <EmptyState
            title={q ? "لا توجد تذاكر مطابقة" : total > 0 ? "لا توجد تذاكر في هذه الصفحة" : tab.empty}
            body={q ? "جرّب بريداً أو عنواناً آخر." : undefined}
          />
        ) : (
          <>
            <DataTable>
              <thead>
                <tr>
                  <th>التذكرة</th>
                  <th>العنوان</th>
                  <th>العميل</th>
                  <th>الطلب</th>
                  <th>الرسائل</th>
                  <th>آخر نشاط</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link href={`/admin/tickets/${t.id}`} className="font-display font-semibold hover:text-volt" dir="ltr">
                        #{shortId(t.id)}
                      </Link>
                    </td>
                    <td className="max-w-72">
                      <Link href={`/admin/tickets/${t.id}`} className="block truncate hover:text-volt" dir="auto">
                        {t.subject}
                      </Link>
                    </td>
                    <td className="max-w-56">
                      <span className="block truncate text-end" dir="ltr">
                        {t.email}
                      </span>
                      <span className="block text-xs text-muted">{t.customerId ? "حساب مسجّل" : "زائر"}</span>
                    </td>
                    <td>
                      {t.orderId ? (
                        <Link href={`/admin/orders/${t.orderId}`} className="font-display text-xs hover:text-volt" dir="ltr">
                          #{shortId(t.orderId)}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="font-display tabular-nums">{t._count.messages}</td>
                    <td className="whitespace-nowrap text-xs text-muted">{formatDate(t.lastMessageAt)}</td>
                    <td>
                      <TicketStatusBadge status={t.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <Pagination
              pathname="/admin/tickets"
              params={{ status: status === "OPEN" ? undefined : status, q: q || undefined }}
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
            />
          </>
        )}
      </section>
    </>
  );
}
