"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/i18n/client";
import { splitLocale } from "@/i18n/config";
import { IconArrow, IconChat, IconX } from "./icons";
import Link from "./link";
import { FooterPreferences } from "./preferences";
import { categoryHref, decodeSlug } from "./site";

const noop = () => () => {};

export type NavCategory = { id: string; name: string; slug: string; imageUrl: string | null };

/** Menu button (three volt bars) that slides in a side drawer with the categories. */
export function CategoryMenu({ categories }: { categories: NavCategory[] }) {
  const t = useT();
  const pathname = splitLocale(usePathname() ?? "/").path;
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  // The header's backdrop-filter would trap a fixed drawer inside it, so the drawer is portalled to <body>
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

  // Navigating (a link in the drawer) closes it
  if (open && pathname !== openedAt) {
    setOpen(false);
    setOpenedAt(pathname);
  }

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const returnTo = trigger.current;
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
      returnTo?.focus();
    };
  }, [open]);

  const activeSlug = pathname.startsWith("/category/") ? decodeSlug(pathname.split("/")[2] ?? "") : null;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => {
          setOpenedAt(pathname);
          setOpen(true);
        }}
        aria-label={t.header.openMenu}
        aria-expanded={open}
        aria-controls="store-menu"
        className="group grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface transition hover:border-volt"
      >
        <span aria-hidden="true" className="flex w-5 flex-col gap-[5px]">
          <span className="h-[2.5px] rounded-full bg-volt transition-all group-hover:w-full" />
          <span className="h-[2.5px] w-3/4 rounded-full bg-volt transition-all group-hover:w-full" />
          <span className="h-[2.5px] rounded-full bg-volt" />
        </span>
      </button>

      {mounted
        ? createPortal(
            <div
              id="store-menu"
              role="dialog"
              aria-modal="true"
              aria-label={t.header.menu}
              inert={!open}
              className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
            >
              <button
                type="button"
                tabIndex={-1}
                aria-label={t.header.closeMenu}
                onClick={() => setOpen(false)}
                className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
              />

              <aside
                className={`absolute inset-y-0 start-0 flex w-[21rem] max-w-[86vw] flex-col border-e border-border bg-bg shadow-[0_0_80px_-20px_rgba(212,255,61,0.35)] transition-transform duration-300 ease-out ${
                  open ? "translate-x-0" : "ltr:-translate-x-full rtl:translate-x-full"
                }`}
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(80%_100%_at_50%_0%,rgba(212,255,61,0.16),transparent_70%)]"
                />

                <div className="relative flex items-center justify-between border-b border-border px-5 py-4">
                  <p className="font-display text-lg font-bold">
                    Nitro <span className="text-volt">Store</span>
                  </p>
                  <button
                    ref={closeBtn}
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label={t.header.closeMenu}
                    className="grid size-9 place-items-center rounded-lg border border-border text-muted transition hover:border-volt hover:text-volt"
                  >
                    <IconX className="size-4" />
                  </button>
                </div>

                <nav aria-label={t.header.categories} className="relative flex-1 overflow-y-auto px-3 py-4">
                  <p className="px-2 pb-2 text-xs font-bold tracking-wide text-muted">{t.header.categories}</p>
                  <ul className="flex flex-col gap-1">
                    {categories.map((c, i) => {
                      const active = c.slug === activeSlug;
                      return (
                        <li
                          key={c.id}
                          style={{ transitionDelay: open ? `${80 + i * 40}ms` : "0ms" }}
                          className={`transition duration-300 ${open ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
                        >
                          <Link
                            href={categoryHref(c.slug)}
                            aria-current={active ? "page" : undefined}
                            className={`group flex items-center gap-3 rounded-xl border p-2 pe-3 transition ${
                              active
                                ? "border-volt/60 bg-volt/10"
                                : "border-transparent hover:border-border hover:bg-surface"
                            }`}
                          >
                            <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border border-volt/30 bg-[radial-gradient(circle,rgba(212,255,61,0.16),rgba(20,20,20,0.9)_70%)]">
                              {c.imageUrl ? (
                                <Image
                                  src={c.imageUrl}
                                  alt=""
                                  fill
                                  unoptimized
                                  sizes="48px"
                                  className="object-contain"
                                />
                              ) : (
                                <span
                                  dir="ltr"
                                  className="font-display text-base font-bold text-transparent [-webkit-text-stroke:1px_var(--color-volt)]"
                                >
                                  {String(i + 1).padStart(2, "0")}
                                </span>
                              )}
                            </span>
                            <span className={`min-w-0 flex-1 truncate font-semibold ${active ? "text-volt" : ""}`}>
                              {c.name}
                            </span>
                            <IconArrow className="size-4 shrink-0 text-muted transition group-hover:text-volt" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="mt-5 flex flex-col gap-1 border-t border-border pt-4">
                    <Link
                      href="/"
                      className="rounded-lg px-3 py-2.5 text-sm text-muted transition hover:bg-surface hover:text-text"
                    >
                      {t.header.home}
                    </Link>
                    <Link
                      href="/#categories"
                      className="rounded-lg px-3 py-2.5 text-sm text-muted transition hover:bg-surface hover:text-text"
                    >
                      {t.header.allCategories}
                    </Link>
                    <Link
                      href="/support"
                      className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-muted transition hover:bg-surface hover:text-text"
                    >
                      <IconChat className="size-4" />
                      {t.header.support}
                    </Link>
                  </div>
                </nav>

                <div className="relative border-t border-border px-5 py-4">
                  <FooterPreferences label={t.prefs.button} />
                </div>
              </aside>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
