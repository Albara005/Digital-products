import Link from "next/link";
import { CartButton } from "./cart-button";
import { CategoryNav, type NavCategory } from "./category-nav";
import { IconSearch } from "./icons";
import { Logo } from "./logo";
import { SearchForm } from "./search-form";

export function StoreHeader({ categories }: { categories: NavCategory[] }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-bg/80 backdrop-blur-xl supports-[backdrop-filter]:bg-bg/65">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Logo />
        <SearchForm className="mx-auto hidden w-full max-w-md md:block" />
        <div className="ms-auto flex items-center gap-2 md:ms-0">
          <Link
            href="/search"
            aria-label="البحث"
            className="grid size-10 place-items-center rounded-lg border border-border bg-surface text-text transition hover:border-volt hover:text-volt md:hidden"
          >
            <IconSearch className="size-5" />
          </Link>
          <CartButton />
        </div>
      </div>
      <CategoryNav categories={categories} />
    </header>
  );
}
