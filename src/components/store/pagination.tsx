import { getDictionary } from "@/i18n/server";
import { IconArrow } from "./icons";
import Link from "./link";

export function pageParam(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 && n < 10_000 ? n : 1;
}

function hrefFor(pathname: string, params: Record<string, string | undefined>, hash?: string) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return `${pathname}${s ? `?${s}` : ""}${hash ? `#${hash}` : ""}`;
}

/**
 * Previous / next links for a server-rendered list. `param` is the query key holding this
 * list's page; `params` carries the rest of the URL state (other lists' pages) unchanged.
 */
export async function Pager({
  pathname,
  param,
  params,
  page,
  pageSize,
  total,
  hash,
  label,
}: {
  pathname: string;
  param: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
  hash?: string;
  label: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const t = await getDictionary();
  const at = (p: number) => hrefFor(pathname, { ...params, [param]: p > 1 ? String(p) : undefined }, hash);
  const link =
    "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold transition";

  return (
    <nav aria-label={label} className="mt-4 flex items-center justify-between gap-3 text-xs text-muted">
      {page > 1 ? (
        <Link href={at(page - 1)} rel="prev" scroll={false} className={`${link} hover:border-volt hover:text-volt`}>
          <IconArrow className="size-3.5 rotate-180" />
          {t.pager.prev}
        </Link>
      ) : (
        <span aria-disabled="true" className={`${link} opacity-40`}>
          <IconArrow className="size-3.5 rotate-180" />
          {t.pager.prev}
        </span>
      )}
      <span>
        {t.pager.page}{" "}
        <span dir="ltr" className="font-display font-bold text-text tabular-nums">
          {Math.min(page, pages)}
        </span>{" "}
        {t.pager.of}{" "}
        <span dir="ltr" className="font-display tabular-nums">
          {pages}
        </span>
      </span>
      {page < pages ? (
        <Link href={at(page + 1)} rel="next" scroll={false} className={`${link} hover:border-volt hover:text-volt`}>
          {t.pager.next}
          <IconArrow className="size-3.5" />
        </Link>
      ) : (
        <span aria-disabled="true" className={`${link} opacity-40`}>
          {t.pager.next}
          <IconArrow className="size-3.5" />
        </span>
      )}
    </nav>
  );
}
