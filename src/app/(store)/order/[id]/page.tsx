import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { OrderStatus, ProductType, ReviewStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { formatPrice, orderStatusLabel } from "@/lib/format";
import { AutoRefresh } from "@/components/store/auto-refresh";
import { CopyButton } from "@/components/store/copy-button";
import { IconAlert, IconBookmark, IconCheck, IconClock, IconShieldCheck, IconSpinner } from "@/components/store/icons";
import { LocalTime } from "@/components/store/local-time";
import { ReviewForm } from "@/components/store/review-form";
import { firstParam, formatWarranty, maskedDisplayName, productHref } from "@/components/store/site";
import { Stars } from "@/components/store/stars";
import { TypeBadge } from "@/components/store/ui";
import { isPlausibleOrderRef, tokenMatches } from "../../_lib/order-access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "تفاصيل الطلب",
  robots: { index: false, follow: false },
  // The URL carries the access token: never leak it through the Referer header.
  referrer: "no-referrer",
};

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
          variant: { select: { product: { select: { warrantyHours: true, slug: true, active: true } } } },
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

const statusCopy: Record<OrderStatus, { title: string; text: string; tone: string }> = {
  PENDING: {
    title: "بانتظار تأكيد الدفع",
    text: "نتحقق من عملية الدفع الآن. ستتحدّث هذه الصفحة تلقائياً فور التأكيد.",
    tone: "border-volt/40 bg-volt/10 text-volt",
  },
  PAID: {
    title: "تم الدفع بنجاح",
    text: "جاري تجهيز طلبك وسيصلك قريباً.",
    tone: "border-volt/40 bg-volt/10 text-volt",
  },
  FULFILLED: {
    title: "تم تسليم طلبك",
    text: "منتجاتك جاهزة أدناه. انسخها واحتفظ بها في مكان آمن.",
    tone: "border-success/40 bg-success/10 text-success",
  },
  FAILED: {
    title: "لم تكتمل عملية الدفع",
    text: "لم يكتمل الدفع لهذا الطلب. يمكنك المحاولة مجدداً من السلة، وإن تم خصم المبلغ تواصل معنا.",
    tone: "border-danger/40 bg-danger/10 text-danger",
  },
  REFUNDED: {
    title: "تم استرجاع المبلغ",
    text: "تم استرجاع مبلغ هذا الطلب. للاستفسار تواصل مع الدعم مع ذكر رقم الطلب.",
    tone: "border-border bg-surface-2 text-muted",
  },
};

const reviewStatusCopy: Record<ReviewStatus, { label: string; tone: string }> = {
  PENDING: { label: "بانتظار المراجعة", tone: "bg-volt/10 text-volt" },
  APPROVED: { label: "منشور", tone: "bg-success/15 text-success" },
  REJECTED: { label: "غير منشور", tone: "bg-surface-2 text-muted" },
};

export default async function OrderPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const token = firstParam(query.token);
  const order = await loadVerifiedOrder(id, token);
  if (!order || !token) notFound();

  const shortId = order.id.slice(-8).toUpperCase();
  const canReveal = order.status === "PAID" || order.status === "FULFILLED";
  const undelivered = order.items.filter((i) => !i.deliveredAt).length;
  const keepRefreshing = order.status === "PENDING" || (order.status === "PAID" && undelivered > 0);
  const copy = statusCopy[order.status];
  // Refunded / failed orders can't be reviewed; a line can be once it has been delivered.
  const canReview = order.status === "PAID" || order.status === "FULFILLED";
  const reviewerName = maskedDisplayName(order.customer.email);
  const subtotal = order.subtotalCents || order.totalCents + order.discountCents;
  const showBreakdown = order.discountCents > 0 || order.walletAppliedCents > 0;
  const paidByCard = Math.max(order.totalCents - order.walletAppliedCents, 0);

  const items = order.items.map((item) => {
    const warrantyHours = item.variant.product.warrantyHours;
    const revealItem = canReveal && !!item.deliveredAt;
    return {
      ...item,
      secrets: revealItem
        ? item.inventoryItems.map((inv) => ({ id: inv.id, value: reveal(inv.payload, `inventory item ${inv.id}`) }))
        : [],
      note: canReveal && item.deliveryNote ? reveal(item.deliveryNote, `delivery note of item ${item.id}`) : null,
      warranty:
        item.productType === "ACCOUNT" && warrantyHours && item.deliveredAt
          ? { label: formatWarranty(warrantyHours), ...warrantyWindow(item.deliveredAt, warrantyHours) }
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
          <span className={`badge border px-3 py-1 ${copy.tone}`}>{orderStatusLabel[order.status]}</span>
        </div>

        <p className="relative mt-3 max-w-2xl text-sm leading-7 text-muted sm:text-base">{copy.text}</p>

        {order.status !== "FAILED" && order.status !== "REFUNDED" ? (
          <Progress status={order.status} />
        ) : null}

        <dl className="relative mt-6 grid grid-cols-2 gap-4 border-t border-border pt-5 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">تاريخ الطلب</dt>
            <dd className="mt-1 font-medium">
              <LocalTime iso={order.createdAt.toISOString()} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">الإجمالي</dt>
            <dd className="mt-1">
              <span dir="ltr" className="font-display text-base font-bold tabular-nums">
                {formatPrice(order.totalCents, order.currency)}
              </span>
            </dd>
          </div>
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <dt className="text-xs text-muted">البريد الإلكتروني</dt>
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
          <span className="font-bold">احفظ هذه الصفحة في المفضلة.</span>{" "}
          <span className="text-muted">
            {order.status === "FULFILLED"
              ? "أرسلنا رابطها أيضاً إلى بريدك الإلكتروني، ويمكنك العودة إليها في أي وقت لعرض منتجاتك."
              : "سنرسل رابطها إلى بريدك الإلكتروني فور اكتمال التسليم، ويمكنك العودة إليها في أي وقت."}{" "}
            الرابط خاص بك — لا تشاركه مع أحد.
          </span>
        </p>
      </div>

      {/* Items */}
      <section aria-labelledby="order-items" className="mt-8">
        <h2 id="order-items" className="text-lg font-bold">
          المنتجات
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
                        الكمية: <span dir="ltr" className="font-display font-bold text-text">{item.quantity}</span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span dir="ltr" className="font-display tabular-nums">
                        {formatPrice(item.unitPriceCents * item.quantity, order.currency)}
                      </span>
                    </div>
                  </div>
                  <DeliveryChip status={order.status} delivered={delivered} />
                </div>

                <div className="space-y-3 p-4 sm:p-5">
                  {canReveal && item.secrets.length > 0
                    ? item.secrets.map((s, i) => (
                        <SecretBox
                          key={s.id}
                          label={`${secretLabel(item.productType)}${item.secrets.length > 1 ? ` ${i + 1}` : ""}`}
                          value={s.value}
                        />
                      ))
                    : null}

                  {canReveal && item.deliveryNote ? (
                    <SecretBox label={item.productType === "SERVICE" ? "تفاصيل التسليم" : "ملاحظة التسليم"} value={item.note} />
                  ) : null}

                  {canReveal && delivered && item.secrets.length === 0 && !item.deliveryNote ? (
                    <p className="flex items-center gap-2 text-sm text-success">
                      <IconCheck className="size-4" />
                      تم تسليم هذا المنتج.
                    </p>
                  ) : null}

                  {!delivered && order.status === "PAID" ? (
                    <p className="flex items-center gap-2 text-sm text-volt">
                      <IconSpinner className="size-4" />
                      جاري تجهيز طلبك وسيصلك قريباً
                    </p>
                  ) : null}

                  {order.status === "PENDING" ? (
                    <p className="flex items-center gap-2 text-sm text-muted">
                      <IconClock className="size-4" />
                      سيظهر المنتج هنا فور تأكيد الدفع.
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
                        {item.warranty.active ? "الضمان ساري" : "انتهى الضمان"} ({item.warranty.label}) —{" "}
                        {item.warranty.active ? "حتى" : "في"}{" "}
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
                    <span className="text-muted">تقييمك</span>
                    <Stars value={item.review.rating} className="size-4" />
                    <span className={`badge ${reviewStatusCopy[item.review.status].tone}`}>
                      {reviewStatusCopy[item.review.status].label}
                    </span>
                    {item.review.status === "APPROVED" && item.variant.product.active ? (
                      <Link
                        href={`${productHref(item.variant.product.slug)}#reviews`}
                        className="ms-auto text-xs text-muted underline decoration-border underline-offset-4 hover:text-volt hover:decoration-volt"
                      >
                        عرض في صفحة المنتج
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
            ملخص الدفع
          </h2>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">المجموع الفرعي</dt>
              <dd dir="ltr" className="font-display font-semibold tabular-nums">
                {formatPrice(subtotal, order.currency)}
              </dd>
            </div>
            {order.discountCents > 0 ? (
              <div className="flex items-center justify-between gap-3 text-success">
                <dt>
                  الخصم
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
                  {formatPrice(order.discountCents, order.currency)}
                </dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
              <dt className="font-semibold">الإجمالي</dt>
              <dd dir="ltr" className="font-display font-bold tabular-nums">
                {formatPrice(order.totalCents, order.currency)}
              </dd>
            </div>
            {order.walletAppliedCents > 0 ? (
              <>
                <div className="flex items-center justify-between gap-3 text-volt">
                  <dt>مدفوع من رصيد المحفظة</dt>
                  <dd dir="ltr" className="font-display font-semibold tabular-nums">
                    {formatPrice(order.walletAppliedCents, order.currency)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">مدفوع بالبطاقة</dt>
                  <dd dir="ltr" className="font-display font-semibold tabular-nums">
                    {formatPrice(paidByCard, order.currency)}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
        </section>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4 text-sm">
        <p className="text-muted">
          تواجه مشكلة في طلبك؟ افتح تذكرة دعم مرتبطة بالطلب{" "}
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
            تواصل مع الدعم بخصوص هذا الطلب
          </Link>
          {order.status === "FAILED" ? (
            <Link href="/cart" className="btn-primary h-9 px-3 text-xs">
              العودة إلى السلة
            </Link>
          ) : (
            <Link href="/" className="btn-primary h-9 px-3 text-xs">
              متابعة التسوّق
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function secretLabel(type: ProductType) {
  if (type === "ACCOUNT") return "بيانات الحساب";
  if (type === "SUBSCRIPTION") return "كود الاشتراك";
  return "الكود";
}

function SecretBox({ label, value }: { label: string; value: string | null }) {
  if (value === null) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
        <IconAlert className="mt-0.5 size-4 shrink-0" />
        تعذّر عرض هذا العنصر. تواصل مع الدعم وسنرسله لك فوراً.
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

function DeliveryChip({ status, delivered }: { status: OrderStatus; delivered: boolean }) {
  if (delivered && (status === "PAID" || status === "FULFILLED")) {
    return (
      <span className="badge gap-1 bg-success/15 text-success">
        <IconCheck className="size-3.5" />
        تم التسليم
      </span>
    );
  }
  if (status === "PAID") {
    return <span className="badge bg-volt/10 text-volt">قيد التجهيز</span>;
  }
  return null;
}

function Progress({ status }: { status: OrderStatus }) {
  const reached = status === "PENDING" ? 1 : status === "PAID" ? 2 : 3;
  const steps = ["تم إنشاء الطلب", "تم الدفع", "تم التسليم"];
  return (
    <ol className="relative mt-6 grid grid-cols-3 gap-2" aria-label="مراحل الطلب">
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
