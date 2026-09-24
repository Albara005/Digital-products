"use client";

import { useEffect, useId, useState } from "react";
import { type CheckoutQuote, getCartLines, quoteCheckout } from "@/app/(store)/cart/actions";
import { type ClientDictionary } from "@/i18n/ar/client";
import { useLocale, useT } from "@/i18n/client";
import { LOCALE_HEADER } from "@/i18n/config";
import type { CartItem, CartLineInfo } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import { useCart } from "./cart-provider";
import { Approx, useApprox } from "./currency";
import {
  IconAlert,
  IconBag,
  IconCard,
  IconCheck,
  IconLock,
  IconMinus,
  IconPlus,
  IconRefresh,
  IconSpinner,
  IconTag,
  IconTrash,
  IconUser,
  IconWallet,
  IconX,
} from "./icons";
import Link from "./link";
import { ProductMedia } from "./product-media";
import { WALLET_CURRENCY, productHref } from "./site";
import type { PaymentProviderOption } from "./topup-form";
import { EmptyState, TypeBadge } from "./ui";

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

function validateEmail(value: string, t: ClientDictionary): string | null {
  const email = value.trim();
  if (!email) return t.cart.emailRequired;
  if (email.length > 254 || !EMAIL_RE.test(email)) return t.cart.emailInvalid;
  return null;
}

/** undefined = still loading, null = no longer sold. */
type LineInfoMap = Record<string, CartLineInfo | null>;

/** A quote tagged with the inputs it was computed for; `result: null` = the request failed. */
type QuoteState = { key: string; result: CheckoutQuote | null };

export type CartAccount = { email: string; walletBalanceCents: number } | null;

export function CartView({
  account,
  providers,
  devMode,
}: {
  /** Signed-in customer (email + wallet), or null for guests. */
  account: CartAccount;
  /** Enabled card gateways; a choice is shown when there is more than one. */
  providers: PaymentProviderOption[];
  devMode: boolean;
}) {
  const cart = useCart();
  const uid = useId();
  const t = useT();
  const locale = useLocale();
  const approx = useApprox();
  const [info, setInfo] = useState<LineInfoMap>({});
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const [couponOpen, setCouponOpen] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [useWallet, setUseWallet] = useState(false);
  const [provider, setProvider] = useState(providers[0]?.id);
  const [quote, setQuote] = useState<QuoteState>({ key: "", result: null });

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
  const checkoutItems = priced.map(({ item, line }) => ({
    variantId: item.variantId,
    quantity: Math.min(item.quantity, line.maxQuantity),
  }));

  // Server-side quote (coupon, wallet, amount due) for exactly what would be checked out.
  const walletOn = !!account && useWallet;
  const canQuote = !loading && !loadError && !blocked && !mixedCurrency && checkoutItems.length > 0;
  const quoteKey = canQuote ? JSON.stringify([checkoutItems, appliedCoupon, walletOn]) : "";

  useEffect(() => {
    if (!quoteKey) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const [items, couponCode, wallet] = JSON.parse(quoteKey) as [CartItem[], string | null, boolean];
      quoteCheckout({ items, couponCode: couponCode ?? undefined, useWallet: wallet }).then(
        (result) => {
          if (!cancelled) setQuote({ key: quoteKey, result });
        },
        () => {
          if (!cancelled) setQuote({ key: quoteKey, result: null });
        },
      );
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [quoteKey]);

  if (redirecting) {
    return (
      <div className="card mt-8 flex flex-col items-center gap-3 px-6 py-16 text-center">
        <IconSpinner className="size-8 text-volt" />
        <p className="font-bold">{t.cart.redirecting}</p>
        <p className="text-sm text-muted">{t.cart.dontClose}</p>
      </div>
    );
  }

  if (!cart.ready) return <CartSkeleton />;

  if (cart.items.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState
          icon={<IconBag className="size-7" />}
          title={t.cart.emptyTitle}
          description={t.cart.emptyText}
        >
          <Link href="/" className="btn-primary">
            {t.cart.startShopping}
          </Link>
        </EmptyState>
      </div>
    );
  }

  const current = quoteKey && quote.key === quoteKey ? quote : null;
  const quoting = !!quoteKey && !current;
  const q = current?.result?.ok ? current.result : null;
  const quoteError = current
    ? current.result === null
      ? t.cart.quoteFailed
      : current.result.ok
        ? null
        : current.result.error
    : null;
  const couponError = appliedCoupon && q?.couponError ? q.couponError : null;
  const couponValid = !!(appliedCoupon && q?.coupon);
  const walletBalance = q?.walletBalanceCents ?? account?.walletBalanceCents ?? 0;
  const showWallet = !!account && walletBalance > 0;
  const currency = q?.currency ?? [...totals.keys()][0] ?? "USD";
  const amountDue = q ? q.amountDueCents : null;
  const paidInFull = amountDue === 0;
  const showProviders = providers.length > 1 && !paidInFull;

  const emailError = account ? null : validateEmail(email, t);
  const showEmailError = emailTouched && emailError;
  const canCheckout =
    !loading && !loadError && !blocked && !mixedCurrency && priced.length > 0 && !submitting && !quoting;

  function applyCoupon(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponInput(code);
    setAppliedCoupon(code);
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponInput("");
  }

  async function checkout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailTouched(true);
    setCheckoutError(null);
    if (emailError || !canCheckout) return;

    // A coupon the quote rejected is not sent; one the quote couldn't check is left to the server.
    const couponCode = appliedCoupon && !couponError ? appliedCoupon : undefined;
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", [LOCALE_HEADER]: locale },
        body: JSON.stringify({
          // Signed in: the server uses the account email from the session.
          ...(account ? {} : { email: email.trim() }),
          items: checkoutItems,
          ...(couponCode ? { couponCode } : {}),
          ...(walletOn ? { useWallet: true } : {}),
          ...(provider && !paidInFull ? { provider } : {}),
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
        typeof body.error === "string" && body.error ? body.error : t.cart.checkoutFailed,
      );
      // Stock or availability changed since the cart was priced: reload fresh data.
      if (res.status === 400 || res.status === 409) setInfo({});
    } catch {
      setCheckoutError(t.cart.network);
    }
    setSubmitting(false);
  }

  const money = (cents: number) => formatPrice(cents, currency);
  const pending = <span className="inline-block h-5 w-16 animate-pulse rounded bg-surface-2 align-middle" />;
  const localSubtotal = totals.get(currency) ?? 0;
  // What the gateway will charge, in USD; shown whenever a local display currency is selected.
  const chargeCents = amountDue ?? (mixedCurrency ? null : localSubtotal);
  const showUsdNote = chargeCents !== null && chargeCents > 0 && approx(chargeCents, currency) !== null;

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <section aria-label={t.cart.itemsLabel}>
        {loadError ? (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            <span className="flex items-center gap-2">
              <IconAlert className="size-4" />
              {t.cart.loadFailed}
            </span>
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className="btn-danger px-3 py-1.5">
              <IconRefresh className="size-4" />
              {t.cart.retry}
            </button>
          </div>
        ) : null}

        <ul className="space-y-3">
          {rows.map(({ item, line }) => (
            <li key={item.variantId}>
              {line === undefined ? (
                <LineSkeleton />
              ) : line === null ? (
                <UnavailableLine t={t} onRemove={() => cart.remove(item.variantId)} />
              ) : (
                <CartLine
                  t={t}
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
          {t.cart.continueShopping}
        </Link>
      </section>

      <aside className="card p-5 sm:p-6 lg:sticky lg:top-32">
        <h2 className="text-lg font-bold">{t.cart.summary}</h2>

        {/* Coupon: its own form so Enter applies the code instead of checking out. */}
        <div className="mt-5 border-b border-border pb-5">
          {couponValid && q?.coupon ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-success">
                <IconTag className="size-4 shrink-0" />
                <span className="min-w-0">
                  <span dir="ltr" className="font-display font-bold tracking-wider">
                    {q.coupon.code}
                  </span>
                  <span className="block truncate text-xs text-text">{q.coupon.label}</span>
                </span>
              </span>
              <button
                type="button"
                onClick={removeCoupon}
                disabled={submitting}
                aria-label={t.cart.removeCoupon(q.coupon.code)}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger"
              >
                <IconX className="size-4" />
              </button>
            </div>
          ) : couponOpen || appliedCoupon ? (
            <form onSubmit={applyCoupon} noValidate>
              <label htmlFor={`${uid}-coupon`} className="label">
                {t.cart.couponLabel}
              </label>
              <div className="flex gap-2">
                <input
                  id={`${uid}-coupon`}
                  type="text"
                  dir="ltr"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={40}
                  autoFocus={!appliedCoupon}
                  value={couponInput}
                  onChange={(e) => {
                    setCouponInput(e.target.value);
                    // Editing a rejected code clears the error until it is applied again.
                    if (appliedCoupon) setAppliedCoupon(null);
                  }}
                  aria-invalid={couponError ? true : undefined}
                  aria-describedby={couponError ? `${uid}-coupon-error` : undefined}
                  placeholder="NITRO10"
                  className={`input h-11 min-w-0 flex-1 text-start font-display tracking-wider uppercase ${couponError ? "border-danger focus:border-danger" : ""}`}
                />
                <button
                  type="submit"
                  disabled={!couponInput.trim() || (!!appliedCoupon && quoting) || submitting}
                  className="btn-ghost h-11 shrink-0 px-4"
                >
                  {appliedCoupon && quoting ? <IconSpinner className="size-4" /> : t.cart.apply}
                </button>
              </div>
              {couponError ? (
                <p id={`${uid}-coupon-error`} role="alert" className="mt-1.5 text-xs text-danger">
                  {couponError}
                </p>
              ) : null}
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCouponOpen(true)}
              className="flex items-center gap-2 text-sm font-semibold text-volt transition hover:text-volt-dim"
            >
              <IconTag className="size-4" />
              {t.cart.haveCoupon}
            </button>
          )}
        </div>

        {showWallet ? (
          <label className="mt-5 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 p-3 transition has-[:checked]:border-volt/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-volt/60">
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-volt/10 text-volt ring-1 ring-volt/20">
                <IconWallet className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{t.cart.useWallet}</span>
                <span className="block text-xs text-muted">
                  {t.cart.available}{" "}
                  <span dir="ltr" className="font-display font-bold text-text tabular-nums">
                    {formatPrice(walletBalance, WALLET_CURRENCY)}
                  </span>
                </span>
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={useWallet}
              onChange={(e) => setUseWallet(e.target.checked)}
              disabled={submitting}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="relative h-6 w-11 shrink-0 rounded-full bg-border transition peer-checked:bg-volt after:absolute after:top-0.5 after:start-0.5 after:size-5 after:rounded-full after:bg-text after:transition-all peer-checked:after:start-[1.375rem] peer-checked:after:bg-bg"
            />
          </label>
        ) : null}

        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted">{t.cart.units}</dt>
            <dd dir="ltr" className="font-display font-bold">
              {loading ? "…" : units}
            </dd>
          </div>
          {mixedCurrency ? null : (
            <div className="flex items-center justify-between">
              <dt className="text-muted">{t.cart.subtotal}</dt>
              <dd dir="ltr" className="font-display font-bold tabular-nums">
                {loading ? pending : money(q?.subtotalCents ?? localSubtotal)}
              </dd>
            </div>
          )}
          {q && q.discountCents > 0 ? (
            <div className="flex items-center justify-between text-success">
              <dt>
                {t.cart.discount}
                {q.coupon ? (
                  <>
                    {" "}
                    <span dir="ltr" className="font-display text-xs">
                      ({q.coupon.code})
                    </span>
                  </>
                ) : null}
              </dt>
              <dd dir="ltr" className="font-display font-bold tabular-nums">
                {"\u2212"}
                {money(q.discountCents)}
              </dd>
            </div>
          ) : null}
          {q && q.walletAppliedCents > 0 ? (
            <div className="flex items-center justify-between text-volt">
              <dt>{t.cart.fromWallet}</dt>
              <dd dir="ltr" className="font-display font-bold tabular-nums">
                {"\u2212"}
                {money(q.walletAppliedCents)}
              </dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t border-border pt-3">
            <dt className="font-bold">{q && (q.discountCents > 0 || q.walletAppliedCents > 0) ? t.cart.amountDue : t.cart.total}</dt>
            <dd className="text-end">
              {loading || quoting ? (
                <span className="inline-block h-7 w-24 animate-pulse rounded bg-surface-2" />
              ) : totals.size === 0 ? (
                <span className="text-muted">—</span>
              ) : mixedCurrency || amountDue === null ? (
                [...totals].map(([cur, cents]) => (
                  <span key={cur} dir="ltr" className="block font-display text-2xl font-bold text-volt tabular-nums">
                    {formatPrice(cents, cur)}
                  </span>
                ))
              ) : (
                <>
                  <span dir="ltr" className="block font-display text-2xl font-bold text-volt tabular-nums">
                    {money(amountDue)}
                  </span>
                  <Approx cents={amountDue} currency={currency} className="block text-sm" />
                </>
              )}
            </dd>
          </div>
        </dl>

        <form onSubmit={checkout} noValidate className="mt-6 space-y-4">
          {account ? (
            <div>
              <p className="label">{t.cart.email}</p>
              <div className="flex h-11 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-sm">
                <IconUser className="size-4 shrink-0 text-volt" />
                <bdi dir="ltr" className="min-w-0 truncate">
                  {account.email}
                </bdi>
              </div>
              <p className="mt-1.5 text-xs text-muted">{t.cart.accountEmailNote}</p>
            </div>
          ) : (
            <div>
              <label htmlFor="checkout-email" className="label">
                {t.cart.email}
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
                {showEmailError ? emailError : t.cart.guestEmailNote}
              </p>
              <p className="mt-2 text-xs text-muted">
                {t.cart.haveAccount}{" "}
                <Link
                  href="/login?next=/cart"
                  className="font-semibold text-volt underline decoration-volt/30 underline-offset-4 hover:decoration-volt"
                >
                  {t.cart.signIn}
                </Link>{" "}
                {t.cart.signInPerks}
              </p>
            </div>
          )}

          {showProviders ? (
            <fieldset disabled={submitting}>
              <legend className="label">{t.cart.paymentMethod}</legend>
              <div className="grid grid-cols-2 gap-2">
                {providers.map((p) => (
                  <label
                    key={p.id}
                    className={`flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-volt/60 ${
                      provider === p.id
                        ? "border-volt bg-volt/[0.07] text-volt shadow-[inset_0_0_0_1px_var(--color-volt)]"
                        : "border-border bg-surface-2 text-text hover:border-muted/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`${uid}-provider`}
                      value={p.id}
                      checked={provider === p.id}
                      onChange={() => setProvider(p.id)}
                      className="sr-only"
                    />
                    <IconCard className="size-4 shrink-0" />
                    <span className="truncate">{p.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {blocked ? (
            <Notice>{t.cart.blocked}</Notice>
          ) : mixedCurrency ? (
            <Notice>{t.cart.mixedCurrency}</Notice>
          ) : quoteError ? (
            <Notice>{quoteError}</Notice>
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
                {t.cart.submitting}
              </>
            ) : paidInFull && q && q.walletAppliedCents > 0 ? (
              <>
                <IconWallet className="size-4" />
                {t.cart.payWithWallet}
              </>
            ) : paidInFull ? (
              <>
                <IconCheck className="size-4" />
                {t.cart.complete}
              </>
            ) : (
              <>
                <IconLock className="size-4" />
                {t.cart.completeAndPay}
              </>
            )}
          </button>

          {showUsdNote && chargeCents !== null ? (
            <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-3 text-xs leading-6 text-muted">
              <IconCard className="mt-1 size-3.5 shrink-0 text-volt" />
              <span>{t.cart.chargedInUsd(formatPrice(chargeCents, currency))}</span>
            </p>
          ) : null}

          {devMode && !paidInFull ? (
            <p className="rounded-lg border border-dashed border-volt/40 p-2 text-center text-xs text-volt">
              {t.cart.devMode}
            </p>
          ) : null}

          <p className="text-center text-xs leading-6 text-muted">
            {hasManual ? t.cart.manualNote : t.cart.instantNote}
            {t.cart.agree}{" "}
            <Link href="/terms" className="text-text underline decoration-border underline-offset-4 hover:decoration-volt">
              {t.cart.terms}
            </Link>{" "}
            {t.cart.and}
            <Link
              href="/refund-policy"
              className="text-text underline decoration-border underline-offset-4 hover:decoration-volt"
            >
              {t.cart.refundPolicy}
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
  t,
  item,
  line,
  onChange,
  onRemove,
}: {
  t: ClientDictionary;
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
              <Approx cents={line.unitPriceCents} currency={line.currency} />
            </div>
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label={t.cart.removeItem(line.productName)}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger"
          >
            <IconTrash className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          {soldOut ? (
            <p className="text-sm font-semibold text-danger">{t.stock.out}</p>
          ) : (
            <div className="flex items-center gap-3">
              <div
                role="group"
                aria-label={t.cart.lineQuantity(line.productName)}
                className="flex h-9 items-center rounded-lg border border-border bg-surface-2 ltr:flex-row-reverse"
              >
                <button
                  type="button"
                  onClick={() => onChange(qty + 1)}
                  disabled={atMax}
                  aria-label={t.purchase.increase}
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
                  aria-label={t.purchase.decrease}
                  className="grid h-full w-9 place-items-center transition hover:text-volt disabled:opacity-30"
                >
                  <IconMinus className="size-3.5" />
                </button>
              </div>
              {atMax && !line.manualDelivery ? (
                <span className="text-xs text-muted">{t.cart.inStock(line.maxQuantity)}</span>
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

function UnavailableLine({ t, onRemove }: { t: ClientDictionary; onRemove: () => void }) {
  return (
    <div className="card flex items-center justify-between gap-3 border-danger/40 p-4">
      <div className="flex items-center gap-3 text-sm">
        <IconAlert className="size-5 shrink-0 text-danger" />
        <span>
          <span className="block font-semibold">{t.cart.unavailableTitle}</span>
          <span className="text-muted">{t.cart.unavailableText}</span>
        </span>
      </div>
      <button type="button" onClick={onRemove} className="btn-danger px-3 py-1.5">
        <IconTrash className="size-4" />
        {t.cart.remove}
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
  const t = useT();
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]" aria-busy="true" aria-label={t.cart.loading}>
      <div className="space-y-3">
        <LineSkeleton />
        <LineSkeleton />
      </div>
      <div className="card h-80 animate-pulse" />
    </div>
  );
}
