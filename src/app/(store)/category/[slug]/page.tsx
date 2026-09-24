import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IconBox } from "@/components/store/icons";
import Link from "@/components/store/link";
import { ProductGrid } from "@/components/store/product-card";
import { categoryHref, decodeSlug, firstParam, truncate } from "@/components/store/site";
import { EmptyState, PageHeader } from "@/components/store/ui";
import { alternates } from "@/i18n/metadata";
import { getDictionary } from "@/i18n/server";
import { type CategorySort, getCategoryBySlug, getCategoryProducts } from "../../_lib/queries";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const SORTS: CategorySort[] = ["newest", "price-asc", "price-desc"];

function parseSort(value: string | undefined): CategorySort {
  return SORTS.some((s) => s === value) ? (value as CategorySort) : "newest";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [category, t] = await Promise.all([getCategoryBySlug(decodeSlug(slug)), getDictionary()]);
  if (!category) return { title: t.category.notFound };
  const description = category.description ? truncate(category.description, 160) : t.category.metaDescription(category.name);
  return {
    title: category.name,
    description,
    alternates: await alternates(categoryHref(category.slug)),
    openGraph: { title: category.name, description },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const [category, t] = await Promise.all([getCategoryBySlug(decodeSlug(slug)), getDictionary()]);
  if (!category) notFound();

  const sort = parseSort(firstParam(query.sort));
  const products = await getCategoryProducts(category.id, sort);
  const base = categoryHref(category.slug);

  return (
    <>
      <PageHeader eyebrow="Category" title={category.name} description={category.description}>
        <nav aria-label={t.common.breadcrumb} className="mt-4 text-xs text-muted">
          <Link href="/" className="hover:text-volt">
            {t.common.home}
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
            {t.common.products(products.length)}
          </p>
          {products.length > 1 ? (
            <div role="group" aria-label={t.category.sortLabel} className="flex gap-1 rounded-full border border-border bg-surface p-1">
              {SORTS.map((s) => {
                const active = s === sort;
                return (
                  <Link
                    key={s}
                    href={s === "newest" ? base : `${base}?sort=${s}`}
                    aria-current={active ? "true" : undefined}
                    scroll={false}
                    replace
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition sm:text-sm ${
                      active ? "bg-volt text-bg" : "text-muted hover:text-text"
                    }`}
                  >
                    {t.category.sorts[s]}
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
              title={t.category.emptyTitle}
              description={t.category.emptyText}
            >
              <Link href="/" className="btn-primary">
                {t.common.backHome}
              </Link>
              <Link href="/search" className="btn-ghost">
                {t.common.search}
              </Link>
            </EmptyState>
          )}
        </div>
      </div>
    </>
  );
}
