import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ProductForm } from "@/components/admin/ProductForm";
import { EmptyState, PageHeader } from "@/components/admin/ui";
import { requireAdminAccess } from "../../../_lib/guard";
import { getAdminMoney } from "../../../_lib/money";
import { saveProduct } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "منتج جديد" };

export default async function NewProductPage() {
  await requireAdminAccess();
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  return (
    <>
      <PageHeader title="منتج جديد" back={{ href: "/admin/products", label: "المنتجات" }} />
      {categories.length === 0 ? (
        <div className="card">
          <EmptyState
            title="أضف فئة أولاً"
            body="كل منتج يجب أن ينتمي إلى فئة."
            action={
              <Link href="/admin/categories" className="btn-primary">
                إدارة الفئات
              </Link>
            }
          />
        </div>
      ) : (
        <ProductForm action={saveProduct} categories={categories} fx={(await getAdminMoney()).fx} />
      )}
    </>
  );
}
