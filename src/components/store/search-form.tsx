import Form from "next/form";
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
  return (
    <Form action="/search" role="search" className={`relative ${className}`}>
      <label htmlFor={lg ? "search-page-q" : "search-q"} className="sr-only">
        ابحث عن منتج
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
        placeholder="ابحث عن بطاقة، اشتراك، حساب…"
        className={`input ps-10 ${lg ? "h-14 rounded-xl text-base" : "h-10 bg-surface"}`}
      />
      {lg ? (
        <button type="submit" className="btn-primary absolute top-1/2 end-2 -translate-y-1/2 px-5">
          بحث
        </button>
      ) : null}
    </Form>
  );
}
