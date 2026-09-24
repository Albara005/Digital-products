import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { formatDate, formatPrice } from "@/lib/format";
import { ActionButton } from "@/components/admin/ActionButton";
import { CopyButton } from "@/components/admin/CopyButton";
import { CheckIcon, UndoIcon } from "@/components/admin/icons";
import { TicketReplyForm } from "@/components/admin/tickets/TicketReplyForm";
import { TicketStatusBadge } from "@/components/admin/tickets/TicketStatusBadge";
import { Callout, OrderStatusBadge, PageHeader, shortId } from "@/components/admin/ui";
import { requireAdminAccess } from "../../../_lib/guard";
import { closeTicket, reopenTicket, replyToTicket } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "تذكرة دعم" };

type Props = { params: Promise<{ id: string }> };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-end">{children}</dd>
    </div>
  );
}

export default async function TicketDetailPage({ params }: Props) {
  await requireAdminAccess();
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      subject: true,
      email: true,
      status: true,
      createdAt: true,
      lastMessageAt: true,
      customer: {
        select: { id: true, email: true, name: true, createdAt: true, _count: { select: { orders: true, tickets: true } } },
      },
      order: { select: { id: true, status: true, totalCents: true, currency: true, createdAt: true } },
      messages: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, author: true, body: true, createdAt: true, admin: { select: { name: true } } },
      },
    },
  });
  if (!ticket) notFound();

  return (
    <>
      <PageHeader
        back={{ href: "/admin/tickets", label: "تذاكر الدعم" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <bdi dir="auto" className="break-words">
              {ticket.subject}
            </bdi>
            <TicketStatusBadge status={ticket.status} />
          </span>
        }
        description={
          <>
            <span dir="ltr" className="font-display">
              #{shortId(ticket.id)}
            </span>{" "}
            · أُنشئت {formatDate(ticket.createdAt)}
          </>
        }
        actions={
          ticket.status === "CLOSED" ? (
            <ActionButton action={reopenTicket} fields={{ ticketId: ticket.id }} variant="ghost" pendingLabel="جارٍ الفتح…">
              <UndoIcon className="size-3.5" />
              إعادة فتح
            </ActionButton>
          ) : (
            <ActionButton action={closeTicket} fields={{ ticketId: ticket.id }} variant="ghost" pendingLabel="جارٍ الإغلاق…">
              <CheckIcon className="size-3.5" />
              إغلاق التذكرة
            </ActionButton>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex flex-col gap-3" aria-label="المحادثة">
          {ticket.messages.map((m) => {
            const staff = m.author === "ADMIN";
            return (
              <article key={m.id} className={`card p-4 ${staff ? "border-volt/30 bg-volt/[0.04]" : ""}`}>
                <header className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span className={`font-semibold ${staff ? "text-volt" : "text-text"}`}>
                    {staff ? `الدعم${m.admin ? ` — ${m.admin.name}` : ""}` : "العميل"}
                  </span>
                  <time dateTime={m.createdAt.toISOString()}>{formatDate(m.createdAt)}</time>
                </header>
                {/* Plain text: escaped by React, line breaks kept, nothing linkified */}
                <p dir="auto" className="text-sm leading-7 break-words whitespace-pre-wrap">
                  {m.body}
                </p>
              </article>
            );
          })}

          <section className="card p-4 sm:p-5" aria-label="الرد">
            {ticket.status === "CLOSED" && (
              <div className="mb-3">
                <Callout>التذكرة مغلقة. إرسال رد يعيد حالتها إلى «تم الرد».</Callout>
              </div>
            )}
            <TicketReplyForm action={replyToTicket} ticketId={ticket.id} />
          </section>
        </section>

        <aside className="flex flex-col gap-4">
          <section className="card p-5" aria-labelledby="customer-title">
            <h2 id="customer-title" className="mb-1 font-semibold">
              العميل
            </h2>
            <dl className="divide-y divide-border">
              <Row label="البريد">
                {ticket.customer ? (
                  <Link href={`/admin/customers/${ticket.customer.id}`} className="break-all hover:text-volt" dir="ltr">
                    {ticket.email}
                  </Link>
                ) : (
                  <span className="break-all" dir="ltr">
                    {ticket.email}
                  </span>
                )}
              </Row>
              <Row label="النوع">{ticket.customer ? "حساب مسجّل" : "زائر (رابط خاص)"}</Row>
              {ticket.customer?.name && <Row label="الاسم">{ticket.customer.name}</Row>}
              {ticket.customer && (
                <>
                  <Row label="عدد طلباته">
                    <Link href={`/admin/orders?q=${encodeURIComponent(ticket.customer.email)}`} className="font-display hover:text-volt">
                      {ticket.customer._count.orders}
                    </Link>
                  </Row>
                  <Row label="تذاكره">
                    <Link href={`/admin/tickets?status=${ticket.status}&q=${encodeURIComponent(ticket.customer.email)}`} className="font-display hover:text-volt">
                      {ticket.customer._count.tickets}
                    </Link>
                  </Row>
                  <Row label="عميل منذ">{formatDate(ticket.customer.createdAt)}</Row>
                </>
              )}
            </dl>
            <div className="mt-3">
              <CopyButton text={ticket.email} label="نسخ البريد" />
            </div>
          </section>

          <section className="card p-5" aria-labelledby="order-title">
            <h2 id="order-title" className="mb-1 font-semibold">
              الطلب المرتبط
            </h2>
            {ticket.order ? (
              <dl className="divide-y divide-border">
                <Row label="الطلب">
                  <Link href={`/admin/orders/${ticket.order.id}`} className="font-display font-semibold hover:text-volt" dir="ltr">
                    #{shortId(ticket.order.id)}
                  </Link>
                </Row>
                <Row label="الحالة">
                  <OrderStatusBadge status={ticket.order.status} />
                </Row>
                <Row label="الإجمالي">
                  <span className="font-display" dir="ltr">
                    {formatPrice(ticket.order.totalCents, ticket.order.currency)}
                  </span>
                </Row>
                <Row label="التاريخ">{formatDate(ticket.order.createdAt)}</Row>
              </dl>
            ) : (
              <p className="text-sm text-muted">لم يحدد العميل طلباً.</p>
            )}
          </section>

          <section className="card p-5" aria-labelledby="meta-title">
            <h2 id="meta-title" className="mb-1 font-semibold">
              التذكرة
            </h2>
            <dl className="divide-y divide-border">
              <Row label="الرسائل">
                <span className="font-display">{ticket.messages.length}</span>
              </Row>
              <Row label="آخر نشاط">{formatDate(ticket.lastMessageAt)}</Row>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}
