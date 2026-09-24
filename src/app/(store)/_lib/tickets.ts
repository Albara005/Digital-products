import "server-only";
import { prisma } from "@/lib/prisma";
import { TICKET_ID, TICKET_TOKEN_MAX, ticketTokenMatches } from "@/lib/tickets";
import { getSignedInCustomer } from "./session";

// Every storefront read or write of a ticket goes through authorizeTicket(): either the private
// link's token (constant-time check) or the signed-in customer who owns the ticket.

export type TicketAccess = { id: string; via: "token" | "account" };

export async function authorizeTicket(id: string, token: string | null | undefined): Promise<TicketAccess | null> {
  if (!TICKET_ID.test(id)) return null;
  if (token) {
    if (token.length > TICKET_TOKEN_MAX) return null;
    const ticket = await prisma.ticket.findUnique({ where: { id }, select: { id: true, accessToken: true } });
    return ticket && ticketTokenMatches(token, ticket.accessToken) ? { id: ticket.id, via: "token" } : null;
  }
  const customer = await getSignedInCustomer();
  if (!customer) return null;
  const ticket = await prisma.ticket.findFirst({ where: { id, customerId: customer.id }, select: { id: true } });
  return ticket ? { id: ticket.id, via: "account" } : null;
}

/** The thread for a ticket already authorized by authorizeTicket(). No admin identities leave here. */
export async function loadTicketThread(id: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      subject: true,
      status: true,
      email: true,
      createdAt: true,
      lastMessageAt: true,
      order: { select: { id: true, accessToken: true, customerId: true } },
      messages: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, author: true, body: true, createdAt: true },
      },
    },
  });
  return ticket;
}

export type TicketThreadData = NonNullable<Awaited<ReturnType<typeof loadTicketThread>>>;
