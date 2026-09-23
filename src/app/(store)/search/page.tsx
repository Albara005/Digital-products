import type { Metadata } from "next";
import Link from "next/link";
import { IconSearch } from "@/components/store/icons";
import { ProductGrid } from "@/components/store/product-card";
import { SearchForm } from "@/components/store/search-form";
import { categoryHref, firstParam } from "@/components/store/site";
import { EmptyState } from "@/components/store/ui";
import { SEARCH_MAX_LENGTH, getNavCategories, searchProducts } from "../_lib/queries";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function readQuery(value: string | string[] | undefined) {
  return (firstParam(value) ?? "").trim().slice(0, SEARCH_MAX_LENGTH);
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = readQuery((await searchParams).q);
  return {
    title: q ? `نتائج البحث عن "${q}"` : "البحث",
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const q = readQuery((await searchParams).q);
  const [results, categories] = await Promise.all([searchProducts(q), q ? Promise.resolve([]) : getNavCategories()]);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 sm:pt-14">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">{q ? "نتائج البحث" : "ابحث في المتجر"}</h1>
        <SearchForm size="lg" defaultValue={q} autoFocus={!q} className="mt-6" />
        {q ? (
          <p className="mt-4 text-sm text-muted">
            <span dir="ltr" className="font-display font-bold text-text">
              {results.length}
            </span>{" "}
            {results.length === 1 ? "نتيجة" : "نتائج"} لـ «<span className="text-text">{q}</span>»
          </p>
        ) : null}
      </div>

      <div className="mt-10">
        {!q ? (
          categories.length > 0 ? (
            <div className="text-center">
              <p className="text-sm text-muted">أو تصفّح الأقسام:</p>
              <ul className="mt-4 flex flex-wrap justify-center gap-2">
                {categories.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={categoryHref(c.slug)}
                      className="inline-flex h-9 items-center rounded-full border border-border bg-surface px-4 text-sm transition hover:border-volt hover:text-volt"
                    >
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null
        ) : results.length > 0 ? (
          <ProductGrid products={results} priorityCount={4} />
        ) : (
          <EmptyState
            icon={<IconSearch className="size-7" />}
            title="لم نجد ما تبحث عنه"
            description="جرّب كلمة أبسط أو اسم اللعبة أو المنصة بالإنجليزية، أو تواصل معنا وسنوفّره لك."
          >
            <Link href="/" className="btn-primary">
              تصفّح المتجر
            </Link>
            <Link href="/contact" className="btn-ghost">
              تواصل معنا
            </Link>
          </EmptyState>
        )}
      </div>
    </div>
  );
}
