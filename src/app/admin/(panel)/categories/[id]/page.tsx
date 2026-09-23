import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CategoryForm } from "@/components/admin/CategoryForm";
import { PageHeader } from "@/components/admin/ui";
import { requireAdminAccess } from "../../../_lib/guard";
import { saveCategory } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "تعديل فئة" };

export default async function EditCategoryPage({ params }: PageProps<"/admin/categories/[id]">) {
  await requireAdminAccess();
  const { id } = await params;
  const category = await prisma.category.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true, description: true, sortOrder: true, _count: { select: { products: true } } },
  });
  if (!category) notFound();

  return (
    <>
      <PageHeader
        title={`تعديل: ${category.name}`}
        description={`${category._count.products} منتج في هذه الفئة. تغيير الرابط يغيّر عنوان صفحة الفئة في المتجر.`}
        back={{ href: "/admin/categories", label: "الفئات" }}
      />
      <section className="card max-w-xl p-5">
        <CategoryForm
          action={saveCategory}
          category={{
            id: category.id,
            name: category.name,
            slug: category.slug,
            description: category.description,
            sortOrder: category.sortOrder,
          }}
        />
      </section>
    </>
  );
}
