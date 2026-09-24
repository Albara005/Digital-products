import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { PaymentProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDate, formatPrice } from "@/lib/format";
import { ActionButton } from "@/components/admin/ActionButton";
import { CopyButton } from "@/components/admin/CopyButton";
import { ManualDeliveryForm } from "@/components/admin/ManualDeliveryForm";
import { RefundButton, type RefundOption } from "@/components/admin/RefundButton";
import { RevealPayload } from "@/components/admin/RevealPayload";
import { CheckIcon, ExternalIcon, RefreshIcon } from "@/components/admin/icons";
import { Callout, OrderStatusBadge, PageHeader, ProductTypeBadge, shortId } from "@/components/admin/ui";
import { requireAdminAccess } from "../../../_lib/guard";
import { revealInventoryItem } from "../../products/[id]/inventory/actions";
import { deliverItemManually, refundOrder, retryAutoDelivery, revealDeliveryNote } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "تفاصيل الطلب" };

const providerLabel: Record<PaymentProvider, string> = {
  STRIPE: "Stripe",
  TAP: "Tap",
  WALLET: "محفظة العميل",
  DEV: "وضع التطوير (بدون دفع فعلي)",
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-end">{children}</dd>
    </div>
  );
}

export default async function OrderDetailPage({ params }: PageProps<"/admin/orders/[id]">) {
  await requireAdminAccess();
  const { id } = await params;

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
      paymentProvider: true,
      coupon: { select: { code: true } },
      stripeSessionId: true,
      stripePaymentIntent: true,
      tapChargeId: true,
      paidAt: true,
      fulfilledAt: true,
      refundedAt: true,
      createdAt: true,
      updatedAt: true,
      customer: { select: { id: true, email: true, name: true, createdAt: true, _count: { select: { orders: true } } } },
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
          variant: { select: { productId: true } },
          inventoryItems: {
            orderBy: [{ soldAt: "asc" }, { createdAt: "asc" }],
            select: { id: true, status: true },
          },
        },
      },
    },
  });
  if (!order) notFound();

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  const customerLink = `${siteUrl}/order/${order.id}?token=${encodeURIComponent(order.accessToken)}`;
  const undelivered = order.items.filter((i) => !i.deliveredAt);
  const canRetry = order.status === "PAID" && undelivered.some((i) => i.productType !== "SERVICE");
  const canRefund = order.status === "PAID" || order.status === "FULFILLED";

  // Mirrors refundOrderPayment(): ORIGINAL sends the gateway-charged part back through Stripe/Tap and the
  // wallet-paid part back to the wallet; WALLET credits the whole order value to the wallet.
  const provider: PaymentProvider =
    order.paymentProvider ?? (order.tapChargeId ? "TAP" : order.stripeSessionId || order.stripePaymentIntent ? "STRIPE" : "DEV");
  const money = (cents: number) => formatPrice(cents, order.currency);
  const gatewayCents = provider === "WALLET" ? 0 : Math.max(0, order.totalCents - order.walletAppliedCents);
  const refundOptions: RefundOption[] = [
    {
      method: "ORIGINAL",
      title: "استرجاع إلى وسيلة الدفع الأصلية",
      amount: money(gatewayCents + order.walletAppliedCents),
      note:
        provider === "DEV"
          ? "طلب وضع التطوير: لا توجد عملية دفع فعلية لإرجاعها."
          : [
              gatewayCents > 0 ? `${money(gatewayCents)} عبر ${providerLabel[provider]}` : null,
              order.walletAppliedCents > 0 ? `${money(order.walletAppliedCents)} إلى المحفظة (دُفع منها)` : null,
            ]
              .filter(Boolean)
              .join(" + "),
    },
    {
      method: "WALLET",
      title: "إضافة المبلغ لرصيد محفظة العميل",
      amount: money(order.totalCents),
      note: "رصيد يستخدمه العميل في مشترياته القادمة، دون المرور ببوابة الدفع.",
    },
  ];

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span>
              طلب{" "}
              <span className="font-display" dir="ltr">
                #{shortId(order.id)}
              </span>
            </span>
            <OrderStatusBadge status={order.status} />
          </span>
        }
        description={`أُنشئ ${formatDate(order.createdAt)}`}
        back={{ href: "/admin/orders", label: "الطلبات" }}
      />

      {order.status === "PAID" && undelivered.length > 0 && (
        <div className="mb-6">
          <Callout tone="warn">
            هذا الطلب مدفوع و<strong>{undelivered.length}</strong> من عناصره بانتظار التسليم. استخدم «إعادة التسليم التلقائي» بعد إضافة
            مخزون، أو سلّم يدوياً من بطاقة العنصر.
          </Callout>
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="items-title" className="flex flex-col gap-4">
          <h2 id="items-title" className="sr-only">
            عناصر الطلب
          </h2>
          {order.items.map((item) => {
            const units = item.inventoryItems;
            return (
              <article key={item.id} className="card overflow-hidden">
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/products/${item.variant.productId}`} className="font-semibold hover:text-volt">
                        {item.productName}
                      </Link>
                      <ProductTypeBadge type={item.productType} />
                    </div>
                    <p className="mt-0.5 text-sm text-muted">
                      <bdi>{item.variantLabel}</bdi> ·{" "}
                      <span className="font-display" dir="ltr">
                        {item.quantity} × {formatPrice(item.unitPriceCents, order.currency)}
                      </span>
                    </p>
                  </div>
                  {item.deliveredAt ? (
                    <span className="badge gap-1 bg-success/15 text-success">
                      <CheckIcon className="size-3" />
                      سُلّم {formatDate(item.deliveredAt)}
                    </span>
                  ) : (
                    <span className="badge bg-surface-2 text-muted ring-1 ring-border">لم يُسلَّم</span>
                  )}
                </header>

                <div className="flex flex-col gap-4 px-5 py-4">
                  {units.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-medium text-muted">
                        من المخزون ({units.length} من {item.quantity})
                      </p>
                      {units.map((u, idx) => (
                        <div key={u.id} className="flex flex-col gap-1">
                          {units.length > 1 && (
                            <span className="text-[11px] text-muted">
                              #{idx + 1}
                              {u.status !== "SOLD" && ` · ${u.status === "RESERVED" ? "محجوز" : "متاح"}`}
                            </span>
                          )}
                          <RevealPayload id={u.id} reveal={revealInventoryItem} />
                        </div>
                      ))}
                    </div>
                  )}

                  {item.deliveryNote && (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-medium text-muted">نص التسليم اليدوي</p>
                      <RevealPayload id={item.id} reveal={revealDeliveryNote} />
                    </div>
                  )}

                  {!item.deliveredAt && order.status === "PAID" && (
                    <ManualDeliveryForm
                      action={deliverItemManually}
                      orderId={order.id}
                      itemId={item.id}
                      placeholder={
                        item.productType === "SERVICE"
                          ? "مثال: تم تنفيذ الخدمة على حسابك. ملاحظات…"
                          : item.productType === "ACCOUNT"
                            ? "email: …\npassword: …"
                            : "الكود/الأكواد المتبقية، سطر لكل كود"
                      }
                    />
                  )}

                  {!item.deliveredAt && order.status !== "PAID" && units.length === 0 && !item.deliveryNote && (
                    <p className="text-sm text-muted">لا يوجد محتوى مُسلَّم.</p>
                  )}
                </div>
              </article>
            );
          })}
        </section>

        <aside className="flex flex-col gap-4">
          <section className="card p-5" aria-labelledby="actions-title">
            <h2 id="actions-title" className="mb-3 font-semibold">
              إجراءات
            </h2>
            <div className="flex flex-col items-start gap-3">
              {canRetry && (
                <ActionButton action={retryAutoDelivery} fields={{ orderId: order.id }} variant="primary" pendingLabel="جارٍ التسليم…">
                  <RefreshIcon className="size-3.5" />
                  إعادة التسليم التلقائي
                </ActionButton>
              )}
              {(canRefund || order.status === "REFUNDED") && (
                <RefundButton
                  action={refundOrder}
                  orderId={order.id}
                  total={money(order.totalCents)}
                  options={refundOptions}
                  canRefund={canRefund}
                />
              )}
              {!canRetry && !canRefund && (
                <p className="text-sm text-muted">
                  {order.status === "REFUNDED"
                    ? `تم استرجاع الطلب${order.refundedAt ? ` ${formatDate(order.refundedAt)}` : ""}. لا توجد إجراءات أخرى.`
                    : order.status === "PENDING"
                      ? "بانتظار إتمام الدفع — لا يمكن التسليم قبل تأكيده."
                      : order.status === "FAILED"
                        ? "فشل الدفع أو انتهت مهلته، ولم يُحتسب الطلب."
                        : "لا توجد إجراءات متاحة لهذه الحالة."}
                </p>
              )}
            </div>
          </section>

          <section className="card p-5" aria-labelledby="link-title">
            <h2 id="link-title" className="mb-1 font-semibold">
              رابط صفحة الطلب للعميل
            </h2>
            <p className="mb-3 text-xs text-muted">أرسله للعميل إن لم يصله البريد. يمنح الرابط الوصول لمحتوى الطلب — شاركه مع صاحبه فقط.</p>
            <p dir="ltr" className="mb-3 break-all rounded-md border border-border bg-bg px-3 py-2 text-start font-mono text-[11px] text-muted">
              {customerLink}
            </p>
            <div className="flex gap-2">
              <CopyButton text={customerLink} label="نسخ الرابط" />
              <a href={customerLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-text">
                <ExternalIcon className="size-3.5" />
                فتح
              </a>
            </div>
          </section>

          <section className="card p-5" aria-labelledby="summary-title">
            <h2 id="summary-title" className="mb-1 font-semibold">
              الملخص
            </h2>
            <dl className="divide-y divide-border">
              {order.subtotalCents > 0 && order.subtotalCents !== order.totalCents && (
                <Row label="المجموع الفرعي">
                  <span className="font-display">{money(order.subtotalCents)}</span>
                </Row>
              )}
              {order.discountCents > 0 && (
                <Row label="الخصم">
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    {order.coupon && (
                      <span className="badge bg-surface-2 font-mono text-text ring-1 ring-border" dir="ltr">
                        {order.coupon.code}
                      </span>
                    )}
                    <span className="font-display text-success" dir="ltr">
                      −{money(order.discountCents)}
                    </span>
                  </span>
                </Row>
              )}
              <Row label="الإجمالي">
                <span className="font-display text-base font-bold">{money(order.totalCents)}</span>
              </Row>
              {order.walletAppliedCents > 0 && (
                <Row label="مدفوع من المحفظة">
                  <span className="font-display">{money(order.walletAppliedCents)}</span>
                </Row>
              )}
              {order.paymentProvider && <Row label="وسيلة الدفع">{providerLabel[order.paymentProvider]}</Row>}
              <Row label="الحالة">
                <OrderStatusBadge status={order.status} />
              </Row>
              <Row label="تاريخ الإنشاء">{formatDate(order.createdAt)}</Row>
              <Row label="تاريخ الدفع">{order.paidAt ? formatDate(order.paidAt) : "—"}</Row>
              <Row label="تاريخ التسليم">{order.fulfilledAt ? formatDate(order.fulfilledAt) : "—"}</Row>
              {order.refundedAt && <Row label="تاريخ الاسترجاع">{formatDate(order.refundedAt)}</Row>}
              <Row label="آخر تحديث">{formatDate(order.updatedAt)}</Row>
              <Row label="رقم الطلب">
                <span className="break-all font-mono text-xs" dir="ltr">
                  {order.id}
                </span>
              </Row>
              {order.stripePaymentIntent && (
                <Row label="Stripe">
                  <span className="break-all font-mono text-xs" dir="ltr">
                    {order.stripePaymentIntent}
                  </span>
                </Row>
              )}
              {order.tapChargeId && (
                <Row label="Tap">
                  <span className="break-all font-mono text-xs" dir="ltr">
                    {order.tapChargeId}
                  </span>
                </Row>
              )}
            </dl>
          </section>

          <section className="card p-5" aria-labelledby="customer-title">
            <h2 id="customer-title" className="mb-1 font-semibold">
              العميل
            </h2>
            <dl className="divide-y divide-border">
              <Row label="البريد">
                <span className="flex items-center justify-end gap-2">
                  <Link href={`/admin/customers/${order.customer.id}`} className="break-all hover:text-volt" dir="ltr">
                    {order.customer.email}
                  </Link>
                </span>
              </Row>
              {order.customer.name && <Row label="الاسم">{order.customer.name}</Row>}
              <Row label="عدد طلباته">
                <Link
                  href={`/admin/orders?q=${encodeURIComponent(order.customer.email)}`}
                  className="font-display hover:text-volt"
                >
                  {order.customer._count.orders}
                </Link>
              </Row>
              <Row label="عميل منذ">{formatDate(order.customer.createdAt)}</Row>
            </dl>
            <div className="mt-3">
              <CopyButton text={order.customer.email} label="نسخ البريد" />
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
