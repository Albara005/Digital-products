"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IconRefresh } from "./icons";

/**
 * Re-renders the current server page every `intervalMs` until it stops rendering this
 * component (e.g. the order is delivered) or `maxMs` elapses; then offers a manual refresh.
 */
export function AutoRefresh({ intervalMs = 4000, maxMs = 120_000 }: { intervalMs?: number; maxMs?: number }) {
  const router = useRouter();
  const [round, setRound] = useState(0);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => {
      if (Date.now() - startedAt >= maxMs) {
        clearInterval(id);
        setExpired(true);
        return;
      }
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs, maxMs, round]);

  if (expired) {
    return (
      <button
        type="button"
        onClick={() => {
          router.refresh();
          setExpired(false);
          setRound((r) => r + 1);
        }}
        className="btn-ghost h-9 px-3 text-xs"
      >
        <IconRefresh className="size-4" />
        تحديث الحالة
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted" role="status">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-volt opacity-70" />
        <span className="relative inline-flex size-2 rounded-full bg-volt" />
      </span>
      يتم التحديث تلقائياً
    </span>
  );
}
