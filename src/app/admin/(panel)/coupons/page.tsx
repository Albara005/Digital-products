import type { Metadata } from "next";
import Link from "next/link";
import type { Coupon } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { getAdminMoney } from "../../_lib/money";
import { ActionButton } from "@/components/admin/ActionButton";
import { PencilIcon, PlusIcon, TrashIcon } from "@/components/admin/icons";
import { Pagination, pageParam } from "@/components/admin/Pagination";
import { DataTable, EmptyState, PageHeader, btnSm } from "@/components/admin/ui";
import { requireAdminAccess } from "../../_lib/guard";
import { deleteCoupon, setCouponActive } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "الكوبونات" };

const PAGE_SIZE = 25;

type CouponState = { label: string; className: string };

function stateOf(c: Pick<Coupon, "active" | "startsAt" | "endsAt" | "maxUses" | "usedCount">, now: Date): CouponState {
  if (!c.active) return { label: "متوقف", className: "bg-surface-2 text-muted ring-1 ring-border" };
  if (c.endsAt && c.endsAt <= now) return { label: "منتهي", className: "bg-danger/15 text-danger ring-1 ring-danger/30" };
  if (c.maxUses != null && c.usedCount >= c.maxUses) {
    return { label: "مستنفد", className: "bg-danger/15 text-danger ring-1 ring-danger/30" };
  }
  if (c.startsAt && c.startsAt > now) return { label: "مجدول", className: "bg-fuchsia/15 text-fuchsia ring-1 ring-fuchsia/30" };
  return { label: "فعّال", className: "bg-success/15 text-success ring-1 ring-success/30" };
}

export default async function CouponsPage({ searchParams }: PageProps<"/admin/coupons">) {
  await requireAdminAccess();
  const page = pageParam((await searchParams).page);
  // Coupon amounts are USD cents, shown in the admin currency
  const money = await getAdminMoney();

  const [total, coupons] = await Promise.all([
    prisma.coupon.count(),
    prisma.coupon.findMany({
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        category: { select: { name: true } },
        product: { select: { name: true } },
        _count: { select: { redemptions: true } },
      },
    }),
  ]);
  const now = new Date();

  return (
    <>
      <PageHeader
        title="الكوبونات"
        description="أكواد خصم يُدخلها العملاء في السلة. الاستخدامات تُحتسب للطلبات غير الفاشلة فقط."
        actions={
          <Link href="/admin/coupons/new" className="btn-primary">
            <PlusIcon className="size-4" />
            كوبون جديد
          </Link>
        }
      />

      <section className="card relative overflow-hidden" aria-label="قائمة الكوبونات">
        {coupons.length === 0 ? (
          <EmptyState
            title="لا توجد كوبونات بعد"
            body="أنشئ كود خصم بنسبة مئوية أو مبلغ ثابت، وحدّد عدد الاستخدامات وفترة الصلاحية."
            action={
              <Link href="/admin/coupons/new" className="btn-primary">
                إضافة كوبون
              </Link>
            }
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>الكود</th>
                <th>الخصم</th>
                <th>الاستخدام</th>
                <th>الصلاحية</th>
                <th>الحالة</th>
                <th className="w-px">
                  <span className="sr-only">إجراءات</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => {
                const state = stateOf(c, now);
                const scope = c.product ? `منتج: ${c.product.name}` : c.category ? `فئة: ${c.category.name}` : "كل المنتجات";
                const deletable = c._count.redemptions === 0;
                return (
                  <tr key={c.id} className={c.active ? "" : "opacity-70"}>
                    <td>
                      <Link href={`/admin/coupons/${c.id}`} className="font-display font-semibold tracking-wider hover:text-volt" dir="ltr">
                        {c.code}
                      </Link>
                      <span className="block max-w-56 truncate text-xs text-muted">{scope}</span>
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="font-display font-semibold">
                        {c.type === "PERCENT" ? `${c.value}%` : money.usd(c.value)}
                      </span>
                      {c.type === "PERCENT" && c.maxDiscountCents != null && (
                        <span className="block text-xs text-muted">حد أقصى {money.usd(c.maxDiscountCents)}</span>
                      )}
                      {c.minSubtotalCents != null && (
                        <span className="block text-xs text-muted">لطلب من {money.usd(c.minSubtotalCents)}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="font-display tabular-nums">
                        {c.usedCount} / {c.maxUses ?? "∞"}
                      </span>
                      {c.perCustomerLimit != null && (
                        <span className="block text-xs text-muted">لكل عميل: {c.perCustomerLimit}</span>
                      )}
                    </td>
                    <td className="text-xs text-muted">
                      {c.startsAt || c.endsAt ? (
                        <>
                          {c.startsAt && <span className="block whitespace-nowrap">من {formatDate(c.startsAt)}</span>}
                          {c.endsAt && <span className="block whitespace-nowrap">إلى {formatDate(c.endsAt)}</span>}
                        </>
                      ) : (
                        "بدون تاريخ انتهاء"
                      )}
                    </td>
                    <td>
                      <span className={`badge whitespace-nowrap ${state.className}`}>{state.label}</span>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        <ActionButton
                          action={setCouponActive}
                          fields={{ id: c.id, active: c.active ? "false" : "true" }}
                          variant={c.active ? "subtle" : "primary"}
                          showSuccess={false}
                        >
                          {c.active ? "إيقاف" : "تفعيل"}
                        </ActionButton>
                        <Link href={`/admin/coupons/${c.id}`} className={btnSm.ghost}>
                          <PencilIcon className="size-3.5" />
                          تعديل
                        </Link>
                        <ActionButton
                          action={deleteCoupon}
                          fields={{ id: c.id }}
                          variant="danger"
                          disabled={!deletable}
                          title={deletable ? undefined : "استُخدم في طلبات: أوقفه بدلاً من حذفه"}
                          confirm={{
                            title: "حذف الكوبون؟",
                            body: (
                              <>
                                سيتم حذف الكوبون{" "}
                                <strong className="font-display text-text" dir="ltr">
                                  {c.code}
                                </strong>{" "}
                                نهائياً.
                              </>
                            ),
                            confirmLabel: "حذف",
                          }}
                        >
                          <TrashIcon className="size-3.5" />
                          حذف
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
        <Pagination pathname="/admin/coupons" params={{}} page={page} pageSize={PAGE_SIZE} total={total} />
      </section>
    </>
  );
}
