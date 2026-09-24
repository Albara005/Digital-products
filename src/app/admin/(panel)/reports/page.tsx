import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import type { PaymentProvider } from "@prisma/client";
import { formatPrice } from "@/lib/format";
import { DailyRevenueChart, type DailyPoint } from "@/components/admin/reports/DailyRevenueChart";
import { DataTable, EmptyState, PageHeader } from "@/components/admin/ui";
import { requireAdminAccess } from "../../_lib/guard";
import { getReport } from "./queries";
import { PRESETS, parseRange, presetLabel, rangeQuery } from "./range";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "التقارير" };

const providerLabel: Record<PaymentProvider, string> = {
  STRIPE: "Stripe",
  TAP: "Tap",
  WALLET: "المحفظة بالكامل",
  DEV: "وضع التطوير",
};

const dayShort = new Intl.DateTimeFormat("ar", { day: "numeric", month: "numeric" });
const dayFull = new Intl.DateTimeFormat("ar", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const dayMedium = new Intl.DateTimeFormat("ar", { dateStyle: "medium" });

function pct(value: number | null, digits = 1) {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toFixed(digits)}%`;
}

function localDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function Kpi({ label, value, sub, tone }: { label: ReactNode; value: string; sub?: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-2 font-display text-2xl font-bold ${tone === "bad" ? "text-danger" : "text-text"}`} dir="ltr">
        <span className="block text-end">{value}</span>
      </p>
      {sub && <p className="mt-1 text-xs leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}

function Estimated() {
  return (
    <span className="badge ms-1.5 bg-fuchsia/15 px-1.5 py-0 text-[10px] text-fuchsia ring-1 ring-fuchsia/30" title="محسوب من تكلفة الخيارات الحالية">
      تقديري
    </span>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="mt-1 h-1.5 rounded-full bg-surface-2" aria-hidden="true">
      <div className="h-1.5 rounded-full bg-[#7f9c1d]" style={{ width: `${max > 0 ? Math.max(0, (value / max) * 100) : 0}%` }} />
    </div>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requireAdminAccess("SUPER_ADMIN");
  const range = parseRange(await searchParams);
  const r = await getReport(range);
  const q = rangeQuery(range);

  const points: DailyPoint[] = r.days.map((d) => {
    const date = localDate(d.key);
    return { key: d.key, axisLabel: dayShort.format(date), fullLabel: dayFull.format(date), cents: d.cents, orders: d.orders };
  });
  const catMax = Math.max(0, ...r.categories.map((c) => c.revenueCents));
  const provMax = Math.max(0, ...r.providers.map((p) => p.cents));
  const costNote =
    r.missingCostLines > 0
      ? `${r.missingCostLines} من ${r.deliveredLines} سطراً مسلّماً بلا تكلفة مسجّلة (حُسبت بصفر)`
      : r.deliveredLines > 0
        ? `كل الأسطر المسلّمة (${r.deliveredLines}) لها تكلفة`
        : "لا أسطر مسلّمة في الفترة";

  return (
    <>
      <PageHeader
        title="التقارير"
        description={`${dayMedium.format(localDate(range.from))} – ${dayMedium.format(localDate(range.to))} · ${range.days} يوماً · حسب تاريخ الدفع`}
        actions={
          <a href={`/admin/reports/export?${q}`} className="btn-ghost" download>
            تصدير الطلبات CSV
          </a>
        }
      />

      <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <nav aria-label="الفترة" className="card flex gap-1 overflow-x-auto p-1">
          {PRESETS.filter((p) => p !== "custom").map((p) => {
            const active = range.preset === p;
            return (
              <Link
                key={p}
                href={`/admin/reports?range=${p}`}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-volt text-bg" : "text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                {presetLabel[p]}
              </Link>
            );
          })}
        </nav>
        <form method="get" className="flex flex-wrap items-end gap-2" aria-label="فترة مخصّصة">
          <input type="hidden" name="range" value="custom" />
          <div>
            <label htmlFor="r-from" className="label mb-1! text-xs">
              من
            </label>
            <input id="r-from" type="date" name="from" defaultValue={range.from} required className="input py-1.5!" dir="ltr" />
          </div>
          <div>
            <label htmlFor="r-to" className="label mb-1! text-xs">
              إلى
            </label>
            <input id="r-to" type="date" name="to" defaultValue={range.to} required className="input py-1.5!" dir="ltr" />
          </div>
          <button type="submit" className={range.preset === "custom" ? "btn-primary py-1.5!" : "btn-ghost py-1.5!"}>
            عرض
          </button>
        </form>
      </div>

      <section aria-label="مؤشرات" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="المبيعات الإجمالية" value={formatPrice(r.grossCents)} sub={`${r.grossOrders} طلب مدفوع في الفترة`} />
        <Kpi
          label="المسترجع"
          value={formatPrice(r.refundCents)}
          sub={`${r.refundOrders} طلب من طلبات الفترة استُرجع`}
          tone={r.refundCents > 0 ? "bad" : undefined}
        />
        <Kpi label="صافي الإيراد" value={formatPrice(r.netCents)} sub="المدفوعة والمسلّمة (بعد الاسترجاع)" />
        <Kpi
          label={
            <>
              تكلفة البضاعة
              <Estimated />
            </>
          }
          value={formatPrice(r.cogsCents)}
          sub={costNote}
        />
        <Kpi
          label={
            <>
              إجمالي الربح
              <Estimated />
            </>
          }
          value={formatPrice(r.grossProfitCents)}
          sub={`هامش ${pct(r.marginPct)} من صافي الإيراد`}
          tone={r.grossProfitCents < 0 ? "bad" : undefined}
        />
        <Kpi label="عدد الطلبات" value={String(r.orders)} sub={`متوسط الطلب ${formatPrice(r.avgOrderCents)}`} />
        <Kpi
          label="الخصومات (كوبونات)"
          value={formatPrice(r.discountCents)}
          sub={`${r.coupons.reduce((a, c) => a + c.uses, 0)} طلب بكوبون`}
        />
        <Kpi
          label="المدفوع من المحفظة"
          value={pct(r.walletShare === null ? null : r.walletShare * 100)}
          sub={`${formatPrice(r.walletCents)} من صافي الإيراد · عملاء جدد: ${r.newCustomers}`}
        />
      </section>

      <section className="card mt-6 p-5" aria-labelledby="daily-title">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 id="daily-title" className="font-semibold">
              صافي الإيراد اليومي
            </h2>
            <p className="text-xs text-muted">الطلبات المدفوعة والمسلّمة حسب يوم الدفع</p>
          </div>
          <p className="font-display text-lg font-bold">{formatPrice(r.netCents)}</p>
        </div>
        <DailyRevenueChart points={points} />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="card overflow-hidden" aria-labelledby="cat-title">
          <div className="px-5 pb-3 pt-5">
            <h2 id="cat-title" className="font-semibold">
              حسب الفئة
            </h2>
            <p className="text-xs text-muted">قيمة الأسطر قبل خصم الكوبونات</p>
          </div>
          {r.categories.length === 0 ? (
            <EmptyState title="لا مبيعات في الفترة" />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th>الفئة</th>
                  <th>الوحدات</th>
                  <th>المبيعات</th>
                  <th>
                    الربح <Estimated />
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.categories.map((c) => (
                  <tr key={c.categoryId}>
                    <td className="min-w-40">
                      {c.name}
                      <Bar value={c.revenueCents} max={catMax} />
                    </td>
                    <td className="font-display tabular-nums">{c.units}</td>
                    <td className="font-display tabular-nums">{formatPrice(c.revenueCents)}</td>
                    <td className="font-display tabular-nums">
                      {formatPrice(c.profitCents)}
                      {c.missingCostLines > 0 && <span className="text-fuchsia" title={`${c.missingCostLines} سطر بلا تكلفة`}>*</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </section>

        <section className="card overflow-hidden" aria-labelledby="prov-title">
          <div className="px-5 pb-3 pt-5">
            <h2 id="prov-title" className="font-semibold">
              حسب وسيلة الدفع
            </h2>
            <p className="text-xs text-muted">البوابة التي أكملت الطلب؛ الجزء المدفوع من المحفظة مبيّن منفصلاً</p>
          </div>
          {r.providers.length === 0 ? (
            <EmptyState title="لا مبيعات في الفترة" />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th>الوسيلة</th>
                  <th>الطلبات</th>
                  <th>القيمة</th>
                  <th>منها من المحفظة</th>
                </tr>
              </thead>
              <tbody>
                {r.providers.map((p) => (
                  <tr key={p.provider ?? "none"}>
                    <td className="min-w-40">
                      {p.provider ? providerLabel[p.provider] : "غير محدد"}
                      <Bar value={p.cents} max={provMax} />
                    </td>
                    <td className="font-display tabular-nums">{p.orders}</td>
                    <td className="font-display tabular-nums">{formatPrice(p.cents)}</td>
                    <td className="font-display tabular-nums text-muted">{formatPrice(p.walletCents)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </section>
      </div>

      <section className="card mt-6 overflow-hidden" aria-labelledby="top-title">
        <div className="px-5 pb-3 pt-5">
          <h2 id="top-title" className="font-semibold">
            أعلى 10 منتجات
          </h2>
          <p className="text-xs text-muted">
            حسب المبيعات (قبل خصم الكوبونات). الربح = مبيعات الأسطر المسلّمة ذات التكلفة − تكلفتها؛ * تعني وجود أسطر بلا تكلفة.
          </p>
        </div>
        {r.topProducts.length === 0 ? (
          <EmptyState title="لا مبيعات في الفترة" />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>المنتج</th>
                <th>الفئة</th>
                <th>الوحدات</th>
                <th>المبيعات</th>
                <th>
                  التكلفة <Estimated />
                </th>
                <th>الربح</th>
              </tr>
            </thead>
            <tbody>
              {r.topProducts.map((p, i) => (
                <tr key={p.productId}>
                  <td>
                    <Link href={`/admin/products/${p.productId}`} className="hover:text-volt">
                      <span className="me-1.5 font-display text-muted">{i + 1}.</span>
                      {p.name}
                    </Link>
                  </td>
                  <td className="text-muted">{p.categoryName}</td>
                  <td className="font-display tabular-nums">{p.units}</td>
                  <td className="font-display tabular-nums">{formatPrice(p.revenueCents)}</td>
                  <td className="font-display tabular-nums text-muted">{formatPrice(p.costCents)}</td>
                  <td className={`font-display tabular-nums ${p.profitCents < 0 ? "text-danger" : ""}`}>
                    {formatPrice(p.profitCents)}
                    {p.missingCostLines > 0 && <span className="text-fuchsia" title={`${p.missingCostLines} سطر بلا تكلفة`}>*</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>

      <section className="card mt-6 overflow-hidden" aria-labelledby="coupon-title">
        <div className="px-5 pb-3 pt-5">
          <h2 id="coupon-title" className="font-semibold">
            أداء الكوبونات
          </h2>
          <p className="text-xs text-muted">الطلبات المدفوعة والمسلّمة التي استخدمت كوبوناً في الفترة</p>
        </div>
        {r.coupons.length === 0 ? (
          <EmptyState title="لم يُستخدم أي كوبون في الفترة" />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>الكود</th>
                <th>الاستخدامات</th>
                <th>الخصم الممنوح</th>
                <th>إيراد الطلبات</th>
              </tr>
            </thead>
            <tbody>
              {r.coupons.map((c) => (
                <tr key={c.couponId}>
                  <td>
                    <Link href={`/admin/coupons/${c.couponId}`} className="font-display font-semibold tracking-wider hover:text-volt" dir="ltr">
                      {c.code}
                    </Link>
                  </td>
                  <td className="font-display tabular-nums">{c.uses}</td>
                  <td className="font-display tabular-nums">{formatPrice(c.discountCents)}</td>
                  <td className="font-display tabular-nums">{formatPrice(c.revenueCents)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>

      <p className="mt-6 text-xs leading-relaxed text-muted">
        الأرقام للطلبات المدفوعة خلال الفترة. «المسترجع» هو ما استُرجع من هذه الطلبات نفسها. التكلفة والربح تقديريان: يُحسبان من التكلفة
        الحالية لكل خيار (تُضبط من صفحة المنتج) على الأسطر المسلّمة فقط.
      </p>
    </>
  );
}
