"use client";

import Form from "next/form";
import { useLocalePath, useT } from "@/i18n/client";
import { IconSearch } from "./icons";

/** GET form to /search; works without JavaScript, client-side navigation with it. */
export function SearchForm({
  defaultValue = "",
  size = "md",
  autoFocus = false,
  className = "",
}: {
  defaultValue?: string;
  size?: "md" | "lg";
  autoFocus?: boolean;
  className?: string;
}) {
  const lg = size === "lg";
  const t = useT();
  const localePath = useLocalePath();
  return (
    <Form action={localePath("/search")} role="search" className={`relative ${className}`}>
      <label htmlFor={lg ? "search-page-q" : "search-q"} className="sr-only">
        {t.header.searchLabel}
      </label>
      <IconSearch
        className={`pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-muted ${lg ? "size-5" : "size-4"}`}
      />
      <input
        id={lg ? "search-page-q" : "search-q"}
        name="q"
        type="search"
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        maxLength={80}
        autoComplete="off"
        enterKeyHint="search"
        placeholder={t.header.searchPlaceholder}
        className={`input ps-10 ${lg ? "h-14 rounded-xl text-base" : "h-10 bg-surface"}`}
      />
      {lg ? (
        <button type="submit" className="btn-primary absolute top-1/2 end-2 -translate-y-1/2 px-5">
          {t.header.searchButton}
        </button>
      ) : null}
    </Form>
  );
}
