"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { ProductType } from "@prisma/client";
import { MAX_LINE_QUANTITY } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import { useCart } from "./cart-provider";
import { IconBag, IconBolt, IconCheck, IconMinus, IconPlus } from "./icons";
import { StockIndicator, stockState } from "./ui";

export type PurchaseVariant = {
  id: string;
  label: string;
  priceCents: number;
  currency: string;
  /** AVAILABLE stock units (ignored for services). */
  available: number;
};

function maxFor(type: ProductType, v: PurchaseVariant) {
  return type === "SERVICE" ? MAX_LINE_QUANTITY : Math.min(v.available, MAX_LINE_QUANTITY);
}

export function PurchasePanel({ productType, variants }: { productType: ProductType; variants: PurchaseVariant[] }) {
  const router = useRouter();
  const cart = useCart();
  const groupId = useId();

  const firstBuyable = variants.find((v) => maxFor(productType, v) > 0) ?? variants[0];
  const [selectedId, setSelectedId] = useState(firstBuyable?.id);
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const selected = variants.find((v) => v.id === selectedId) ?? firstBuyable;
  if (!selected) {
    return (
      <div className="card p-5 text-sm text-muted">هذا المنتج غير متاح للشراء حالياً.</div>
    );
  }

  const max = maxFor(productType, selected);
  const inCart = cart.quantityOf(selected.id);
  const roomLeft = Math.max(max - inCart, 0);
  const soldOut = max === 0;
  const qty = Math.min(Math.max(quantity, 1), Math.max(roomLeft, 1));
  const canAdd = !soldOut && roomLeft > 0;

  function flash(kind: "ok" | "warn", text: string) {
    setNotice({ kind, text });
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }

  function addSelected(): boolean {
    if (!selected || !canAdd) return false;
    const before = cart.quantityOf(selected.id);
    const after = cart.add(selected.id, qty, max);
    if (after === 0) {
      flash("warn", "السلة ممتلئة، أكمل طلبك الحالي أولاً.");
      return false;
    }
    if (after - before < qty) flash("warn", `تم تعديل الكمية إلى الحد المتاح (${after}).`);
    else flash("ok", "أُضيف إلى السلة.");
    setQuantity(1);
    return true;
  }

  function buyNow() {
    // Already at the cap for this variant: nothing to add, go straight to checkout.
    if (canAdd && !addSelected()) return;
    router.push("/cart");
  }

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-3 text-sm font-bold">اختر الفئة</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {variants.map((v) => {
            const vMax = maxFor(productType, v);
            const state = stockState(productType, v.available);
            const checked = v.id === selected.id;
            return (
              <label
                key={v.id}
                className={`relative flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3.5 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-volt/60 ${
                  checked
                    ? "border-volt bg-volt/[0.07] shadow-[inset_0_0_0_1px_var(--color-volt)]"
                    : "border-border bg-surface hover:border-muted/50"
                } ${vMax === 0 ? "opacity-60" : ""}`}
              >
                <input
                  type="radio"
                  name={groupId}
                  value={v.id}
                  checked={checked}
                  onChange={() => {
                    setSelectedId(v.id);
                    setQuantity(1);
                  }}
                  className="sr-only"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{v.label}</span>
                  <span className="mt-1 block">
                    <StockIndicator state={state} count={v.available} />
                  </span>
                </span>
                <span dir="ltr" className="font-display text-base font-bold tabular-nums">
                  {formatPrice(v.priceCents, v.currency)}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-end justify-between gap-4 border-y border-border py-5">
        <div>
          <p className="text-xs text-muted">الإجمالي</p>
          <p dir="ltr" className="font-display text-3xl font-bold text-volt tabular-nums sm:text-4xl">
            {formatPrice(selected.priceCents * qty, selected.currency)}
          </p>
        </div>

        <div>
          <p id={`${groupId}-qty`} className="mb-2 text-xs text-muted">
            الكمية
          </p>
          <div
            role="group"
            aria-labelledby={`${groupId}-qty`}
            className="flex h-11 items-center rounded-lg border border-border bg-surface"
          >
            <button
              type="button"
              onClick={() => setQuantity(qty + 1)}
              disabled={!canAdd || qty >= roomLeft}
              aria-label="زيادة الكمية"
              className="grid h-full w-11 place-items-center text-text transition hover:text-volt disabled:opacity-30"
            >
              <IconPlus className="size-4" />
            </button>
            <output aria-live="polite" dir="ltr" className="w-10 text-center font-display font-bold tabular-nums">
              {canAdd ? qty : 0}
            </output>
            <button
              type="button"
              onClick={() => setQuantity(qty - 1)}
              disabled={!canAdd || qty <= 1}
              aria-label="إنقاص الكمية"
              className="grid h-full w-11 place-items-center text-text transition hover:text-volt disabled:opacity-30"
            >
              <IconMinus className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button type="button" onClick={buyNow} disabled={soldOut} className="btn-primary h-12 text-base">
          <IconBolt className="size-4" />
          {soldOut ? "نفدت الكمية" : "اشترِ الآن"}
        </button>
        <button type="button" onClick={addSelected} disabled={!canAdd} className="btn-ghost h-12 text-base">
          <IconBag className="size-4" />
          أضف إلى السلة
        </button>
      </div>

      <div aria-live="polite" className="min-h-6 text-sm">
        {notice ? (
          <p className={`flex flex-wrap items-center gap-2 ${notice.kind === "ok" ? "text-success" : "text-volt"}`}>
            {notice.kind === "ok" ? <IconCheck className="size-4" /> : null}
            {notice.text}
            <Link href="/cart" className="font-semibold text-text underline decoration-volt underline-offset-4">
              عرض السلة
            </Link>
          </p>
        ) : !soldOut && roomLeft === 0 ? (
          <p className="text-muted">
            لديك الحد الأقصى المتاح من هذه الفئة في السلة.{" "}
            <Link href="/cart" className="font-semibold text-text underline decoration-volt underline-offset-4">
              إتمام الطلب
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
