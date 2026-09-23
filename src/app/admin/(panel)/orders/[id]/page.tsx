import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { formatDate, formatPrice } from "@/lib/format";
import { ActionButton } from "@/components/admin/ActionButton";
import { CopyButton } from "@/components/admin/CopyButton";
import { ManualDeliveryForm } from "@/components/admin/ManualDeliveryForm";
import { CheckIcon, ExternalIcon, RefreshIcon, UndoIcon } from "@/components/admin/icons";
import { Callout, OrderStatusBadge, PageHeader, ProductTypeBadge, shortId } from "@/components/admin/ui";
import { requireAdminAccess } from "../../../_lib/guard";
import { deliverItemManually, markOrderRefunded, retryAutoDelivery } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "تفاصيل الطلب" };

function reveal(payload: string): { ok: true; value: string } | { ok: false } {
  try {
    return { ok: true, value: decrypt(payload) };
  } catch {
    return { ok: false };
  }
}

function Secret({ payload, label }: { payload: string; label?: string }) {
  const r = reveal(payload);
  if (!r.ok) {
    return <p className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">تعذّر فك التشفير — تحقق من INVENTORY_ENCRYPTION_KEY.</p>;
  }
  return (
    <div className="flex items-start gap-2">
      <pre
        dir="ltr"
        className="min-w-0 flex-1 whitespace-pre-wrap break-all rounded-md border border-border bg-bg px-3 py-2 text-start font-mono text-xs leading-relaxed text-text"
      >
        {r.value}
      </pre>
      <CopyButton text={r.value} label={label ?? "نسخ"} />
    </div>
  );
}

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
      totalCents: true,
      currency: true,
      stripeSessionId: true,
      stripePaymentIntent: true,
      paidAt: true,
      fulfilledAt: true,
      createdAt: true,
      updatedAt: true,
      customer: { select: { email: true, name: true, createdAt: true, _count: { select: { orders: true } } } },
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
            select: { id: true, payload: true, status: true },
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
                      {item.variantLabel} ·{" "}
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
                          <Secret payload={u.payload} />
                        </div>
                      ))}
                    </div>
                  )}

                  {item.deliveryNote && (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-medium text-muted">نص التسليم اليدوي</p>
                      <Secret payload={item.deliveryNote} />
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
              {canRefund && (
                <ActionButton
                  action={markOrderRefunded}
                  fields={{ orderId: order.id }}
                  variant="danger"
                  confirm={{
                    title: "تسجيل الطلب كمسترجع؟",
                    body: (
                      <>
                        ستتغير حالة الطلب إلى <strong className="text-text">مسترجع</strong>، وتعود أي وحدات محجوزة غير مسلّمة إلى المخزون.
                        <br />
                        هذا الإجراء <strong className="text-text">لا يعيد المال</strong> — نفّذ الاسترجاع المالي من لوحة Stripe.
                      </>
                    ),
                    confirmLabel: "تأكيد الاسترجاع",
                  }}
                >
                  <UndoIcon className="size-3.5" />
                  تسجيل كمسترجع
                </ActionButton>
              )}
              {!canRetry && !canRefund && <p className="text-sm text-muted">لا توجد إجراءات متاحة لهذه الحالة.</p>}
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
              <Row label="الإجمالي">
                <span className="font-display text-base font-bold">{formatPrice(order.totalCents, order.currency)}</span>
              </Row>
              <Row label="الحالة">
                <OrderStatusBadge status={order.status} />
              </Row>
              <Row label="تاريخ الإنشاء">{formatDate(order.createdAt)}</Row>
              <Row label="تاريخ الدفع">{order.paidAt ? formatDate(order.paidAt) : "—"}</Row>
              <Row label="تاريخ التسليم">{order.fulfilledAt ? formatDate(order.fulfilledAt) : "—"}</Row>
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
            </dl>
          </section>

          <section className="card p-5" aria-labelledby="customer-title">
            <h2 id="customer-title" className="mb-1 font-semibold">
              العميل
            </h2>
            <dl className="divide-y divide-border">
              <Row label="البريد">
                <span className="flex items-center justify-end gap-2">
                  <span className="break-all" dir="ltr">
                    {order.customer.email}
                  </span>
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
