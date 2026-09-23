"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { categoryHref, decodeSlug } from "./site";

export type NavCategory = { id: string; name: string; slug: string };

export function CategoryNav({ categories }: { categories: NavCategory[] }) {
  const pathname = usePathname();
  if (categories.length === 0) return null;

  const activeSlug = pathname.startsWith("/category/") ? decodeSlug(pathname.split("/")[2] ?? "") : null;

  return (
    <nav aria-label="الأقسام" className="border-t border-border/60">
      <ul className="mx-auto flex max-w-7xl gap-1.5 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
        {categories.map((c) => {
          const active = c.slug === activeSlug;
          return (
            <li key={c.id} className="shrink-0">
              <Link
                href={categoryHref(c.slug)}
                aria-current={active ? "page" : undefined}
                className={`inline-flex h-8 items-center rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition ${
                  active
                    ? "bg-volt text-bg"
                    : "text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                {c.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
