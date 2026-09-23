"use client";

import { useSyncExternalStore } from "react";
import { formatDate } from "@/lib/format";

const noopSubscribe = () => () => {};

function utcFallback(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())} UTC`;
}

/**
 * Renders a timestamp in the viewer's own time zone. Server HTML (and the hydration pass)
 * use a deterministic UTC string so markup always matches; the browser then localises it.
 */
export function LocalTime({ iso, className = "" }: { iso: string; className?: string }) {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const date = new Date(iso);
  return (
    <time dateTime={iso} className={className}>
      {isClient ? formatDate(date) : <span dir="ltr">{utcFallback(date)}</span>}
    </time>
  );
}
