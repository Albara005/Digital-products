"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  TICKET_BODY_MAX,
  TICKET_BODY_MIN,
  TICKET_ID,
  TICKET_SUBJECT_MAX,
  TICKET_SUBJECT_MIN,
  TICKET_TOKEN_MAX,
  addCustomerReply,
  cleanTicketBody,
  cleanTicketSubject,
  createTicket,
  setTicketStatus,
  ticketPath,
} from "@/lib/tickets";
import { localizePath } from "@/i18n/config";
import { type Dictionary, dictionaryFor, getLocale } from "@/i18n/server";
import { hit, requestIp, throttled } from "../_lib/rate-limit";
import { getSignedInCustomer } from "../_lib/session";
import { authorizeTicket } from "../_lib/tickets";
import { tokenMatches } from "../_lib/order-access";

export type NewTicketState = {
  ok: boolean;
  message: string;
  field?: "subject" | "body" | "email" | "orderId";
  /** Guests only: the private link to follow the ticket. */
  link?: string;
} | null;

export type TicketActionState = { ok: boolean; message: string; ts: number } | null;

const HOUR = 60 * 60_000;
// Ticket creation: 3 per hour per email + IP, 10 per hour per IP
const CREATE_PER_EMAIL_IP = 3;
const CREATE_PER_IP = 10;
// Replies: 10 per 10 minutes per ticket + IP, 40 per hour per IP
const REPLY_PER_TICKET_IP = 10;
const REPLY_WINDOW_MS = 10 * 60_000;
const REPLY_PER_IP = 40;

const subjectSchema = (t: Dictionary) =>
  z
    .string()
    .max(TICKET_SUBJECT_MAX * 2, t.support.errors.subjectTooLong(TICKET_SUBJECT_MAX))
    .transform(cleanTicketSubject)
    .pipe(
      z
        .string()
        .min(TICKET_SUBJECT_MIN, t.support.errors.subjectShort)
        .max(TICKET_SUBJECT_MAX, t.support.errors.subjectTooLong(TICKET_SUBJECT_MAX)),
    );

const bodySchema = (t: Dictionary) =>
  z
    .string()
    .max(TICKET_BODY_MAX + 500, t.support.errors.bodyTooLong(TICKET_BODY_MAX))
    .transform(cleanTicketBody)
    .pipe(
      z
        .string()
        .min(TICKET_BODY_MIN, t.support.errors.bodyEmpty)
        .max(TICKET_BODY_MAX, t.support.errors.bodyTooLong(TICKET_BODY_MAX)),
    );

const emailSchema = (t: Dictionary) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .min(1, t.support.errors.emailRequired)
    .max(254, t.support.errors.emailTooLong)
    .pipe(z.email(t.support.errors.emailInvalid));

const optionalId = z.union([z.literal(""), z.string().regex(TICKET_ID)]);
const optionalToken = z.string().max(TICKET_TOKEN_MAX);

const newTicketSchema = (t: Dictionary) =>
  z.object({
    subject: subjectSchema(t),
    body: bodySchema(t),
    orderId: optionalId,
    orderToken: optionalToken,
  });

function field(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

/**
 * New ticket from /support. Signed-in customers: their account email, and an optional order of
 * theirs. Guests: the email they type, or — when they came from an order page with its token —
 * that order (and its email). Guests get their private link back; customers go to the thread.
 */
export async function createTicketAction(_prev: NewTicketState, formData: FormData): Promise<NewTicketState> {
  const locale = await getLocale();
  const t = dictionaryFor(locale);
  const parsed = newTicketSchema(t).safeParse({
    subject: field(formData, "subject"),
    body: field(formData, "body"),
    orderId: field(formData, "orderId"),
    orderToken: field(formData, "orderToken"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const key = issue?.path[0];
    if (key === "subject" || key === "body") return { ok: false, message: issue.message, field: key };
    return { ok: false, message: t.support.errors.orderInvalid, field: "orderId" };
  }
  const { subject, body, orderId, orderToken } = parsed.data;

  const customer = await getSignedInCustomer();
  let email: string | null = null;
  let customerId: string | null = null;
  let linkedOrderId: string | null = null;

  if (orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, accessToken: true, customerId: true, customer: { select: { email: true } } },
    });
    const owns = !!order && !!customer && order.customerId === customer.id;
    const holdsLink = !!order && !!orderToken && tokenMatches(orderToken, order.accessToken);
    if (!order || (!owns && !holdsLink)) {
      return { ok: false, message: t.support.errors.orderUnverified, field: "orderId" };
    }
    linkedOrderId = order.id;
    if (!customer) {
      // A guest holding the order link writes as the order's buyer
      email = order.customer.email;
      customerId = order.customerId;
    }
  }

  if (customer) {
    email = customer.email;
    customerId = customer.id;
  } else if (!linkedOrderId) {
    const checked = emailSchema(t).safeParse(field(formData, "email"));
    if (!checked.success) return { ok: false, message: checked.error.issues[0]?.message ?? t.support.errors.emailFallback, field: "email" };
    email = checked.data;
  }
  if (!email) return { ok: false, message: t.support.errors.emailRequired, field: "email" };

  const ip = await requestIp();
  const pairKey = `ticket-create:${email}|${ip}`;
  const ipKey = `ticket-create-ip:${ip}`;
  const wait = Math.max(throttled(pairKey, CREATE_PER_EMAIL_IP), throttled(ipKey, CREATE_PER_IP));
  if (wait) return { ok: false, message: t.support.errors.tooManyTickets(t.common.minutes(wait)) };
  hit(pairKey, HOUR);
  hit(ipKey, HOUR);

  const ticket = await createTicket({ customerId, email, subject, body, orderId: linkedOrderId });

  if (customer) {
    revalidatePath("/account/tickets");
    redirect(localizePath(`/account/tickets/${ticket.id}?created=1`, locale));
  }
  return { ok: true, message: t.support.sent, link: ticketPath(ticket) };
}

const replySchema = (t: Dictionary) =>
  z.object({
    ticketId: z.string().regex(TICKET_ID),
    token: optionalToken,
    body: bodySchema(t),
  });

const ticketRefSchema = z.object({ ticketId: z.string().regex(TICKET_ID), token: optionalToken });

function revalidateTicket(id: string) {
  revalidatePath(`/support/t/${id}`);
  revalidatePath(`/account/tickets/${id}`);
  revalidatePath("/account/tickets");
}

/** Customer reply (token link or signed-in owner). Reopens a closed ticket. */
export async function replyTicketAction(_prev: TicketActionState, formData: FormData): Promise<TicketActionState> {
  const t = dictionaryFor(await getLocale());
  const parsed = replySchema(t).safeParse({
    ticketId: field(formData, "ticketId"),
    token: field(formData, "token"),
    body: field(formData, "body"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue?.path[0] === "body" ? issue.message : t.support.errors.ticketUnverified, ts: Date.now() };
  }
  const { ticketId, token, body } = parsed.data;

  const access = await authorizeTicket(ticketId, token || null);
  if (!access) return { ok: false, message: t.support.errors.ticketUnverified, ts: Date.now() };

  const ip = await requestIp();
  const pairKey = `ticket-reply:${ticketId}|${ip}`;
  const ipKey = `ticket-reply-ip:${ip}`;
  const wait = Math.max(throttled(pairKey, REPLY_PER_TICKET_IP), throttled(ipKey, REPLY_PER_IP));
  if (wait) return { ok: false, message: t.support.errors.tooManyReplies(t.common.minutes(wait)), ts: Date.now() };
  hit(pairKey, REPLY_WINDOW_MS);
  hit(ipKey, HOUR);

  const result = await addCustomerReply(ticketId, body);
  if (!result.ok) return { ok: false, message: t.support.errors.notFound, ts: Date.now() };
  revalidateTicket(ticketId);
  return { ok: true, message: t.support.replied, ts: Date.now() };
}

/** Customer closes their ticket (a later reply reopens it). */
export async function closeTicketAction(_prev: TicketActionState, formData: FormData): Promise<TicketActionState> {
  const t = dictionaryFor(await getLocale());
  const parsed = ticketRefSchema.safeParse({ ticketId: field(formData, "ticketId"), token: field(formData, "token") });
  if (!parsed.success) return { ok: false, message: t.support.errors.ticketUnverifiedShort, ts: Date.now() };
  const access = await authorizeTicket(parsed.data.ticketId, parsed.data.token || null);
  if (!access) return { ok: false, message: t.support.errors.ticketUnverified, ts: Date.now() };

  await setTicketStatus(access.id, "CLOSED");
  revalidateTicket(access.id);
  return { ok: true, message: t.support.closed, ts: Date.now() };
}
