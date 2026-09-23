"use client";

import Link from "next/link";
import { useCart } from "./cart-provider";
import { IconBag } from "./icons";

export function CartButton() {
  const { count, ready } = useCart();
  const shown = ready && count > 0;
  return (
    <Link
      href="/cart"
      aria-label={shown ? `السلة، ${count} منتج` : "السلة"}
      className="relative grid size-10 place-items-center rounded-lg border border-border bg-surface text-text transition hover:border-volt hover:text-volt"
    >
      <IconBag className="size-5" />
      {shown ? (
        <span
          dir="ltr"
          className="absolute -top-1.5 -end-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-volt px-1 font-display text-[11px] font-bold text-bg shadow-[0_0_14px_rgba(212,255,61,0.6)] ring-2 ring-bg"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
