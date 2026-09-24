import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { OrderStatus, ProductType, ReviewStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { formatPrice } from "@/lib/format";
import { AutoRefresh } from "@/components/store/auto-refresh";
import { CopyButton } from "@/components/store/copy-button";
import { IconAlert, IconBookmark, IconCheck, IconClock, IconShieldCheck, IconSpinner } from "@/components/store/icons";
import Link from "@/components/store/link";
import { LocalTime } from "@/components/store/local-time";
import { ReviewForm } from "@/components/store/review-form";
import { firstParam, maskedDisplayName, productHref } from "@/components/store/site";
import { localized } from "@/i18n/config";
import { type Dictionary, getDictionary, getLocale } from "@/i18n/server";
import { Stars } from "@/components/store/stars";
import { TypeBadge } from "@/components/store/ui";
import { isPlausibleOrderRef, tokenMatches } from "../../_lib/order-access";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await getDictionary()).order.metaTitle,
    robots: { index: false, follow: false },
    // The URL carries the access token: never leak it through the Referer header.
    referrer: "no-referrer",
  };
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function loadVerifiedOrder(id: string, token: string | undefined) {
  if (!isPlausibleOrderRef(id, token)) return null;
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      accessToken: true,
      status: true,
      subtotalCents: true,
      discountCents: true,
      walletAppliedCents: true,
      totalCents: true,
      currency: true,
      createdAt: true,
      coupon: { select: { code: true } },
      customer: { select: { email: true } },
      items: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          productName: true,
          variantLabel: true,
          productType: true,
          quantity: true,
          unitPriceCents: true,
          deliveryNote: true,
          deliveredAt: true,
          variant: {
            select: { labelEn: true, product: { select: { nameEn: true, warrantyHours: true, slug: true, active: true } } },
          },
          review: { select: { rating: true, status: true } },
          // Units are linked as RESERVED at checkout; only SOLD (delivered) units may be revealed.
          inventoryItems: {
            where: { status: "SOLD" },
            orderBy: [{ soldAt: "asc" }, { id: "asc" }],
            select: { id: true, payload: true },
          },
        },
      },
    },
  });
  if (!order || !tokenMatches(token, order.accessToken)) return null;
  return order;
}

function reveal(payload: string, context: string): string | null {
  try {
    return decrypt(payload);
  } catch {
    console.error(`[order] Could not decrypt ${context}`);
    return null;
  }
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.slice(0, 2)}${"•".repeat(Math.max(3, Math.min(local.length - 2, 6)))}@${domain}`;
}

function warrantyWindow(deliveredAt: Date, hours: number) {
  const endsAt = new Date(deliveredAt.getTime() + hours * 3_600_000);
  return { endsAt, active: endsAt.getTime() > Date.now() };
}

const statusTone: Record<OrderStatus, string> = {
  PENDING: "border-volt/40 bg-volt/10 text-volt",
  PAID: "border-volt/40 bg-volt/10 text-volt",
  FULFILLED: "border-success/40 bg-success/10 text-success",
  FAILED: "border-danger/40 bg-danger/10 text-danger",
  REFUNDED: "border-border bg-surface-2 text-muted",
};

const reviewStatusTone: Record<ReviewStatus, string> = {
  PENDING: "bg-volt/10 text-volt",
  APPROVED: "bg-success/15 text-success",
  REJECTED: "bg-surface-2 text-muted",
};

export default async function OrderPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const token = firstParam(query.token);
  const [order, t, locale] = await Promise.all([loadVerifiedOrder(id, token), getDictionary(), getLocale()]);
  if (!order || !token) notFound();

  const shortId = order.id.slice(-8).toUpperCase();
  const canReveal = order.status === "PAID" || order.status === "FULFILLED";
  const undelivered = order.items.filter((i) => !i.deliveredAt).length;
  const keepRefreshing = order.status === "PENDING" || (order.status === "PAID" && undelivered > 0);
  const copy = { ...t.order.status[order.status], tone: statusTone[order.status] };
  // Refunded / failed orders can't be reviewed; a line can be once it has been delivered.
  const canReview = order.status === "PAID" || order.status === "FULFILLED";
  const reviewerName = maskedDisplayName(order.customer.email, t.common.customer);
  const subtotal = order.subtotalCents || order.totalCents + order.discountCents;
  const showBreakdown = order.discountCents > 0 || order.walletAppliedCents > 0;
  const paidByCard = Math.max(order.totalCents - order.walletAppliedCents, 0);

  const items = order.items.map((item) => {
    const warrantyHours = item.variant.product.warrantyHours;
    const revealItem = canReveal && !!item.deliveredAt;
    return {
      ...item,
      productName: localized(locale, item.productName, item.variant.product.nameEn),
      variantLabel: localized(locale, item.variantLabel, item.variant.labelEn),
      secrets: revealItem
        ? item.inventoryItems.map((inv) => ({ id: inv.id, value: reveal(inv.payload, `inventory item ${inv.id}`) }))
        : [],
      note: canReveal && item.deliveryNote ? reveal(item.deliveryNote, `delivery note of item ${item.id}`) : null,
      warranty:
        item.productType === "ACCOUNT" && warrantyHours && item.deliveredAt
          ? { label: t.common.warranty(warrantyHours), ...warrantyWindow(item.deliveredAt, warrantyHours) }
          : null,
    };
  });

  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 sm:pt-12">
      {/* Status header */}
      <header className="card relative overflow-hidden p-5 sm:p-7">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_100%_0%,rgba(212,255,61,0.10),transparent_60%)]"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-volt">
              <span dir="ltr" className="font-display tracking-[0.2em] uppercase">
                Order #{shortId}
              </span>
            </p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{copy.title}</h1>
          </div>
          <span className={`badge border px-3 py-1 ${copy.tone}`}>{t.orderStatus[order.status]}</span>
        </div>

        <p className="relative mt-3 max-w-2xl text-sm leading-7 text-muted sm:text-base">{copy.text}</p>

        {order.status !== "FAILED" && order.status !== "REFUNDED" ? (
          <Progress status={order.status} t={t} />
        ) : null}

        <dl className="relative mt-6 grid grid-cols-2 gap-4 border-t border-border pt-5 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">{t.order.date}</dt>
            <dd className="mt-1 font-medium">
              <LocalTime iso={order.createdAt.toISOString()} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t.order.total}</dt>
            <dd className="mt-1">
              <span dir="ltr" className="font-display text-base font-bold tabular-nums">
                {formatPrice(order.totalCents, order.currency, locale)}
              </span>
            </dd>
          </div>
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <dt className="text-xs text-muted">{t.order.email}</dt>
            <dd className="mt-1 truncate font-medium">
              <span dir="ltr">{maskEmail(order.customer.email)}</span>
            </dd>
          </div>
        </dl>

        {keepRefreshing ? (
          <div className="relative mt-5">
            <AutoRefresh intervalMs={4000} maxMs={120_000} />
          </div>
        ) : null}
      </header>

      {/* Bookmark notice */}
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-volt/25 bg-volt/[0.06] p-4 text-sm leading-7">
        <IconBookmark className="mt-1 size-4 shrink-0 text-volt" />
        <p>
          <span className="font-bold">{t.order.bookmark}</span>{" "}
          <span className="text-muted">
            {order.status === "FULFILLED" ? t.order.bookmarkDelivered : t.order.bookmarkPending} {t.order.private}
          </span>
        </p>
      </div>

      {/* Items */}
      <section aria-labelledby="order-items" className="mt-8">
        <h2 id="order-items" className="text-lg font-bold">
          {t.order.items}
        </h2>
        <ul className="mt-4 space-y-4">
          {items.map((item) => {
            const delivered = !!item.deliveredAt;
            const isAccount = item.productType === "ACCOUNT";
            return (
              <li key={item.id} className="card overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
                  <div className="min-w-0">
                    <h3 className="font-bold">{item.productName}</h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <TypeBadge type={item.productType} />
                      <span>{item.variantLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {t.order.quantity} <span dir="ltr" className="font-display font-bold text-text">{item.quantity}</span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span dir="ltr" className="font-display tabular-nums">
                        {formatPrice(item.unitPriceCents * item.quantity, order.currency, locale)}
                      </span>
                    </div>
                  </div>
                  <DeliveryChip status={order.status} delivered={delivered} t={t} />
                </div>

                <div className="space-y-3 p-4 sm:p-5">
                  {canReveal && item.secrets.length > 0
                    ? item.secrets.map((s, i) => (
                        <SecretBox
                          key={s.id}
                          label={`${secretLabel(item.productType, t)}${item.secrets.length > 1 ? ` ${i + 1}` : ""}`}
                          value={s.value}
                          t={t}
                        />
                      ))
                    : null}

                  {canReveal && item.deliveryNote ? (
                    <SecretBox
                      label={item.productType === "SERVICE" ? t.order.deliveryDetails : t.order.deliveryNote}
                      value={item.note}
                      t={t}
                    />
                  ) : null}

                  {canReveal && delivered && item.secrets.length === 0 && !item.deliveryNote ? (
                    <p className="flex items-center gap-2 text-sm text-success">
                      <IconCheck className="size-4" />
                      {t.order.itemDelivered}
                    </p>
                  ) : null}

                  {!delivered && order.status === "PAID" ? (
                    <p className="flex items-center gap-2 text-sm text-volt">
                      <IconSpinner className="size-4" />
                      {t.order.preparing}
                    </p>
                  ) : null}

                  {order.status === "PENDING" ? (
                    <p className="flex items-center gap-2 text-sm text-muted">
                      <IconClock className="size-4" />
                      {t.order.appearsAfterPayment}
                    </p>
                  ) : null}

                  {canReveal && isAccount && item.warranty ? (
                    <p
                      className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border p-3 text-sm ${
                        item.warranty.active
                          ? "border-success/30 bg-success/5 text-success"
                          : "border-border bg-surface-2 text-muted"
                      }`}
                    >
                      <IconShieldCheck className="size-4 shrink-0" />
                      <span>
                        {item.warranty.active ? t.order.warrantyActive : t.order.warrantyEnded} ({item.warranty.label}) —{" "}
                        {item.warranty.active ? t.order.until : t.order.at}{" "}
                        <LocalTime iso={item.warranty.endsAt.toISOString()} className="font-semibold" />
                      </span>
                    </p>
                  ) : null}
                </div>

                {canReview && item.deliveredAt && !item.review ? (
                  <div className="border-t border-border bg-bg/40 p-4 sm:p-5">
                    <ReviewForm
                      orderId={order.id}
                      token={token}
                      orderItemId={item.id}
                      productName={item.productName}
                      defaultName={reviewerName}
                    />
                  </div>
                ) : item.review ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-bg/40 px-4 py-3 text-sm sm:px-5">
                    <span className="text-muted">{t.order.yourReview}</span>
                    <Stars value={item.review.rating} className="size-4" />
                    <span className={`badge ${reviewStatusTone[item.review.status]}`}>
                      {t.order.reviewStatus[item.review.status]}
                    </span>
                    {item.review.status === "APPROVED" && item.variant.product.active ? (
                      <Link
                        href={`${productHref(item.variant.product.slug)}#reviews`}
                        className="ms-auto text-xs text-muted underline decoration-border underline-offset-4 hover:text-volt hover:decoration-volt"
                      >
                        {t.order.viewOnProduct}
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {showBreakdown ? (
        <section aria-labelledby="order-payment" className="card mt-6 p-4 sm:p-5">
          <h2 id="order-payment" className="font-bold">
            {t.order.paymentSummary}
          </h2>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">{t.order.subtotal}</dt>
              <dd dir="ltr" className="font-display font-semibold tabular-nums">
                {formatPrice(subtotal, order.currency, locale)}
              </dd>
            </div>
            {order.discountCents > 0 ? (
              <div className="flex items-center justify-between gap-3 text-success">
                <dt>
                  {t.order.discount}
                  {order.coupon ? (
                    <>
                      {" "}
                      <span dir="ltr" className="font-display text-xs">
                        ({order.coupon.code})
                      </span>
                    </>
                  ) : null}
                </dt>
                <dd dir="ltr" className="font-display font-semibold tabular-nums">
                  {"\u2212"}
                  {formatPrice(order.discountCents, order.currency, locale)}
                </dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
              <dt className="font-semibold">{t.order.total}</dt>
              <dd className="text-end">
                <span dir="ltr" className="font-display font-bold tabular-nums">
                  {formatPrice(order.totalCents, order.currency, locale)}
                </span>
              </dd>
            </div>
            {order.walletAppliedCents > 0 ? (
              <>
                <div className="flex items-center justify-between gap-3 text-volt">
                  <dt>{t.order.paidFromWallet}</dt>
                  <dd dir="ltr" className="font-display font-semibold tabular-nums">
                    {formatPrice(order.walletAppliedCents, order.currency, locale)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">{t.order.paidByCard}</dt>
                  <dd dir="ltr" className="font-display font-semibold tabular-nums">
                    {formatPrice(paidByCard, order.currency, locale)}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
        </section>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4 text-sm">
        <p className="text-muted">
          {t.order.problem}{" "}
          <span dir="ltr" className="font-display font-bold text-text">
            #{shortId}
          </span>
        </p>
        <div className="flex gap-2">
          {/* The order link travels with its token so a guest's ticket is attached to this order */}
          <Link
            href={`/support?order=${encodeURIComponent(order.id)}&token=${encodeURIComponent(token)}`}
            prefetch={false}
            className="btn-ghost h-9 px-3 text-xs"
          >
            {t.order.contactSupport}
          </Link>
          {order.status === "FAILED" ? (
            <Link href="/cart" className="btn-primary h-9 px-3 text-xs">
              {t.order.backToCart}
            </Link>
          ) : (
            <Link href="/" className="btn-primary h-9 px-3 text-xs">
              {t.order.continueShopping}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function secretLabel(type: ProductType, t: Dictionary) {
  if (type === "ACCOUNT") return t.order.secretAccount;
  if (type === "SUBSCRIPTION") return t.order.secretSubscription;
  return t.order.secretCode;
}

function SecretBox({ label, value, t }: { label: string; value: string | null; t: Dictionary }) {
  if (value === null) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
        <IconAlert className="mt-0.5 size-4 shrink-0" />
        {t.order.secretError}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-bg">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <span className="text-xs font-semibold text-muted">{label}</span>
        <CopyButton text={value} />
      </div>
      <pre
        dir="auto"
        className="overflow-x-auto p-3 font-mono text-sm leading-7 break-words whitespace-pre-wrap text-volt select-all sm:text-base"
      >
        {value}
      </pre>
    </div>
  );
}

function DeliveryChip({ status, delivered, t }: { status: OrderStatus; delivered: boolean; t: Dictionary }) {
  if (delivered && (status === "PAID" || status === "FULFILLED")) {
    return (
      <span className="badge gap-1 bg-success/15 text-success">
        <IconCheck className="size-3.5" />
        {t.order.delivered}
      </span>
    );
  }
  if (status === "PAID") {
    return <span className="badge bg-volt/10 text-volt">{t.order.inProgress}</span>;
  }
  return null;
}

function Progress({ status, t }: { status: OrderStatus; t: Dictionary }) {
  const reached = status === "PENDING" ? 1 : status === "PAID" ? 2 : 3;
  const steps = t.order.steps;
  return (
    <ol className="relative mt-6 grid grid-cols-3 gap-2" aria-label={t.order.stepsLabel}>
      {steps.map((label, i) => {
        const done = i < reached;
        const current = i === reached;
        return (
          <li key={label} aria-current={current ? "step" : undefined}>
            <div
              className={`h-1.5 rounded-full ${
                done ? "bg-volt shadow-[0_0_12px_rgba(212,255,61,0.5)]" : current ? "animate-pulse bg-volt/40" : "bg-surface-2"
              }`}
            />
            <p className={`mt-2 text-xs ${done ? "font-semibold text-text" : "text-muted"}`}>{label}</p>
          </li>
        );
      })}
    </ol>
  );
}
