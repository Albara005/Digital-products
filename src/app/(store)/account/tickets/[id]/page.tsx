import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { orderPagePath } from "@/lib/email";
import { TicketView } from "@/components/store/tickets/ticket-view";
import { firstParam } from "@/components/store/site";
import { getSignedInCustomer } from "../../../_lib/session";
import { authorizeTicket, loadTicketThread } from "../../../_lib/tickets";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "تذكرة دعم",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AccountTicketPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const customer = await getSignedInCustomer();
  if (!customer) redirect(`/login?next=${encodeURIComponent(`/account/tickets/${id}`)}`);

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
      back={{ href: "/account/tickets", label: "تذاكري" }}
      order={order}
      created={firstParam(query.created) === "1"}
    />
  );
}
