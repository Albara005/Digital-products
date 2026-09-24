"use client";

import type { ProductType } from "@prisma/client";
import { useT } from "@/i18n/client";
import { ProductTypeIcon } from "./icons";
import type { StockState } from "./stock";

// Small translated labels shared by server and client components.

export function TypeBadge({ type, className = "" }: { type: ProductType; className?: string }) {
  const t = useT();
  return (
    <span className={`badge gap-1 bg-volt/10 text-volt ring-1 ring-volt/25 ring-inset ${className}`}>
      <ProductTypeIcon type={type} className="size-3.5" />
      {t.productType[type]}
    </span>
  );
}

export function StockIndicator({ state, count }: { state: StockState; count?: number }) {
  const t = useT();
  const styles: Record<StockState, { dot: string; text: string; label: string }> = {
    in: { dot: "bg-success", text: "text-success", label: t.stock.in },
    low: { dot: "bg-volt", text: "text-volt", label: t.stock.low(count) },
    out: { dot: "bg-muted/60", text: "text-muted", label: t.stock.out },
    manual: { dot: "bg-volt", text: "text-volt", label: t.stock.manual },
  };
  const s = styles[state];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
      <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
    </span>
  );
}
