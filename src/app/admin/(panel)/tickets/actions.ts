"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { TICKET_BODY_MAX, addAdminReply, cleanTicketBody, setTicketStatus } from "@/lib/tickets";
import type { FormState } from "../../_lib/form-state";
import { requireAdminAccess } from "../../_lib/guard";
import { fail, fromZod, idSchema, ok, str } from "../../_lib/validation";

const replySchema = z.object({
  ticketId: idSchema,
  body: z
    .string()
    .max(TICKET_BODY_MAX + 500, `الرد أطول من ${TICKET_BODY_MAX} حرف.`)
    .transform(cleanTicketBody)
    .pipe(z.string().min(1, "اكتب الرد.").max(TICKET_BODY_MAX, `الرد أطول من ${TICKET_BODY_MAX} حرف.`)),
});

function revalidate(id: string) {
  revalidatePath("/admin/tickets");
  revalidatePath(`/admin/tickets/${id}`);
  revalidatePath(`/support/t/${id}`);
  revalidatePath(`/account/tickets/${id}`);
}

/** Admin reply: the ticket becomes ANSWERED and the customer is emailed the ticket link. */
export async function replyToTicket(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdminAccess();
  const parsed = replySchema.safeParse({ ticketId: str(formData, "ticketId"), body: str(formData, "body") });
  if (!parsed.success) return fromZod(parsed.error);
  const { ticketId, body } = parsed.data;

  const result = await addAdminReply(ticketId, admin.adminId, body);
  if (!result.ok) return fail(result.error);
  // The reply text is customer-facing content: ids and length only in the audit log
  await audit({ adminId: admin.adminId, email: admin.email }, "ticket.reply", { type: "ticket", id: ticketId }, {
    messageId: result.messageId,
    length: body.length,
  });
  revalidate(ticketId);
  return ok("تم إرسال الرد وإشعار العميل بالبريد.");
}

async function changeStatus(formData: FormData, status: Extract<TicketStatus, "OPEN" | "CLOSED">): Promise<FormState> {
  const admin = await requireAdminAccess();
  const parsed = idSchema.safeParse(str(formData, "ticketId"));
  if (!parsed.success) return fromZod(parsed.error);
  const id = parsed.data;

  const ticket = await prisma.ticket.findUnique({ where: { id }, select: { status: true } });
  if (!ticket) return fail("التذكرة غير موجودة.");
  const changed = await setTicketStatus(id, status);
  if (!changed) return ok(status === "CLOSED" ? "التذكرة مغلقة بالفعل." : "التذكرة مفتوحة بالفعل.");
  await audit(
    { adminId: admin.adminId, email: admin.email },
    status === "CLOSED" ? "ticket.close" : "ticket.reopen",
    { type: "ticket", id },
    { from: ticket.status },
  );
  revalidate(id);
  return ok(status === "CLOSED" ? "تم إغلاق التذكرة." : "تمت إعادة فتح التذكرة.");
}

export async function closeTicket(_prev: FormState, formData: FormData): Promise<FormState> {
  return changeStatus(formData, "CLOSED");
}

export async function reopenTicket(_prev: FormState, formData: FormData): Promise<FormState> {
  return changeStatus(formData, "OPEN");
}
