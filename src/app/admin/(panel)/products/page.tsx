import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { Prisma, ProductType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatPrice, productTypeLabel } from "@/lib/format";
import { LayersIcon, PencilIcon, PlusIcon, SearchIcon, StarIcon } from "@/components/admin/icons";
import { Pagination, firstParam, pageParam } from "@/components/admin/Pagination";
import { DataTable, EmptyState, PageHeader, ProductTypeBadge, btnSm } from "@/components/admin/ui";
import { requireAdminAccess } from "../../_lib/guard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "المنتجات" };

const PAGE_SIZE = 25;
const LOW_STOCK = 5;
const typeParam = z.enum(ProductType).optional().catch(undefined);
const statusParam = z.enum(["active", "inactive"]).optional().catch(undefined);

export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requireAdminAccess();
  const sp = await searchParams;
  const q = firstParam(sp.q);
  const category = firstParam(sp.category);
  const type = typeParam.parse(firstParam(sp.type) || undefined);
  const status = statusParam.parse(firstParam(sp.status) || undefined);
  const page = pageParam(sp.page);

  const where: Prisma.ProductWhereInput = {
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
        { variants: { some: { label: { contains: q, mode: "insensitive" } } } },
      ],
    }),
    ...(category && { categoryId: category }),
    ...(type && { type }),
    ...(status && { active: status === "active" }),
  };

  const [categories, total, products] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        active: true,
        featured: true,
        imageUrl: true,
        category: { select: { name: true } },
        variants: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            label: true,
            priceCents: true,
            currency: true,
            _count: { select: { inventoryItems: { where: { status: "AVAILABLE" } } } },
          },
        },
      },
    }),
  ]);

  const filtered = Boolean(q || category || type || status);
  const params = { q: q || undefined, category: category || undefined, type, status };

  return (
    <>
      <PageHeader
        title="المنتجات"
        description="البطاقات، الاشتراكات، الحسابات والخدمات المعروضة في المتجر."
        actions={
          <Link href="/admin/products/new" className="btn-primary">
            <PlusIcon className="size-4" />
            منتج جديد
          </Link>
        }
      />

      <form method="get" className="card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_180px_150px_150px_auto]" role="search">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" />
          <input
            name="q"
            defaultValue={q}
            placeholder="ابحث بالاسم أو الرابط أو الخيار…"
            className="input ps-9!"
            aria-label="بحث"
          />
        </div>
        <select name="category" defaultValue={category} className="input" aria-label="الفئة">
          <option value="">كل الفئات</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={type ?? ""} className="input" aria-label="النوع">
          <option value="">كل الأنواع</option>
          {(Object.keys(productTypeLabel) as ProductType[]).map((t) => (
            <option key={t} value={t}>
              {productTypeLabel[t]}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status ?? ""} className="input" aria-label="الحالة">
          <option value="">كل الحالات</option>
          <option value="active">نشط</option>
          <option value="inactive">معطّل</option>
        </select>
        <div className="flex gap-2">
          <button type="submit" className="btn-ghost flex-1">
            تصفية
          </button>
          {filtered && (
            <Link href="/admin/products" className="btn text-muted hover:text-text">
              مسح
            </Link>
          )}
        </div>
      </form>

      <section className="card overflow-hidden" aria-label="قائمة المنتجات">
        {products.length === 0 ? (
          filtered ? (
            <EmptyState title="لا توجد نتائج" body="جرّب تعديل البحث أو الفلاتر." />
          ) : (
            <EmptyState
              title="لا توجد منتجات بعد"
              body={categories.length ? "أضف أول منتج وحدد خياراته وأسعاره." : "ابدأ بإضافة فئة، ثم أضف المنتجات إليها."}
              action={
                <Link href={categories.length ? "/admin/products/new" : "/admin/categories"} className="btn-primary">
                  {categories.length ? "إضافة منتج" : "إضافة فئة"}
                </Link>
              }
            />
          )
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>المنتج</th>
                <th>الفئة</th>
                <th>النوع</th>
                <th>الخيارات · السعر · المتاح</th>
                <th>الحالة</th>
                <th className="w-px">
                  <span className="sr-only">إجراءات</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className={p.active ? "" : "opacity-70"}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="size-10 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-2">
                        {p.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of arbitrary URL
                          <img src={p.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <Link href={`/admin/products/${p.id}`} className="flex items-center gap-1.5 font-medium hover:text-volt">
                          <span className="truncate">{p.name}</span>
                          {p.featured && <StarIcon className="size-3.5 shrink-0 fill-volt text-volt" aria-label="مميّز" />}
                        </Link>
                        <span className="block truncate font-mono text-xs text-muted" dir="ltr">
                          {p.slug}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-muted">{p.category.name}</td>
                  <td>
                    <ProductTypeBadge type={p.type} />
                  </td>
                  <td>
                    <ul className="flex flex-col gap-1">
                      {p.variants.map((v) => {
                        const n = v._count.inventoryItems;
                        return (
                          <li key={v.id} className="flex items-center gap-2 whitespace-nowrap text-xs">
                            <span className="text-text">{v.label}</span>
                            <span className="font-display text-muted">{formatPrice(v.priceCents, v.currency)}</span>
                            {p.type !== "SERVICE" && (
                              <span
                                className={`badge px-2 font-display ${
                                  n === 0
                                    ? "bg-danger/15 text-danger"
                                    : n < LOW_STOCK
                                      ? "bg-fuchsia/15 text-fuchsia"
                                      : "bg-surface-2 text-muted"
                                }`}
                                title="متاح في المخزون"
                              >
                                {n}
                              </span>
                            )}
                          </li>
                        );
                      })}
                      {p.variants.length === 0 && <li className="text-xs text-danger">بدون خيارات</li>}
                    </ul>
                  </td>
                  <td>
                    {p.active ? (
                      <span className="badge bg-success/15 text-success">نشط</span>
                    ) : (
                      <span className="badge bg-surface-2 text-muted ring-1 ring-border">معطّل</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/admin/products/${p.id}`} className={btnSm.ghost}>
                        <PencilIcon className="size-3.5" />
                        تعديل
                      </Link>
                      {p.type !== "SERVICE" && (
                        <Link href={`/admin/products/${p.id}/inventory`} className={btnSm.ghost}>
                          <LayersIcon className="size-3.5" />
                          المخزون
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        <Pagination pathname="/admin/products" params={params} page={page} pageSize={PAGE_SIZE} total={total} />
      </section>
    </>
  );
}
