import type { Metadata } from "next";
import { getSetting } from "@/lib/settings";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { InventoryStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDate, formatPrice } from "@/lib/format";
import { ActionButton } from "@/components/admin/ActionButton";
import { InventoryAddForm } from "@/components/admin/InventoryAddForm";
import { RevealPayload } from "@/components/admin/RevealPayload";
import { PencilIcon, TrashIcon } from "@/components/admin/icons";
import { Pagination, firstParam, pageParam } from "@/components/admin/Pagination";
import { Callout, EmptyState, PageHeader, ProductTypeBadge, btnSm } from "@/components/admin/ui";
import { requireAdminAccess } from "../../../../_lib/guard";
import { addInventory, deleteInventoryItem, revealInventoryItem } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "المخزون" };

const PAGE_SIZE = 50;

export default async function ProductInventoryPage({ params, searchParams }: PageProps<"/admin/products/[id]/inventory">) {
  const { lowStockThreshold: LOW_STOCK } = await getSetting("store");
  await requireAdminAccess();
  const { id } = await params;
  const sp = await searchParams;

  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      variants: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, label: true, priceCents: true, currency: true },
      },
    },
  });
  if (!product) notFound();

  const header = (
    <PageHeader
      title={
        <span className="flex flex-wrap items-center gap-3">
          مخزون: {product.name}
          <ProductTypeBadge type={product.type} />
        </span>
      }
      back={{ href: "/admin/inventory", label: "المخزون" }}
      actions={
        <Link href={`/admin/products/${product.id}`} className={btnSm.ghost}>
          <PencilIcon className="size-3.5" />
          تعديل المنتج
        </Link>
      }
    />
  );

  if (product.type === "SERVICE") {
    return (
      <>
        {header}
        <Callout>
          هذا منتج <strong className="text-text">خدمة</strong>: يُسلَّم يدوياً من صفحة الطلب بعد الدفع (نص التسليم يُشفَّر ويظهر
          للعميل)، لذلك لا يحتاج مخزوناً.{" "}
          <Link href="/admin/orders?status=PAID" className="text-volt underline-offset-4 hover:underline">
            الطلبات بانتظار التسليم
          </Link>
        </Callout>
      </>
    );
  }

  if (product.variants.length === 0) {
    return (
      <>
        {header}
        <div className="card">
          <EmptyState
            title="لا توجد خيارات"
            body="أضف خياراً واحداً على الأقل للمنتج قبل رفع المخزون."
            action={
              <Link href={`/admin/products/${product.id}`} className="btn-primary">
                تعديل المنتج
              </Link>
            }
          />
        </div>
      </>
    );
  }

  const requested = firstParam(sp.variant);
  const selected = product.variants.find((v) => v.id === requested) ?? product.variants[0];
  const page = pageParam(sp.page);

  const [grouped, available, availableTotal] = await Promise.all([
    prisma.inventoryItem.groupBy({
      by: ["variantId", "status"],
      where: { variant: { productId: product.id } },
      _count: { _all: true },
    }),
    prisma.inventoryItem.findMany({
      where: { variantId: selected.id, status: "AVAILABLE" },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, createdAt: true }, // payload deliberately not loaded: revealed on demand
    }),
    prisma.inventoryItem.count({ where: { variantId: selected.id, status: "AVAILABLE" } }),
  ]);

  const counts = new Map<string, Record<InventoryStatus, number>>();
  for (const g of grouped) {
    const c = counts.get(g.variantId) ?? { AVAILABLE: 0, RESERVED: 0, SOLD: 0 };
    c[g.status] = g._count._all;
    counts.set(g.variantId, c);
  }
  const kind = product.type;

  return (
    <>
      {header}

      <section aria-label="ملخص المخزون" className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {product.variants.map((v) => {
          const c = counts.get(v.id) ?? { AVAILABLE: 0, RESERVED: 0, SOLD: 0 };
          const isSelected = v.id === selected.id;
          return (
            <Link
              key={v.id}
              href={`/admin/products/${product.id}/inventory?variant=${v.id}`}
              aria-current={isSelected ? "true" : undefined}
              className={`card block p-4 transition-colors ${isSelected ? "border-volt/60 bg-volt/5" : "hover:border-muted/60"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <bdi className="block truncate font-medium">{v.label}</bdi>
                <span className="font-display text-xs text-muted">{formatPrice(v.priceCents, v.currency)}</span>
              </div>
              <p className="mt-3 flex items-baseline gap-1.5">
                <span
                  className={`font-display text-2xl font-bold ${
                    c.AVAILABLE === 0 ? "text-danger" : c.AVAILABLE < LOW_STOCK ? "text-fuchsia" : "text-text"
                  }`}
                >
                  {c.AVAILABLE}
                </span>
                <span className="text-xs text-muted">متاح</span>
              </p>
              <p className="mt-1 text-xs text-muted">
                محجوز <span className="font-display text-text">{c.RESERVED}</span> · مباع{" "}
                <span className="font-display text-text">{c.SOLD}</span>
              </p>
            </Link>
          );
        })}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="card p-5" aria-labelledby="add-stock">
          <h2 id="add-stock" className="mb-1 font-semibold">
            إضافة مخزون
          </h2>
          <p className="mb-4 text-xs text-muted">يُشفَّر كل عنصر (AES-256-GCM) قبل حفظه. تُرفض الدفعة إن احتوت على تكرار.</p>
          <InventoryAddForm
            action={addInventory}
            productId={product.id}
            kind={kind}
            variants={product.variants.map((v) => ({ id: v.id, label: v.label }))}
            defaultVariantId={selected.id}
          />
        </section>

        <section className="card overflow-hidden" aria-labelledby="available-title">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-5">
            <h2 id="available-title" className="font-semibold">
              المتاح — <bdi>{selected.label}</bdi>
            </h2>
            <span className="text-xs text-muted">مخفي افتراضياً · اضغط «إظهار» لعرض عنصر واحد</span>
          </div>
          {available.length === 0 ? (
            <EmptyState title="لا يوجد مخزون متاح لهذا الخيار" body="أضف أكواداً أو حسابات من النموذج." />
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {available.map((item, i) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                  <span className="w-8 shrink-0 font-display text-xs tabular-nums text-muted">
                    {(page - 1) * PAGE_SIZE + i + 1}
                  </span>
                  <RevealPayload id={item.id} reveal={revealInventoryItem} />
                  <span className="hidden shrink-0 text-xs text-muted md:inline">{formatDate(item.createdAt)}</span>
                  <ActionButton
                    action={deleteInventoryItem}
                    fields={{ id: item.id }}
                    variant="subtle"
                    showSuccess={false}
                    confirm={{
                      title: "حذف عنصر من المخزون؟",
                      body: "سيُحذف هذا العنصر نهائياً ولن يُسلَّم لأي عميل.",
                      confirmLabel: "حذف",
                    }}
                  >
                    <TrashIcon className="size-3.5" />
                    <span className="sr-only">حذف</span>
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}
          <Pagination
            pathname={`/admin/products/${product.id}/inventory`}
            params={{ variant: selected.id }}
            page={page}
            pageSize={PAGE_SIZE}
            total={availableTotal}
          />
        </section>
      </div>
    </>
  );
}
