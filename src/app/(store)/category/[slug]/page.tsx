import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IconBox } from "@/components/store/icons";
import { ProductGrid } from "@/components/store/product-card";
import { categoryHref, decodeSlug, firstParam, truncate } from "@/components/store/site";
import { EmptyState, PageHeader } from "@/components/store/ui";
import { type CategorySort, getCategoryBySlug, getCategoryProducts } from "../../_lib/queries";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SORTS: { value: CategorySort; label: string }[] = [
  { value: "newest", label: "الأحدث" },
  { value: "price-asc", label: "السعر: من الأقل" },
  { value: "price-desc", label: "السعر: من الأعلى" },
];

function parseSort(value: string | undefined): CategorySort {
  return SORTS.some((s) => s.value === value) ? (value as CategorySort) : "newest";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(decodeSlug(slug));
  if (!category) return { title: "القسم غير موجود" };
  const description = category.description
    ? truncate(category.description, 160)
    : `تسوّق ${category.name} من Nitro Store — دفع آمن وتسليم فوري على مدار الساعة.`;
  return {
    title: category.name,
    description,
    alternates: { canonical: categoryHref(category.slug) },
    openGraph: { title: category.name, description },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const category = await getCategoryBySlug(decodeSlug(slug));
  if (!category) notFound();

  const sort = parseSort(firstParam(query.sort));
  const products = await getCategoryProducts(category.id, sort);
  const base = categoryHref(category.slug);

  return (
    <>
      <PageHeader eyebrow="Category" title={category.name} description={category.description}>
        <nav aria-label="مسار التنقل" className="mt-4 text-xs text-muted">
          <Link href="/" className="hover:text-volt">
            الرئيسية
          </Link>
          <span className="mx-2" aria-hidden="true">
            /
          </span>
          <span className="text-text">{category.name}</span>
        </nav>
      </PageHeader>

      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            <span dir="ltr" className="font-display font-bold text-text">
              {products.length}
            </span>{" "}
            {products.length === 1 ? "منتج" : "منتجات"}
          </p>
          {products.length > 1 ? (
            <div role="group" aria-label="ترتيب المنتجات" className="flex gap-1 rounded-full border border-border bg-surface p-1">
              {SORTS.map((s) => {
                const active = s.value === sort;
                return (
                  <Link
                    key={s.value}
                    href={s.value === "newest" ? base : `${base}?sort=${s.value}`}
                    aria-current={active ? "true" : undefined}
                    scroll={false}
                    replace
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition sm:text-sm ${
                      active ? "bg-volt text-bg" : "text-muted hover:text-text"
                    }`}
                  >
                    {s.label}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="mt-6">
          {products.length > 0 ? (
            <ProductGrid products={products} priorityCount={4} />
          ) : (
            <EmptyState
              icon={<IconBox className="size-7" />}
              title="لا توجد منتجات في هذا القسم حالياً"
              description="نضيف منتجات جديدة باستمرار. تصفّح بقية الأقسام أو ابحث عن منتج محدد."
            >
              <Link href="/" className="btn-primary">
                العودة للرئيسية
              </Link>
              <Link href="/search" className="btn-ghost">
                البحث
              </Link>
            </EmptyState>
          )}
        </div>
      </div>
    </>
  );
}
