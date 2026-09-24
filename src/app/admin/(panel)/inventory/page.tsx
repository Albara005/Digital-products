import type { Metadata } from "next";
import { getSetting } from "@/lib/settings";
import Link from "next/link";
import type { InventoryStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { LayersIcon } from "@/components/admin/icons";
import { firstParam } from "@/components/admin/Pagination";
import { DataTable, EmptyState, PageHeader, ProductTypeBadge, btnSm } from "@/components/admin/ui";
import { requireAdminAccess } from "../../_lib/guard";
import { getAdminMoney } from "../../_lib/money";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "المخزون" };


export default async function InventoryOverviewPage({ searchParams }: PageProps<"/admin/inventory">) {
  const { lowStockThreshold: LOW_STOCK } = await getSetting("store");
  await requireAdminAccess();
  const sp = await searchParams;
  const money = await getAdminMoney();
  const lowOnly = firstParam(sp.low) === "1";
  const q = firstParam(sp.q);

  const [variants, grouped] = await Promise.all([
    prisma.productVariant.findMany({
      where: {
        product: {
          type: { not: "SERVICE" },
          ...(q && { name: { contains: q, mode: "insensitive" as const } }),
        },
      },
      select: {
        id: true,
        label: true,
        priceCents: true,
        currency: true,
        product: { select: { id: true, name: true, type: true, active: true } },
      },
    }),
    prisma.inventoryItem.groupBy({ by: ["variantId", "status"], _count: { _all: true } }),
  ]);

  const counts = new Map<string, Record<InventoryStatus, number>>();
  for (const g of grouped) {
    const c = counts.get(g.variantId) ?? { AVAILABLE: 0, RESERVED: 0, SOLD: 0 };
    c[g.status] = g._count._all;
    counts.set(g.variantId, c);
  }

  const rows = variants
    .map((v) => ({ ...v, c: counts.get(v.id) ?? { AVAILABLE: 0, RESERVED: 0, SOLD: 0 } }))
    .filter((r) => !lowOnly || (r.product.active && r.c.AVAILABLE < LOW_STOCK))
    .sort(
      (a, b) =>
        Number(b.product.active) - Number(a.product.active) ||
        a.c.AVAILABLE - b.c.AVAILABLE ||
        a.product.name.localeCompare(b.product.name, "ar"),
    );

  const totals = rows.reduce(
    (t, r) => ({ AVAILABLE: t.AVAILABLE + r.c.AVAILABLE, RESERVED: t.RESERVED + r.c.RESERVED, SOLD: t.SOLD + r.c.SOLD }),
    { AVAILABLE: 0, RESERVED: 0, SOLD: 0 },
  );

  const tab = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? "bg-volt text-bg" : "text-muted hover:bg-surface-2 hover:text-text"
    }`;

  return (
    <>
      <PageHeader
        title="المخزون"
        description="الأكواد والحسابات المتاحة لكل خيار. يُدار المخزون من صفحة كل منتج."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="تصفية" className="card flex gap-1 p-1">
          <Link href={q ? `/admin/inventory?q=${encodeURIComponent(q)}` : "/admin/inventory"} className={tab(!lowOnly)}>
            الكل
          </Link>
          <Link href={`/admin/inventory?low=1${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={tab(lowOnly)}>
            منخفض (أقل من {LOW_STOCK})
          </Link>
        </nav>
        <form method="get" role="search" className="flex gap-2">
          {lowOnly && <input type="hidden" name="low" value="1" />}
          <input name="q" defaultValue={q} placeholder="ابحث باسم المنتج…" className="input w-56" aria-label="بحث" />
          <button type="submit" className="btn-ghost">
            بحث
          </button>
        </form>
      </div>

      <section className="card overflow-hidden" aria-label="المخزون حسب الخيار">
        {rows.length === 0 ? (
          <EmptyState
            title={lowOnly ? "لا يوجد مخزون منخفض" : "لا توجد منتجات تحتاج مخزوناً"}
            body={lowOnly ? "كل الخيارات النشطة لديها مخزون كافٍ." : "أنشئ منتجاً من نوع بطاقة أو اشتراك أو حساب."}
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>المنتج / الخيار</th>
                <th>النوع</th>
                <th>متاح</th>
                <th>محجوز</th>
                <th>مباع</th>
                <th className="w-px">
                  <span className="sr-only">إجراءات</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.product.active ? "" : "opacity-60"}>
                  <td>
                    <Link href={`/admin/products/${r.product.id}/inventory?variant=${r.id}`} className="font-medium hover:text-volt">
                      {r.product.name}
                    </Link>
                    <span className="block text-xs text-muted">
                      <bdi>{r.label}</bdi> · <span className="font-display">{r.currency === "USD" ? money.usd(r.priceCents) : money.own(r.priceCents, r.currency)}</span>
                      {!r.product.active && " · معطّل"}
                    </span>
                  </td>
                  <td>
                    <ProductTypeBadge type={r.product.type} />
                  </td>
                  <td>
                    <span
                      className={`badge font-display ${
                        r.c.AVAILABLE === 0
                          ? "bg-danger/15 text-danger"
                          : r.c.AVAILABLE < LOW_STOCK
                            ? "bg-fuchsia/15 text-fuchsia"
                            : "bg-success/15 text-success"
                      }`}
                    >
                      {r.c.AVAILABLE === 0 ? "نفد" : r.c.AVAILABLE}
                    </span>
                  </td>
                  <td className="font-display tabular-nums text-muted">{r.c.RESERVED}</td>
                  <td className="font-display tabular-nums text-muted">{r.c.SOLD}</td>
                  <td>
                    <Link href={`/admin/products/${r.product.id}/inventory?variant=${r.id}`} className={btnSm.ghost}>
                      <LayersIcon className="size-3.5" />
                      إدارة
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border text-xs text-muted [&_td]:py-2.5">
                <td colSpan={2}>الإجمالي ({rows.length} خيار)</td>
                <td className="font-display text-text">{totals.AVAILABLE}</td>
                <td className="font-display">{totals.RESERVED}</td>
                <td className="font-display">{totals.SOLD}</td>
                <td />
              </tr>
            </tfoot>
          </DataTable>
        )}
      </section>
    </>
  );
}
