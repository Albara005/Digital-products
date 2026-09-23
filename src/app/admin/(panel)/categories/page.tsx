import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ActionButton } from "@/components/admin/ActionButton";
import { CategoryForm } from "@/components/admin/CategoryForm";
import { PencilIcon, TrashIcon } from "@/components/admin/icons";
import { DataTable, EmptyState, PageHeader, btnSm } from "@/components/admin/ui";
import { requireAdminAccess } from "../../_lib/guard";
import { deleteCategory, saveCategory } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "الفئات" };

export default async function CategoriesPage() {
  await requireAdminAccess();

  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, description: true, sortOrder: true, _count: { select: { products: true } } },
  });

  return (
    <>
      <PageHeader title="الفئات" description="تنظيم المنتجات في أقسام تظهر في المتجر." />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card overflow-hidden" aria-label="قائمة الفئات">
          {categories.length === 0 ? (
            <EmptyState title="لا توجد فئات بعد" body="أضف أول فئة من النموذج المجاور، ثم أضف المنتجات إليها." />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th>الفئة</th>
                  <th>الرابط</th>
                  <th>المنتجات</th>
                  <th>الترتيب</th>
                  <th className="w-px">
                    <span className="sr-only">إجراءات</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="font-medium">{c.name}</span>
                      {c.description && <span className="block max-w-xs truncate text-xs text-muted">{c.description}</span>}
                    </td>
                    <td className="font-mono text-xs text-muted" dir="ltr">
                      <span className="block text-end">{c.slug}</span>
                    </td>
                    <td>
                      {c._count.products > 0 ? (
                        <Link href={`/admin/products?category=${c.id}`} className="font-display hover:text-volt">
                          {c._count.products}
                        </Link>
                      ) : (
                        <span className="font-display text-muted">0</span>
                      )}
                    </td>
                    <td className="font-display tabular-nums text-muted">{c.sortOrder}</td>
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/admin/categories/${c.id}`} className={btnSm.ghost}>
                          <PencilIcon className="size-3.5" />
                          تعديل
                        </Link>
                        <ActionButton
                          action={deleteCategory}
                          fields={{ id: c.id }}
                          variant="danger"
                          // With products attached the click goes straight to the server, which explains why it can't delete.
                          confirm={
                            c._count.products > 0
                              ? undefined
                              : {
                                  title: "حذف الفئة؟",
                                  body: (
                                    <>
                                      سيتم حذف الفئة <strong className="text-text">«{c.name}»</strong> نهائياً.
                                    </>
                                  ),
                                  confirmLabel: "حذف",
                                }
                          }
                        >
                          <TrashIcon className="size-3.5" />
                          حذف
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </section>

        <section className="card p-5" aria-labelledby="new-cat">
          <h2 id="new-cat" className="mb-4 font-semibold">
            إضافة فئة
          </h2>
          <CategoryForm action={saveCategory} />
        </section>
      </div>
    </>
  );
}
