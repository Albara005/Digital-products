import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { formatDate, formatPrice } from "@/lib/format";
import { countWalletTransactions, listWalletTransactions, walletTransactionTypeLabel } from "@/lib/wallet";
import { CopyButton } from "@/components/admin/CopyButton";
import { WalletAdjustForm } from "@/components/admin/customers/WalletAdjustForm";
import { ChevronLeftIcon } from "@/components/admin/icons";
import { Pagination, pageParam } from "@/components/admin/Pagination";
import { DataTable, EmptyState, OrderStatusBadge, PageHeader, shortId } from "@/components/admin/ui";
import { requireAdminAccess } from "../../../_lib/guard";
import { SPENT_STATUSES } from "../spent";
import { adjustCustomerWallet } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "تفاصيل العميل" };

const ORDERS_SHOWN = 25;
const LEDGER_PAGE_SIZE = 20;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-end">{children}</dd>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-2 font-display text-xl font-bold">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export default async function CustomerDetailPage({ params, searchParams }: PageProps<"/admin/customers/[id]">) {
  const session = await requireAdminAccess();
  const { id } = await params;
  const page = pageParam((await searchParams).page);

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerifiedAt: true,
      walletBalanceCents: true,
      createdAt: true,
      referredBy: { select: { id: true, email: true } },
      _count: { select: { orders: true, referrals: true } },
    },
  });
  if (!customer) notFound();

  const [orders, byStatus, ledger, ledgerTotal] = await Promise.all([
    prisma.order.findMany({
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
      take: ORDERS_SHOWN,
      select: {
        id: true,
        status: true,
        totalCents: true,
        walletAppliedCents: true,
        currency: true,
        createdAt: true,
        items: { select: { productName: true, variantLabel: true, quantity: true }, take: 2 },
        _count: { select: { items: true } },
      },
    }),
    prisma.order.groupBy({ by: ["status"], where: { customerId: id }, _sum: { totalCents: true }, _count: { _all: true } }),
    listWalletTransactions(id, { take: LEDGER_PAGE_SIZE, skip: (page - 1) * LEDGER_PAGE_SIZE }),
    countWalletTransactions(id),
  ]);

  const sumOf = (statuses: string[]) =>
    byStatus.filter((s) => statuses.includes(s.status)).reduce((a, s) => ({ cents: a.cents + (s._sum.totalCents ?? 0), n: a.n + s._count._all }), { cents: 0, n: 0 });
  const spent = sumOf(SPENT_STATUSES);
  const refunded = sumOf(["REFUNDED"]);
  const isSuper = session.role === "SUPER_ADMIN";

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="break-all" dir="ltr">
              {customer.email}
            </span>
            {customer.emailVerifiedAt ? (
              <span className="badge bg-success/15 text-success ring-1 ring-success/30">موثّق</span>
            ) : (
              <span className="badge bg-surface-2 text-muted ring-1 ring-border">غير موثّق</span>
            )}
          </span>
        }
        description={customer.name ?? undefined}
        back={{ href: "/admin/customers", label: "العملاء" }}
        actions={<CopyButton text={customer.email} label="نسخ البريد" />}
      />

      <section aria-label="ملخص" className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="المُنفَق" value={formatPrice(spent.cents)} sub={`${spent.n} طلب مدفوع أو مسلّم`} />
        <Stat label="عدد الطلبات" value={String(customer._count.orders)} sub="بكل الحالات" />
        <Stat label="المسترجع" value={formatPrice(refunded.cents)} sub={`${refunded.n} طلب`} />
        <Stat label="رصيد المحفظة" value={formatPrice(customer.walletBalanceCents)} sub={`${ledgerTotal} حركة`} />
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="card overflow-hidden" aria-labelledby="orders-title">
            <div className="flex items-center justify-between px-5 pb-3 pt-5">
              <h2 id="orders-title" className="font-semibold">
                الطلبات
              </h2>
              {customer._count.orders > ORDERS_SHOWN && (
                <Link
                  href={`/admin/orders?q=${encodeURIComponent(customer.email)}`}
                  className="inline-flex items-center gap-1 text-xs text-muted hover:text-volt"
                >
                  كل الطلبات ({customer._count.orders}) <ChevronLeftIcon className="size-3.5" />
                </Link>
              )}
            </div>
            {orders.length === 0 ? (
              <EmptyState title="لا طلبات لهذا العميل" />
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <th>الطلب</th>
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
                      <td className="max-w-64">
                        {o.items.map((it, i) => (
                          <span key={i} className="block truncate text-xs">
                            <bdi>{it.productName}</bdi>{" "}
                            <span className="text-muted">
                              · <bdi>{it.variantLabel}</bdi>
                            </span>
                            {it.quantity > 1 && <span className="font-display text-muted"> ×{it.quantity}</span>}
                          </span>
                        ))}
                        {o._count.items > o.items.length && (
                          <span className="text-xs text-muted">+{o._count.items - o.items.length} أخرى</span>
                        )}
                      </td>
                      <td className="font-display tabular-nums">
                        {formatPrice(o.totalCents, o.currency)}
                        {o.walletAppliedCents > 0 && (
                          <span className="block text-[11px] text-muted">منها {formatPrice(o.walletAppliedCents)} من المحفظة</span>
                        )}
                      </td>
                      <td>
                        <OrderStatusBadge status={o.status} />
                      </td>
                      <td className="whitespace-nowrap text-xs text-muted">{formatDate(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </section>

          <section className="card overflow-hidden" aria-labelledby="ledger-title">
            <div className="px-5 pb-3 pt-5">
              <h2 id="ledger-title" className="font-semibold">
                سجل المحفظة
              </h2>
              <p className="text-xs text-muted">كل حركة على الرصيد، الأحدث أولاً.</p>
            </div>
            {ledger.length === 0 ? (
              <EmptyState title="لا توجد حركات" body="لم يُشحن رصيد ولم يُستخدم بعد." />
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <th>النوع</th>
                    <th>المبلغ</th>
                    <th>الرصيد بعدها</th>
                    <th>ملاحظة</th>
                    <th>التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((t) => (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap">{walletTransactionTypeLabel[t.type]}</td>
                      <td className={`font-display tabular-nums ${t.amountCents > 0 ? "text-success" : "text-danger"}`} dir="ltr">
                        <span className="block text-end">
                          {t.amountCents > 0 ? "+" : "−"}
                          {formatPrice(Math.abs(t.amountCents))}
                        </span>
                      </td>
                      <td className="font-display tabular-nums">{formatPrice(t.balanceAfterCents)}</td>
                      <td className="max-w-72 text-xs">
                        {t.note && <span className="block break-words">{t.note}</span>}
                        {t.orderId && (
                          <Link href={`/admin/orders/${t.orderId}`} className="font-display text-muted hover:text-volt" dir="ltr">
                            #{shortId(t.orderId)}
                          </Link>
                        )}
                        {!t.note && !t.orderId && <span className="text-muted">—</span>}
                      </td>
                      <td className="whitespace-nowrap text-xs text-muted">{formatDate(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
            <Pagination pathname={`/admin/customers/${customer.id}`} params={{}} page={page} pageSize={LEDGER_PAGE_SIZE} total={ledgerTotal} />
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <section className="card p-5" aria-labelledby="profile-title">
            <h2 id="profile-title" className="mb-1 font-semibold">
              الملف
            </h2>
            <dl className="divide-y divide-border">
              <Row label="البريد">
                <span className="break-all" dir="ltr">
                  {customer.email}
                </span>
              </Row>
              {customer.name && <Row label="الاسم">{customer.name}</Row>}
              <Row label="التحقق من البريد">{customer.emailVerifiedAt ? formatDate(customer.emailVerifiedAt) : "لم يسجّل الدخول بعد"}</Row>
              <Row label="عميل منذ">{formatDate(customer.createdAt)}</Row>
              {customer.referredBy && (
                <Row label="دعاه">
                  <Link href={`/admin/customers/${customer.referredBy.id}`} className="break-all hover:text-volt" dir="ltr">
                    {customer.referredBy.email}
                  </Link>
                </Row>
              )}
              {customer._count.referrals > 0 && <Row label="عملاء دعاهم">{customer._count.referrals}</Row>}
            </dl>
          </section>

          <section className="card p-5" aria-labelledby="wallet-title">
            <h2 id="wallet-title" className="font-semibold">
              تعديل رصيد المحفظة
            </h2>
            <p className="mb-4 mt-1 text-sm text-muted">
              الرصيد الحالي: <span className="font-display font-semibold text-text">{formatPrice(customer.walletBalanceCents)}</span>
            </p>
            {isSuper ? (
              <WalletAdjustForm
                action={adjustCustomerWallet}
                customerId={customer.id}
                email={customer.email}
                balanceCents={customer.walletBalanceCents}
              />
            ) : (
              <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
                تعديل الرصيد متاح للمدير العام فقط.
              </p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
