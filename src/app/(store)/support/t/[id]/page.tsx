import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { firstParam } from "@/components/store/site";
import { TicketView } from "@/components/store/tickets/ticket-view";
import { getSignedInCustomer } from "../../../_lib/session";
import { authorizeTicket, loadTicketThread } from "../../../_lib/tickets";
import { orderPagePath } from "@/lib/email";
import { getDictionary } from "@/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await getDictionary()).tickets.ticketTitle,
    robots: { index: false, follow: false },
    // The URL carries the ticket's access token: never leak it through the Referer header.
    referrer: "no-referrer",
  };
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Private guest link: the token is the only key (checked in constant time). */
export default async function GuestTicketPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const token = firstParam(query.token);
  if (!token) notFound();
  const access = await authorizeTicket(id, token);
  if (!access) notFound();
  const ticket = await loadTicketThread(access.id);
  if (!ticket) notFound();

  // The order page link carries the order token: only its signed-in owner gets it here
  const customer = ticket.order ? await getSignedInCustomer() : null;
  const order = ticket.order
    ? {
        shortId: ticket.order.id.slice(-8).toUpperCase(),
        href: customer && customer.id === ticket.order.customerId ? orderPagePath(ticket.order) : null,
      }
    : null;

  const t = await getDictionary();
  return <TicketView ticket={ticket} token={token} back={{ href: "/support", label: t.tickets.backSupport }} order={order} />;
}
