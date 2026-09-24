import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { IconArrow, IconChat, IconPlus } from "@/components/store/icons";
import Link from "@/components/store/link";
import { LocalTime } from "@/components/store/local-time";
import { Pager, pageParam } from "@/components/store/pagination";
import { TicketStatusBadge, shortTicketId } from "@/components/store/tickets/ticket-ui";
import { EmptyState } from "@/components/store/ui";
import { localizePath } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { getSignedInCustomer } from "../../_lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await getDictionary()).tickets.metaTitle,
    robots: { index: false, follow: false },
  };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const PAGE_SIZE = 15;

export default async function AccountTicketsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const [customer, t, locale] = await Promise.all([getSignedInCustomer(), getDictionary(), getLocale()]);
  if (!customer) redirect(localizePath("/login?next=/account/tickets", locale));
  const page = pageParam(sp.page);
  const mine = { customerId: customer.id };

  const [total, tickets] = await Promise.all([
    prisma.ticket.count({ where: mine }),
    prisma.ticket.findMany({
      where: mine,
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        subject: true,
        status: true,
        lastMessageAt: true,
        orderId: true,
        _count: { select: { messages: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 sm:pt-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/account" className="inline-flex items-center gap-1.5 text-xs text-muted transition hover:text-volt">
            <IconArrow className="size-3.5 rotate-180" />
            {t.tickets.account}
          </Link>
          <h1 className="mt-3 text-3xl font-bold">{t.tickets.title}</h1>
          <p className="mt-2 text-sm text-muted">{t.tickets.text}</p>
        </div>
        <Link href="/support" className="btn-primary h-10">
          <IconPlus className="size-4" />
          {t.tickets.newTicket}
        </Link>
      </header>

      {tickets.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<IconChat className="size-7" />}
            title={total > 0 ? t.tickets.noTicketsPage : t.tickets.noTickets}
            description={t.tickets.noTicketsText}
          >
            <Link href={total > 0 ? "/account/tickets" : "/support"} className="btn-primary">
              {total > 0 ? t.tickets.firstPage : t.tickets.open}
            </Link>
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/account/tickets/${ticket.id}`}
                className="group card flex items-center gap-3 p-4 transition hover:border-volt/50 sm:gap-4 sm:p-5"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span dir="ltr" className="font-display text-xs font-bold text-muted">
                      #{shortTicketId(ticket.id)}
                    </span>
                    <TicketStatusBadge status={ticket.status} />
                  </span>
                  <span dir="auto" className="mt-1.5 block truncate text-sm font-semibold">
                    {ticket.subject}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {t.tickets.lastMessage} <LocalTime iso={ticket.lastMessageAt.toISOString()} /> ·{" "}
                    <span dir="ltr" className="font-display">
                      {ticket._count.messages}
                    </span>{" "}
                    {t.tickets.messages}
                    {ticket.orderId ? (
                      <>
                        {" "}
                        · {t.tickets.order}{" "}
                        <span dir="ltr" className="font-display">
                          #{ticket.orderId.slice(-8).toUpperCase()}
                        </span>
                      </>
                    ) : null}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-muted transition group-hover:border-volt group-hover:bg-volt group-hover:text-bg"
                >
                  <IconArrow className="size-4" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager pathname="/account/tickets" param="page" params={{}} page={page} pageSize={PAGE_SIZE} total={total} label={t.tickets.pages} />
    </div>
  );
}
