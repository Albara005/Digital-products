import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { orderPagePath } from "@/lib/email";
import { TicketView } from "@/components/store/tickets/ticket-view";
import { firstParam } from "@/components/store/site";
import { localizePath } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { getSignedInCustomer } from "../../../_lib/session";
import { authorizeTicket, loadTicketThread } from "../../../_lib/tickets";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await getDictionary()).tickets.ticketTitle,
    robots: { index: false, follow: false },
  };
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AccountTicketPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [customer, t, locale] = await Promise.all([getSignedInCustomer(), getDictionary(), getLocale()]);
  if (!customer) redirect(localizePath(`/login?next=${encodeURIComponent(`/account/tickets/${id}`)}`, locale));

  // Owner check: only tickets on this account (no token on this route)
  const access = await authorizeTicket(id, null);
  if (!access) notFound();
  const ticket = await loadTicketThread(access.id);
  if (!ticket) notFound();

  const order = ticket.order
    ? {
        shortId: ticket.order.id.slice(-8).toUpperCase(),
        href: ticket.order.customerId === customer.id ? orderPagePath(ticket.order) : null,
      }
    : null;

  return (
    <TicketView
      ticket={ticket}
      token={null}
      back={{ href: "/account/tickets", label: t.tickets.backMine }}
      order={order}
      created={firstParam(query.created) === "1"}
    />
  );
}
