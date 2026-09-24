import type { Metadata } from "next";
import { IconSearch } from "@/components/store/icons";
import Link from "@/components/store/link";
import { ProductGrid } from "@/components/store/product-card";
import { SearchForm } from "@/components/store/search-form";
import { categoryHref, firstParam } from "@/components/store/site";
import { EmptyState } from "@/components/store/ui";
import { getDictionary } from "@/i18n/server";
import { SEARCH_MAX_LENGTH, getNavCategories, searchProducts } from "../_lib/queries";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function readQuery(value: string | string[] | undefined) {
  return (firstParam(value) ?? "").trim().slice(0, SEARCH_MAX_LENGTH);
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = readQuery((await searchParams).q);
  const t = await getDictionary();
  return {
    title: q ? t.search.metaTitle(q) : t.search.title,
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const q = readQuery((await searchParams).q);
  const [results, categories, t] = await Promise.all([
    searchProducts(q),
    q ? Promise.resolve([]) : getNavCategories(),
    getDictionary(),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 sm:pt-14">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">{q ? t.search.resultsTitle : t.search.searchTitle}</h1>
        <SearchForm size="lg" defaultValue={q} autoFocus={!q} className="mt-6" />
        {q ? (
          <p className="mt-4 text-sm text-muted">
            <span dir="ltr" className="font-display font-bold text-text">
              {results.length}
            </span>{" "}
            {t.search.resultWord(results.length)} {t.search.for} {t.search.quoteOpen}
            <span className="text-text">{q}</span>
            {t.search.quoteClose}
          </p>
        ) : null}
      </div>

      <div className="mt-10">
        {!q ? (
          categories.length > 0 ? (
            <div className="text-center">
              <p className="text-sm text-muted">{t.search.browse}</p>
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
            title={t.search.emptyTitle}
            description={t.search.emptyText}
          >
            <Link href="/" className="btn-primary">
              {t.search.browseStore}
            </Link>
            <Link href="/contact" className="btn-ghost">
              {t.common.contact}
            </Link>
          </EmptyState>
        )}
      </div>
    </div>
  );
}
