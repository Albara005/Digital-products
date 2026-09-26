import { getDictionary } from "@/i18n/server";
import { AccountButton, type HeaderAccount } from "./account-button";
import { CartButton } from "./cart-button";
import { CategoryMenu, type NavCategory } from "./category-nav";
import { IconSearch } from "./icons";
import Link from "./link";
import { Logo } from "./logo";
import { PreferencesMenu } from "./preferences";
import { SearchForm } from "./search-form";

export async function StoreHeader({ categories, account }: { categories: NavCategory[]; account?: HeaderAccount }) {
  const t = await getDictionary();
  const hasNav = categories.length > 0;
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-bg/80 backdrop-blur-xl supports-[backdrop-filter]:bg-bg/65">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        {hasNav ? <CategoryMenu categories={categories} /> : null}
        <Logo priority />
        <SearchForm className="mx-auto hidden w-full max-w-md md:block" />
        <div className="ms-auto flex items-center gap-1.5 sm:gap-2 md:ms-0">
          <Link
            href="/search"
            aria-label={t.headerNav.search}
            className="grid size-10 place-items-center rounded-lg border border-border bg-surface text-text transition hover:border-volt hover:text-volt md:hidden"
          >
            <IconSearch className="size-5" />
          </Link>
          {/* On phones the language/currency switcher lives in the side menu, so the top row never overflows */}
          <PreferencesMenu className={hasNav ? "hidden sm:block" : ""} />
          <AccountButton account={account} />
          <CartButton />
        </div>
      </div>
    </header>
  );
}
