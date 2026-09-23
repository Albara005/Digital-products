"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCartLines } from "@/app/(store)/cart/actions";
import type { CartItem, CartLineInfo } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import { useCart } from "./cart-provider";
import {
  IconAlert,
  IconBag,
  IconLock,
  IconMinus,
  IconPlus,
  IconRefresh,
  IconSpinner,
  IconTrash,
} from "./icons";
import { ProductMedia } from "./product-media";
import { productHref } from "./site";
import { EmptyState, TypeBadge } from "./ui";

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

function validateEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return "أدخل بريدك الإلكتروني لاستلام الطلب.";
  if (email.length > 254 || !EMAIL_RE.test(email)) return "صيغة البريد الإلكتروني غير صحيحة.";
  return null;
}

/** undefined = still loading, null = no longer sold. */
type LineInfoMap = Record<string, CartLineInfo | null>;

export function CartView() {
  const cart = useCart();
  const [info, setInfo] = useState<LineInfoMap>({});
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Fetch fresh data only for variants we haven't priced yet (removing a line needs no refetch).
  const missingKey = cart.items
    .filter((i) => !(i.variantId in info))
    .map((i) => i.variantId)
    .sort()
    .join(",");

  useEffect(() => {
    if (!missingKey) return;
    let cancelled = false;
    const ids = missingKey.split(",");
    getCartLines(ids).then(
      (lines) => {
        if (cancelled) return;
        setInfo((prev) => {
          const next: LineInfoMap = { ...prev };
          for (const id of ids) next[id] = null;
          for (const line of lines) next[line.variantId] = line;
          return next;
        });
        setLoadError(false);
      },
      () => {
        if (!cancelled) setLoadError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [missingKey, attempt]);

  // Keep stored quantities within what can actually be bought.
  useEffect(() => {
    for (const item of cart.items) {
      const line = info[item.variantId];
      if (line && line.maxQuantity > 0 && item.quantity > line.maxQuantity) {
        cart.setQuantity(item.variantId, line.maxQuantity, line.maxQuantity);
      }
    }
  }, [cart, info]);

  if (redirecting) {
    return (
      <div className="card mt-8 flex flex-col items-center gap-3 px-6 py-16 text-center">
        <IconSpinner className="size-8 text-volt" />
        <p className="font-bold">جارٍ تحويلك لإتمام الدفع…</p>
        <p className="text-sm text-muted">لا تغلق هذه الصفحة.</p>
      </div>
    );
  }

  if (!cart.ready) return <CartSkeleton />;

  if (cart.items.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState
          icon={<IconBag className="size-7" />}
          title="سلتك فارغة"
          description="تصفّح الأقسام وأضف ما يعجبك — التسليم فوري بعد الدفع."
        >
          <Link href="/" className="btn-primary">
            ابدأ التسوّق
          </Link>
        </EmptyState>
      </div>
    );
  }

  const loading = missingKey !== "";
  const rows = cart.items.map((item) => ({ item, line: info[item.variantId] }));
  const blocked = rows.some(({ line }) => line === null || (line && line.maxQuantity === 0));
  const priced = rows.filter(
    (r): r is { item: CartItem; line: CartLineInfo } => !!r.line && r.line.maxQuantity > 0,
  );
  const totals = new Map<string, number>();
  for (const { item, line } of priced) {
    const qty = Math.min(item.quantity, line.maxQuantity);
    totals.set(line.currency, (totals.get(line.currency) ?? 0) + qty * line.unitPriceCents);
  }
  const mixedCurrency = totals.size > 1;
  const units = priced.reduce((sum, { item, line }) => sum + Math.min(item.quantity, line.maxQuantity), 0);
  const hasManual = priced.some(({ line }) => line.manualDelivery);

  const emailError = validateEmail(email);
  const showEmailError = emailTouched && emailError;
  const canCheckout = !loading && !loadError && !blocked && !mixedCurrency && priced.length > 0 && !submitting;

  async function checkout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailTouched(true);
    setCheckoutError(null);
    if (emailError || !canCheckout) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          items: priced.map(({ item, line }) => ({
            variantId: item.variantId,
            quantity: Math.min(item.quantity, line.maxQuantity),
          })),
        }),
      });
      const data: unknown = await res.json().catch(() => null);
      const body = (data && typeof data === "object" ? data : {}) as { url?: unknown; error?: unknown };

      if (res.ok && typeof body.url === "string") {
        const target = new URL(body.url, window.location.origin);
        if (target.protocol === "https:" || target.protocol === "http:") {
          setRedirecting(true);
          cart.clear();
          window.location.assign(target.href);
          return;
        }
      }

      setCheckoutError(
        typeof body.error === "string" && body.error ? body.error : "تعذّر بدء عملية الدفع، حاول مرة أخرى.",
      );
      // Stock or availability changed since the cart was priced: reload fresh data.
      if (res.status === 400 || res.status === 409) setInfo({});
    } catch {
      setCheckoutError("تعذّر الاتصال بالخادم. تحقّق من اتصالك وحاول مرة أخرى.");
    }
    setSubmitting(false);
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <section aria-label="المنتجات في السلة">
        {loadError ? (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            <span className="flex items-center gap-2">
              <IconAlert className="size-4" />
              تعذّر تحميل أحدث الأسعار والمخزون.
            </span>
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className="btn-danger px-3 py-1.5">
              <IconRefresh className="size-4" />
              إعادة المحاولة
            </button>
          </div>
        ) : null}

        <ul className="space-y-3">
          {rows.map(({ item, line }) => (
            <li key={item.variantId}>
              {line === undefined ? (
                <LineSkeleton />
              ) : line === null ? (
                <UnavailableLine onRemove={() => cart.remove(item.variantId)} />
              ) : (
                <CartLine
                  item={item}
                  line={line}
                  onChange={(q) => cart.setQuantity(item.variantId, q, line.maxQuantity)}
                  onRemove={() => cart.remove(item.variantId)}
                />
              )}
            </li>
          ))}
        </ul>

        <Link href="/" className="mt-5 inline-block text-sm text-muted transition hover:text-volt">
          → متابعة التسوّق
        </Link>
      </section>

      <aside className="card p-5 sm:p-6 lg:sticky lg:top-32">
        <h2 className="text-lg font-bold">ملخص الطلب</h2>

        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted">عدد المنتجات</dt>
            <dd dir="ltr" className="font-display font-bold">
              {loading ? "…" : units}
            </dd>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <dt className="font-bold">المجموع</dt>
            <dd className="text-end">
              {loading ? (
                <span className="inline-block h-7 w-24 animate-pulse rounded bg-surface-2" />
              ) : totals.size === 0 ? (
                <span className="text-muted">—</span>
              ) : (
                [...totals].map(([currency, cents]) => (
                  <span key={currency} dir="ltr" className="block font-display text-2xl font-bold text-volt tabular-nums">
                    {formatPrice(cents, currency)}
                  </span>
                ))
              )}
            </dd>
          </div>
        </dl>

        <form onSubmit={checkout} noValidate className="mt-6 space-y-4">
          <div>
            <label htmlFor="checkout-email" className="label">
              البريد الإلكتروني
            </label>
            <input
              id="checkout-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              dir="ltr"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              aria-invalid={showEmailError ? true : undefined}
              aria-describedby="checkout-email-hint"
              placeholder="you@example.com"
              className={`input h-11 text-start ${showEmailError ? "border-danger focus:border-danger" : ""}`}
            />
            <p id="checkout-email-hint" className={`mt-1.5 text-xs ${showEmailError ? "text-danger" : "text-muted"}`}>
              {showEmailError ? emailError : "سنرسل رابط طلبك إلى هذا البريد."}
            </p>
          </div>

          {blocked ? (
            <Notice>بعض المنتجات لم تعد متوفرة. احذفها من السلة للمتابعة.</Notice>
          ) : mixedCurrency ? (
            <Notice>لا يمكن الدفع لمنتجات بعملات مختلفة في طلب واحد. أكمل كل عملة في طلب منفصل.</Notice>
          ) : null}

          {checkoutError ? (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
              <IconAlert className="mt-0.5 size-4 shrink-0" />
              {checkoutError}
            </p>
          ) : null}

          <button type="submit" disabled={!canCheckout} className="btn-primary h-12 w-full text-base">
            {submitting ? (
              <>
                <IconSpinner className="size-4" />
                جارٍ التحويل…
              </>
            ) : (
              <>
                <IconLock className="size-4" />
                إتمام الطلب والدفع
              </>
            )}
          </button>

          <p className="text-center text-xs leading-6 text-muted">
            {hasManual ? "الخدمات تُنفَّذ يدوياً بعد الدفع. " : "يصلك طلبك فوراً بعد تأكيد الدفع. "}
            بإتمام الطلب فإنك توافق على{" "}
            <Link href="/terms" className="text-text underline decoration-border underline-offset-4 hover:decoration-volt">
              الشروط والأحكام
            </Link>{" "}
            و
            <Link
              href="/refund-policy"
              className="text-text underline decoration-border underline-offset-4 hover:decoration-volt"
            >
              سياسة الاسترجاع
            </Link>
            .
          </p>
        </form>
      </aside>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-volt/30 bg-volt/10 p-3 text-sm text-volt">
      <IconAlert className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}

function CartLine({
  item,
  line,
  onChange,
  onRemove,
}: {
  item: CartItem;
  line: CartLineInfo;
  onChange: (quantity: number) => void;
  onRemove: () => void;
}) {
  const soldOut = line.maxQuantity === 0;
  const qty = soldOut ? 0 : Math.min(item.quantity, line.maxQuantity);
  const atMax = !soldOut && qty >= line.maxQuantity;

  return (
    <div className={`card flex gap-3 p-3 sm:gap-4 sm:p-4 ${soldOut ? "border-danger/40" : ""}`}>
      <Link
        href={productHref(line.productSlug)}
        className="size-18 shrink-0 overflow-hidden rounded-lg border border-border sm:size-22"
        tabIndex={-1}
        aria-hidden="true"
      >
        <ProductMedia name={line.productName} type={line.productType} imageUrl={line.imageUrl} size="sm" sizes="88px" />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={productHref(line.productSlug)}
              className="line-clamp-2 text-sm leading-6 font-semibold transition hover:text-volt sm:text-base"
            >
              {line.productName}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <TypeBadge type={line.productType} />
              <span>{line.variantLabel}</span>
              <span aria-hidden="true">·</span>
              <span dir="ltr" className="font-display tabular-nums">
                {formatPrice(line.unitPriceCents, line.currency)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`حذف ${line.productName} من السلة`}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger"
          >
            <IconTrash className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          {soldOut ? (
            <p className="text-sm font-semibold text-danger">نفدت الكمية</p>
          ) : (
            <div className="flex items-center gap-3">
              <div
                role="group"
                aria-label={`كمية ${line.productName}`}
                className="flex h-9 items-center rounded-lg border border-border bg-surface-2"
              >
                <button
                  type="button"
                  onClick={() => onChange(qty + 1)}
                  disabled={atMax}
                  aria-label="زيادة الكمية"
                  className="grid h-full w-9 place-items-center transition hover:text-volt disabled:opacity-30"
                >
                  <IconPlus className="size-3.5" />
                </button>
                <output dir="ltr" aria-live="polite" className="w-8 text-center font-display text-sm font-bold tabular-nums">
                  {qty}
                </output>
                <button
                  type="button"
                  onClick={() => onChange(qty - 1)}
                  disabled={qty <= 1}
                  aria-label="إنقاص الكمية"
                  className="grid h-full w-9 place-items-center transition hover:text-volt disabled:opacity-30"
                >
                  <IconMinus className="size-3.5" />
                </button>
              </div>
              {atMax && !line.manualDelivery ? (
                <span className="text-xs text-muted">المتوفر: {line.maxQuantity}</span>
              ) : null}
            </div>
          )}
          <span dir="ltr" className="font-display text-base font-bold tabular-nums">
            {formatPrice(qty * line.unitPriceCents, line.currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

function UnavailableLine({ onRemove }: { onRemove: () => void }) {
  return (
    <div className="card flex items-center justify-between gap-3 border-danger/40 p-4">
      <div className="flex items-center gap-3 text-sm">
        <IconAlert className="size-5 shrink-0 text-danger" />
        <span>
          <span className="block font-semibold">منتج لم يعد متاحاً</span>
          <span className="text-muted">تم إيقاف هذا المنتج أو تغييره.</span>
        </span>
      </div>
      <button type="button" onClick={onRemove} className="btn-danger px-3 py-1.5">
        <IconTrash className="size-4" />
        حذف
      </button>
    </div>
  );
}

function LineSkeleton() {
  return (
    <div className="card flex gap-4 p-4" aria-hidden="true">
      <div className="size-18 animate-pulse rounded-lg bg-surface-2 sm:size-22" />
      <div className="flex-1 space-y-3 py-1">
        <div className="h-4 w-2/3 animate-pulse rounded bg-surface-2" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-surface-2" />
        <div className="h-8 w-28 animate-pulse rounded bg-surface-2" />
      </div>
    </div>
  );
}

function CartSkeleton() {
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]" aria-busy="true" aria-label="جارٍ تحميل السلة">
      <div className="space-y-3">
        <LineSkeleton />
        <LineSkeleton />
      </div>
      <div className="card h-80 animate-pulse" />
    </div>
  );
}
