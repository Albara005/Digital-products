"use client";

import { useSyncExternalStore } from "react";
import { formatDate } from "@/lib/format";

const noopSubscribe = () => () => {};

const dateOnlyFormat = new Intl.DateTimeFormat("ar", { dateStyle: "medium" });

function utcFallback(date: Date, dateOnly: boolean) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  return dateOnly ? day : `${day} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

/**
 * Renders a timestamp in the viewer's own time zone. Server HTML (and the hydration pass)
 * use a deterministic UTC string so markup always matches; the browser then localises it.
 */
export function LocalTime({
  iso,
  className = "",
  dateOnly = false,
}: {
  iso: string;
  className?: string;
  /** Day precision only ("24 سبتمبر 2026"). */
  dateOnly?: boolean;
}) {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const date = new Date(iso);
  return (
    <time dateTime={iso} className={className}>
      {isClient ? (
        dateOnly ? (
          dateOnlyFormat.format(date)
        ) : (
          formatDate(date)
        )
      ) : (
        <span dir="ltr">{utcFallback(date, dateOnly)}</span>
      )}
    </time>
  );
}
