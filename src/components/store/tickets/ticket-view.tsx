import Link from "next/link";
import type { TicketStatus } from "@prisma/client";
import { IconArrow, IconCheck, IconReceipt } from "../icons";
import { LocalTime } from "../local-time";
import { TicketReplyForm } from "./ticket-reply-form";
import { type ThreadMessage, TicketMessages, TicketStatusBadge, shortTicketId } from "./ticket-ui";

export type TicketViewData = {
  id: string;
  subject: string;
  status: TicketStatus;
  createdAt: Date;
  messages: ThreadMessage[];
};

/** Full thread page body, shared by the guest link and the account page. */
export function TicketView({
  ticket,
  token,
  back,
  order,
  created = false,
}: {
  ticket: TicketViewData;
  /** Set on the guest link page; the reply/close actions re-check it. */
  token: string | null;
  back: { href: string; label: string };
  /** The linked order: `href` only when the viewer may open it. */
  order: { shortId: string; href: string | null } | null;
  created?: boolean;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 sm:pt-12">
      <Link href={back.href} className="inline-flex items-center gap-1.5 text-xs text-muted transition hover:text-volt">
        <IconArrow className="size-3.5 rotate-180" />
        {back.label}
      </Link>

      <header className="card mt-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p dir="ltr" className="text-end font-display text-xs font-bold tracking-[0.2em] text-volt uppercase sm:text-start">
              Ticket #{shortTicketId(ticket.id)}
            </p>
            <h1 dir="auto" className="mt-2 text-xl font-bold break-words sm:text-2xl">
              {ticket.subject}
            </h1>
          </div>
          <TicketStatusBadge status={ticket.status} />
        </div>
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-4 text-xs text-muted">
          <div className="flex gap-1.5">
            <dt>أُنشئت:</dt>
            <dd className="text-text">
              <LocalTime iso={ticket.createdAt.toISOString()} />
            </dd>
          </div>
          {order ? (
            <div className="flex items-center gap-1.5">
              <dt className="flex items-center gap-1">
                <IconReceipt className="size-3.5" />
                الطلب:
              </dt>
              <dd>
                {order.href ? (
                  <Link href={order.href} prefetch={false} dir="ltr" className="font-display font-bold text-text hover:text-volt">
                    #{order.shortId}
                  </Link>
                ) : (
                  <span dir="ltr" className="font-display font-bold text-text">
                    #{order.shortId}
                  </span>
                )}
              </dd>
            </div>
          ) : null}
        </dl>
      </header>

      {created ? (
        <p role="status" className="mt-4 flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 p-4 text-sm text-success">
          <IconCheck className="size-4 shrink-0" />
          تم إرسال تذكرتك. سنرد عليك هنا ونرسل لك إشعاراً بالبريد.
        </p>
      ) : null}

      <section aria-label="المحادثة" className="mt-6">
        <TicketMessages messages={ticket.messages} />
      </section>

      <section aria-label="الرد" className="card mt-6 p-4 sm:p-5">
        {ticket.status === "CLOSED" ? (
          <p className="mb-3 text-sm text-muted">هذه التذكرة مغلقة. إن عادت المشكلة، أرسل رداً وسنعيد فتحها.</p>
        ) : null}
        <TicketReplyForm ticketId={ticket.id} token={token} status={ticket.status} />
      </section>
    </div>
  );
}
