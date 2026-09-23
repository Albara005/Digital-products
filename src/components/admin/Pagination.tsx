import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

function hrefFor(pathname: string, params: Record<string, string | undefined>, page: number) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  if (page > 1) qs.set("page", String(page));
  const s = qs.toString();
  return s ? `${pathname}?${s}` : pathname;
}

export function Pagination({
  pathname,
  params,
  page,
  pageSize,
  total,
}: {
  pathname: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = "inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium";

  return (
    <nav aria-label="التنقل بين الصفحات" className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted">
      <p>
        <span className="font-display tabular-nums">
          {from}–{to}
        </span>{" "}
        من <span className="font-display tabular-nums">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={hrefFor(pathname, params, page - 1)} className={`${link} hover:border-volt hover:text-volt`} rel="prev">
            <ChevronRightIcon className="size-3.5" />
            السابق
          </Link>
        ) : (
          <span className={`${link} opacity-40`} aria-disabled="true">
            <ChevronRightIcon className="size-3.5" />
            السابق
          </span>
        )}
        <span className="font-display tabular-nums">
          {page} / {pages}
        </span>
        {page < pages ? (
          <Link href={hrefFor(pathname, params, page + 1)} className={`${link} hover:border-volt hover:text-volt`} rel="next">
            التالي
            <ChevronLeftIcon className="size-3.5" />
          </Link>
        ) : (
          <span className={`${link} opacity-40`} aria-disabled="true">
            التالي
            <ChevronLeftIcon className="size-3.5" />
          </span>
        )}
      </div>
    </nav>
  );
}

export function pageParam(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 && n < 100000 ? n : 1;
}

export function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim().slice(0, 200) ?? "";
}
