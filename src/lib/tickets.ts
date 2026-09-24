import "server-only";
import { createHash, timingSafeEqual } from "crypto";
import type { TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { randomToken } from "@/lib/crypto";
import { siteUrl } from "@/lib/email";
import { notifyAdmin } from "@/lib/notify";
import { MAX_TICKET_BODY, MAX_TICKET_SUBJECT } from "@/components/store/site";

/*
 * Customer support tickets.
 *
 * - A ticket belongs to a signed-in customer (customerId) or to a guest email. Guests (and anyone
 *   holding the emailed link) follow it at /support/t/[id]?token=… ; the token is checked in
 *   constant time and is the only thing that unlocks a guest thread.
 * - Status: a customer message (new ticket, reply) -> OPEN; an admin reply -> ANSWERED; either
 *   side can close -> CLOSED; a customer reply to a CLOSED ticket reopens it.
 * - Bodies are stored as plain text (control characters dropped, line breaks kept) and always
 *   rendered as text, never HTML, never linkified.
 * - Emails carry only the private link, never the message text: an admin reply may quote a code.
 */

export const TICKET_SUBJECT_MIN = 3;
export const TICKET_SUBJECT_MAX = MAX_TICKET_SUBJECT;
export const TICKET_BODY_MIN = 2;
export const TICKET_BODY_MAX = MAX_TICKET_BODY;
export const TICKET_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const TICKET_TOKEN_MAX = 256;

export const ticketStatusLabel: Record<TicketStatus, string> = {
  OPEN: "مفتوحة",
  ANSWERED: "تم الرد",
  CLOSED: "مغلقة",
};

/** Drops control characters (keeping line breaks and tabs), normalizes newlines, squeezes blank runs. */
export function cleanTicketBody(value: string): string {
  return Array.from(value.replace(/\r\n?/g, "\n"))
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return ch === "\n" || ch === "\t" || (c >= 0x20 && c !== 0x7f && (c < 0x80 || c > 0x9f));
    })
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

/** One line, no control characters, single spaces. */
export function cleanTicketSubject(value: string): string {
  return Array.from(value)
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 0x20 && c !== 0x7f && (c < 0x80 || c > 0x9f);
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export const shortTicketId = (id: string) => id.slice(-8).toUpperCase();

/** Private guest link (also works for signed-in owners). */
export function ticketPath(ticket: { id: string; accessToken: string }): string {
  return `/support/t/${ticket.id}?token=${encodeURIComponent(ticket.accessToken)}`;
}

export function ticketUrl(ticket: { id: string; accessToken: string }): string {
  return `${siteUrl()}${ticketPath(ticket)}`;
}

const adminTicketUrl = (id: string) => `${siteUrl()}/admin/tickets/${id}`;

/** Constant-time token check; hashing first gives equal-length buffers whatever the input. */
export function ticketTokenMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

function truncateLine(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export type NewTicket = {
  customerId: string | null;
  email: string;
  subject: string;
  body: string;
  orderId: string | null;
};

/** Creates the ticket with its first message, alerts the owner and emails the customer their link. */
export async function createTicket(input: NewTicket): Promise<{ id: string; accessToken: string }> {
  const now = new Date();
  const ticket = await prisma.ticket.create({
    data: {
      customerId: input.customerId,
      email: input.email,
      subject: input.subject,
      orderId: input.orderId,
      accessToken: randomToken(),
      status: "OPEN",
      lastMessageAt: now,
      messages: { create: { author: "CUSTOMER", body: input.body, createdAt: now } },
    },
    select: { id: true, accessToken: true },
  });

  void notifyAdmin(
    "ticket.new",
    `🎫 تذكرة دعم جديدة #${shortTicketId(ticket.id)}: ${truncateLine(input.subject, 80)}\n${adminTicketUrl(ticket.id)}`,
  );
  await sendTicketEmail({ kind: "created", ticket: { ...ticket, email: input.email, subject: input.subject }, idempotencyKey: `ticket-created-${ticket.id}` });
  return ticket;
}

export type TicketMessageResult = { ok: true; messageId: string } | { ok: false; error: string };

/**
 * Customer reply: appends the message and moves the ticket to OPEN (reopening a CLOSED one).
 * The caller must have authorized the customer for this ticket.
 */
export async function addCustomerReply(ticketId: string, body: string): Promise<TicketMessageResult> {
  const result = await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({ where: { id: ticketId }, select: { id: true, subject: true } });
    if (!ticket) return null;
    const now = new Date();
    const message = await tx.ticketMessage.create({
      data: { ticketId, author: "CUSTOMER", body, createdAt: now },
      select: { id: true },
    });
    await tx.ticket.update({ where: { id: ticketId }, data: { status: "OPEN", lastMessageAt: now } });
    return { messageId: message.id, subject: ticket.subject };
  });
  if (!result) return { ok: false, error: "التذكرة غير موجودة." };
  void notifyAdmin(
    "ticket.reply",
    `💬 رد جديد من العميل على التذكرة #${shortTicketId(ticketId)}: ${truncateLine(result.subject, 80)}\n${adminTicketUrl(ticketId)}`,
  );
  return { ok: true, messageId: result.messageId };
}

/** Admin reply: appends the message, marks the ticket ANSWERED and emails the customer the link. */
export async function addAdminReply(ticketId: string, adminId: string, body: string): Promise<TicketMessageResult> {
  const result = await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, accessToken: true, email: true, subject: true },
    });
    if (!ticket) return null;
    const now = new Date();
    const message = await tx.ticketMessage.create({
      data: { ticketId, author: "ADMIN", adminId, body, createdAt: now },
      select: { id: true },
    });
    await tx.ticket.update({ where: { id: ticketId }, data: { status: "ANSWERED", lastMessageAt: now } });
    return { messageId: message.id, ticket };
  });
  if (!result) return { ok: false, error: "التذكرة غير موجودة." };
  await sendTicketEmail({ kind: "reply", ticket: result.ticket, idempotencyKey: `ticket-reply-${result.messageId}` });
  return { ok: true, messageId: result.messageId };
}

/** Sets the status unless it already is; true when it changed. */
export async function setTicketStatus(ticketId: string, status: TicketStatus): Promise<boolean> {
  const res = await prisma.ticket.updateMany({ where: { id: ticketId, status: { not: status } }, data: { status } });
  return res.count === 1;
}

// --- Email -----------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * "created": confirmation with the private link. "reply": the support team answered.
 * Only the link is sent (never the message text). Never throws: failures are logged.
 */
async function sendTicketEmail({
  kind,
  ticket,
  idempotencyKey,
}: {
  kind: "created" | "reply";
  ticket: { id: string; accessToken: string; email: string; subject: string };
  idempotencyKey: string;
}): Promise<void> {
  try {
    const link = ticketUrl(ticket);
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const shortId = shortTicketId(ticket.id);
    if (!apiKey) {
      console.info(`[email] RESEND_API_KEY not set. Ticket ${kind} email for #${shortId} (${ticket.email}): ${link}`);
      return;
    }

    const subject =
      kind === "reply" ? `رد جديد على تذكرتك #${shortId} - Nitro Store` : `استلمنا تذكرتك #${shortId} - Nitro Store`;
    const lead =
      kind === "reply"
        ? `ردّ فريق الدعم على تذكرتك رقم <strong>#${shortId}</strong>.`
        : `استلمنا تذكرتك رقم <strong>#${shortId}</strong> وسنرد عليك في أقرب وقت.`;
    const leadText =
      kind === "reply" ? `ردّ فريق الدعم على تذكرتك رقم #${shortId}.` : `استلمنا تذكرتك رقم #${shortId} وسنرد عليك في أقرب وقت.`;
    const cta = kind === "reply" ? "عرض الرد" : "متابعة التذكرة";

    const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;color:#1a1a2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px;" dir="rtl">
        <tr><td style="font-size:22px;font-weight:bold;padding-bottom:16px;">Nitro Store</td></tr>
        <tr><td style="font-size:16px;line-height:1.8;">
          <p style="margin:0 0 12px;">مرحباً،</p>
          <p style="margin:0 0 12px;">${lead}</p>
          <p style="margin:0 0 20px;color:#555;">الموضوع: ${escapeHtml(ticket.subject)}</p>
          <p style="margin:0 0 20px;">لحماية بياناتك لا نرسل محتوى الرسائل عبر البريد. اضغط الزر أدناه لقراءة المحادثة والرد عليها.</p>
        </td></tr>
        <tr><td align="center" style="padding-bottom:24px;">
          <a href="${escapeHtml(link)}" style="display:inline-block;background:#0a0a0a;color:#d4ff3d;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:16px;font-weight:bold;">${cta}</a>
        </td></tr>
        <tr><td style="font-size:12px;color:#666;line-height:1.7;">
          <p style="margin:0 0 8px;">إذا لم يعمل الزر، انسخ هذا الرابط في المتصفح:</p>
          <p style="margin:0 0 16px;direction:ltr;text-align:left;word-break:break-all;"><a href="${escapeHtml(link)}" style="color:#0a0a0a;">${escapeHtml(link)}</a></p>
          <p style="margin:0;">هذا الرابط خاص بك، لا تشاركه مع أحد.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const text = ["مرحباً،", leadText, `الموضوع: ${ticket.subject}`, "اقرأ المحادثة ورد عليها من هنا:", link, "هذا الرابط خاص بك، لا تشاركه مع أحد."].join(
      "\n",
    );

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM?.trim() || "Nitro Store <onboarding@resend.dev>",
        to: [ticket.email],
        subject,
        html,
        text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] Resend rejected ticket ${kind} email for ${ticket.id}: ${res.status} ${body.slice(0, 300)}`);
    }
  } catch (err) {
    console.error(`[email] Failed to send ticket ${kind} email for ${ticket.id}:`, err);
  }
}
